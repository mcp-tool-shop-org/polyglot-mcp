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
import { DEFAULT_PROTECTED_TERMS, linkTargetsEnabled, urlsEnabled, type ProtectedTermSet } from "./protectedTerms.js";

/** What a lost span was. */
export type LostSpanKind =
  | MaskedSpanKind
  | "number"
  | "code-span-count"
  | "fence-count"
  | "link"
  | "placeholder";

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
  const extracted = new Set(extractLinks(source).nonAnchorTargets);
  const expected = new Map<string, { kind: MaskedSpanKind; count: number }>();
  spans.forEach((span, i) => {
    if (kinds[i] === "anchor") return;
    if (
      kinds[i] === "link-target" &&
      extracted.has(span.startsWith("<") && span.endsWith(">") ? span.slice(1, -1) : span)
    ) {
      return;
    }
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

// ─── Links & placeholder leakage ──────────────────────────────────

/**
 * CommonMark reference-label normalisation: trim, collapse internal whitespace
 * runs to a single space, and lowercase.
 */
export function normalizeRefLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Replace bracket, paren, angle, and placeholder characters inside inline code
 * spans with `_` so link and placeholder scanners skip inline code while still
 * preserving non-empty link text when a link wraps an inline code span
 * (e.g. ``[`foo`](https://example.com)``).
 */
function maskInlineCodeForScan(line: string): string {
  return line.replace(CODE_SPAN_PATTERN, (m) => m.replace(/[\[\]()⟦⟧<>"'#]/g, "_"));
}

/**
 * Yield lines of `markdown` that lie outside fenced code blocks (` ``` `) and
 * HTML comments (`<!-- … -->`), with trailing `\r` stripped.
 */
function nonCodeLines(markdown: string): string[] {
  const out: string[] = [];
  let inFence = false;
  let inComment = false;
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
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
    out.push(line);
  }
  return out;
}

const REF_DEF_LINE_PATTERN =
  /^[ \t>]*\[([^\][\n]+)\]:[ \t]*(?:<((?:\\.|[^<>\\\n])+)>|((?:\\[^\s]|[^\s<>\\])+))(?:[ \t]+(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\((?:\\.|[^()\\\n])*\)))?[ \t]*\r?$/;

/**
 * Parse a reference link definition line (`[label]: target` with optional
 * title) in linear time without backtracking regexes.
 */
function parseRefDefinitionLine(line: string): { label: string; target: string } | null {
  const m = REF_DEF_LINE_PATTERN.exec(line);
  if (!m) return null;
  const label = normalizeRefLabel(m[1]);
  const target = m[2] ?? m[3];
  return label && target ? { label, target } : null;
}

/**
 * Extract all reference link definitions (`[label]: target`) from a Markdown
 * document, skipping fenced code blocks, HTML comments, and inline code spans.
 * Labels are normalised via `normalizeRefLabel`; first definition wins.
 */
export function extractRefDefinitions(markdown: string): Map<string, string> {
  const defs = new Map<string, string>();
  for (const line of nonCodeLines(markdown)) {
    const def = parseRefDefinitionLine(maskInlineCodeForScan(line));
    if (def && !defs.has(def.label)) {
      defs.set(def.label, def.target);
    }
  }
  return defs;
}

/**
 * Linear-time parser for an inline link destination `(target)` or
 * `(target "title")` starting at `openParenIdx` (`line[openParenIdx] === "("`).
 * Supports `<target>` and balanced parentheses in bare URLs
 * (`https://en.wikipedia.org/wiki/Foo_(bar)`). Records `state.deadFrom` when an
 * unclosed `(` reaches end-of-line so long unclosed runs of `(` are scanned
 * at most once.
 */
function parseInlineTarget(
  line: string,
  openParenIdx: number,
  state: { deadFrom: number },
): { target: string; endIdx: number } | null {
  const L = line.length;
  if (openParenIdx >= state.deadFrom) return null;

  let k = openParenIdx + 1;
  while (k < L && (line[k] === " " || line[k] === "\t")) k++;
  const start = k;
  let target: string;

  if (k < L && line[start] === "<") {
    k++;
    while (k < L && line[k] !== ">") {
      if (line[k] === "\\") {
        k += 2;
        continue;
      }
      if (line[k] === "<") return null;
      k++;
    }
    if (k >= L || k === start + 1) return null;
    target = line.slice(start + 1, k);
    k++;
  } else {
    let depth = 1;
    while (k < L && line[k] !== " " && line[k] !== "\t") {
      if (line[k] === "\\" && k + 1 < L && line[k + 1] !== " " && line[k + 1] !== "\t") {
        k += 2;
        continue;
      }
      if (line[k] === "(") {
        depth++;
      } else if (line[k] === ")") {
        depth--;
        if (depth === 0) {
          target = line.slice(start, k);
          return target.length > 0 ? { target, endIdx: k } : null;
        }
      }
      k++;
    }
    if (k >= L && depth > 0) {
      state.deadFrom = openParenIdx;
      return null;
    }
    if (depth !== 1 || k === start) return null;
    target = line.slice(start, k);
  }

  while (k < L && (line[k] === " " || line[k] === "\t")) k++;
  if (k < L && (line[k] === '"' || line[k] === "'" || line[k] === "(")) {
    const closeQuote = line[k] === "(" ? ")" : line[k];
    k++;
    while (k < L && line[k] !== closeQuote) {
      if (line[k] === "\\") {
        k += 2;
        continue;
      }
      if (closeQuote === ")" && line[k] === "(") return null;
      k++;
    }
    if (k >= L) {
      if (closeQuote === ")") state.deadFrom = openParenIdx;
      return null;
    }
    k++;
    while (k < L && (line[k] === " " || line[k] === "\t")) k++;
  }
  return k < L && line[k] === ")" ? { target, endIdx: k } : null;
}

export interface ExtractedLinks {
  /** Non-anchor link targets (external URLs, relative paths, images) in order. */
  nonAnchorTargets: string[];
  /** Number of in-page `#slug` anchor links. */
  anchorCount: number;
}

/**
 * Extract all Markdown links (inline links, images, resolved reference links,
 * and reference definitions) and HTML `href="#…"` anchor links from `markdown`
 * in linear time, skipping fenced code blocks, HTML comments, and inline code
 * spans.
 */
export function extractLinks(
  markdown: string,
  defs?: ReadonlyMap<string, string>,
): ExtractedLinks {
  const resolvedDefs = defs ?? extractRefDefinitions(markdown);
  const nonAnchorTargets: string[] = [];
  let anchorCount = 0;

  const recordTarget = (target: string): void => {
    if (target.startsWith("#")) anchorCount++;
    else nonAnchorTargets.push(target);
  };

  for (const raw of nonCodeLines(markdown)) {
    const line = maskInlineCodeForScan(raw);
    const def = parseRefDefinitionLine(line);
    if (def) {
      recordTarget(def.target);
      continue;
    }

    for (const m of line.matchAll(/\bhref\s*=\s*["'](#[^"'\s<>]+)["']/giu)) {
      recordTarget(m[1]);
    }

    // Pass 1: pair every unescaped '[' and ']' in O(L) with a stack, stepping
    // over valid inline `(target "title")` destinations so brackets inside
    // URLs or image titles (e.g. `"a ] b"`) do not close an outer link.
    const L = line.length;
    const closeBracketFor = new Int32Array(L).fill(-1);
    const hasInnerBracket = new Uint8Array(L);
    const stack: number[] = [];
    const parenState = { deadFrom: L };

    for (let i = 0; i < L; i++) {
      if (line[i] === "\\" && i + 1 < L) {
        i++;
        continue;
      }
      if (line[i] === "[") {
        if (stack.length > 0) hasInnerBracket[stack[stack.length - 1]] = 1;
        stack.push(i);
      } else if (line[i] === "]") {
        if (stack.length > 0) {
          const openIdx = stack.pop()!;
          closeBracketFor[openIdx] = i;
          if (stack.length > 0 && hasInnerBracket[openIdx]) {
            hasInnerBracket[stack[stack.length - 1]] = 1;
          }
          if (i + 1 < L && line[i + 1] === "(") {
            const inline = parseInlineTarget(line, i + 1, parenState);
            if (inline !== null) i = inline.endIdx;
          }
        }
      }
    }

    // Pass 2: visit paired brackets in O(L).
    const skipBracketAt = new Uint8Array(L);
    parenState.deadFrom = L;

    for (let i = 0; i < L; i++) {
      if (line[i] !== "[" || skipBracketAt[i]) continue;
      const j = closeBracketFor[i];
      if (j === -1) continue;

      // 1. Inline link or image: `[text](target)` / `![alt](src)`
      if (j + 1 < L && line[j + 1] === "(") {
        const inline = parseInlineTarget(line, j + 1, parenState);
        if (inline !== null) {
          recordTarget(inline.target);
          if (!hasInnerBracket[i]) {
            i = inline.endIdx;
          } else {
            for (let p = j + 1; p <= inline.endIdx; p++) skipBracketAt[p] = 1;
          }
          continue;
        }
      }

      // 2. Full `[text][label]` or collapsed `[text][]` reference link
      if (j + 1 < L && line[j + 1] === "[") {
        const k = closeBracketFor[j + 1];
        if (
          k !== -1 &&
          !hasInnerBracket[j + 1] &&
          !(k + 1 < L && line[k + 1] === "(" && parseInlineTarget(line, k + 1, parenState) !== null)
        ) {
          const rawLabel = k === j + 2 ? line.slice(i + 1, j) : line.slice(j + 2, k);
          const norm = normalizeRefLabel(rawLabel);
          if (norm && resolvedDefs.has(norm)) {
            skipBracketAt[j + 1] = 1;
            recordTarget(resolvedDefs.get(norm)!);
            continue;
          }
        }
      }

      // 3. Shortcut reference link `[label]`
      if (!hasInnerBracket[i]) {
        const norm = normalizeRefLabel(line.slice(i + 1, j));
        if (norm && resolvedDefs.has(norm)) {
          recordTarget(resolvedDefs.get(norm)!);
        }
      }
    }
  }

  return { nonAnchorTargets, anchorCount };
}

export interface LinkCheckOptions {
  sourceDefs?: ReadonlyMap<string, string>;
  targetDefs?: ReadonlyMap<string, string>;
  segment?: string;
  terms?: ProtectedTermSet;
}

/**
 * §1 link structure check:
 * - the multiset of non-anchor link targets in the translation must equal the
 *   source's, compared exactly (filtered by active `url` and `link-target` rules);
 * - the number of in-page anchor links must equal the source's.
 */
export function checkLinks(
  source: string,
  translation: string,
  lang: string,
  options: LinkCheckOptions = {},
): LostSpan[] {
  const segment = options.segment ?? segmentLabel(source);
  const terms = options.terms ?? DEFAULT_PROTECTED_TERMS;
  const checkUrls = urlsEnabled(terms);
  const checkLinkTargets = linkTargetsEnabled(terms);
  const keepTarget = (t: string): boolean => (/^https?:\/\//i.test(t) ? checkUrls : checkLinkTargets);

  const srcLinks = extractLinks(source, options.sourceDefs);
  const tgtLinks = extractLinks(translation, options.targetDefs);
  const srcNonAnchor = srcLinks.nonAnchorTargets.filter(keepTarget);
  const tgtNonAnchor = tgtLinks.nonAnchorTargets.filter(keepTarget);
  const lost: LostSpan[] = [];

  const countMultiset = (items: readonly string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
    return counts;
  };

  const srcCounts = countMultiset(srcNonAnchor);
  const tgtCounts = countMultiset(tgtNonAnchor);
  const foundNonAnchor = tgtNonAnchor.join(" ") || "(no links)";

  let missingNonAnchor = 0;
  for (const [target, srcCount] of srcCounts) {
    if ((tgtCounts.get(target) ?? 0) < srcCount) {
      missingNonAnchor++;
      lost.push({
        lang,
        segment,
        span: target,
        kind: "link",
        found: foundNonAnchor,
      });
    }
  }

  const totalSrc = srcNonAnchor.length + srcLinks.anchorCount;
  const totalTgt = tgtNonAnchor.length + tgtLinks.anchorCount;
  const anchorShift = totalSrc === totalTgt && srcLinks.anchorCount !== tgtLinks.anchorCount;

  if (missingNonAnchor === 0 && !anchorShift && tgtNonAnchor.length !== srcNonAnchor.length) {
    lost.push({
      lang,
      segment,
      span: srcNonAnchor.join(" ") || "(no links)",
      kind: "link",
      found: foundNonAnchor,
    });
  }

  if (srcLinks.anchorCount !== tgtLinks.anchorCount && !(anchorShift && missingNonAnchor > 0)) {
    lost.push({
      lang,
      segment,
      span: `${srcLinks.anchorCount} anchor links`,
      kind: "link",
      found: String(tgtLinks.anchorCount),
    });
  }

  return lost;
}

/**
 * Linear-time matcher for leaked placeholder brackets outside code: matches a
 * bracketed `⟦…⟧` span or a stray `⟦` / `⟧` character.
 */
export const PLACEHOLDER_LEAK_PATTERN = /⟦[^⟦⟧\n]*⟧|[⟦⟧]/g;

/**
 * §2 placeholder leakage check: any `⟦` or `⟧` outside code in the finished
 * translation, beyond the number the source has outside code, is a `LostSpan`
 * of kind `placeholder`.
 */
export function checkPlaceholders(
  source: string,
  translation: string,
  lang: string,
  options: { segment?: string } = {},
): LostSpan[] {
  const strip = (md: string): string =>
    nonCodeLines(md)
      .map((l) => l.replace(CODE_SPAN_PATTERN, ""))
      .join("\n");
  const srcClean = strip(source);
  const tgtClean = strip(translation);

  const srcOpen = (srcClean.match(/⟦/g) ?? []).length;
  const srcClose = (srcClean.match(/⟧/g) ?? []).length;
  const tgtOpen = (tgtClean.match(/⟦/g) ?? []).length;
  const tgtClose = (tgtClean.match(/⟧/g) ?? []).length;

  if (tgtOpen <= srcOpen && tgtClose <= srcClose) return [];

  const segment = options.segment ?? segmentLabel(source);
  const remaining = [...(srcClean.match(PLACEHOLDER_LEAK_PATTERN) ?? [])];
  const lost: LostSpan[] = [];
  for (const tok of tgtClean.match(PLACEHOLDER_LEAK_PATTERN) ?? []) {
    const idx = remaining.indexOf(tok);
    if (idx !== -1) {
      remaining.splice(idx, 1);
    } else {
      lost.push({ lang, segment, span: tok, kind: "placeholder" });
    }
  }
  return lost;
}

// ─── Per-segment check ────────────────────────────────────────────

export interface SegmentCheckOptions {
  /** Protected-term set. Default: the default patterns. */
  terms?: ProtectedTermSet;
  /** Also compare the numbers (table cells). */
  isCell?: boolean;
  /** Reference link definitions from the source file. */
  sourceDefs?: ReadonlyMap<string, string>;
  /** Reference link definitions from the translated file. */
  targetDefs?: ReadonlyMap<string, string>;
}

/**
 * Check one translated segment against its source: every protected span is
 * present as often as in the source, link structure and placeholder brackets
 * survive, and for a table cell the numbers match.
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
  lost.push(
    ...checkLinks(source, translation, lang, {
      sourceDefs: options.sourceDefs,
      targetDefs: options.targetDefs,
      segment,
      terms: options.terms,
    }),
    ...checkPlaceholders(source, translation, lang, { segment }),
  );
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
  let text = raw.trim().replace(/^#{1,6}\s+/, "");
  let end = text.length;
  while (end > 0 && text[end - 1] === "#") end--;
  if (end < text.length && end > 0 && /\s/.test(text[end - 1])) {
    text = text.slice(0, end).trimEnd();
  }

  const codeSpans: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_m, content: string) => {
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
      .replace(/!\[([^\][\n]*)\](?:\([^()\n]*\)|\[[^\][\n]*\])/g, "$1")
      .replace(/\[([^\][\n]*)\](?:\([^()\n]*\)|\[[^\][\n]*\])/g, "$1");
  } while (text !== prev);

  do {
    prev = text;
    text = text.replace(/<\/?[A-Za-z!][^<>\n]*>/g, "");
  } while (text !== prev);

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
  /(?=#)(?<=\]\(\s*)#([^\s)<>"'`[\]]+)(?=(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\r\n]*\)))?\s*\))|(?=#)(?<=^[ \t>]*\[[^\][\n]+\]:[ \t]*)#([^\s)<>"'`[\]]+)(?=(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\r\n]*\)))?[ \t]*\r?$)|(?=#)(?<=\bhref\s*=\s*["'])#([^"'\s<>]+)(?=["'])/giu;

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

  for (const line of nonCodeLines(markdown)) {
    if (/^#{1,6}\s/.test(line)) {
      const slug = safeDecodeSlug(slugger.slug(stripHeadingMarkup(line))).toLowerCase();
      const idx = headings.length;
      headings.push(slug);
      if (slug) {
        if (!headingIndex.has(slug)) headingIndex.set(slug, idx);
        headingSet.add(slug);
      }
    }

    // F3: strip inline code spans before scanning for explicit ids and anchors.
    const lineNoCode = line.replace(CODE_SPAN_PATTERN, "_");

    for (const tagMatch of lineNoCode.matchAll(/<[A-Za-z][^<>\n]*>/g)) {
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
  /** Skip the count-mismatch LostSpan when §1 has already flagged an anchor-count mismatch in a segment. */
  skipCountMismatch?: boolean;
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
    const lower = a.decoded.toLowerCase();
    if (src.headingIndex.has(lower)) {
      return { status: "heading" as const, headingIdx: src.headingIndex.get(lower)! };
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

  const srcBrokenDecoded = new Set(
    src.anchors.filter((_, idx) => srcStates[idx].status === "broken").map((a) => a.decoded.toLowerCase()),
  );

  const resolvesInTarget = (decoded: string): boolean =>
    tgt.headingSet.has(decoded.toLowerCase()) || tgt.explicitIds.has(decoded);

  // F2 step 4 / #50 §3: If link counts differ, report the mismatch in warnings,
  // run the plain resolve check, and also push a LostSpan when a source-valid
  // anchor was lost (unless §1 already accounted for the whole difference).
  if (src.anchors.length !== tgt.anchors.length) {
    warnings?.push(
      `[${lang}]: anchor count mismatch (source has ${src.anchors.length}, translation has ${tgt.anchors.length}); falling back to plain resolve check.`,
    );
    const srcValidCount = srcStates.filter((s) => s.status !== "broken").length;
    const tgtNonSourceBrokenCount = tgt.anchors.filter((a) => !srcBrokenDecoded.has(a.decoded.toLowerCase())).length;

    const plainLost: LostSpan[] = [];
    for (const tgtA of tgt.anchors) {
      if (srcBrokenDecoded.has(tgtA.decoded.toLowerCase())) continue;
      if (!resolvesInTarget(tgtA.decoded)) {
        const srcIdx = src.headingIndex.get(tgtA.decoded.toLowerCase());
        const foundSlug = srcIdx !== undefined ? tgt.headings[srcIdx] : undefined;
        plainLost.push({
          lang,
          segment: tgtA.segment,
          span: tgtA.raw,
          kind: "anchor",
          ...(foundSlug ? { found: `#${foundSlug}` } : {}),
        });
      }
    }

    const expectedTargetCounts = new Map<string, number>();
    srcStates.forEach((s, idx) => {
      if (s.status === "heading") {
        const slug = (tgt.headings[s.headingIdx] ?? src.anchors[idx].decoded).toLowerCase();
        expectedTargetCounts.set(slug, (expectedTargetCounts.get(slug) ?? 0) + 1);
      } else if (s.status === "explicit") {
        const slug = src.anchors[idx].decoded;
        expectedTargetCounts.set(slug, (expectedTargetCounts.get(slug) ?? 0) + 1);
      }
    });
    const actualTargetCounts = new Map<string, number>();
    for (const tgtA of tgt.anchors) {
      if (srcBrokenDecoded.has(tgtA.decoded.toLowerCase()) || !resolvesInTarget(tgtA.decoded)) continue;
      const key = tgt.headingSet.has(tgtA.decoded.toLowerCase()) ? tgtA.decoded.toLowerCase() : tgtA.decoded;
      actualTargetCounts.set(key, (actualTargetCounts.get(key) ?? 0) + 1);
    }
    let missingExpectedTarget = false;
    for (const [slug, count] of expectedTargetCounts) {
      if ((actualTargetCounts.get(slug) ?? 0) < count) {
        missingExpectedTarget = true;
        break;
      }
    }

    const tgtResolvedCount = tgtNonSourceBrokenCount - plainLost.length;
    if (
      !options.skipCountMismatch &&
      srcValidCount > 0 &&
      (tgtResolvedCount < srcValidCount || missingExpectedTarget)
    ) {
      lost.push({
        lang,
        segment: "(whole file)",
        span: `anchor count ${src.anchors.length} → ${tgt.anchors.length}`,
        kind: "anchor",
        found: String(tgt.anchors.length),
      });
    }

    lost.push(...plainLost);
    return lost;
  }

  // F2 steps 2 & 3 / F4: Pair each translated anchor with its source anchor by link order,
  // skipping source-broken slugs by slug rather than position.
  for (let i = 0; i < tgt.anchors.length; i++) {
    const tgtA = tgt.anchors[i];
    if (srcBrokenDecoded.has(tgtA.decoded.toLowerCase())) continue; // F5: non-fatal source warning, never a LostSpan.

    if (!resolvesInTarget(tgtA.decoded)) {
      const state = srcStates[i];
      const srcIdx =
        src.headingIndex.get(tgtA.decoded.toLowerCase()) ??
        (state.status === "heading" ? state.headingIdx : undefined);
      const foundSlug = srcIdx !== undefined ? tgt.headings[srcIdx] : undefined;
      const segment = state.status !== "broken" ? src.anchors[i].segment : tgtA.segment;
      lost.push({
        lang,
        segment,
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

// ─── Untranslated prose ───────────────────────────────────────────

/**
 * The lost-span check asks whether protected text survived. This one asks the
 * opposite question: whether prose that should have been translated is still
 * the English. A model that echoes a part untranslated while the batch splitter
 * still finds the right number of separators looks like success to every other
 * check, so the finished document is compared with the source line by line.
 */

/** A line needs this many words, outside code, links and URLs, to count as prose. */
export const MIN_PROSE_WORDS = 6;

/** One prose line that came back as the English. */
export interface UntranslatedSegment {
  /** Target language code. */
  lang: string;
  /** The English segment (heading, paragraph or table cell) it belongs to, shortened. */
  segment: string;
  /** The line that is identical to the English, shortened. */
  line: string;
  /** How many words of prose it has. */
  words: number;
  /** How the segment got there: echoed in a batch, echoed after a separator mismatch, and so on. */
  reason: string;
  /** True when it was retried on its own once and still came back English. */
  retried: boolean;
}

/** A segment that left the plain batch path, and how it ended. */
export interface SegmentFallback {
  lang: string;
  segment: string;
  /** Why: "separator-count mismatch", "echoed in a batch", "empty output", "placeholders did not survive", … */
  reason: string;
  /** True when the segment was re-sent on its own to be translated again. */
  retried: boolean;
  /** True when the translation that was kept is no longer the English. */
  recovered: boolean;
}

/** What to do when prose comes back untranslated: fail the run, or report it and carry on. */
export type UntranslatedPolicy = "fail" | "report";

const LINK_INLINE = /!?\[[^\]\n]*\]\([^)\n]*\)/g;
const LINK_REFERENCE = /!?\[[^\]\n]*\]\[[^\]\n]*\]/g;
const AUTOLINK = /<(?:https?:\/\/|mailto:)[^>\s]*>/gi;
const BARE_URL = /\b(?:https?:\/\/|www\.)\S+/gi;
const HTML_TAG = /<\/?[A-Za-z][^>\n]*>/g;
const PLACEHOLDER_TOKEN = /⟦[^⟦⟧\n]*⟧/g;
const LINE_MARKER = /^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)?/;
const WORD = /\p{L}[\p{L}\p{N}'’-]*/gu;

/** A line with its Markdown furniture, code spans, links, URLs, tags and placeholders taken out. */
function proseText(line: string): string {
  return line
    .replace(LINE_MARKER, "")
    .replace(CODE_SPAN_PATTERN, " ")
    .replace(PLACEHOLDER_TOKEN, " ")
    .replace(LINK_INLINE, " ")
    .replace(LINK_REFERENCE, " ")
    .replace(AUTOLINK, " ")
    .replace(BARE_URL, " ")
    .replace(HTML_TAG, " ");
}

/** The words of prose in a line, outside code spans, links, URLs and protected spans. */
export function proseWords(line: string): string[] {
  return proseText(line).match(WORD) ?? [];
}

/**
 * True when every word starts with a capital or has no lowercase letter at all:
 * a list of product or company names, which stays as written in any language.
 */
function namesOnly(words: readonly string[]): boolean {
  return words.every((w) => {
    const first = w[0]!;
    const cased = first.toLowerCase() !== first.toUpperCase();
    return !cased || first !== first.toLowerCase() || !/\p{Ll}/u.test(w);
  });
}

/**
 * A prose line is one with MIN_PROSE_WORDS or more words that is not a list of
 * names. Code-only lines, link-only lines and short names fall under the word
 * floor by construction; a line of proper names is exempt by this rule, so no
 * list of allowed lines is kept.
 */
export function isProseLine(line: string): boolean {
  const words = proseWords(line);
  return words.length >= MIN_PROSE_WORDS && !namesOnly(words);
}

/** A line as compared: markers and surrounding space off, inner whitespace collapsed. */
const comparable = (line: string): string =>
  line.replace(LINE_MARKER, "").replace(/\s+/g, " ").trim().replace(/[.。．]+$/, "");

/**
 * The prose lines of `source` that appear verbatim in `translation`. These are
 * the lines the model returned as the English.
 */
export function survivingProse(source: string, translation: string): string[] {
  const translated = new Set(translation.split("\n").map(comparable));
  const survivors: string[] = [];
  for (const line of source.split("\n")) {
    if (!isProseLine(line)) continue;
    if (translated.has(comparable(line))) survivors.push(line.trim());
  }
  return survivors;
}

/** One line per untranslated segment: language, segment, the line, and how it got there. */
export function formatUntranslated(items: readonly UntranslatedSegment[]): string[] {
  return items.map(
    (u) =>
      `[${u.lang}] "${u.segment}": untranslated line ${JSON.stringify(u.line)} (${u.words} words; ${u.reason}${u.retried ? "; retried once" : ""})`,
  );
}

/** One line per segment that left the plain batch path. */
export function formatFallbacks(items: readonly SegmentFallback[]): string[] {
  return items.map(
    (f) =>
      `[${f.lang}] "${f.segment}": ${f.reason}${f.retried ? (f.recovered ? "; retried, translated" : "; retried, still English") : ""}`,
  );
}

/**
 * Thrown under `--on-untranslated=fail`. Carries the list and the result the
 * caller would otherwise have used, so a CLI can still write the file.
 */
export class UntranslatedError<R = unknown> extends PolyglotError {
  readonly untranslated: UntranslatedSegment[];
  readonly result?: R;

  constructor(untranslated: UntranslatedSegment[], result?: R) {
    const langs = [...new Set(untranslated.map((u) => u.lang))].join(", ");
    super({
      code: "UNTRANSLATED",
      message: [
        `${untranslated.length} prose line(s) came back in English (${langs}):`,
        ...formatUntranslated(untranslated).map((line) => `  ${line}`),
      ].join("\n"),
      hint:
        "Rerun the language: a segment is retried once on its own before this fails, and nothing English is cached. " +
        "If it keeps coming back, fix the translation by hand and pin it (scripts/pin-translation.mjs). " +
        "--on-untranslated=report writes the list and exits 0.",
      retryable: true,
    });
    this.name = "UntranslatedError";
    this.untranslated = untranslated;
    this.result = result;
  }
}

/** Apply the policy: throw an UntranslatedError under "fail" when any prose is untranslated. */
export function enforceUntranslatedPolicy<R>(
  untranslated: UntranslatedSegment[],
  policy: UntranslatedPolicy,
  result?: R,
): void {
  if (policy === "fail" && untranslated.length > 0) throw new UntranslatedError(untranslated, result);
}

/** Parse an `--on-untranslated=` value, or throw a CONFIG_ERROR. */
export function parseUntranslatedPolicy(value: string | undefined, fallback: UntranslatedPolicy): UntranslatedPolicy {
  if (value === undefined) return fallback;
  if (value === "fail" || value === "report") return value;
  throw new PolyglotError({
    code: "CONFIG_ERROR",
    message: `Invalid --on-untranslated value: ${JSON.stringify(value)}.`,
    hint: "Use --on-untranslated=fail or --on-untranslated=report.",
    retryable: false,
  });
}
