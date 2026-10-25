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

import GithubSlugger from "github-slugger";
import { translateBatch, type TranslateBatchOptions, type BatchItem } from "./translate.js";
import { resolveLanguage } from "./languages.js";
import { validateTranslation } from "./validate.js";
import { maskCodeSpans, restoreCodeSpans } from "./codeSpans.js";
import { anchorsEnabled, DEFAULT_PROTECTED_TERMS, loadProtectedTerms, type ProtectedTermSet } from "./protectedTerms.js";
import { createPins, getPin, loadPins, type PinFile } from "./pins.js";
import {
  checkAnchors,
  checkCodeStructure,
  checkLinks,
  checkPlaceholders,
  checkSegment,
  enforceLostSpanPolicy,
  enforceUntranslatedPolicy,
  expectedSpans,
  extractLinks,
  extractRefDefinitions,
  proseWords,
  safeDecodeSlug,
  segmentLabel,
  stripHeadingMarkup,
  survivingProse,
  type LostSpan,
  type LostSpanPolicy,
  type SegmentFallback,
  type UntranslatedPolicy,
  type UntranslatedSegment,
} from "./survival.js";
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
  /** Clear the target language's cached entries before translating. Other languages' entries are kept. */
  cacheClear?: boolean;
  /** Path to the source file (for cache file location). Required if cache=true. */
  filePath?: string;
  /** Progress callback — called with (completed, total) after each segment batch. */
  onProgress?: (completed: number, total: number) => void;
  /**
   * Protected terms masked in prose, like inline code spans. Default: the
   * `.polyglot-terms.json` beside `filePath` if there is one, else the
   * default patterns.
   */
  terms?: ProtectedTermSet;
  /**
   * Pinned translations, which win over the cache and the model. Default: the
   * `.polyglot-pins.json` beside `filePath`, else none.
   */
  pins?: PinFile;
  /**
   * What to do when the survival check finds a protected span missing from
   * the translation: "report" lists it in `lostSpans` (default), "fail" throws
   * a LostSpanError carrying the list and this result.
   */
  onLostSpan?: LostSpanPolicy;
  /**
   * What to do when prose comes back in English after its one retry: "report"
   * lists it in `untranslated` (default), "fail" throws an UntranslatedError
   * that carries the result.
   */
  onUntranslated?: UntranslatedPolicy;
}

export interface TranslateMarkdownResult {
  markdown: string;
  segments: number;
  cached: number;
  translated: number;
  deduplicated: number;
  /** Segments reused from a cached source that differs only in whitespace layout. */
  fuzzyMatched: number;
  /** Segments taken from `.polyglot-pins.json`. */
  pinned: number;
  ollamaCalls: number;
  durationMs: number;
  warnings: string[];
  /** Protected spans in the source that the translation does not carry. */
  lostSpans: LostSpan[];
  /** Prose lines still identical to the English after the segment was retried on its own. */
  untranslated: UntranslatedSegment[];
  /** Segments that left the plain batch path: a separator mismatch, an echo, an empty part. */
  fallbacks: SegmentFallback[];
  /** How many segments were re-sent on their own after coming back as the English. */
  retries: number;
}

// ─── Segmentation ─────────────────────────────────────────────────

/**
 * Break a markdown document into translatable and protected segments.
 * Protected segments (code blocks, HTML, rules, blank lines) pass through unchanged.
 */
export function segmentMarkdown(md: string): Segment[] {
  const segments: Segment[] = [];
  const lines = md.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
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
        !/^(---|#{1,6}\s)/.test(lines[i])
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
  const rows = tableText.split("\n").map((r) => (r.endsWith("\r") ? r.slice(0, -1) : r));
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

// ─── Translatable units ───────────────────────────────────────────

/** One piece of prose that goes through translation on its own. */
export interface TranslatableUnit {
  segIndex: number;
  kind: "heading" | "text" | "cell";
  /** The source text: heading text without its `#`s, a tagline's inner text, a trimmed cell. */
  text: string;
  /** `row:cell` within the table, for cells. */
  tableKey?: string;
}

/**
 * The translatable units of a segmented document, in order: headings,
 * paragraphs and block quotes, taglines' inner text, and translatable table
 * cells. Records each table's parse on its segment for reassembly.
 */
export function collectUnits(segments: Segment[]): TranslatableUnit[] {
  const units: TranslatableUnit[] = [];
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    if (seg.type === "html-tagline") {
      const innerText = extractTaglineText(seg.text);
      if (innerText) units.push({ segIndex: s, kind: "text", text: innerText });
    } else if (seg.type === "heading") {
      units.push({ segIndex: s, kind: "heading", text: seg.text });
    } else if (seg.type === "text") {
      if (/^`[^`]+`$/.test(seg.text.trim())) continue; // skip bare backtick terms
      units.push({ segIndex: s, kind: "text", text: seg.text });
    } else if (seg.type === "table") {
      const { parsed, translatableCells } = parseTable(seg.text);
      seg._parsed = parsed;
      for (const cell of translatableCells) {
        units.push({ segIndex: s, kind: "cell", text: cell.text, tableKey: `${cell.rowIdx}:${cell.cellIdx}` });
      }
    }
  }
  return units;
}

/** A source unit and the text that stands in its place in a translation. */
export interface AlignedUnit {
  unit: TranslatableUnit;
  target: string;
}

/**
 * Pair each translatable unit of `source` with its counterpart in
 * `translation`, by position. Translation keeps the document's structure, so
 * the n-th heading, paragraph, tagline or table of one is the n-th of the
 * other, and a table cell sits at the same row and column. Returns null when
 * the structures differ and no such pairing can be trusted.
 */
export function alignUnits(source: string, translation: string): AlignedUnit[] | null {
  const sourceSegs = segmentMarkdown(source);
  const targetSegs = segmentMarkdown(translation);
  const sourceIdx = sourceSegs.flatMap((seg, i) => (seg.type === "protected" ? [] : [i]));
  const targetIdx = targetSegs.flatMap((seg, i) => (seg.type === "protected" ? [] : [i]));
  if (sourceIdx.length !== targetIdx.length) return null;

  const counterpart = new Map<number, Segment>();
  for (let i = 0; i < sourceIdx.length; i++) {
    const target = targetSegs[targetIdx[i]];
    if (sourceSegs[sourceIdx[i]].type !== target.type) return null;
    counterpart.set(sourceIdx[i], target);
  }

  const targetTables = new Map<Segment, ParsedRow[]>();
  const aligned: AlignedUnit[] = [];
  for (const unit of collectUnits(sourceSegs)) {
    const target = counterpart.get(unit.segIndex)!;
    if (unit.kind === "cell") {
      let parsed = targetTables.get(target);
      if (!parsed) {
        parsed = parseTable(target.text).parsed;
        targetTables.set(target, parsed);
      }
      const [r, c] = unit.tableKey!.split(":").map(Number);
      const cell = parsed[r]?.type === "data" ? parsed[r].cells?.[c] : undefined;
      if (!cell) return null;
      aligned.push({ unit, target: cell.original.trim() });
    } else if (target.type === "html-tagline") {
      const inner = extractTaglineText(target.text);
      if (inner === null) return null;
      aligned.push({ unit, target: inner });
    } else {
      aligned.push({ unit, target: target.text });
    }
  }
  return aligned;
}

// ─── §2 Anchor rewriting ──────────────────────────────────────────

/**
 * Pair each source ATX heading with its translated ATX heading by segment index
 * (`segIndex`), slugging both in heading order with one `GithubSlugger` per
 * document so duplicate headings receive GitHub's `-1`, `-2` suffixes.
 */
export function buildHeadingSlugMap(
  segments: readonly Segment[],
  translationMap: ReadonlyMap<number, string>,
): Map<string, string> {
  const sourceSlugger = new GithubSlugger();
  const targetSlugger = new GithubSlugger();
  const slugMap = new Map<string, string>();

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    if (seg.type !== "heading") continue;
    const srcSlug = safeDecodeSlug(sourceSlugger.slug(stripHeadingMarkup(seg.text))).toLowerCase();
    const tgtText = translationMap.get(s) ?? seg.text;
    const tgtSlug = targetSlugger.slug(stripHeadingMarkup(tgtText));
    if (srcSlug && tgtSlug) {
      slugMap.set(srcSlug, tgtSlug);
    }
  }
  return slugMap;
}

/**
 * Single-pass line regex matching either an inline code span (kept verbatim) or
 * an in-page anchor target in an inline link, reference definition, or HTML
 * `href="#…"` attribute (F6).
 */
const REWRITE_LINE_PATTERN =
  /(`[^`\n]+`)|(\]\(\s*)#([^\s)<>"'`[\]]+)(?=(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\r\n]*\)))?\s*\))|(^[ \t>]*\[[^\][\n]+\]:[ \t]*)#([^\s)<>"'`[\]]+)(?=(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\r\n]*\)))?[ \t]*\r?$)|(\bhref\s*=\s*["'])#([^"'\s<>]+)(?=["'])/giu;

/**
 * Rewrite in-page anchors across an assembled Markdown document in a single
 * regex pass per non-fenced line, skipping fenced and inline code (F6).
 * Each matched slug is decoded via `safeDecodeSlug` (F4) and looked up once in
 * `slugMap`, preventing double rewrites when headings swap slugs.
 */
export function rewriteAnchors(markdown: string, slugMap: ReadonlyMap<string, string>): string {
  if (slugMap.size === 0) return markdown;
  const lines = markdown.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  let inFence = false;
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    if (/^<!--/.test(line.trim())) {
      if (!line.includes("-->")) inComment = true;
      continue;
    }

    lines[i] = line.replace(
      REWRITE_LINE_PATTERN,
      (
        match,
        codeSpan: string | undefined,
        inlinePrefix: string | undefined,
        inlineSlug: string | undefined,
        refPrefix: string | undefined,
        refSlug: string | undefined,
        hrefPrefix: string | undefined,
        hrefSlug: string | undefined,
      ) => {
        if (codeSpan !== undefined) return match;
        const prefix = inlinePrefix ?? refPrefix ?? hrefPrefix ?? "";
        const rawSlug = (inlineSlug ?? refSlug ?? hrefSlug)!;
        const targetSlug = slugMap.get(safeDecodeSlug(rawSlug).toLowerCase());
        return targetSlug !== undefined ? `${prefix}#${targetSlug}` : match;
      },
    );
  }

  return lines.join("\n");
}

/**
 * The survival check for one translated file: every protected span in the
 * English (inline code spans, protected terms, and "N of M" counts as `N/M`)
 * must be present, character for character, in the translation of its
 * segment; each table cell must carry the same numbers as its source cell;
 * the file must keep its fenced blocks and inline code spans; and when the
 * `anchor` rule is enabled, every source-valid in-page anchor must resolve in
 * the translation.
 *
 * When the translation's structure no longer lines up with the source's, the
 * spans are checked against the whole file instead.
 */
export function checkSurvival(
  source: string,
  translation: string,
  options: { lang: string; terms?: ProtectedTermSet; warnings?: string[] },
): LostSpan[] {
  const terms = options.terms ?? DEFAULT_PROTECTED_TERMS;
  const { lang } = options;
  const lost: LostSpan[] = [];
  const sourceDefs = extractRefDefinitions(source);
  const targetDefs = extractRefDefinitions(translation);

  const aligned = alignUnits(source, translation);
  if (aligned) {
    for (const { unit, target } of aligned) {
      lost.push(
        ...checkSegment(unit.text, target, lang, {
          terms,
          isCell: unit.kind === "cell",
          sourceDefs,
          targetDefs,
        }),
      );
    }
  } else {
    const total = new Map<string, { kind: LostSpan["kind"]; count: number }>();
    for (const unit of collectUnits(segmentMarkdown(source))) {
      for (const [span, { kind, count }] of expectedSpans(unit.text, terms)) {
        if (kind === "anchor") continue;
        const entry = total.get(span);
        if (entry) entry.count += count;
        else total.set(span, { kind, count });
      }
    }
    for (const [span, { kind, count }] of total) {
      if (translation.split(span).length - 1 < count) lost.push({ lang, segment: "(whole file)", span, kind });
    }
    lost.push(
      ...checkLinks(source, translation, lang, {
        sourceDefs,
        targetDefs,
        segment: "(whole file)",
        terms,
      }),
      ...checkPlaceholders(source, translation, lang, {
        segment: "(whole file)",
      }),
    );
  }

  lost.push(...checkCodeStructure(source, translation, lang));
  if (anchorsEnabled(terms)) {
    const srcAnchorTotal = extractLinks(source, sourceDefs).anchorCount;
    const tgtAnchorTotal = extractLinks(translation, targetDefs).anchorCount;
    const fileAnchorDiff = srcAnchorTotal - tgtAnchorTotal;
    const segAnchorLosses = lost.filter((l) => l.kind === "link" && l.span.endsWith(" anchor links"));
    let segAnchorDiff = 0;
    for (const l of segAnchorLosses) {
      segAnchorDiff += Number.parseInt(l.span, 10) - Number(l.found ?? 0);
    }
    const skipCountMismatch =
      segAnchorLosses.length > 0 &&
      segAnchorLosses.every((l) => Number.parseInt(l.span, 10) > Number(l.found ?? 0)) &&
      segAnchorDiff === fileAnchorDiff;
    lost.push(
      ...checkAnchors(source, translation, lang, {
        warnings: options.warnings,
        skipCountMismatch,
      }),
    );
  }
  return lost;
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
  const onLostSpan = options.onLostSpan ?? "report";
  const onUntranslated = options.onUntranslated ?? "report";

  // Protected terms and pins live beside the source file, when there is one.
  // Both load before the cache is touched, so a broken file fails the run
  // before a --cache-clear has thrown anything away.
  const terms = options.terms ?? (options.filePath ? loadProtectedTerms(options.filePath) : DEFAULT_PROTECTED_TERMS);
  const pins = options.pins ?? (options.filePath ? loadPins(options.filePath) : createPins());

  // Set up cache
  let cache: TranslationCache;
  if (useCache && options.filePath) {
    cache = loadCache(options.filePath);
    if (options.cacheClear) {
      // This language only. Every translate-all child clears on start, so
      // clearing everything wiped the languages earlier children had finished.
      clearCache(cache, targetLang);
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
    /** Source text with its inline code spans and protected terms still inline. */
    original: string;
    /** What each placeholder in `text` restores to, indexed by placeholder number. */
    spans: string[];
    /** Cache key: masked text, language, model and the protected-term rules that fired. */
    key: string;
    cacheHit?: string;
    /** Set when this entry was matched via fuzzy cache (translation memory). */
    fuzzyHit?: boolean;
    /** Final text that needs neither cache nor model: a pin, or nothing left to translate. */
    resolved?: string;
    /** Set when `resolved` came from `.polyglot-pins.json`. */
    pinned?: boolean;
    tableKey?: string;
  }

  const batchItems: BatchEntry[] = [];

  /**
   * Mask a translatable string's inline code spans and protected terms, look
   * it up in the cache by its MASKED form, and queue it.
   *
   * Keying the cache on the masked text is deliberate and does two jobs at
   * once. It invalidates entries written before this protection existed (their
   * keys carried the raw spans), so a stale cache cannot replay a transliterated
   * identifier. And it widens dedup: two sentences differing only in which
   * identifier they name collapse to one translation, then each entry restores
   * its own spans. The hash of the protected-term rules that fired is folded
   * into the key as well, so adding a term retires every cached translation of
   * a segment that contains it.
   *
   * A pinned segment skips all of that: the pin is the translation.
   */
  const enqueue = ({ segIndex, kind, text: raw, tableKey }: TranslatableUnit) => {
    const where = tableKey !== undefined ? { tableKey } : {};
    const pin = getPin(pins, raw, targetLang);
    if (pin !== undefined) {
      batchItems.push({ segIndex, kind, text: raw, original: raw, spans: [], key: "", resolved: pin, pinned: true, ...where });
      return;
    }

    const { text: masked, spans, termsHash } = maskCodeSpans(raw, terms);
    const key = cacheKey(masked, targetLang, modelStr, termsHash);

    // Nothing but placeholders, digits and punctuation left (a cell that reads
    // "218 of 224"): there is nothing to translate, so the model never sees it.
    if (!/\p{L}/u.test(masked)) {
      batchItems.push({ segIndex, kind, text: masked, original: raw, spans, key, resolved: restoreCodeSpans(masked, spans).text, ...where });
      return;
    }

    // An entry that is still the English was written by an earlier run that
    // echoed the segment. It is not a translation, so it is not reused.
    let cached = useCache ? getCached(cache, key) : undefined;
    if (cached !== undefined && (cached.trim() === "" || survivingProse(masked, cached).length > 0)) cached = undefined;
    let fuzzy = (!cached && useCache)
      ? getFuzzyCached(cache, masked, targetLang, modelStr)
      : undefined;
    if (fuzzy && (fuzzy.translation.trim() === "" || survivingProse(masked, fuzzy.translation).length > 0)) fuzzy = undefined;
    batchItems.push({
      segIndex,
      kind,
      text: masked,
      original: raw,
      spans,
      key,
      ...where,
      ...(cached ? { cacheHit: cached } : fuzzy ? { cacheHit: fuzzy.translation, fuzzyHit: true } : {}),
    });
  };

  for (const unit of collectUnits(segments)) enqueue(unit);

  // Split into hits and misses, dedup misses
  const misses = batchItems.filter((b) => b.resolved === undefined && !b.cacheHit);
  const cacheHits = batchItems.filter((b) => b.cacheHit && !b.fuzzyHit).length;
  const fuzzyHits = batchItems.filter((b) => b.fuzzyHit).length;
  const resolvedItems = batchItems.filter((b) => b.resolved !== undefined).length;
  const pinnedItems = batchItems.filter((b) => b.pinned).length;

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

  // Report progress for cache hits (exact + fuzzy) and resolved items
  const totalItems = batchItems.length;
  let completedItems = cacheHits + fuzzyHits + resolvedItems;
  if (options.onProgress && completedItems > 0) {
    options.onProgress(completedItems, totalItems);
  }

  // Translate unique misses
  let uniqueTranslations: string[] = [];
  let ollamaCalls = 0;
  const fallbacks: SegmentFallback[] = [];
  const untranslated: UntranslatedSegment[] = [];
  /** Why a masked segment left the plain path, and whether it was retried. */
  const reasonByMasked = new Map<string, string>();
  const retriedMasked = new Set<string>();
  let retries = 0;

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

    // A translation that is the English (echoed by the model, or an empty part)
    // is retried once on its own. A segment that took the one-call-per-item
    // fallback after a separator-count mismatch is reported either way.
    for (let i = 0; i < uniqueItems.length; i++) {
      const item = uniqueItems[i];
      const via = result.details?.[i]?.via ?? "batch";
      const empty = uniqueTranslations[i].trim() === "";
      const echoed = empty || survivingProse(item.text, uniqueTranslations[i]).length > 0;
      if (!echoed && via !== "fallback") continue;

      const how =
        via === "fallback" ? "after a separator-count mismatch" : via === "single" ? "as a single item" : "in a batch";
      if (!echoed) {
        fallbacks.push({
          lang: targetLang,
          segment: segmentLabel(item.text),
          reason: "separator-count mismatch (re-sent on its own)",
          retried: false,
          recovered: true,
        });
        continue;
      }

      const reason = empty ? `empty output ${how}` : `echoed ${how}`;
      reasonByMasked.set(item.text, reason);
      retriedMasked.add(item.text);
      const retry = await translateBatch([item], sourceLang, targetLang, {
        model: options.model,
        temperature: options.temperature,
        ollamaUrl: options.ollamaUrl,
        glossary: options.glossary,
        softwareGlossary: options.softwareGlossary,
        polish: options.polish,
        batchCharLimit: options.batchCharLimit,
      });
      ollamaCalls += retry.ollamaCalls;
      retries++;
      const again = retry.translations[0] ?? "";
      const recovered = again.trim() !== "" && survivingProse(item.text, again).length === 0;
      if (recovered) uniqueTranslations[i] = again;
      fallbacks.push({
        lang: targetLang,
        segment: segmentLabel(item.text),
        reason,
        retried: true,
        recovered,
      });
    }

    // Cache the results, under each miss's own key: two misses can share a
    // masked text but differ in which protected-term rules fired. A segment
    // that is still the English is never cached.
    if (useCache) {
      misses.forEach((m, i) => {
        const translation = uniqueTranslations[missToUnique[i]];
        if (translation.trim() === "" || survivingProse(m.text, translation).length > 0) return;
        setCached(cache, m.key, translation, modelStr, m.text, targetLang);
      });
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
    let cleaned: string;
    if (item.resolved !== undefined) {
      cleaned = item.resolved;
    } else {
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

      cleaned = cleanTranslation(translated, item.kind === "heading");

      // Put the inline code spans and protected terms back. If the
      // placeholders did not survive the round trip the translation has
      // silently lost or doubled an identifier, so fall back to the source
      // text: untranslated prose is a visible, reportable cost, whereas a
      // mangled `npm install` line reads as correct and is not. The fallback
      // is the masked source restored, which is the source with its counts
      // written as N/M.
      if (item.spans.length > 0) {
        const restored = restoreCodeSpans(cleaned, item.spans);
        if (restored.intact) {
          cleaned = restored.text;
        } else {
          warnings.push(
            `[segment "${item.original.slice(0, 40)}…"]: code-span placeholders did not survive translation; kept the source text so the identifiers stay correct.`,
          );
          cleaned = restoreCodeSpans(item.text, item.spans).text;
          reasonByMasked.set(item.text, "code-span placeholders did not survive; the source text was kept");
        }
      }

      // The finished segment, whatever road it took (model, retry, an empty
      // part, the placeholder fallback): any prose line still identical to the
      // English is untranslated. A pinned segment never reaches here.
      for (const line of survivingProse(item.original, cleaned)) {
        untranslated.push({
          lang: targetLang,
          segment: segmentLabel(item.original),
          line: segmentLabel(line),
          words: proseWords(line).length,
          reason: reasonByMasked.get(item.text) ?? (item.cacheHit ? "kept from the cache" : "returned as the English"),
          retried: retriedMasked.has(item.text),
        });
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

  // §2: Rewrite restored English anchor slugs to the translated headings' slugs
  // before the survival check runs, unless `anchor` was switched off in terms (F7).
  let translatedMarkdown = output.join("\n");
  if (anchorsEnabled(terms)) {
    const slugMap = buildHeadingSlugMap(segments, translationMap);
    translatedMarkdown = rewriteAnchors(translatedMarkdown, slugMap);
  }

  // The survival check reads the finished file, so it covers every road a
  // segment took to get there: the model, the cache, a pin, or a fallback.
  const lostSpans = checkSurvival(markdown, translatedMarkdown, { lang: targetLang, terms, warnings });

  const result: TranslateMarkdownResult = {
    markdown: translatedMarkdown,
    segments: batchItems.length,
    cached: cacheHits,
    translated: uniqueItems.length,
    deduplicated,
    fuzzyMatched: fuzzyHits,
    pinned: pinnedItems,
    ollamaCalls,
    durationMs: Date.now() - start,
    warnings,
    lostSpans,
    untranslated,
    fallbacks,
    retries,
  };

  // After the cache is saved: a failed check must not cost the translations.
  enforceLostSpanPolicy(lostSpans, onLostSpan, result);
  enforceUntranslatedPolicy(untranslated, onUntranslated, result);
  return result;
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
