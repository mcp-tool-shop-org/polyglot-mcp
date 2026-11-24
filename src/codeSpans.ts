/**
 * Inline code-span protection.
 *
 * Fenced code blocks are protected by `segmentMarkdown`, but an inline span
 * embedded in a prose sentence used to reach the model unguarded — and a target
 * language written in another script transliterated the identifier inside it.
 * ai-rpg-engine's Hindi README shipped `रन <पथ>` for `run <path>`,
 * `--चेकपॉइंट` for `--checkpoint`, `@ai-rpg-इंजन/कोर` for
 * `@ai-rpg-engine/core`, and `बिल्डकॉम्बैटस्टैक` for `buildCombatStack`:
 * a CLI command, a flag, an npm package name, and a function — none of which
 * work when copied out of the docs. 122 spans across three files.
 *
 * So every inline span is swapped for a placeholder before translation and
 * swapped back after. The placeholder is a bracket pair around a digit run and
 * nothing else: it carries no letters, so there is nothing in it for a
 * transliterating model to convert. Contrast `POLYGLOT_SEP`-style word tokens,
 * which are themselves transliterable — exactly the failure being fixed.
 *
 * Protected terms in prose (see protectedTerms.ts) ride the same mechanism:
 * given a term set, `maskCodeSpans` swaps them for placeholders too, numbered
 * after the code spans, and `restoreCodeSpans` puts them back.
 */

import { findProtectedSpans, hashRules, type ProtectedSpanKind, type ProtectedTermSet } from "./protectedTerms.js";

/** Matches an inline code span, backticks included. Never spans a newline. */
export const CODE_SPAN_PATTERN = /`[^`\n]+`/g;

/** Build the placeholder for span `index`. */
export const codePlaceholder = (index: number): string => `⟦${index}⟧`;

/**
 * Matches a placeholder on the way back, tolerantly: any bracket pair whose
 * contents include a digit run. Models pad brackets and occasionally slip a
 * stray character inside; anything looser than this would start eating prose.
 *
 * Written so that no two parts can match the same characters: the text before
 * the first digit run holds no digits, the run is taken whole, and anything
 * after it starts with a non-digit. The earlier lazy form,
 * `⟦[^⟦⟧]*?(\d+)[^⟦⟧]*?⟧`, matched the same placeholders but backtracked
 * polynomially on an unclosed `⟦` followed by a long digit run (CodeQL
 * js/polynomial-redos).
 */
export const PLACEHOLDER_PATTERN = /⟦[^⟦⟧\d]*(\d+)(?:[^⟦⟧\d][^⟦⟧]*)?⟧/g;

/** Non-global twin of the above — safe for `.test()` (no `lastIndex` state). */
const HAS_PLACEHOLDER = /⟦[^⟦⟧\d]*\d+(?:[^⟦⟧\d][^⟦⟧]*)?⟧/;

/** True when `text` already contains something shaped like a placeholder. */
export const containsCodePlaceholder = (text: string): boolean => HAS_PLACEHOLDER.test(text);

/** What a placeholder stands for: an inline code span, a protected term, or an "N of M" count. */
export type MaskedSpanKind = "code" | ProtectedSpanKind;

export interface MaskedText {
  /** Text with every inline code span (and protected term) replaced by its placeholder. */
  text: string;
  /**
   * What each placeholder restores to, indexed by placeholder number. A code
   * span or term restores to itself, backticks included; a count restores to
   * `N/M`.
   */
  spans: string[];
  /** What each placeholder stands for, parallel to `spans`. */
  kinds: MaskedSpanKind[];
  /** Ids of the protected-term rules that fired, sorted and unique. */
  rules: string[];
  /** Hash of `rules`; empty when none fired. Folded into the cache key. */
  termsHash: string;
}

/**
 * Replace every inline code span in `text` with a placeholder and, given a
 * protected-term set, every protected term in the prose around them too. Code
 * spans take placeholders first, in order, then terms in order; both restore
 * through `restoreCodeSpans`.
 *
 * If `text` already contains placeholder-shaped bracket pairs, masking is
 * skipped entirely (spans stay inline and translate as prose) rather than
 * producing a document whose restore step cannot be trusted. Prose that
 * genuinely uses ⟦ ⟧ around a number is vanishingly rare in a README; a
 * mangled identifier is not worth the risk of guessing.
 */
export function maskCodeSpans(text: string, terms?: ProtectedTermSet): MaskedText {
  if (containsCodePlaceholder(text)) return { text, spans: [], kinds: [], rules: [], termsHash: "" };

  const spans: string[] = [];
  const kinds: MaskedSpanKind[] = [];
  let masked = text.replace(CODE_SPAN_PATTERN, (span) => {
    spans.push(span);
    kinds.push("code");
    return codePlaceholder(spans.length - 1);
  });

  let rules: string[] = [];
  if (terms) {
    const blocked = [...masked.matchAll(/⟦\d+⟧/g)].map((m) => [m.index, m.index + m[0].length] as const);
    const matches = findProtectedSpans(masked, terms, blocked);
    let out = "";
    let cursor = 0;
    for (const m of matches) {
      out += masked.slice(cursor, m.start) + codePlaceholder(spans.length);
      spans.push(m.restored);
      kinds.push(m.kind);
      cursor = m.end;
    }
    masked = out + masked.slice(cursor);
    rules = [...new Set(matches.map((m) => m.rule))].sort();
  }

  return { text: masked, spans, kinds, rules, termsHash: hashRules(rules) };
}

export interface RestoreResult {
  /** Text with every recognised placeholder swapped back to its code span. */
  text: string;
  /**
   * True only when every masked span came back exactly once, no unknown
   * placeholder appeared, and every inline code span in the restored text
   * matches the source code spans byte-for-byte in order. False means the
   * translation cannot be trusted to carry the identifiers, and the caller
   * should fall back to the source.
   */
  intact: boolean;
}

const EXACT_CODE_SPAN_RE = /^`[^`\n]+`$/;

/** Return all inline code spans in `text`, in order (backticks included). */
export function extractCodeSpans(text: string): string[] {
  return text.match(CODE_SPAN_PATTERN) ?? [];
}

/** Count backtick characters in `text` outside valid inline code spans. */
export function strayBacktickCount(text: string): number {
  const outside = text.replace(CODE_SPAN_PATTERN, "");
  let count = 0;
  for (let i = 0; i < outside.length; i++) {
    if (outside[i] === "`") count++;
  }
  return count;
}

/**
 * True when `restoredText` carries the exact same inline code spans as
 * `expectedSpans`, byte-for-byte and in the same order, and (when provided)
 * the same number of stray backticks outside code spans.
 */
export function codeSpansMatch(
  expectedSpans: readonly string[],
  restoredText: string,
  expectedStrayBackticks?: number,
): boolean {
  if (expectedSpans.length === 0) {
    return expectedStrayBackticks === undefined || strayBacktickCount(restoredText) === expectedStrayBackticks;
  }
  const actual = extractCodeSpans(restoredText);
  if (actual.length !== expectedSpans.length) return false;
  for (let i = 0; i < expectedSpans.length; i++) {
    if (actual[i] !== expectedSpans[i]) return false;
  }
  if (expectedStrayBackticks !== undefined && strayBacktickCount(restoredText) !== expectedStrayBackticks) {
    return false;
  }
  return true;
}

/**
 * Swap placeholders in `text` back to the code spans they stand for.
 *
 * `intact` is the load-bearing half of the return value. A model that drops,
 * duplicates, invents, reorders, or wraps a placeholder in extra backticks
 * produces a sentence that has silently lost, doubled, or mangled an
 * identifier — which is the same class of defect as transliterating it.
 * Callers are expected to fail closed on `intact: false`.
 */
export function restoreCodeSpans(text: string, spans: string[]): RestoreResult {
  if (spans.length === 0) {
    // Nothing was masked, so any placeholder-shaped text is the model's own
    // invention — but there is nothing to restore it to. Report it as intact
    // only if none appeared.
    return { text, intact: !containsCodePlaceholder(text) };
  }

  const seen = new Array<number>(spans.length).fill(0);
  let unknown = false;
  let wrappedInBackticks = false;

  const restored = text.replace(PLACEHOLDER_PATTERN, (whole, digits: string, offset: number, str: string) => {
    const index = Number(digits);
    if (!Number.isInteger(index) || index < 0 || index >= spans.length) {
      unknown = true;
      return whole;
    }
    seen[index]++;
    const replacement = spans[index];
    if (EXACT_CODE_SPAN_RE.test(replacement)) {
      const before = offset > 0 ? str[offset - 1] : "";
      const after = offset + whole.length < str.length ? str[offset + whole.length] : "";
      if (before === "`" || after === "`") {
        wrappedInBackticks = true;
      }
    }
    return replacement;
  });

  const expectedCode = spans.filter((s) => EXACT_CODE_SPAN_RE.test(s));
  const placeholdersIntact = !unknown && !wrappedInBackticks && seen.every((count) => count === 1);
  const spansIntact = codeSpansMatch(expectedCode, restored);

  return { text: restored, intact: placeholdersIntact && spansIntact };
}
