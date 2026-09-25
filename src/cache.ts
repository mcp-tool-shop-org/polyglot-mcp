/**
 * Segment-level translation cache.
 * Hashes source text + target language + model to avoid re-translating unchanged segments.
 * Cache file lives alongside the README as .polyglot-cache.json.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

export interface CacheEntry {
  translation: string;
  model: string;
  timestamp: number;
  /** Source text — stored for fuzzy matching (added in v1.6.0). */
  source?: string;
  /** Target language code — stored for fuzzy matching (added in v1.6.1). */
  targetLang?: string;
}

export interface TranslationCache {
  version: 1;
  entries: Record<string, CacheEntry>;
}

/** Generate a cache key from source text, target language, and model. */
export function cacheKey(text: string, targetLang: string, model: string): string {
  return createHash("sha256")
    .update(`${targetLang}:${model}:${text}`)
    .digest("hex")
    .slice(0, 16);
}

/** Create an empty cache. */
export function createCache(): TranslationCache {
  return { version: 1, entries: {} };
}

/** Load cache from disk. Returns empty cache if file doesn't exist or is invalid. */
export function loadCache(readmePath: string): TranslationCache {
  const cachePath = getCachePath(readmePath);
  if (!existsSync(cachePath)) return createCache();
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const data = JSON.parse(raw);
    if (data.version === 1 && data.entries) return data as TranslationCache;
    return createCache();
  } catch {
    return createCache();
  }
}

/** Save cache to disk next to the README. */
export function saveCache(readmePath: string, cache: TranslationCache): void {
  const cachePath = getCachePath(readmePath);
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
}

/** Default cache TTL: 30 days in milliseconds. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Look up a cached translation. Returns undefined on miss or if expired. */
export function getCached(cache: TranslationCache, key: string, ttlMs: number = CACHE_TTL_MS): string | undefined {
  const entry = cache.entries[key];
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > ttlMs) {
    delete cache.entries[key];
    return undefined;
  }
  return entry.translation;
}

/** Remove all expired entries from the cache. Returns number of entries pruned. */
export function pruneCache(cache: TranslationCache, ttlMs: number = CACHE_TTL_MS): number {
  const now = Date.now();
  let pruned = 0;
  for (const key of Object.keys(cache.entries)) {
    if (now - cache.entries[key].timestamp > ttlMs) {
      delete cache.entries[key];
      pruned++;
    }
  }
  return pruned;
}

/** Clear all entries from the cache. Returns number of entries cleared. */
export function clearCache(cache: TranslationCache): number {
  const count = Object.keys(cache.entries).length;
  cache.entries = {};
  return count;
}

/** Store a translation in the cache. */
export function setCached(
  cache: TranslationCache,
  key: string,
  translation: string,
  model: string,
  source?: string,
  targetLang?: string
): void {
  cache.entries[key] = { translation, model, timestamp: Date.now(), source, targetLang };
}

// ─── Fuzzy matching ───────────────────────────────────────────────

/**
 * Minimum Levenshtein similarity (0–1) a fuzzy candidate must reach. It narrows
 * and ranks candidates but never makes one safe to reuse — see getFuzzyCached.
 */
export const FUZZY_THRESHOLD = 0.85;

/**
 * Invariant tokens: identifiers and quantities that must match exactly, in
 * order, between a fuzzy candidate and the query. A difference in any of them
 * changes what the segment says, however similar the rest of the text is.
 *
 * - SemVer version tokens (`v1.2.3`, `v1.2.3-rc.1`). The testing-os v1.2.2
 *   release (2026-05-14) had a version-marker block ~0.99 similar to the
 *   previous release's, and all 7 translations came out stamped v1.2.1.
 * - Code-span placeholders (`⟦0⟧`). The cache sees masked text, so a sentence
 *   that gained or lost an inline code span differs only by a placeholder, and
 *   a reused translation then fails the restore step and falls back to source.
 * - Every other run of digits, with its decimal and grouping separators
 *   (`174`, `1,000`, `0.2105`). In si-rpg-engine (2026-09-25) "174 tests, …"
 *   became "197 tests, …" (0.987 similar) and 4 of 7 translations kept 174.
 *
 * One alternation, so tokens come out in source order and a version's or a
 * placeholder's digits are not counted again as a bare number. Tokens are
 * compared source against source in their written form, never against a
 * translation: a target locale may legitimately write 1,000 as 1.000 or 1 000.
 */
const INVARIANT_TOKEN_RE = /v\d+\.\d+\.\d+(?:-[\w.]+)?|⟦\d+⟧|\p{Nd}+(?:[.,]\p{Nd}+)*/gu;

/**
 * Extract the invariant tokens (version tokens, code-span placeholders and
 * numbers) from a text, in the order they appear.
 *
 * @internal Exported for testing.
 */
export function extractInvariantTokens(text: string): string[] {
  return text.match(INVARIANT_TOKEN_RE) ?? [];
}

/**
 * Returns true when two texts carry the same invariant tokens in the same
 * order (both empty counts as a match).
 *
 * @internal Exported for testing.
 */
export function hasSameInvariantTokens(a: string, b: string): boolean {
  const aTokens = extractInvariantTokens(a);
  const bTokens = extractInvariantTokens(b);
  if (aTokens.length !== bTokens.length) return false;
  for (let i = 0; i < aTokens.length; i++) {
    if (aTokens[i] !== bTokens[i]) return false;
  }
  return true;
}

/**
 * The segment with its whitespace laid out canonically. Layout is the one kind
 * of edit a cached translation survives unchanged.
 *
 * Runs of spaces and tabs within a line collapse to one space, CRLF becomes LF,
 * and whitespace at the start and end of the segment is dropped. Whitespace
 * that Markdown gives meaning to is kept: each line break, the indentation
 * after it (list nesting), and two or more spaces before it (a hard line
 * break). So a reflowed paragraph does not match, and neither does a
 * non-breaking space, which is content rather than layout.
 *
 * @internal Exported for testing.
 */
export function canonicalWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^[ \t\n]+|[ \t\n]+$/g, "")
    .replace(/[ \t\n]+/g, (run) => {
      if (!run.includes("\n")) return " ";
      const lines = run.split("\n");
      const hardBreak = / {2,}$/.test(lines[0]) ? "  " : "";
      return hardBreak + "\n".repeat(lines.length - 1) + lines[lines.length - 1];
    });
}

/**
 * Compute normalised similarity between two strings using Levenshtein distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 *
 * Uses the iterative Wagner–Fischer algorithm with a single-row optimisation
 * (O(min(m,n)) space).
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const aN = a.toLowerCase();
  const bN = b.toLowerCase();
  if (aN === bN) return 1;

  const m = aN.length;
  const n = bN.length;
  if (m === 0 || n === 0) return 0;

  // Early exit: if length difference alone exceeds threshold,
  // no way the strings are similar enough.
  const maxLen = Math.max(m, n);

  // Single-row Levenshtein
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = aN[i - 1] === bN[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return 1 - prev[n] / maxLen;
}

/**
 * Fuzzy cache lookup — finds a cached translation whose source differs from the
 * query only in whitespace layout (see canonicalWhitespace), preferring the
 * candidate most similar to the query above `threshold`.
 *
 * A cached translation is the translation of its own source and nothing else,
 * so any other edit — a word, a number, a punctuation mark, a change of case —
 * sends the segment back to the model. Similarity cannot make that call: in
 * si-rpg-engine (2026-09-25) a table cell that went from "NaN refused" to "NaN
 * and infinities refused" was 0.894 similar to its old source, and 4 of 7
 * translations kept the old cell. Punctuation is not layout either: text
 * struck through with ~~, a ✓ that became ✗, or a flipped sign reverses what a
 * line says.
 *
 * Only considers entries that share the same target language and model.
 *
 * Returns `{ translation, similarity }` or undefined if nothing matches.
 */
export function getFuzzyCached(
  cache: TranslationCache,
  text: string,
  targetLang: string,
  model: string,
  ttlMs: number = CACHE_TTL_MS,
  threshold: number = FUZZY_THRESHOLD
): { translation: string; similarity: number } | undefined {
  const now = Date.now();
  const canonical = canonicalWhitespace(text);
  let bestSim = threshold;
  let bestTranslation: string | undefined;

  for (const entry of Object.values(cache.entries)) {
    // Skip entries without stored source text (pre-v1.6.0 cache entries)
    if (!entry.source) continue;
    // Skip expired
    if (now - entry.timestamp > ttlMs) continue;
    // Skip different models
    if (entry.model !== model) continue;
    // Skip different target languages (prevents cross-language contamination)
    if (entry.targetLang && entry.targetLang !== targetLang) continue;
    // Skip sources that differ from the query in more than whitespace layout
    if (canonicalWhitespace(entry.source) !== canonical) continue;
    // Implied by the check above today, and kept so that loosening that check
    // can never let a changed number, version or code span through.
    if (!hasSameInvariantTokens(text, entry.source)) continue;

    const sim = similarity(text, entry.source);
    if (sim > bestSim) {
      bestSim = sim;
      bestTranslation = entry.translation;
    }
  }

  if (bestTranslation !== undefined) {
    return { translation: bestTranslation, similarity: bestSim };
  }
  return undefined;
}

/** @internal Exported for testing. */
export function getCachePath(readmePath: string): string {
  const dir = resolve(dirname(readmePath));
  const cachePath = join(dir, ".polyglot-cache.json");
  const resolved = resolve(cachePath);

  // Guard against path traversal — cache file must stay within the
  // same directory as the source file.
  if (!resolved.startsWith(dir)) {
    throw new Error(
      `Cache path traversal blocked: "${resolved}" escapes "${dir}".`
    );
  }

  return resolved;
}
