/**
 * Markdown-aware translation engine.
 *
 * Translates markdown documents while preserving structure: code blocks,
 * HTML elements, tables, URLs, and formatting are left intact. Only
 * translatable prose (headings, paragraphs, taglines, table cells) is sent
 * through the translation pipeline.
 *
 * This module is the engine behind the `translate_markdown` MCP tool
 * and the `scripts/translate-all.mjs` CLI.
 */

import { translateBatch, type TranslateBatchOptions, type BatchItem } from "./translate.js";
import { resolveLanguage, type Language } from "./languages.js";
import { validateTranslation } from "./validate.js";
import { maskCodeSpans, restoreCodeSpans } from "./codeSpans.js";
import {
  loadCache,
  saveCache,
  cacheKey,
  getCached,
  setCached,
  getFuzzyCached,
  createCache,
  clearCache,
  pruneCache,
  type TranslationCache,
} from "./cache.js";
import { PolyglotError } from "./errors.js";

// ─── Types ────────────────────────────────────────────────────────

export type SegmentType = "protected" | "html-tagline" | "heading" | "text" | "table";

export interface Segment {
  type: SegmentType;
  text: string;
  /** Heading prefix (e.g. "## ") — only on heading segments. */
  prefix?: string;
  /** @internal Parsed table data for reassembly. */
  _parsed?: ParsedRow[];
}

export interface ParsedRow {
  type: "separator" | "data";
  raw?: string;
  cells?: CellData[];
}

export interface CellData {
  translatable: boolean;
  original: string;
}

export interface TranslatableCell {
  rowIdx: number;
  cellIdx: number;
  text: string;
}

export interface TranslateMarkdownOptions extends TranslateBatchOptions {
  /** Use segment cache. Default: true. */
  cache?: boolean;
  /** Clear all cached entries before translating. */
  cacheClear?: boolean;
  /** Path to the source file (for cache file location). Required if cache=true. */
  filePath?: string;
  /** Progress callback — called with (completed, total) after each segment batch. */
  onProgress?: (completed: number, total: number) => void;
}

export interface TranslateMarkdownResult {
  markdown: string;
  segments: number;
  cached: number;
  translated: number;
  deduplicated: number;
  /** Segments matched by fuzzy cache (translation memory). */
  fuzzyMatched: number;
  ollamaCalls: number;
  durationMs: number;
  warnings: string[];
}

// ─── Segmentation ─────────────────────────────────────────────────

/**
 * Break a markdown document into translatable and protected segments.
 * Protected segments (code blocks, HTML, rules, blank lines) pass through unchanged.
 */
export function segmentMarkdown(md: string): Segment[] {
  const segments: Segment[] = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — protect entire block
    if (/^```/.test(line)) {
      const block = [line];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      if (i < lines.length) block.push(lines[i++]);
      segments.push({ type: "protected", text: block.join("\n") });
      continue;
    }

    // HTML comment (single line or multi-line block) — protect verbatim.
    // Generated markers such as `<!-- BEGIN curriculum:auto readme-table -->`
    // are document structure, not prose. Like the language nav bar, they must
    // round-trip byte-for-byte and are never sent through translation —
    // otherwise the model translates or drops them (INICIO/FIN, missing markers).
    if (/^<!--/.test(line.trim())) {
      const block = [line];
      i++;
      // Multi-line comment: keep collecting until the line with the closing `-->`.
      if (!line.includes("-->")) {
        while (i < lines.length && !lines[i].includes("-->")) {
          block.push(lines[i]);
          i++;
        }
        if (i < lines.length) block.push(lines[i++]); // include the closing line
      }
      segments.push({ type: "protected", text: block.join("\n") });
      continue;
    }

    // HTML tagline: <p ...><strong>translatable text</strong></p>
    if (/^<p[^>]*><strong>[^<]+<\/strong><\/p>/.test(line.trim())) {
      segments.push({ type: "html-tagline", text: line });
      i++;
      continue;
    }

    // HTML block (badges, images, alignment wrappers) — protect
    if (/^<[a-z]/i.test(line.trim())) {
      const block = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^(---|##)/.test(lines[i])
      ) {
        block.push(lines[i]);
        i++;
      }
      segments.push({ type: "protected", text: block.join("\n") });
      continue;
    }

    // Horizontal rule — protect
    if (/^---\s*$/.test(line)) {
      segments.push({ type: "protected", text: line });
      i++;
      continue;
    }

    // Empty line — protect
    if (line.trim() === "") {
      segments.push({ type: "protected", text: "" });
      i++;
      continue;
    }

    // Table — translate cell contents, preserve structure
    if (/^\|/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      segments.push({ type: "table", text: tableLines.join("\n") });
      continue;
    }

    // Heading — translate text, preserve ## prefix
    if (/^#{1,6}\s/.test(line)) {
      const match = line.match(/^(#{1,6}\s+)(.*)/);
      if (match) {
        segments.push({ type: "heading", prefix: match[1], text: match[2] });
      } else {
        segments.push({ type: "text", text: line });
      }
      i++;
      continue;
    }

    // Block quote — translate
    if (/^>\s/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      segments.push({ type: "text", text: block.join("\n") });
      continue;
    }

    // Regular paragraph — collect consecutive non-special lines
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(```|<!--|<[a-z]|---|#{1,6}\s|\||>\s)/i.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length > 0) {
      segments.push({ type: "text", text: para.join("\n") });
    }
  }

  return segments;
}

// ─── Table parsing ────────────────────────────────────────────────

/** Check if a table cell contains translatable prose. */
export function isTranslatableCell(trimmed: string): boolean {
  if (/^`[^`]+`$/.test(trimmed)) return false;                        // single backtick term
  if (/^(`[^`]+`[,\s]*)+$/.test(trimmed)) return false;               // multiple backtick terms
  if (/^@\w+\//.test(trimmed)) return false;                           // scoped package name
  if (/^\*\*[A-Za-z]/.test(trimmed) && trimmed.length < 30) return false; // bold short label
  if (/^[\d.]+$/.test(trimmed)) return false;                          // pure number/version
  if (/^\[.*\]\(.*\)$/.test(trimmed)) return false;                    // markdown link
  if (trimmed === "—" || trimmed === "-") return false;                // em dash
  if (trimmed.length <= 2) return false;                               // too short
  if (!/[A-Za-z\u00C0-\u024F]/.test(trimmed)) return false;           // no letters
  return true;
}

/** Parse a markdown table into rows/cells, identifying translatable cells. */
export function parseTable(tableText: string): { parsed: ParsedRow[]; translatableCells: TranslatableCell[] } {
  const rows = tableText.split("\n");
  const parsed: ParsedRow[] = [];
  const translatableCells: TranslatableCell[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (/^\|[\s\-:|]+\|$/.test(row)) {
      parsed.push({ type: "separator", raw: row });
      continue;
    }
    const cells = row.split("|").slice(1, -1);
    const cellData: CellData[] = cells.map((cell, c) => {
      const trimmed = cell.trim();
      if (isTranslatableCell(trimmed)) {
        translatableCells.push({ rowIdx: parsed.length, cellIdx: c, text: trimmed });
        return { translatable: true, original: cell };
      }
      return { translatable: false, original: cell };
    });
    parsed.push({ type: "data", cells: cellData });
  }

  return { parsed, translatableCells };
}

/** Reassemble a table from parsed data with translated cells injected. */
export function reassembleTable(parsed: ParsedRow[], translatedMap: Map<string, string>): string {
  const rows: string[] = [];
  for (const row of parsed) {
    if (row.type === "separator") {
      rows.push(row.raw!);
      continue;
    }
    const cells = row.cells!.map((c, idx) => {
      const key = `${parsed.indexOf(row)}:${idx}`;
      if (c.translatable && translatedMap.has(key)) {
        return ` ${translatedMap.get(key)} `;
      }
      return c.original;
    });
    rows.push("|" + cells.join("|") + "|");
  }
  return rows.join("\n");
}

// ─── Translation cleaning ─────────────────────────────────────────

/**
 * Clean up TranslateGemma quirks in translated text:
 * - Strip "or" alternative translations in various languages
 * - Strip trailing periods on headings
 */
const OR_PATTERNS = [
  /\nまたは\n.*/s, /\n또는\n.*/s, /\no\n(?=[A-Z]).*/s, /\nou\n.*/s,
  /\noder\n.*/s, /\nили\n.*/s, /\nया\n.*/s, /\nveya\n.*/s,
  /\nหรือ\n.*/s, /\nhoặc\n.*/s, /\natau\n.*/s, /\nof\n(?=[A-Z]).*/s,
];

export function cleanTranslation(text: string, isHeading = false): string {
  let cleaned = text;
  for (const pat of OR_PATTERNS) {
    cleaned = cleaned.replace(pat, "");
  }
  if (isHeading) {
    cleaned = cleaned.replace(/[。．.]\s*$/, "");
  }
  return cleaned.trim();
}

// ─── Core translate function ──────────────────────────────────────

/**
 * Translate a markdown document while preserving its structure.
 *
 * Segments the markdown, identifies translatable text, batches translations,
 * applies caching, validates output, and reassembles the document.
 */
export async function translateMarkdown(
  markdown: string,
  sourceLang: string,
  targetLang: string,
  options: TranslateMarkdownOptions = {}
): Promise<TranslateMarkdownResult> {
  const source = resolveLanguage(sourceLang);
  if (!source) {
    throw new PolyglotError({
      code: "UNSUPPORTED_LANGUAGE",
      message: `Unsupported source language: "${sourceLang}".`,
      hint: "Use the list_languages tool to see all 57 supported languages.",
      retryable: false,
    });
  }

  const target = resolveLanguage(targetLang);
  if (!target) {
    throw new PolyglotError({
      code: "UNSUPPORTED_LANGUAGE",
      message: `Unsupported target language: "${targetLang}".`,
      hint: "Use the list_languages tool to see all 57 supported languages.",
      retryable: false,
    });
  }

  const start = Date.now();
  const warnings: string[] = [];
  const useCache = options.cache !== false;
  const model = options.model ?? undefined; // let translateBatch pick default

  // Set up cache
  let cache: TranslationCache;
  if (useCache && options.filePath) {
    cache = loadCache(options.filePath);
    if (options.cacheClear) {
      clearCache(cache);
      saveCache(options.filePath, cache);
    } else {
      pruneCache(cache);
    }
  } else {
    cache = createCache();
  }

  // Segment
  const segments = segmentMarkdown(markdown);
  const modelStr = model ?? "translategemma:12b";

  // Collect all translatable items for batching
  interface BatchEntry {
    segIndex: number;
    kind: "heading" | "text" | "cell";
    /** Masked text — what the model sees, and what the cache is keyed on. */
    text: string;
    /** Source text with its inline code spans still inline. */
    original: string;
    /** Code spans lifted out of `original`, indexed by placeholder number. */
    spans: string[];
    cacheHit?: string;
    /** Set when this entry was matched via fuzzy cache (translation memory). */
    fuzzyHit?: boolean;
    tableKey?: string;
  }

  const batchItems: BatchEntry[] = [];

  /**
   * Mask a translatable string's inline code spans, look it up in the cache by
   * its MASKED form, and queue it.
   *
   * Keying the cache on the masked text is deliberate and does two jobs at
   * once. It invalidates entries written before this protection existed (their
   * keys carried the raw spans), so a stale cache cannot replay a transliterated
   * identifier. And it widens dedup: two sentences differing only in which
   * identifier they name collapse to one translation, then each entry restores
   * its own spans.
   */
  const enqueue = (
    segIndex: number,
    kind: "heading" | "text" | "cell",
    raw: string,
    tableKey?: string,
  ) => {
    const { text: masked, spans } = maskCodeSpans(raw);
    const key = cacheKey(masked, targetLang, modelStr);
    const cached = useCache ? getCached(cache, key) : undefined;
    const fuzzy = (!cached && useCache)
      ? getFuzzyCached(cache, masked, targetLang, modelStr)
      : undefined;
    batchItems.push({
      segIndex,
      kind,
      text: masked,
      original: raw,
      spans,
      ...(tableKey !== undefined ? { tableKey } : {}),
      ...(cached ? { cacheHit: cached } : fuzzy ? { cacheHit: fuzzy.translation, fuzzyHit: true } : {}),
    });
  };

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];

    if (seg.type === "protected") continue;

    if (seg.type === "html-tagline") {
      const innerText = extractTaglineText(seg.text);
      if (innerText) enqueue(s, "text", innerText);
      continue;
    }

    if (seg.type === "heading") {
      enqueue(s, "heading", seg.text);
      continue;
    }

    if (seg.type === "text") {
      if (/^`[^`]+`$/.test(seg.text.trim())) continue; // skip bare backtick terms
      enqueue(s, "text", seg.text);
      continue;
    }

    if (seg.type === "table") {
      const { parsed, translatableCells } = parseTable(seg.text);
      seg._parsed = parsed;
      for (const cell of translatableCells) {
        enqueue(s, "cell", cell.text, `${cell.rowIdx}:${cell.cellIdx}`);
      }
      continue;
    }
  }

  // Split into hits and misses, dedup misses
  const misses = batchItems.filter((b) => !b.cacheHit);
  const cacheHits = batchItems.filter((b) => b.cacheHit && !b.fuzzyHit).length;
  const fuzzyHits = batchItems.filter((b) => b.fuzzyHit).length;

  const uniqueTexts = new Map<string, number>();
  const uniqueItems: BatchItem[] = [];
  const missToUnique: number[] = [];

  for (const m of misses) {
    if (uniqueTexts.has(m.text)) {
      missToUnique.push(uniqueTexts.get(m.text)!);
    } else {
      const idx = uniqueItems.length;
      uniqueTexts.set(m.text, idx);
      uniqueItems.push({ text: m.text, kind: m.kind });
      missToUnique.push(idx);
    }
  }

  const deduplicated = misses.length - uniqueItems.length;

  // Report progress for cache hits (exact + fuzzy)
  const totalItems = batchItems.length;
  let completedItems = cacheHits + fuzzyHits;
  if (options.onProgress && completedItems > 0) {
    options.onProgress(completedItems, totalItems);
  }

  // Translate unique misses
  let uniqueTranslations: string[] = [];
  let ollamaCalls = 0;

  if (uniqueItems.length > 0) {
    const result = await translateBatch(uniqueItems, sourceLang, targetLang, {
      model: options.model,
      temperature: options.temperature,
      ollamaUrl: options.ollamaUrl,
      glossary: options.glossary,
      softwareGlossary: options.softwareGlossary,
      polish: options.polish,
      batchCharLimit: options.batchCharLimit,
    });
    uniqueTranslations = result.translations;
    ollamaCalls = result.ollamaCalls;

    // Cache the results
    if (useCache) {
      for (let i = 0; i < uniqueItems.length; i++) {
        const key = cacheKey(uniqueItems[i].text, targetLang, modelStr);
        setCached(cache, key, uniqueTranslations[i], modelStr, uniqueItems[i].text, targetLang);
      }
    }

    // Report progress for translated items
    completedItems = totalItems;
    if (options.onProgress) {
      options.onProgress(completedItems, totalItems);
    }
  }

  // Validate translations and build maps
  const translationMap = new Map<number, string>();
  const tableTranslationMaps = new Map<number, Map<string, string>>();

  let missIdx = 0;
  for (const item of batchItems) {
    let translated: string;
    if (item.cacheHit) {
      translated = item.cacheHit;
    } else {
      translated = uniqueTranslations[missToUnique[missIdx++]];
    }

    // Validate
    try {
      const validation = validateTranslation(item.text, translated, sourceLang, targetLang);
      if (!validation.valid) {
        for (const w of validation.warnings) {
          warnings.push(`[segment "${item.original.slice(0, 40)}…"]: ${w}`);
        }
      }
    } catch {
      // validateTranslation threw — empty output. Use source as fallback.
      warnings.push(`[segment "${item.original.slice(0, 40)}…"]: Empty translation, using source text as fallback.`);
      translated = item.text;
    }

    let cleaned = cleanTranslation(translated, item.kind === "heading");

    // Put the inline code spans back. If the placeholders did not survive the
    // round trip the translation has silently lost or doubled an identifier, so
    // fall back to the source text: untranslated prose is a visible, reportable
    // cost, whereas a mangled `npm install` line reads as correct and is not.
    if (item.spans.length > 0) {
      const restored = restoreCodeSpans(cleaned, item.spans);
      if (restored.intact) {
        cleaned = restored.text;
      } else {
        warnings.push(
          `[segment "${item.original.slice(0, 40)}…"]: code-span placeholders did not survive translation; kept the source text so the identifiers stay correct.`,
        );
        cleaned = item.original;
      }
    }

    if (item.tableKey !== undefined) {
      if (!tableTranslationMaps.has(item.segIndex)) {
        tableTranslationMaps.set(item.segIndex, new Map());
      }
      tableTranslationMaps.get(item.segIndex)!.set(item.tableKey, cleaned);
    } else {
      translationMap.set(item.segIndex, cleaned);
    }
  }

  // Assemble output
  const output: string[] = [];
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];

    if (seg.type === "protected") {
      output.push(seg.text);
      continue;
    }

    if (seg.type === "html-tagline") {
      if (translationMap.has(s)) {
        output.push(rebuildTagline(seg.text, translationMap.get(s)!));
      } else {
        output.push(seg.text);
      }
      continue;
    }

    if (seg.type === "heading") {
      output.push((seg.prefix ?? "") + (translationMap.get(s) ?? seg.text));
      continue;
    }

    if (seg.type === "text") {
      output.push(translationMap.get(s) ?? seg.text);
      continue;
    }

    if (seg.type === "table") {
      const tMap = tableTranslationMaps.get(s) ?? new Map();
      if (seg._parsed) {
        output.push(reassembleTable(seg._parsed, tMap));
      } else {
        output.push(seg.text);
      }
      continue;
    }
  }

  // Save cache
  if (useCache && options.filePath) {
    saveCache(options.filePath, cache);
  }

  return {
    markdown: output.join("\n"),
    segments: batchItems.length,
    cached: cacheHits,
    translated: uniqueItems.length,
    deduplicated,
    fuzzyMatched: fuzzyHits,
    ollamaCalls,
    durationMs: Date.now() - start,
    warnings,
  };
}

// ─── HTML tagline helpers (fix for item #1) ───────────────────────

/**
 * Extract the inner text from an HTML tagline like:
 *   <p align="center"><strong>Some text here.</strong></p>
 *
 * The previous regex `^(.+<strong>)([^<]+)(<\/strong>.+)$` failed
 * because the `<p>` tag contains attributes with `=` and `"` that the
 * greedy `.+` captured correctly, but [^<]+ failed on edge cases with
 * entities. This version uses named groups and is more precise.
 */
export function extractTaglineText(line: string): string | null {
  const match = line.match(/<strong>([^<]+)<\/strong>/);
  return match ? match[1] : null;
}

/**
 * Replace the inner text of an HTML tagline with translated text.
 */
export function rebuildTagline(originalLine: string, translatedText: string): string {
  return originalLine.replace(
    /(<strong>)[^<]+(<\/strong>)/,
    `$1${translatedText}$2`
  );
}
