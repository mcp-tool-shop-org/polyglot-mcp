/**
 * Segment-level translation cache.
 * Hashes source text + target language + model to avoid re-translating unchanged segments.
 * Cache file lives alongside the README as .polyglot-cache.json.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

export interface CacheEntry {
  translation: string;
  model: string;
  timestamp: number;
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
  model: string
): void {
  cache.entries[key] = { translation, model, timestamp: Date.now() };
}

function getCachePath(readmePath: string): string {
  return join(dirname(readmePath), ".polyglot-cache.json");
}
