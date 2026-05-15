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

/** Minimum similarity threshold for fuzzy cache hits (0–1). */
export const FUZZY_THRESHOLD = 0.85;

/**
 * Invariant tokens that must NOT differ between a fuzzy-match candidate and
 * the query — they're identifiers, not prose, so a difference here changes
 * the meaning of the segment even when Levenshtein similarity is high.
 *
 * Current set: SemVer-style version tokens (`v1.2.3`, `v1.2.3-rc.1`).
 *
 * Why: when a README's `<!-- version:start -->` block ships
 * `**v1.2.1** — 7 packages...` in one release and `**v1.2.2** — 7 packages...`
 * in the next, the Levenshtein similarity is ~0.99. Without an invariant
 * check, the fuzzy cache returns the v1.2.1 translation for the v1.2.2
 * source, and the translated README ends up with the previous version
 * stamped inside the marker block. Caught on the testing-os v1.2.2 release
 * 2026-05-14 — all 7 translations regenerated with stale marker versions.
 *
 * The check rejects a fuzzy match whenever the candidate and the query
 * disagree on version tokens, forcing a fresh translation. ~7 extra Ollama
 * calls per release (one per language); ~0 ms overhead at lookup time
 * since the regex runs only against entries that already passed the
 * Levenshtein similarity check.
 */
const VERSION_TOKEN_RE = /v\d+\.\d+\.\d+(?:-[\w.]+)?/g;

/**
 * Extract the multiset of invariant tokens (currently SemVer version
 * tokens) from a text, sorted for order-independent comparison.
 *
 * @internal Exported for testing.
 */
export function extractInvariantTokens(text: string): string[] {
  const matches = text.match(VERSION_TOKEN_RE);
  if (!matches) return [];
  return [...matches].sort();
}

/**
 * Returns true when two texts share the exact same multiset of invariant
 * tokens (both empty counts as a match).
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
 * Fuzzy cache lookup — finds the best cached entry whose source text is
 * similar to the query above FUZZY_THRESHOLD.
 *
 * Only considers entries that share the same target language and model
 * (they already live in the same cache so only model match needs checking).
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

    const sim = similarity(text, entry.source);
    if (sim > bestSim) {
      // Invariant-token guard: reject fuzzy matches whose source text
      // disagrees with the query on identifier tokens (version numbers,
      // etc.). See VERSION_TOKEN_RE above for the failure mode this
      // catches.
      if (!hasSameInvariantTokens(text, entry.source)) continue;
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
