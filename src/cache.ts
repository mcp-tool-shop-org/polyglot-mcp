/**
 * Segment-level translation cache.
 * Hashes source text + target language + model to avoid re-translating unchanged segments.
 * Cache file lives alongside the README as .polyglot-cache.json.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, statSync, unlinkSync } from "node:fs";
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

/**
 * What each cache object held when it was last read from or written to disk,
 * so that a save writes back only what changed since then (see saveCache).
 */
const baselines = new WeakMap<TranslationCache, Map<string, CacheEntry>>();

const snapshot = (entries: Record<string, CacheEntry>): Map<string, CacheEntry> =>
  new Map(Object.entries(entries).map(([key, entry]) => [key, { ...entry }]));

type CacheFile = { entries: Record<string, CacheEntry> } | "missing" | "corrupt";

/**
 * Read a cache file. A read that fails for any reason other than the file not
 * existing throws: guessing at its contents is how a save would clobber them.
 */
function readCacheFile(cachePath: string): CacheFile {
  let raw: string;
  try {
    raw = retryOnWindows(() => readFileSync(cachePath, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw err;
  }
  try {
    const data = JSON.parse(raw);
    if (data.version === 1 && data.entries) return { entries: data.entries };
  } catch {
    // Falls through to corrupt.
  }
  return "corrupt";
}

/** Load cache from disk. Returns empty cache if file doesn't exist or is invalid. */
export function loadCache(readmePath: string): TranslationCache {
  const cachePath = getCachePath(readmePath);
  let file: CacheFile;
  try {
    file = readCacheFile(cachePath);
  } catch {
    file = "corrupt"; // Unreadable: start empty. The save merges with the file.
  }
  const cache: TranslationCache = typeof file === "object" ? { version: 1, entries: file.entries } : createCache();
  baselines.set(cache, snapshot(cache.entries));
  return cache;
}

/**
 * Save cache to disk next to the README, merged with what the file holds now.
 *
 * Several processes share one cache file: translate-all.mjs translates two or
 * three languages at once, each in its own child, and each child loads the file
 * when it starts and saves it when it finishes. Overwriting the file with one
 * child's copy dropped every entry another child had saved in between, so the
 * last language to finish in each pair kept its entries and the others lost
 * theirs. facet's cache, for one, held ja, fr, it and pt, and nothing for zh,
 * es or hi.
 *
 * So a save is a three-way merge done under a lock (see mergeCacheEntries): it
 * re-reads the file and applies only what this cache object changed since it
 * was loaded or last saved. The result is written to a temporary file and
 * renamed over the cache, so a reader never sees half a file.
 */
export function saveCache(readmePath: string, cache: TranslationCache): void {
  const cachePath = getCachePath(readmePath);
  const base = baselines.get(cache) ?? new Map<string, CacheEntry>();
  withLock(`${cachePath}.lock`, () => {
    const file = readCacheFile(cachePath);
    // A missing file has nothing to keep. A corrupt one is rebuilt from this copy.
    const theirs = file === "missing" ? {} : file === "corrupt" ? Object.fromEntries(base) : file.entries;
    const entries = mergeCacheEntries(base, cache.entries, theirs);
    writeFileAtomic(cachePath, JSON.stringify({ version: 1, entries }, null, 2));
  });
  baselines.set(cache, snapshot(cache.entries));
}

// ─── Sharing the cache file ───────────────────────────────────────

/**
 * Three-way merge of cache entries. `base` is what this cache held when it was
 * last read or written, `ours` is what it holds now, and `theirs` is the file
 * as it stands.
 *
 * Our additions and replacements win. Our removals — by clearCache, pruneCache
 * or expiry — apply only to entries nobody has rewritten since `base`. Every
 * entry we did not touch comes from `theirs`, so other writers' additions,
 * replacements and removals all stand.
 *
 * @internal Exported for testing.
 */
export function mergeCacheEntries(
  base: ReadonlyMap<string, CacheEntry>,
  ours: Record<string, CacheEntry>,
  theirs: Record<string, CacheEntry>,
): Record<string, CacheEntry> {
  const merged = { ...theirs };
  for (const [key, entry] of Object.entries(ours)) {
    const before = base.get(key);
    if (!before || !sameEntry(before, entry)) merged[key] = entry;
  }
  for (const [key, before] of base) {
    if (Object.hasOwn(ours, key)) continue;
    const now = theirs[key];
    if (now && sameEntry(now, before)) delete merged[key];
  }
  return merged;
}

const sameEntry = (a: CacheEntry, b: CacheEntry): boolean =>
  a.translation === b.translation &&
  a.model === b.model &&
  a.timestamp === b.timestamp &&
  a.source === b.source &&
  a.targetLang === b.targetLang;

/** A lock this old belongs to a process that died holding it. */
const LOCK_STALE_MS = 10_000;

/** Past this, save without the lock rather than fail a finished translation. */
const LOCK_WAIT_MS = 15_000;

/**
 * Errors that mean another process holds the lock. On Windows a lock file
 * that is being deleted refuses to be created with EPERM or EACCES, not EEXIST.
 */
const LOCK_HELD = new Set(process.platform === "win32" ? ["EEXIST", "EPERM", "EACCES", "EBUSY"] : ["EEXIST"]);

/**
 * Run `fn` holding an exclusive lock file. A save's read, merge and write take
 * milliseconds, so a lock older than LOCK_STALE_MS belongs to a process that
 * died holding it, and is broken.
 *
 * The merge alone is not enough. Unlocked, two saves can read the same file
 * and the later rename drops the earlier one's entries. Measured on Windows,
 * with 4 processes each saving 40 entries, as few as 36 of the 160 survived.
 *
 * Still best effort: a lock file that cannot be created at all (a read-only
 * directory), or not within LOCK_WAIT_MS, is done without, and `fn` finds out
 * for itself whether the cache file can be written.
 */
function withLock(lockPath: string, fn: () => void): void {
  const deadline = Date.now() + LOCK_WAIT_MS;
  let held = false;
  for (let delayMs = 5; !held && Date.now() < deadline; delayMs = Math.min(delayMs * 2, 100)) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      held = true;
    } catch (err) {
      if (!LOCK_HELD.has((err as NodeJS.ErrnoException).code ?? "")) break;
      if (fileAgeMs(lockPath) > LOCK_STALE_MS) removeFile(lockPath);
      sleepSync(delayMs);
    }
  }
  try {
    fn();
  } finally {
    if (held) removeFile(lockPath);
  }
}

/**
 * Write `content` to a temporary file beside `path`, then rename it over
 * `path`, so a reader sees either the old file or the new one.
 */
function writeFileAtomic(path: string, content: string): void {
  const tmp = `${path}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, content, "utf-8");
  try {
    retryOnWindows(() => renameSync(tmp, path));
  } catch (err) {
    removeFile(tmp);
    throw err;
  }
}

/**
 * Run a file operation, retrying for about a second on Windows. There, a virus
 * scanner, an indexer or another process's rename can hold a file for a moment
 * and make the operation fail with EPERM, EACCES or EBUSY.
 */
function retryOnWindows<T>(op: () => T): T {
  for (let delayMs = 10; ; delayMs *= 2) {
    try {
      return op();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      const transient = process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(code);
      if (!transient || delayMs > 640) throw err;
      sleepSync(delayMs);
    }
  }
}

function fileAgeMs(path: string): number {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function removeFile(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone, or still held open; neither needs handling here.
  }
}

const sleepSync = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

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

/**
 * Clear entries from the cache. Returns number of entries cleared.
 *
 * With `targetLang`, only that language's entries go, along with any entry
 * that carries no language (written before entries were tagged). Such an entry
 * could be for any language, and a lookup for this one may still return it.
 * Without `targetLang`, every entry goes.
 */
export function clearCache(cache: TranslationCache, targetLang?: string): number {
  const cleared = Object.keys(cache.entries).filter((key) => {
    const lang = cache.entries[key].targetLang;
    return targetLang === undefined || lang === undefined || lang === targetLang;
  });
  for (const key of cleared) delete cache.entries[key];
  return cleared.length;
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
