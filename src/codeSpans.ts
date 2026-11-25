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

/** Matches a single-backtick inline code span on one line. Kept for callers expecting a RegExp. */
export const CODE_SPAN_PATTERN = /`[^`\n]+`/g;

export interface InlineCodeSpanMatch {
  start: number;
  end: number;
  span: string;
}

/**
 * Find all inline code spans in `text` using CommonMark's backtick-run rule:
 * an opening run of N backticks closes only at the next run of exact length N
 * on the same line. Single-pass O(n) per line with no regex backtracking.
 */
export function findInlineCodeSpans(text: string): InlineCodeSpanMatch[] {
  const spans: InlineCodeSpanMatch[] = [];
  let lineStart = 0;

  while (lineStart < text.length) {
    const nl = text.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? text.length : nl;
    const firstTick = text.indexOf("`", lineStart);

    if (firstTick !== -1 && firstTick < lineEnd) {
      const runs: Array<{ pos: number; len: number }> = [];
      const byLen = new Map<number, number[]>();
      let i = firstTick;

      while (i < lineEnd) {
        if (text[i] === "`") {
          let len = 1;
          while (i + len < lineEnd && text[i + len] === "`") len++;
          const runIdx = runs.length;
          runs.push({ pos: i, len });
          let list = byLen.get(len);
          if (!list) {
            list = [];
            byLen.set(len, list);
          }
          list.push(runIdx);
          i += len;
        } else {
          i++;
        }
      }

      if (runs.length >= 2) {
        const ptrByLen = new Map<number, number>();
        let r = 0;
        while (r < runs.length) {
          const open = runs[r]!;
          const list = byLen.get(open.len)!;
          let p = ptrByLen.get(open.len) ?? 0;
          while (p < list.length && list[p]! <= r) p++;
          if (p < list.length) {
            const closeIdx = list[p]!;
            ptrByLen.set(open.len, p + 1);
            const end = runs[closeIdx]!.pos + runs[closeIdx]!.len;
            spans.push({ start: open.pos, end, span: text.slice(open.pos, end) });
            r = closeIdx + 1;
          } else {
            ptrByLen.set(open.len, p);
            r++;
          }
        }
      }
    }

    if (nl === -1) break;
    lineStart = nl + 1;
  }

  return spans;
}

function replaceInlineCodeSpans(text: string, replacer: (span: string) => string): string {
  const matches = findInlineCodeSpans(text);
  if (matches.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const m of matches) {
    out += text.slice(cursor, m.start) + replacer(m.span);
    cursor = m.end;
  }
  return out + text.slice(cursor);
}

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
  let masked = replaceInlineCodeSpans(text, (span) => {
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

function isExactInlineCodeSpan(s: string): boolean {
  if (!s.startsWith("`") || !s.endsWith("`")) return false;
  const found = findInlineCodeSpans(s);
  return found.length === 1 && found[0]!.start === 0 && found[0]!.end === s.length;
}

/** Return all inline code spans in `text`, in order (backticks included). */
export function extractCodeSpans(text: string): string[] {
  return findInlineCodeSpans(text).map((m) => m.span);
}

/** Count backtick characters in `text` outside valid inline code spans. */
export function strayBacktickCount(text: string): number {
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "`") total++;
  }
  if (total === 0) return 0;
  let inSpans = 0;
  for (const m of findInlineCodeSpans(text)) {
    for (let i = 0; i < m.span.length; i++) {
      if (m.span[i] === "`") inSpans++;
    }
  }
  return total - inSpans;
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
    if (isExactInlineCodeSpan(replacement)) {
      const before = offset > 0 ? str[offset - 1] : "";
      const after = offset + whole.length < str.length ? str[offset + whole.length] : "";
      if (before === "`" || after === "`") {
        wrappedInBackticks = true;
      }
    }
    return replacement;
  });

  const expectedCode = spans.filter((s) => isExactInlineCodeSpan(s));
  const placeholdersIntact = !unknown && !wrappedInBackticks && seen.every((count) => count === 1);
  const spansIntact = codeSpansMatch(expectedCode, restored);

  return { text: restored, intact: placeholdersIntact && spansIntact };
}

export interface SpanDiff {
  stage?: string;
  piece?: string;
  spanIndex: number;
  expected: string;
  received: string;
  expectedStrayBackticks: number;
  receivedStrayBackticks: number;
  candidate?: string;
}

/**
 * Escape control, bidi/zero-width, and backslash/quote characters for safe
 * single-line terminal logging, capping the escaped string at `maxLen`.
 */
export function escapeForTerminal(value: string, maxLen = 80): string {
  if (maxLen <= 0) return "";
  let out = "";
  let i = 0;
  while (i < value.length) {
    const cp = value.codePointAt(i)!;
    const step = cp > 0xffff ? 2 : 1;
    let rep: string;
    if (cp === 0x5c) rep = "\\\\";
    else if (cp === 0x22) rep = '\\"';
    else if (cp === 0x0a) rep = "\\n";
    else if (cp === 0x0d) rep = "\\r";
    else if (cp === 0x09) rep = "\\t";
    else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) {
      rep = `\\x${cp.toString(16).padStart(2, "0")}`;
    } else if (
      (cp >= 0x200b && cp <= 0x200f) ||
      (cp >= 0x2028 && cp <= 0x202f) ||
      (cp >= 0x2060 && cp <= 0x206f) ||
      cp === 0xfeff ||
      (cp >= 0xfff9 && cp <= 0xfffb) ||
      (cp >= 0xd800 && cp <= 0xdfff)
    ) {
      rep = `\\u${cp.toString(16).padStart(4, "0")}`;
    } else {
      rep = value.slice(i, i + step);
    }

    if (out.length + rep.length > maxLen) {
      if (maxLen === 1) return "…";
      return `${out.slice(0, maxLen - 1)}…`;
    }
    out += rep;
    i += step;
  }
  return out;
}

/**
 * Compute a terminal-safe diagnostic diff describing the first inline code-span
 * or placeholder mismatch between expected source (`masked`, `spans`) and a
 * cleaned candidate translation (`cleaned`).
 */
export function diffCandidateSpans(masked: string, spans: readonly string[], cleaned: string): SpanDiff | undefined {
  const expectedText = spans.length > 0 ? restoreCodeSpans(masked, [...spans]).text : masked;
  const expectedStrayBackticks = strayBacktickCount(expectedText);

  if (spans.length === 0) {
    const expectedCode = extractCodeSpans(masked);
    const actualCode = extractCodeSpans(cleaned);
    const receivedStrayBackticks = strayBacktickCount(cleaned);
    const limit = Math.max(expectedCode.length, actualCode.length);
    for (let i = 0; i < limit; i++) {
      if (expectedCode[i] !== actualCode[i]) {
        const expRaw = expectedCode[i];
        const actRaw = actualCode[i];
        const expected = expRaw === undefined ? "none" : escapeForTerminal(expRaw);
        const received =
          expRaw === undefined && actRaw !== undefined
            ? `extra: ${escapeForTerminal(actRaw)}`
            : actRaw === undefined
              ? "missing"
              : escapeForTerminal(actRaw);
        return {
          spanIndex: i,
          expected,
          received,
          expectedStrayBackticks,
          receivedStrayBackticks,
          ...(received === "missing" || expectedStrayBackticks !== receivedStrayBackticks
            ? { candidate: escapeForTerminal(cleaned, 96) }
            : {}),
        };
      }
    }
    if (expectedStrayBackticks !== receivedStrayBackticks) {
      return {
        spanIndex: 0,
        expected: "none",
        received: "missing",
        expectedStrayBackticks,
        receivedStrayBackticks,
        candidate: escapeForTerminal(cleaned, 96),
      };
    }
    return undefined;
  }

  const seen = new Array<number>(spans.length).fill(0);
  let badUnknown: { tok: string; index: number } | undefined;
  let badDupIdx: number | undefined;
  let badWrapIdx: number | undefined;

  for (const m of cleaned.matchAll(PLACEHOLDER_PATTERN)) {
    const index = Number(m[1]);
    if (!Number.isInteger(index) || index < 0 || index >= spans.length) {
      if (!badUnknown) badUnknown = { tok: m[0], index: Number.isInteger(index) && index >= 0 ? index : spans.length };
      continue;
    }
    seen[index]++;
    if (seen[index]! > 1 && badDupIdx === undefined) badDupIdx = index;
    const offset = m.index ?? 0;
    if (isExactInlineCodeSpan(spans[index]!)) {
      const before = offset > 0 ? cleaned[offset - 1] : "";
      const after = offset + m[0].length < cleaned.length ? cleaned[offset + m[0].length] : "";
      if ((before === "`" || after === "`") && badWrapIdx === undefined) {
        badWrapIdx = index;
      }
    }
  }

  const restored = restoreCodeSpans(cleaned, [...spans]);
  const expectedCode = spans.filter((s) => isExactInlineCodeSpan(s));
  const actualCode = extractCodeSpans(restored.text);
  const receivedStrayBackticks = strayBacktickCount(restored.text);

  const codeLimit = Math.max(expectedCode.length, actualCode.length);
  for (let i = 0; i < codeLimit; i++) {
    if (expectedCode[i] !== actualCode[i]) {
      const expRaw = expectedCode[i];
      const actRaw = actualCode[i];
      const expected = expRaw === undefined ? "none" : escapeForTerminal(expRaw);
      const received =
        expRaw === undefined && actRaw !== undefined
          ? `extra: ${escapeForTerminal(actRaw)}`
          : actRaw === undefined
            ? "missing"
            : escapeForTerminal(actRaw);
      return {
        spanIndex: i,
        expected,
        received,
        expectedStrayBackticks,
        receivedStrayBackticks,
        ...(received === "missing" || expectedStrayBackticks !== receivedStrayBackticks
          ? { candidate: escapeForTerminal(cleaned, 96) }
          : {}),
      };
    }
  }

  if (expectedStrayBackticks !== receivedStrayBackticks) {
    return {
      spanIndex: badWrapIdx ?? 0,
      expected: expectedCode[badWrapIdx ?? 0] ? escapeForTerminal(expectedCode[badWrapIdx ?? 0]!) : "none",
      received: "missing",
      expectedStrayBackticks,
      receivedStrayBackticks,
      candidate: escapeForTerminal(cleaned, 96),
    };
  }

  const missingIdx = seen.findIndex((c) => c === 0);
  if (missingIdx !== -1) {
    return {
      spanIndex: missingIdx,
      expected: escapeForTerminal(spans[missingIdx]!),
      received: "missing",
      expectedStrayBackticks,
      receivedStrayBackticks,
      candidate: escapeForTerminal(cleaned, 96),
    };
  }
  if (badUnknown) {
    return {
      spanIndex: badUnknown.index,
      expected: "none",
      received: `extra: ${escapeForTerminal(badUnknown.tok)}`,
      expectedStrayBackticks,
      receivedStrayBackticks,
      candidate: escapeForTerminal(cleaned, 96),
    };
  }
  if (badDupIdx !== undefined) {
    return {
      spanIndex: badDupIdx,
      expected: escapeForTerminal(spans[badDupIdx]!),
      received: `extra: ${escapeForTerminal(spans[badDupIdx]!)}`,
      expectedStrayBackticks,
      receivedStrayBackticks,
      candidate: escapeForTerminal(cleaned, 96),
    };
  }
  if (badWrapIdx !== undefined) {
    return {
      spanIndex: badWrapIdx,
      expected: escapeForTerminal(spans[badWrapIdx]!),
      received: escapeForTerminal(`\`${spans[badWrapIdx]!}\``),
      expectedStrayBackticks,
      receivedStrayBackticks,
    };
  }
  return undefined;
}

/** Render one `SpanDiff` into a compact single-line diagnostic string. */
export function formatSpanDiff(diff: SpanDiff): string {
  const fmt = (val: string) => {
    if (val === "missing" || val === "none") return val;
    if (val.startsWith("extra: ")) return `extra "${val.slice(7)}"`;
    return `"${val}"`;
  };
  const prefix = `${diff.stage ? `${diff.stage}: ` : ""}${diff.piece ? `"${diff.piece}" ` : ""}`;
  const candidateSuffix = diff.candidate ? ` [candidate: "${diff.candidate}"]` : "";
  return (
    `${prefix}span[${diff.spanIndex}] expected ${fmt(diff.expected)}, received ${fmt(diff.received)} ` +
    `(stray backticks: expected ${diff.expectedStrayBackticks}, received ${diff.receivedStrayBackticks})${candidateSuffix}`
  );
}
