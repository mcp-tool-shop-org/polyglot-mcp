/**
 * The survival check: after translation, every protected span in the English
 * must still be on the page, character for character, and every in-page anchor
 * that resolved in the English must resolve in the translation.
 *
 * Masking (codeSpans.ts, protectedTerms.ts) keeps identifiers away from the
 * model, but a translation can still reach the page by other roads: a pinned
 * hand fix, a cached entry, a fallback, or a term the masking did not cover.
 * This check reads the result, not the process, so it catches all of them.
 *
 * Table cells get a second, independent check: the multiset of numbers in
 * each cell must match the source cell. Not the order — correct Chinese for
 * "218 of 224" puts the total first (`224 首中的 218 首`), while the reversed
 * slip (`218 首中的 224 首`) keeps the English order, so an order check would
 * flag the right answer and pass the wrong one. Digits from other scripts are
 * normalised before comparing, and grouping or decimal separators are not
 * compared at all, since a target locale may write 1,000 as 1.000 or 1 000.
 */

import GithubSlugger from "github-slugger";
import { CODE_SPAN_PATTERN, maskCodeSpans, type MaskedSpanKind } from "./codeSpans.js";
import { PolyglotError } from "./errors.js";
import { DEFAULT_PROTECTED_TERMS, type ProtectedTermSet } from "./protectedTerms.js";

/** What a lost span was. */
export type LostSpanKind = MaskedSpanKind | "number" | "code-span-count" | "fence-count";

export interface LostSpan {
  /** Target language code. */
  lang: string;
  /** The English segment (heading, paragraph or table cell) it belongs to, shortened. */
  segment: string;
  /** The span that is missing from the translation, as it should read there. */
  span: string;
  kind: LostSpanKind;
  /** What the translation has instead, where that is useful (numbers, counts, anchors). */
  found?: string;
}

/** What to do when a span is lost: fail the run, or report it and carry on. */
export type LostSpanPolicy = "fail" | "report";

/** Shorten a segment for a report line. */
export const segmentLabel = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
};

/** Occurrences of `needle` in `haystack`, not overlapping. */
function occurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count++;
  return count;
}

/**
 * The protected spans a source segment must carry into its translation, as
 * they should read there (a count as `N/M`), with how many times each occurs.
 *
 * `anchor` spans are exempt from the exact-text check: §2 rewrites them to the
 * translated headings' slugs, and §3 checks that they resolve.
 */
export function expectedSpans(
  source: string,
  terms: ProtectedTermSet = DEFAULT_PROTECTED_TERMS,
): Map<string, { kind: MaskedSpanKind; count: number }> {
  const { spans, kinds } = maskCodeSpans(source, terms);
  const expected = new Map<string, { kind: MaskedSpanKind; count: number }>();
  spans.forEach((span, i) => {
    if (kinds[i] === "anchor") return;
    const entry = expected.get(span);
    if (entry) entry.count++;
    else expected.set(span, { kind: kinds[i], count: 1 });
  });
  return expected;
}

// ─── Numbers ──────────────────────────────────────────────────────

const DECIMAL_DIGIT = /\p{Nd}/u;

/** The value of one decimal digit character from any script. */
function digitValue(ch: string): string {
  const compat = ch.normalize("NFKC");
  if (/^[0-9]$/.test(compat)) return compat; // ASCII, full-width, mathematical
  // Every other decimal digit sits in a run of ten that starts at its zero.
  const cp = ch.codePointAt(0)!;
  let value = 0;
  while (value < 9 && DECIMAL_DIGIT.test(String.fromCodePoint(cp - value - 1))) value++;
  return String(value);
}

/** Replace every decimal digit, in any script, with its ASCII digit. */
export function normalizeDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, digitValue);
}

/** The digit runs in a text, after normalising digits, sorted (a multiset). */
export function numberMultiset(text: string): string[] {
  return (normalizeDigits(text).match(/[0-9]+/g) ?? []).sort();
}

/** True when two cells carry the same numbers, in any order. */
export function cellNumbersMatch(source: string, translation: string): boolean {
  const a = numberMultiset(source);
  const b = numberMultiset(translation);
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

// ─── Per-segment check ────────────────────────────────────────────

export interface SegmentCheckOptions {
  /** Protected-term set. Default: the default patterns. */
  terms?: ProtectedTermSet;
  /** Also compare the numbers (table cells). */
  isCell?: boolean;
}

/**
 * Check one translated segment against its source: every protected span is
 * present as often as in the source, and for a table cell the numbers match.
 */
export function checkSegment(
  source: string,
  translation: string,
  lang: string,
  options: SegmentCheckOptions = {},
): LostSpan[] {
  const lost: LostSpan[] = [];
  const segment = segmentLabel(source);
  for (const [span, { kind, count }] of expectedSpans(source, options.terms)) {
    if (kind === "anchor") continue;
    if (occurrences(translation, span) < count) lost.push({ lang, segment, span, kind });
  }
  if (options.isCell && !cellNumbersMatch(source, translation)) {
    lost.push({
      lang,
      segment,
      span: numberMultiset(source).join(" ") || "(no numbers)",
      kind: "number",
      found: numberMultiset(translation).join(" ") || "(no numbers)",
    });
  }
  return lost;
}

// ─── Headings & in-page anchors ───────────────────────────────────

/**
 * Decode a percent-encoded slug safely; malformed `%` sequences stay as written
 * rather than throwing `URIError` (F4).
 */
export function safeDecodeSlug(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Strip inline Markdown markup from an ATX heading so `github-slugger` sees the
 * rendered text GitHub slugs (F6):
 * 1. Strip opening `^#{1,6}\s+` and whitespace-preceded closing `\s+#+\s*$`.
 * 2. Mask inline code spans first, keeping their literal content.
 * 3. Outside code: strip images and links to their text, remove HTML tags, and
 *    remove emphasis delimiters at word boundaries.
 * 4. Restore inline code content and `.trim()`.
 */
export function stripHeadingMarkup(raw: string): string {
  let text = raw.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "");

  const codeSpans: string[] = [];
  text = text.replace(/(`+)([^`\n]*?)\1/g, (_m, _ticks: string, content: string) => {
    const inner =
      content.length >= 2 && content.startsWith(" ") && content.endsWith(" ") && /[^ ]/.test(content)
        ? content.slice(1, -1)
        : content;
    codeSpans.push(inner);
    return `\uE000${codeSpans.length - 1}\uE001`;
  });

  let prev: string;
  do {
    prev = text;
    text = text
      .replace(/!\[([^\][\n]*)\](?:\([^)\n]*\)|\[[^\][\n]*\])/g, "$1")
      .replace(/\[([^\][\n]*)\](?:\([^)\n]*\)|\[[^\][\n]*\])/g, "$1");
  } while (text !== prev);

  text = text.replace(/<\/?[A-Za-z!][^>\n]*>/g, "");
  text = text
    .replace(/[*~]+/g, "")
    .replace(/(?<![\p{L}\p{N}])_+|_{1,}(?![\p{L}\p{N}])/gu, "");

  text = text.replace(/\uE000(\d+)\uE001/g, (_m, idx: string) => codeSpans[Number(idx)]);
  return text.trim();
}

/**
 * Slug a document's ATX headings in order with a single `GithubSlugger`
 * instance so duplicate headings get GitHub's `-1`, `-2` suffixes.
 */
export function slugifyHeadings(headings: Iterable<string>): string[] {
  const slugger = new GithubSlugger();
  const slugs: string[] = [];
  for (const h of headings) {
    slugs.push(slugger.slug(stripHeadingMarkup(h)));
  }
  return slugs;
}

export interface ExtractedAnchor {
  /** The anchor as written in the document, `#` included (e.g. `#ollama-cloud-optional`). */
  raw: string;
  /** The slug without `#`, decoded through `safeDecodeSlug`. */
  decoded: string;
  /** Shortened label of the segment or line where the anchor appears. */
  segment: string;
}

export interface DocumentAnchors {
  /** Decoded heading slugs in ATX heading order (index N = heading N). */
  headings: string[];
  /** First heading index for each decoded heading slug. */
  headingIndex: Map<string, number>;
  /** All decoded ATX heading slugs in the document. */
  headingSet: Set<string>;
  /** Explicit `id=` and `name=` attribute values outside code, decoded. */
  explicitIds: Set<string>;
  /** In-page anchor links (`](#slug)`, `[label]: #slug`, `href="#slug"`) outside code, in order. */
  anchors: ExtractedAnchor[];
}

const DOC_ANCHOR_PATTERN =
  /(?<=\]\(\s*)#([^\s)<>"'`[\]]+)(?=(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\))|(?<=\[[^\][\n]+\]:[ \t]*)#([^\s)<>"'`[\]]+)(?=(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*$)|(?<=\bhref\s*=\s*["'])#([^"'\s<>]+)(?=["'])/giu;

/**
 * Extract ATX headings, explicit HTML `id=`/`name=` anchors, and in-page
 * anchor links from `markdown`, skipping fenced code blocks, HTML comments,
 * and inline code spans (F3).
 */
export function extractDocumentAnchors(markdown: string): DocumentAnchors {
  const slugger = new GithubSlugger();
  const headings: string[] = [];
  const headingIndex = new Map<string, number>();
  const headingSet = new Set<string>();
  const explicitIds = new Set<string>();
  const anchors: ExtractedAnchor[] = [];

  const lines = markdown.split("\n");
  let inFence = false;
  let inComment = false;

  for (const line of lines) {
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

    if (/^#{1,6}\s/.test(line)) {
      const slug = safeDecodeSlug(slugger.slug(stripHeadingMarkup(line)));
      const idx = headings.length;
      headings.push(slug);
      if (slug) {
        if (!headingIndex.has(slug)) headingIndex.set(slug, idx);
        headingSet.add(slug);
      }
    }

    // F3: strip inline code spans before scanning for explicit ids and anchors.
    const lineNoCode = line.replace(/(`+)([^`\n]*?)\1/g, "");

    for (const tagMatch of lineNoCode.matchAll(/<[A-Za-z][^>\n]*>/g)) {
      const tag = tagMatch[0];
      for (const attrMatch of tag.matchAll(/\b(?:id|name)\s*=\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s>"'=]+))/gi)) {
        const val = attrMatch[1] ?? attrMatch[2] ?? attrMatch[3];
        if (val) explicitIds.add(safeDecodeSlug(val));
      }
    }

    for (const m of lineNoCode.matchAll(DOC_ANCHOR_PATTERN)) {
      const rawSlug = (m[1] ?? m[2] ?? m[3])!;
      anchors.push({
        raw: `#${rawSlug}`,
        decoded: safeDecodeSlug(rawSlug),
        segment: segmentLabel(line),
      });
    }
  }

  return { headings, headingIndex, headingSet, explicitIds, anchors };
}

export interface AnchorCheckOptions {
  /** Non-fatal findings (unresolved in source, link count mismatch) are appended here (F5). */
  warnings?: string[];
}

/**
 * §3 survival check: every in-page anchor that resolved in the source must
 * resolve in the translation to either a translated ATX heading slug or an
 * explicit `id=`/`name=` anchor (F2, F3, F4, F5).
 *
 * Source anchors that match neither an ATX heading nor an explicit id in the
 * source (including links to setext headings) are reported once in `warnings`
 * as unresolved in source and never produce a `LostSpan`.
 */
export function checkAnchors(
  source: string,
  translation: string,
  lang: string,
  options: AnchorCheckOptions = {},
): LostSpan[] {
  const src = extractDocumentAnchors(source);
  const tgt = extractDocumentAnchors(translation);
  const warnings = options.warnings;
  const lost: LostSpan[] = [];

  // F2 step 1: Index the source's anchors in document order.
  const reportedSourceBroken = new Set<string>();
  const srcStates = src.anchors.map((a) => {
    if (src.headingIndex.has(a.decoded)) {
      return { status: "heading" as const, headingIdx: src.headingIndex.get(a.decoded)! };
    }
    if (src.explicitIds.has(a.decoded)) {
      return { status: "explicit" as const };
    }
    if (warnings && !reportedSourceBroken.has(a.raw)) {
      reportedSourceBroken.add(a.raw);
      warnings.push(
        `[source "${a.segment}"]: anchor ${a.raw} is unresolved in source (no matching ATX heading or explicit id).`,
      );
    }
    return { status: "broken" as const };
  });

  const resolvesInTarget = (decoded: string): boolean =>
    tgt.headingSet.has(decoded) || tgt.explicitIds.has(decoded);

  // F2 step 4: If link counts differ, report the mismatch and fall back to a plain resolve check.
  if (src.anchors.length !== tgt.anchors.length) {
    warnings?.push(
      `[${lang}]: anchor count mismatch (source has ${src.anchors.length}, translation has ${tgt.anchors.length}); falling back to plain resolve check.`,
    );
    const srcBrokenDecoded = new Set(
      src.anchors.filter((_, idx) => srcStates[idx].status === "broken").map((a) => a.decoded),
    );
    for (const tgtA of tgt.anchors) {
      if (srcBrokenDecoded.has(tgtA.decoded)) continue;
      if (!resolvesInTarget(tgtA.decoded)) {
        const srcIdx = src.headingIndex.get(tgtA.decoded);
        const foundSlug = srcIdx !== undefined ? tgt.headings[srcIdx] : undefined;
        lost.push({
          lang,
          segment: tgtA.segment,
          span: tgtA.raw,
          kind: "anchor",
          ...(foundSlug ? { found: `#${foundSlug}` } : {}),
        });
      }
    }
    return lost;
  }

  // F2 steps 2 & 3: Pair each translated anchor with its source anchor by link order.
  for (let i = 0; i < src.anchors.length; i++) {
    const state = srcStates[i];
    if (state.status === "broken") continue; // F5: non-fatal source warning, never a LostSpan.

    const srcA = src.anchors[i];
    const tgtA = tgt.anchors[i];
    if (!resolvesInTarget(tgtA.decoded)) {
      const foundSlug = state.status === "heading" ? tgt.headings[state.headingIdx] : undefined;
      lost.push({
        lang,
        segment: srcA.segment,
        span: tgtA.raw,
        kind: "anchor",
        ...(foundSlug ? { found: `#${foundSlug}` } : {}),
      });
    }
  }

  return lost;
}

// ─── Whole-file counts ────────────────────────────────────────────

/** Count fenced code blocks and the inline code spans outside them. */
export function countCodeStructure(markdown: string): { fences: number; inlineSpans: number } {
  let fences = 0;
  let inFence = false;
  let inlineSpans = 0;
  for (const line of markdown.split("\n")) {
    if (/^```/.test(line)) {
      if (!inFence) fences++;
      inFence = !inFence;
      continue;
    }
    if (!inFence) inlineSpans += line.match(CODE_SPAN_PATTERN)?.length ?? 0;
  }
  return { fences, inlineSpans };
}

/**
 * Compare the whole-file counts of fenced blocks and inline code spans. Only a
 * shortfall is reported: a model that adds backticks has not lost anything.
 */
export function checkCodeStructure(source: string, translation: string, lang: string): LostSpan[] {
  const a = countCodeStructure(source);
  const b = countCodeStructure(translation);
  const lost: LostSpan[] = [];
  if (b.fences < a.fences) {
    lost.push({ lang, segment: "(whole file)", span: `${a.fences} fenced code blocks`, kind: "fence-count", found: String(b.fences) });
  }
  if (b.inlineSpans < a.inlineSpans) {
    lost.push({
      lang,
      segment: "(whole file)",
      span: `${a.inlineSpans} inline code spans`,
      kind: "code-span-count",
      found: String(b.inlineSpans),
    });
  }
  return lost;
}

// ─── Policy ───────────────────────────────────────────────────────

/** One line per lost span: language, segment, missing span. */
export function formatLostSpans(lost: readonly LostSpan[]): string[] {
  return lost.map(
    (l) => `[${l.lang}] "${l.segment}": missing ${l.kind} ${JSON.stringify(l.span)}${l.found !== undefined ? ` (found ${l.found})` : ""}`,
  );
}

/**
 * Thrown under `--on-lost-span=fail`. Carries the list, and the result the
 * caller would otherwise have used, so a CLI can still write the file for a
 * person to fix and pin.
 */
export class LostSpanError<R = unknown> extends PolyglotError {
  readonly lostSpans: LostSpan[];
  readonly result?: R;

  constructor(lostSpans: LostSpan[], result?: R) {
    const langs = [...new Set(lostSpans.map((l) => l.lang))].join(", ");
    super({
      code: "LOST_SPAN",
      message: [
        `${lostSpans.length} protected span(s) did not survive translation (${langs}):`,
        ...formatLostSpans(lostSpans).map((line) => `  ${line}`),
      ].join("\n"),
      hint:
        "Add the term to .polyglot-terms.json and rerun, or fix the translation by hand and pin it " +
        "(scripts/pin-translation.mjs). --on-lost-span=report writes the list and exits 0.",
      retryable: false,
    });
    this.name = "LostSpanError";
    this.lostSpans = lostSpans;
    this.result = result;
  }
}

/** Apply the policy: throw a LostSpanError under "fail" when anything was lost. */
export function enforceLostSpanPolicy<R>(lost: LostSpan[], policy: LostSpanPolicy, result?: R): void {
  if (policy === "fail" && lost.length > 0) throw new LostSpanError(lost, result);
}

/** Parse a `--on-lost-span=` value, or throw a CONFIG_ERROR. */
export function parseLostSpanPolicy(value: string | undefined, fallback: LostSpanPolicy): LostSpanPolicy {
  if (value === undefined) return fallback;
  if (value === "fail" || value === "report") return value;
  throw new PolyglotError({
    code: "CONFIG_ERROR",
    message: `Invalid --on-lost-span value: ${JSON.stringify(value)}.`,
    hint: "Use --on-lost-span=fail or --on-lost-span=report.",
    retryable: false,
  });
}
