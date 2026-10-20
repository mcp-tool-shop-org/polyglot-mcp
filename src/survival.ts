/**
 * The survival check: after translation, every protected span in the English
 * must still be on the page, character for character.
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
  /** What the translation has instead, where that is useful (numbers, counts). */
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
 */
export function expectedSpans(
  source: string,
  terms: ProtectedTermSet = DEFAULT_PROTECTED_TERMS,
): Map<string, { kind: MaskedSpanKind; count: number }> {
  const { spans, kinds } = maskCodeSpans(source, terms);
  const expected = new Map<string, { kind: MaskedSpanKind; count: number }>();
  spans.forEach((span, i) => {
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
