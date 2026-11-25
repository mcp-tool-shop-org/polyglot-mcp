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
import { PLACEHOLDER_PATTERN, codeSpansMatch, extractCodeSpans, maskCodeSpans, restoreCodeSpans, strayBacktickCount } from "./codeSpans.js";
import { MIN_NUM_PREDICT, estimateTokens, resolveNumCtx } from "./numCtx.js";
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
   * Called after every model call made while retrying or re-cutting an unusable segment, where
   * `onProgress` cannot move (its count is already at the last segment). A host that watches for a
   * stalled run (the Colab lane's stall guard) counts these as progress, so a language working
   * through retries alone is not mistaken for a hung one.
   */
  onHeartbeat?: () => void;
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

// ─── Line by line ─────────────────────────────────────────────────

/**
 * Placeholders `⟦n⟧` in a piece, renumbered from 0 in order of first use. `order[k]`
 * is the segment's own number for local placeholder k, and `spans[k]` what it stands for.
 * Uses the same pattern as restoreCodeSpans, so a placeholder is the same thing everywhere.
 */
function localiseLine(line: string, spans: readonly string[]): { text: string; spans: string[]; order: number[] } {
  const local: string[] = [];
  const order: number[] = [];
  const index = new Map<number, number>();
  const text = line.replace(PLACEHOLDER_PATTERN, (_m, n: string) => {
    const global = Number(n);
    if (!index.has(global)) {
      index.set(global, local.length);
      local.push(spans[global] ?? "");
      order.push(global);
    }
    return `⟦${index.get(global)}⟧`;
  });
  return { text, spans: local, order };
}

/** `[label](target)`, `![alt](src)` and `[label][ref]` in `text`, as [start, end) ranges. A label may wrap lines. */
function linkRanges(text: string): Array<[number, number]> {
  const n = text.length;
  const nextBracket = new Int32Array(n + 2).fill(n);
  const nextParen = new Int32Array(n + 2).fill(n);
  for (let i = n - 1; i >= 0; i--) {
    nextBracket[i] = text[i] === "]" ? i : nextBracket[i + 1]!;
    nextParen[i] = text[i] === ")" ? i : nextParen[i + 1]!;
  }
  const out: Array<[number, number]> = [];
  let i = 0;
  while (i < n) {
    const open = text[i] === "[" ? i : text[i] === "!" && text[i + 1] === "[" ? i + 1 : -1;
    if (open >= 0) {
      const close = nextBracket[open + 1]!;
      const after = close < n ? text[close + 1] : undefined;
      if (after === "(" || after === "[") {
        const end = after === "(" ? nextParen[close + 2]! : nextBracket[close + 2]!;
        if (end < n && end - i <= 600) {
          out.push([i, end + 1]);
          i = end + 1;
          continue;
        }
      }
    }
    i++;
  }
  return out;
}

/** A position test over sorted, disjoint ranges, for positions asked in increasing order. */
function insideAny(ranges: ReadonlyArray<[number, number]>): (pos: number) => boolean {
  let k = 0;
  return (pos) => {
    while (k < ranges.length && ranges[k]![1] <= pos) k++;
    return k < ranges.length && ranges[k]![0] <= pos && pos < ranges[k]![1];
  };
}

const BLOCK_START = /^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/;

/**
 * Pieces of a masked segment. "line": its lines. "sentence": its blocks (a list
 * item or paragraph, with hard-wrapped lines joined by a space) split into
 * sentences. Neither mode ever cuts inside a link, whose label may contain a
 * stop or a line break; a link is one piece of text.
 */
function pieces(text: string, mode: "line" | "sentence"): string[][] {
  const inLink = insideAny(linkRanges(text));
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n" && !inLink(i)) {
      lines.push(text.slice(start, i));
      start = i + 1;
    }
  }
  lines.push(text.slice(start));
  if (mode === "line") return lines.map((l) => [l]);

  const blocks: string[] = [];
  for (const line of lines) {
    if (blocks.length === 0 || line.trim() === "" || BLOCK_START.test(line) || blocks[blocks.length - 1]!.trim() === "") {
      blocks.push(line);
    } else {
      blocks[blocks.length - 1] += ` ${line.trim()}`;
    }
  }
  return blocks.map((block) => {
    const inside = insideAny(linkRanges(block));
    const out: string[] = [];
    let from = 0;
    for (let i = 0; i < block.length; i++) {
      if (".!?。！？".includes(block[i]!) && i + 1 < block.length && /\s/.test(block[i + 1]!) && !inside(i)) {
        out.push(block.slice(from, i + 1));
        from = i + 2;
      }
    }
    if (from < block.length) out.push(block.slice(from));
    const sentences = out.map((x) => x.trim()).filter((x) => x !== "");
    return sentences.length > 0 ? sentences : [block];
  });
}

/**
 * Split `sentence` into pieces each carrying at most `maxSpans` placeholders
 * (unless an indivisible atomic construct such as `[label](url)` holds more).
 * Cuts only outside atomic ranges (links, HTML tags, placeholders, short bold
 * spans), preferring `; ` / `: ` / ` — `, then `, `, then whitespace, then
 * inline punctuation such as `/` so reassembly restores exact spacing.
 * Scans in time bounded by `n × atomic ranges` without regex backtracking.
 */
export function splitSpanBounded(
  sentence: string,
  maxSpans: number,
): Array<{ piece: string; sep: string }> {
  const placeholders = [...sentence.matchAll(PLACEHOLDER_PATTERN)]
    .map((m) => [m.index!, m.index! + m[0].length] as [number, number]);
  if (placeholders.length <= maxSpans) return [{ piece: sentence, sep: "" }];

  const rawAtomic: Array<[number, number]> = [...linkRanges(sentence), ...placeholders];
  const isAsciiAlpha = (ch: string): boolean => (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
  let scan = 0;
  while (scan < sentence.length) {
    if (sentence[scan] === "<") {
      const nameIdx = sentence[scan + 1] === "/" ? scan + 2 : scan + 1;
      if (nameIdx < sentence.length && isAsciiAlpha(sentence[nameIdx]!)) {
        let close = nameIdx + 1;
        while (close < sentence.length && sentence[close] !== ">" && sentence[close] !== "<" && sentence[close] !== "\n") {
          close++;
        }
        if (close < sentence.length && sentence[close] === ">") {
          rawAtomic.push([scan, close + 1]);
          scan = close + 1;
          continue;
        }
        scan = close;
        continue;
      }
    }
    scan++;
  }
  let boldPos = 0;
  while (boldPos < sentence.length) {
    const open = sentence.indexOf("**", boldPos);
    if (open === -1) break;
    const close = sentence.indexOf("**", open + 2);
    if (close === -1) break;
    if (close - open <= 120 && !sentence.slice(open + 2, close).includes("\n")) {
      const end = close + 2;
      const innerCount = placeholders.filter(([s, e]) => s >= open && e <= end).length;
      if (innerCount <= maxSpans) {
        rawAtomic.push([open, end]);
      }
      boldPos = end;
    } else {
      boldPos = open + 2;
    }
  }
  rawAtomic.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const atomic: Array<[number, number]> = [];
  for (const r of rawAtomic) {
    const last = atomic[atomic.length - 1];
    if (last && r[0] < last[1]) {
      last[1] = Math.max(last[1], r[1]);
    } else {
      atomic.push([r[0], r[1]]);
    }
  }
  const atomicContaining = (pos: number): [number, number] | undefined =>
    atomic.find(([s, e]) => s <= pos && pos < e);
  const insideAtomic = (pos: number): boolean => atomicContaining(pos) !== undefined;

  const isHorizWs = (ch: string | undefined): boolean => ch === " " || ch === "\t";
  const wsEnd = (from: number, hi: number): number => {
    let p = from;
    while (p < hi && isHorizWs(sentence[p])) p++;
    return p;
  };
  const findClauseCut = (lo: number, hi: number): { pieceEnd: number; nextStart: number } | null => {
    let best: { pieceEnd: number; nextStart: number } | null = null;
    for (let idx = lo; idx < hi; idx++) {
      const ch = sentence[idx];
      if ((ch === ";" || ch === ":") && !insideAtomic(idx)) {
        const end = wsEnd(idx + 1, hi);
        if (end > idx + 1 && !insideAtomic(end - 1)) best = { pieceEnd: idx + 1, nextStart: end };
      } else if (
        idx + 3 <= hi &&
        ch === " " &&
        sentence[idx + 1] === "—" &&
        sentence[idx + 2] === " " &&
        !insideAtomic(idx) &&
        !insideAtomic(idx + 2)
      ) {
        best = { pieceEnd: idx, nextStart: idx + 3 };
      }
    }
    return best;
  };
  const findCommaCut = (lo: number, hi: number): { pieceEnd: number; nextStart: number } | null => {
    let best: { pieceEnd: number; nextStart: number } | null = null;
    for (let idx = lo; idx < hi; idx++) {
      if (sentence[idx] === "," && !insideAtomic(idx)) {
        const end = wsEnd(idx + 1, hi);
        if (end > idx + 1 && !insideAtomic(end - 1)) best = { pieceEnd: idx + 1, nextStart: end };
      }
    }
    return best;
  };
  const findSpaceCut = (lo: number, hi: number): { pieceEnd: number; nextStart: number } | null => {
    let best: { pieceEnd: number; nextStart: number } | null = null;
    for (let idx = lo; idx < hi; idx++) {
      if (isHorizWs(sentence[idx]) && !insideAtomic(idx)) {
        const end = wsEnd(idx, hi);
        if (!insideAtomic(end - 1)) best = { pieceEnd: idx, nextStart: end };
        idx = end - 1;
      }
    }
    return best;
  };

  const out: Array<{ piece: string; sep: string }> = [];
  let cursor = 0;

  while (true) {
    const remaining = placeholders.filter(([s]) => s >= cursor);
    if (remaining.length <= maxSpans) {
      const tail = sentence.slice(cursor);
      if (tail !== "" || out.length === 0) out.push({ piece: tail, sep: "" });
      break;
    }

    let limitIdx = maxSpans - 1;
    while (limitIdx + 1 < remaining.length) {
      const curBox = atomicContaining(remaining[limitIdx]![0]);
      const nextBox = atomicContaining(remaining[limitIdx + 1]![0]);
      if (curBox && nextBox && curBox[0] === nextBox[0] && curBox[1] === nextBox[1]) {
        limitIdx++;
      } else {
        break;
      }
    }
    if (limitIdx + 1 >= remaining.length) {
      out.push({ piece: sentence.slice(cursor), sep: "" });
      break;
    }

    const firstBox = atomicContaining(remaining[0]![0]);
    const limitBox = atomicContaining(remaining[limitIdx]![0]);
    const nextBox = atomicContaining(remaining[limitIdx + 1]![0]);
    const minCut = Math.max(remaining[0]![1], firstBox ? firstBox[1] : 0);
    const tightMin = Math.max(remaining[limitIdx]![1], limitBox ? limitBox[1] : 0);
    const maxCut = Math.min(remaining[limitIdx + 1]![0], nextBox ? nextBox[0] : sentence.length);

    if (tightMin > maxCut) {
      // Unreachable unless atomic boxes overlapped inconsistently; fail safe without splitting.
      out.push({ piece: sentence.slice(cursor), sep: "" });
      break;
    }

    const cut =
      findClauseCut(minCut, maxCut) ??
      findCommaCut(tightMin, maxCut) ??
      findCommaCut(minCut, maxCut) ??
      findSpaceCut(tightMin, maxCut) ??
      findSpaceCut(minCut, maxCut);

    if (cut) {
      out.push({ piece: sentence.slice(cursor, cut.pieceEnd), sep: sentence.slice(cut.pieceEnd, cut.nextStart) });
      cursor = cut.nextStart;
    } else if (tightMin < maxCut) {
      // Non-whitespace separator between spans (e.g. `⟦0⟧/⟦1⟧`).
      out.push({ piece: sentence.slice(cursor, tightMin), sep: sentence.slice(tightMin, maxCut) });
      cursor = maxCut;
    } else {
      out.push({ piece: sentence.slice(cursor, maxCut), sep: "" });
      cursor = maxCut;
    }
  }

  return out;
}

interface SegmentBlock {
  rawLines: string[];
  joined: string;
  sentences: string[];
}

function splitSentences(block: string): string[] {
  const inside = insideAny(linkRanges(block));
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < block.length; i++) {
    if (".!?。！？".includes(block[i]!) && i + 1 < block.length && /\s/.test(block[i + 1]!) && !inside(i)) {
      out.push(block.slice(from, i + 1));
      from = i + 2;
    }
  }
  if (from < block.length) out.push(block.slice(from));
  const sentences = out.map((x) => x.trim()).filter((x) => x !== "");
  return sentences.length > 0 ? sentences : [block];
}

function buildSegmentBlocks(text: string): SegmentBlock[] {
  const inLink = insideAny(linkRanges(text));
  const rawLines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n" && !inLink(i)) {
      rawLines.push(text.slice(start, i));
      start = i + 1;
    }
  }
  rawLines.push(text.slice(start));

  const grouped: string[][] = [];
  for (const line of rawLines) {
    if (
      grouped.length === 0 ||
      line.trim() === "" ||
      BLOCK_START.test(line) ||
      grouped[grouped.length - 1]![0]!.trim() === ""
    ) {
      grouped.push([line]);
    } else {
      grouped[grouped.length - 1]!.push(line);
    }
  }

  return grouped.map((linesInBlock) => {
    const joined = linesInBlock
      .map((l, idx) => (idx === 0 ? l : l.trim()))
      .join(linesInBlock.length > 1 ? " " : "");
    return {
      rawLines: linesInBlock,
      joined,
      sentences: splitSentences(joined),
    };
  });
}

async function translatePiece(
  piece: string,
  spans: readonly string[],
  kind: BatchItem["kind"],
  sourceLang: string,
  targetLang: string,
  batchOptions: Omit<TranslateBatchOptions, "batchCharLimit">,
  onHeartbeat?: () => void,
): Promise<{ text: string | undefined; reason?: UnusableReason; calls: number }> {
  if (!/\p{L}/u.test(piece.replace(PLACEHOLDER_PATTERN, ""))) {
    return { text: piece, calls: 0 };
  }
  const local = localiseLine(piece, spans);
  const r = await translateBatch([{ text: local.text, kind }], sourceLang, targetLang, {
    ...batchOptions,
    batchCharLimit: 1,
  });
  onHeartbeat?.();
  const answer = r.translations[0] ?? "";
  const reason = unusableReason(local.text, local.spans, answer, false);
  if (reason !== undefined) {
    return { text: undefined, reason, calls: r.ollamaCalls };
  }
  const restoredNum = cleanTranslation(answer).replace(
    PLACEHOLDER_PATTERN,
    (_m, k: string) => `⟦${local.order[Number(k)]}⟧`,
  );
  return { text: restoredNum, calls: r.ollamaCalls };
}

function isPieceUsableInGlobal(
  sourcePiece: string,
  outputWithGlobalPlaceholders: string,
  spans: readonly string[],
): boolean {
  const local = localiseLine(sourcePiece, spans);
  const localOut = outputWithGlobalPlaceholders.replace(PLACEHOLDER_PATTERN, (m, g: string) => {
    const idx = local.order.indexOf(Number(g));
    return idx >= 0 ? `⟦${idx}⟧` : m;
  });
  return unusableReason(local.text, local.spans, localOut, false) === undefined;
}

async function translateSentenceSpanBounded(
  sentence: string,
  spans: readonly string[],
  kind: BatchItem["kind"],
  sourceLang: string,
  targetLang: string,
  batchOptions: Omit<TranslateBatchOptions, "batchCharLimit">,
  onHeartbeat?: () => void,
): Promise<{ text: string | undefined; sawPlaceholderFailure?: boolean; calls: number }> {
  let calls = 0;
  let sawPlaceholderFailure = false;
  const clauses = splitSpanBounded(sentence, 3);
  const primaryParts = clauses.length > 1 ? clauses : splitSpanBounded(sentence, 1);
  if (primaryParts.length <= 1) return { text: undefined, calls };

  const outParts: string[] = [];
  for (const part of primaryParts) {
    const res = await translatePiece(part.piece, spans, kind, sourceLang, targetLang, batchOptions, onHeartbeat);
    calls += res.calls;
    if (res.text !== undefined) {
      outParts.push(res.text + part.sep);
      continue;
    }
    if (res.reason === "placeholders") sawPlaceholderFailure = true;
    const subParts = splitSpanBounded(part.piece, 1);
    if (subParts.length <= 1) return { text: undefined, sawPlaceholderFailure, calls };
    let subOut = "";
    for (const sub of subParts) {
      const subRes = await translatePiece(sub.piece, spans, kind, sourceLang, targetLang, batchOptions, onHeartbeat);
      calls += subRes.calls;
      if (subRes.text === undefined) {
        if (subRes.reason === "placeholders") sawPlaceholderFailure = true;
        return { text: undefined, sawPlaceholderFailure, calls };
      }
      subOut += subRes.text + sub.sep;
    }
    outParts.push(subOut + part.sep);
  }

  const assembled = outParts.join("");
  return isPieceUsableInGlobal(sentence, assembled, spans)
    ? { text: assembled, calls }
    : { text: undefined, sawPlaceholderFailure, calls };
}

/**
 * True when sending `text` as a single whole-segment request would fail
 * `numPredictFor`'s context budget before reaching Ollama.
 */
function exceedsSingleCallContext(text: string): boolean {
  const numCtx = resolveNumCtx();
  const srcTokens = estimateTokens(text);
  const estPromptTokens = srcTokens + 400;
  return numCtx - estPromptTokens < Math.max(MIN_NUM_PREDICT, srcTokens);
}

// ─── Is a translation usable? ─────────────────────────────────────

/** Why a model answer cannot be used as the translation of a masked segment. */
export type UnusableReason = "empty" | "placeholders" | "english";

/**
 * Whether `raw`, the model's answer for the masked segment `masked`, can be
 * used: it is not empty, every code-span placeholder came back and restores
 * byte-equal inline code spans in order, and no prose sentence of the English
 * is still in it. The English is compared with the spans restored on both
 * sides, so a protected term or an "N of M" count counts as the words it is
 * on the page.
 *
 * This one test gates the retry, the cache write and the cache read, so a
 * segment is retried, cached or served from the cache on the same grounds.
 */
export function unusableReason(
  masked: string,
  spans: readonly string[],
  raw: string,
  isHeading: boolean,
): UnusableReason | undefined {
  const cleaned = cleanTranslation(raw, isHeading);
  if (cleaned === "") return "empty";
  if (spans.length === 0) {
    const srcCode = extractCodeSpans(masked);
    if (srcCode.length > 0 && !codeSpansMatch(srcCode, cleaned, strayBacktickCount(masked))) {
      return "placeholders";
    }
    return survivingProse(masked, cleaned).length > 0 ? "english" : undefined;
  }
  const restored = restoreCodeSpans(cleaned, [...spans]);
  if (!restored.intact) return "placeholders";
  const expected = restoreCodeSpans(masked, [...spans]).text;
  const expectedCode = extractCodeSpans(expected);
  if (expectedCode.length > 0 && !codeSpansMatch(expectedCode, restored.text, strayBacktickCount(expected))) {
    return "placeholders";
  }
  return survivingProse(expected, restored.text).length > 0 ? "english" : undefined;
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
    if (cached !== undefined && unusableReason(masked, spans, cached, kind === "heading") !== undefined) {
      delete cache.entries[key]; // poisoned: English, empty, or placeholders that cannot be restored
      cached = undefined;
    }
    let fuzzy = (!cached && useCache)
      ? getFuzzyCached(cache, masked, targetLang, modelStr)
      : undefined;
    if (fuzzy && unusableReason(masked, spans, fuzzy.translation, kind === "heading") !== undefined) fuzzy = undefined;
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
  const partialPlaceholderFallback = new Set<string>();
  let retries = 0;

  if (uniqueItems.length > 0) {
    const oversizeIndices = new Set<number>();
    const normalItems: BatchItem[] = [];
    const normalMap: number[] = [];
    for (let i = 0; i < uniqueItems.length; i++) {
      if (exceedsSingleCallContext(uniqueItems[i].text) && pieces(uniqueItems[i].text, "line").length > 1) {
        oversizeIndices.add(i);
      } else {
        normalMap.push(i);
        normalItems.push(uniqueItems[i]);
      }
    }

    uniqueTranslations = new Array(uniqueItems.length).fill("");
    const resultDetails: Array<{ via: "single" | "batch" | "fallback"; truncated?: boolean } | undefined> = new Array(
      uniqueItems.length,
    );
    if (normalItems.length > 0) {
      const result = await translateBatch(normalItems, sourceLang, targetLang, {
        model: options.model,
        temperature: options.temperature,
        ollamaUrl: options.ollamaUrl,
        glossary: options.glossary,
        softwareGlossary: options.softwareGlossary,
        polish: options.polish,
        batchCharLimit: options.batchCharLimit,
        // A heartbeat per finished group of segments, so a long document shows progress
        // before the whole call returns (the Colab stall guard reads it).
        onItemsDone: options.onProgress
          ? (done) => options.onProgress!(Math.min(totalItems - 1, completedItems + done), totalItems)
          : undefined,
      });
      ollamaCalls = result.ollamaCalls;
      for (let k = 0; k < normalItems.length; k++) {
        uniqueTranslations[normalMap[k]] = result.translations[k] ?? "";
        resultDetails[normalMap[k]] = result.details?.[k];
      }
    }

    // A translation the segment cannot use (the English echoed back, an empty
    // part, or code-span placeholders that did not come back) is retried once
    // on its own. A segment that took the one-call-per-item fallback after a
    // separator-count mismatch has already been sent on its own, so that is its
    // retry. A segment still unusable after its retry walks the piecewise
    // fallback ladder (line by line -> sentence by sentence -> span by span),
    // keeping each clean block so one unrecoverable line never throws away
    // sibling lines in the same block list.
    const spansByMasked = new Map<string, string[]>();
    for (const m of misses) if (!spansByMasked.has(m.text)) spansByMasked.set(m.text, m.spans);
    const batchOptions = {
      model: options.model,
      temperature: options.temperature,
      ollamaUrl: options.ollamaUrl,
      glossary: options.glossary,
      softwareGlossary: options.softwareGlossary,
      polish: options.polish,
      batchCharLimit: options.batchCharLimit,
    };
    for (let i = 0; i < uniqueItems.length; i++) {
      const item = uniqueItems[i];
      const spans = spansByMasked.get(item.text) ?? [];
      const isHeading = item.kind === "heading";
      const isOversize = oversizeIndices.has(i);
      const via = resultDetails[i]?.via ?? "batch";
      const problem = isOversize ? "empty" : unusableReason(item.text, spans, uniqueTranslations[i], isHeading);
      if (problem === undefined && via !== "fallback") continue;

      const truncated = resultDetails[i]?.truncated === true;
      const how =
        via === "fallback" ? "after a separator-count mismatch" : via === "single" ? "as a single item" : "in a batch";
      if (problem === undefined) {
        fallbacks.push({
          lang: targetLang,
          segment: segmentLabel(item.text),
          reason: "separator-count mismatch (re-sent on its own)",
          retried: false,
          recovered: true,
        });
        continue;
      }

      const what = isOversize
        ? "segment exceeds single-call context window"
        : problem === "empty"
          ? truncated
            ? `output cut off at the num_predict cap ${how}`
            : `empty output ${how}`
          : problem === "placeholders"
            ? `code-span placeholders did not survive ${how}`
            : `echoed ${how}`;
      retriedMasked.add(item.text);

      let recovered = false;
      let route = what;
      let sawPlaceholderFailure = problem === "placeholders";
      if (!isOversize && via !== "fallback") {
        const retry = await translateBatch([item], sourceLang, targetLang, batchOptions);
        ollamaCalls += retry.ollamaCalls;
        retries++;
        options.onHeartbeat?.();
        const again = retry.translations[0] ?? "";
        const retryProblem = unusableReason(item.text, spans, again, isHeading);
        if (retryProblem === undefined) {
          uniqueTranslations[i] = again;
          recovered = true;
        } else if (retryProblem === "placeholders") {
          sawPlaceholderFailure = true;
        }
      } else if (!isOversize) {
        route = `${what} (its one-call-per-item answer was its retry)`;
      }

      if (!recovered) {
        const blocks = buildSegmentBlocks(item.text);
        const blockDone: Array<string | undefined> = new Array(blocks.length).fill(undefined);
        const sentenceDone: Array<Array<string | undefined>> = blocks.map((b) =>
          new Array(b.sentences.length).fill(undefined),
        );
        const hasLines = pieces(item.text, "line").length > 1;
        const sameCut =
          pieces(item.text, "line").flat().join("\n") === pieces(item.text, "sentence").flat().join("\n");

        // Rung 1: line by line (multi-line segments)
        if (hasLines) {
          const lineResults: Array<Array<string | undefined>> = [];
          let allLinesOk = true;
          for (let b = 0; b < blocks.length; b++) {
            const blk = blocks[b]!;
            const resLines: Array<string | undefined> = [];
            for (const rawLine of blk.rawLines) {
              const r = await translatePiece(
                rawLine,
                spans,
                item.kind,
                sourceLang,
                targetLang,
                batchOptions,
                options.onHeartbeat,
              );
              ollamaCalls += r.calls;
              if (r.text === undefined) {
                allLinesOk = false;
                if (r.reason === "placeholders") sawPlaceholderFailure = true;
              }
              resLines.push(r.text);
            }
            lineResults.push(resLines);
          }

          let whole: UnusableReason | undefined = allLinesOk ? undefined : "placeholders";
          if (allLinesOk) {
            const candidate = lineResults.map((ls) => ls.join("\n")).join("\n");
            whole = unusableReason(item.text, spans, candidate, isHeading);
            if (whole === undefined) {
              uniqueTranslations[i] = candidate;
              recovered = true;
              route += "; translated line by line";
            } else {
              route += `; line by line did not recover it (the reassembled segment was still ${whole === "english" ? "English" : whole})`;
            }
          } else {
            route += "; line by line did not recover it";
          }

          if (!recovered) {
            // Preserve single-line blocks that passed cleanly; multi-line blocks
            // re-run joined in sentence mode if needed.
            for (let b = 0; b < blocks.length; b++) {
              if (
                blocks[b]!.rawLines.length === 1 &&
                lineResults[b]![0] !== undefined &&
                isPieceUsableInGlobal(blocks[b]!.joined, lineResults[b]![0]!, spans)
              ) {
                blockDone[b] = lineResults[b]![0]!;
              }
            }
          }
        }

        // Rung 2: sentence by sentence
        if (!recovered && !sameCut) {
          for (let b = 0; b < blocks.length; b++) {
            if (blockDone[b] !== undefined) continue;
            const blk = blocks[b]!;
            for (let sIdx = 0; sIdx < blk.sentences.length; sIdx++) {
              const sent = blk.sentences[sIdx]!;
              const r = await translatePiece(
                sent,
                spans,
                item.kind,
                sourceLang,
                targetLang,
                batchOptions,
                options.onHeartbeat,
              );
              ollamaCalls += r.calls;
              if (r.text === undefined) {
                if (r.reason === "placeholders") sawPlaceholderFailure = true;
              } else {
                sentenceDone[b]![sIdx] = r.text;
              }
            }
            if (sentenceDone[b]!.every((x) => x !== undefined)) {
              const joinedOut = sentenceDone[b]!.join(" ");
              if (isPieceUsableInGlobal(blk.joined, joinedOut, spans)) {
                blockDone[b] = joinedOut;
              }
            }
          }

          if (blockDone.every((x) => x !== undefined)) {
            const candidate = blockDone.join("\n");
            const whole = unusableReason(item.text, spans, candidate, isHeading);
            if (whole === undefined) {
              uniqueTranslations[i] = candidate;
              recovered = true;
              route += "; translated sentence by sentence";
            } else {
              route += `; sentence by sentence did not recover it (the reassembled segment was still ${whole === "english" ? "English" : whole})`;
            }
          } else {
            route += "; sentence by sentence did not recover it";
          }
        }

        // Rung 3: span by span (split dense sentences down to <=3 then <=1 placeholders)
        const hasDenseSentence =
          !recovered &&
          (sawPlaceholderFailure || isOversize || truncated) &&
          blocks.some(
            (blk, b) =>
              blockDone[b] === undefined &&
              blk.sentences.some(
                (sent, sIdx) => sentenceDone[b]![sIdx] === undefined && splitSpanBounded(sent, 1).length > 1,
              ),
          );
        if (hasDenseSentence) {
          for (let b = 0; b < blocks.length; b++) {
            if (blockDone[b] !== undefined) continue;
            const blk = blocks[b]!;
            for (let sIdx = 0; sIdx < blk.sentences.length; sIdx++) {
              if (sentenceDone[b]![sIdx] !== undefined) continue;
              const sent = blk.sentences[sIdx]!;
              if (splitSpanBounded(sent, 1).length <= 1) continue;
              const r = await translateSentenceSpanBounded(
                sent,
                spans,
                item.kind,
                sourceLang,
                targetLang,
                batchOptions,
                options.onHeartbeat,
              );
              ollamaCalls += r.calls;
              if (r.text === undefined) {
                if (r.sawPlaceholderFailure) sawPlaceholderFailure = true;
              } else {
                sentenceDone[b]![sIdx] = r.text;
              }
            }
            if (sentenceDone[b]!.every((x) => x !== undefined)) {
              const joinedOut = sentenceDone[b]!.join(" ");
              if (isPieceUsableInGlobal(blk.joined, joinedOut, spans)) {
                blockDone[b] = joinedOut;
              }
            }
          }

          if (blockDone.every((x) => x !== undefined)) {
            const candidate = blockDone.join("\n");
            const whole = unusableReason(item.text, spans, candidate, isHeading);
            if (whole === undefined) {
              uniqueTranslations[i] = candidate;
              recovered = true;
              route += "; translated span by span";
            } else {
              route += `; span by span did not recover it (the reassembled segment was still ${whole === "english" ? "English" : whole})`;
            }
          } else {
            route += "; span by span did not recover it";
          }
        }

        // Per-block salvage: keep translated blocks and fall back to English only
        // for blocks that failed, so one unrecoverable line never blanks out siblings.
        if (!recovered && blocks.length > 1 && blockDone.some((x) => x !== undefined)) {
          uniqueTranslations[i] = blocks.map((blk, b) => blockDone[b] ?? blk.rawLines.join("\n")).join("\n");
          if (sawPlaceholderFailure) partialPlaceholderFallback.add(item.text);
        } else if (!recovered && isOversize) {
          uniqueTranslations[i] = item.text;
        }
      }

      reasonByMasked.set(item.text, route);
      fallbacks.push({ lang: targetLang, segment: segmentLabel(item.text), reason: route, retried: true, recovered });
    }

    // Cache the results, under each miss's own key: two misses can share a
    // masked text but differ in which protected-term rules fired. A segment
    // that is still the English is never cached.
    if (useCache) {
      misses.forEach((m, i) => {
        const translation = uniqueTranslations[missToUnique[i]];
        if (unusableReason(m.text, m.spans, translation, m.kind === "heading") !== undefined) return;
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
      // placeholders did not survive the round trip (or an unmasked segment
      // altered an inline code span) the translation has silently lost or
      // damaged an identifier, so fall back to the source text: untranslated
      // prose is a visible, reportable cost, whereas a mangled `npm install`
      // line reads as correct and is not. The fallback is the masked source
      // restored, which is the source with its counts written as N/M.
      const recordPlaceholderFallback = (partial: boolean) => {
        warnings.push(
          partial
            ? `[segment "${item.original.slice(0, 40)}…"]: code-span placeholders did not survive translation on every line; kept the source text for some lines while keeping translated sibling blocks.`
            : `[segment "${item.original.slice(0, 40)}…"]: code-span placeholders did not survive translation; kept the source text so the identifiers stay correct.`,
        );
        reasonByMasked.set(
          item.text,
          `${reasonByMasked.get(item.text) ?? "code-span placeholders did not survive"}; ${
            partial ? "the source text was kept for some lines" : "the source text was kept"
          }`,
        );
      };

      const expected = item.spans.length > 0 ? restoreCodeSpans(item.text, item.spans).text : item.original;
      const expectedCode = extractCodeSpans(expected);
      if (item.spans.length > 0) {
        const restored = restoreCodeSpans(cleaned, item.spans);
        const spansOk =
          restored.intact &&
          (expectedCode.length === 0 || codeSpansMatch(expectedCode, restored.text, strayBacktickCount(expected)));
        if (spansOk) {
          cleaned = restored.text;
          if (partialPlaceholderFallback.has(item.text)) recordPlaceholderFallback(true);
        } else {
          recordPlaceholderFallback(false);
          cleaned = expected;
        }
      } else if (expectedCode.length > 0 && !codeSpansMatch(expectedCode, cleaned, strayBacktickCount(expected))) {
        recordPlaceholderFallback(false);
        cleaned = expected;
        if (!retriedMasked.has(item.text)) {
          fallbacks.push({
            lang: targetLang,
            segment: segmentLabel(item.text),
            reason: reasonByMasked.get(item.text) ?? "code-span placeholders did not survive; the source text was kept",
            retried: false,
            recovered: false,
          });
        }
      } else if (partialPlaceholderFallback.has(item.text)) {
        recordPlaceholderFallback(true);
      }

      // The finished segment, whatever road it took (model, retry, an empty
      // part, the placeholder fallback): any prose line still identical to the
      // English is untranslated. A pinned segment never reaches here.
      for (const line of survivingProse(expected, cleaned)) {
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
