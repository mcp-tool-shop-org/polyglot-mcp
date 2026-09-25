import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cacheKey,
  createCache,
  getCached,
  setCached,
  pruneCache,
  clearCache,
  getCachePath,
  similarity,
  getFuzzyCached,
  extractInvariantTokens,
  hasSameInvariantTokens,
  canonicalWhitespace,
  FUZZY_THRESHOLD,
} from "./cache.js";

describe("cacheKey", () => {
  it("returns a 16-char hex string", () => {
    const key = cacheKey("hello", "ja", "translategemma:12b");
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });

  it("is deterministic", () => {
    const a = cacheKey("hello", "ja", "translategemma:12b");
    const b = cacheKey("hello", "ja", "translategemma:12b");
    expect(a).toBe(b);
  });

  it("differs for different text", () => {
    const a = cacheKey("hello", "ja", "translategemma:12b");
    const b = cacheKey("world", "ja", "translategemma:12b");
    expect(a).not.toBe(b);
  });

  it("differs for different target language", () => {
    const a = cacheKey("hello", "ja", "translategemma:12b");
    const b = cacheKey("hello", "fr", "translategemma:12b");
    expect(a).not.toBe(b);
  });

  it("differs for different model", () => {
    const a = cacheKey("hello", "ja", "translategemma:12b");
    const b = cacheKey("hello", "ja", "translategemma:4b");
    expect(a).not.toBe(b);
  });
});

describe("createCache", () => {
  it("returns a valid empty cache", () => {
    const cache = createCache();
    expect(cache.version).toBe(1);
    expect(cache.entries).toEqual({});
  });
});

describe("getCached / setCached", () => {
  it("returns undefined for missing key", () => {
    const cache = createCache();
    expect(getCached(cache, "nonexistent")).toBeUndefined();
  });

  it("stores and retrieves a translation", () => {
    const cache = createCache();
    setCached(cache, "abc123", "こんにちは", "translategemma:12b");
    expect(getCached(cache, "abc123")).toBe("こんにちは");
  });

  it("returns undefined for expired entries", () => {
    const cache = createCache();
    // Manually insert an old entry
    cache.entries["old-key"] = {
      translation: "old",
      model: "translategemma:12b",
      timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
    };
    expect(getCached(cache, "old-key")).toBeUndefined();
    // Should also have deleted the entry
    expect(cache.entries["old-key"]).toBeUndefined();
  });

  it("respects custom TTL", () => {
    const cache = createCache();
    cache.entries["recent"] = {
      translation: "fresh",
      model: "m",
      timestamp: Date.now() - 5000, // 5 seconds ago
    };
    // With 1-second TTL it's expired
    expect(getCached(cache, "recent", 1000)).toBeUndefined();
    // Re-add and check with longer TTL
    cache.entries["recent2"] = {
      translation: "fresh",
      model: "m",
      timestamp: Date.now() - 5000,
    };
    expect(getCached(cache, "recent2", 60000)).toBe("fresh");
  });
});

describe("pruneCache", () => {
  it("removes expired entries and returns count", () => {
    const cache = createCache();
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    cache.entries["a"] = { translation: "x", model: "m", timestamp: old };
    cache.entries["b"] = { translation: "y", model: "m", timestamp: old };
    cache.entries["c"] = { translation: "z", model: "m", timestamp: Date.now() };

    const pruned = pruneCache(cache);
    expect(pruned).toBe(2);
    expect(Object.keys(cache.entries)).toEqual(["c"]);
  });

  it("returns 0 when nothing to prune", () => {
    const cache = createCache();
    cache.entries["a"] = { translation: "x", model: "m", timestamp: Date.now() };
    expect(pruneCache(cache)).toBe(0);
  });
});

describe("clearCache", () => {
  it("removes all entries and returns count", () => {
    const cache = createCache();
    setCached(cache, "a", "x", "m");
    setCached(cache, "b", "y", "m");
    const count = clearCache(cache);
    expect(count).toBe(2);
    expect(cache.entries).toEqual({});
  });

  it("returns 0 for empty cache", () => {
    expect(clearCache(createCache())).toBe(0);
  });
});

describe("getCachePath", () => {
  it("returns a path ending in .polyglot-cache.json", () => {
    const p = getCachePath("/some/dir/README.md");
    expect(p).toMatch(/\.polyglot-cache\.json$/);
  });

  it("places cache file in the same directory as source", () => {
    const p = getCachePath("/some/dir/README.md");
    expect(p).toContain("some");
    expect(p).toContain("dir");
  });
});

// ─── Fuzzy cache / translation memory ─────────────────────────────

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    expect(similarity("hello world", "hello world")).toBe(1);
  });

  it("returns 1 for case-different strings", () => {
    expect(similarity("Hello World", "hello world")).toBe(1);
  });

  it("returns 0 for empty vs non-empty", () => {
    expect(similarity("", "hello")).toBe(0);
    expect(similarity("hello", "")).toBe(0);
  });

  it("returns high similarity for minor edits", () => {
    const sim = similarity(
      "Install Ollama from https://ollama.com",
      "Install Ollama from https://ollama.ai"
    );
    expect(sim).toBeGreaterThan(0.9);
  });

  it("returns low similarity for unrelated strings", () => {
    const sim = similarity("hello world", "typescript is great");
    expect(sim).toBeLessThan(0.5);
  });

  it("handles single character difference", () => {
    const sim = similarity("cat", "bat");
    expect(sim).toBeCloseTo(0.667, 2);
  });

  it("handles transpositions", () => {
    const sim = similarity("abcd", "abdc");
    expect(sim).toBeGreaterThanOrEqual(0.5);
  });
});

describe("getFuzzyCached", () => {
  it("returns undefined for empty cache", () => {
    const cache = createCache();
    expect(getFuzzyCached(cache, "hello", "ja", "model")).toBeUndefined();
  });

  it("returns undefined when entries lack source text", () => {
    const cache = createCache();
    // Old-style entry without source
    cache.entries["key1"] = {
      translation: "こんにちは",
      model: "translategemma:12b",
      timestamp: Date.now(),
    };
    expect(getFuzzyCached(cache, "hello", "ja", "translategemma:12b")).toBeUndefined();
  });

  it("finds fuzzy match above threshold", () => {
    const cache = createCache();
    setCached(cache, "key1", "Excelente calidad", "translategemma:12b", "Excellent quality");
    const result = getFuzzyCached(cache, "Excellent  quality ", "es", "translategemma:12b");
    expect(result).toBeDefined();
    expect(result!.translation).toBe("Excelente calidad");
    expect(result!.similarity).toBeGreaterThan(FUZZY_THRESHOLD);
  });

  it("returns undefined for below-threshold matches", () => {
    const cache = createCache();
    setCached(cache, "key1", "こんにちは", "translategemma:12b", "Hello world");
    const result = getFuzzyCached(cache, "Completely different text", "ja", "translategemma:12b");
    expect(result).toBeUndefined();
  });

  it("skips expired entries", () => {
    const cache = createCache();
    cache.entries["key1"] = {
      translation: "expired",
      model: "translategemma:12b",
      timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
      source: "Hello world",
    };
    expect(getFuzzyCached(cache, "Hello world", "ja", "translategemma:12b")).toBeUndefined();
  });

  it("skips entries with different model", () => {
    const cache = createCache();
    setCached(cache, "key1", "こんにちは", "translategemma:4b", "Hello world");
    expect(getFuzzyCached(cache, "Hello world", "ja", "translategemma:12b")).toBeUndefined();
  });

  it("returns the best match when multiple candidates exist", () => {
    const cache = createCache();
    setCached(cache, "key1", "translation A", "m", "Hello world again");
    setCached(cache, "key2", "translation B", "m", "Hello  world again");
    // Closer still by edit distance, but it adds a character, so it is out.
    setCached(cache, "key3", "translation C", "m", "Hello   world again!");
    const result = getFuzzyCached(cache, "Hello   world again", "ja", "m");
    expect(result).toBeDefined();
    // Both A and B differ from the query only in spacing; B differs by less.
    expect(result!.translation).toBe("translation B");
  });

  it("skips entries with different target language", () => {
    const cache = createCache();
    setCached(cache, "key1", "こんにちは", "translategemma:12b", "Hello world", "ja");
    // Querying for Spanish should NOT return the Japanese translation
    const result = getFuzzyCached(cache, "Hello world", "es", "translategemma:12b");
    expect(result).toBeUndefined();
  });

  it("returns match when target language matches", () => {
    const cache = createCache();
    setCached(cache, "key1", "Hola mundo", "translategemma:12b", "Hello world", "es");
    const result = getFuzzyCached(cache, "Hello world", "es", "translategemma:12b");
    expect(result).toBeDefined();
    expect(result!.translation).toBe("Hola mundo");
  });

  it("handles entries without targetLang (pre-v1.6.1 backward compat)", () => {
    const cache = createCache();
    // Simulate old cache entry without targetLang
    cache.entries["key1"] = {
      translation: "こんにちは",
      model: "translategemma:12b",
      timestamp: Date.now(),
      source: "Hello world",
    };
    // Old entries without targetLang should still be returned (backward compat)
    const result = getFuzzyCached(cache, "Hello world", "es", "translategemma:12b");
    expect(result).toBeDefined();
  });

  // ─── Invariant-token guard (v1.7.2) ─────────────────────────────
  //
  // Fuzzy similarity is high (~0.99) between text that differs only by a
  // SemVer version token. Before v1.7.2, the cache returned the wrong-
  // version translation for the testing-os README's `<!-- version:start -->`
  // marker block on every release.

  it("rejects fuzzy match when source contains a different version token", () => {
    const cache = createCache();
    setCached(
      cache,
      cacheKey("**v1.2.1** — 7 packages.", "ja", "translategemma:12b"),
      "**v1.2.1** — 7パッケージ。",
      "translategemma:12b",
      "**v1.2.1** — 7 packages.",
      "ja"
    );
    const result = getFuzzyCached(cache, "**v1.2.2** — 7 packages.", "ja", "translategemma:12b");
    expect(result).toBeUndefined();
  });

  it("accepts fuzzy match when both texts share the same version token", () => {
    const cache = createCache();
    setCached(
      cache,
      cacheKey("**v1.2.1** — 7 packages.", "ja", "translategemma:12b"),
      "**v1.2.1** — 7パッケージ。",
      "translategemma:12b",
      "**v1.2.1** — 7 packages.",
      "ja"
    );
    // Version unchanged; only the spacing moved — fuzzy match should still hit.
    const result = getFuzzyCached(cache, "**v1.2.1**  — 7 packages. ", "ja", "translategemma:12b");
    expect(result).toBeDefined();
    expect(result!.translation).toBe("**v1.2.1** — 7パッケージ。");
  });

  it("accepts fuzzy match when neither text contains a version token", () => {
    const cache = createCache();
    setCached(
      cache,
      cacheKey("Hello world", "ja", "translategemma:12b"),
      "こんにちは世界",
      "translategemma:12b",
      "Hello world",
      "ja"
    );
    const result = getFuzzyCached(cache, "Hello  world", "ja", "translategemma:12b");
    expect(result).toBeDefined();
  });

  it("rejects fuzzy match when version-token counts differ", () => {
    const cache = createCache();
    setCached(
      cache,
      cacheKey("Upgrade from v1.2.0 to v1.2.1.", "ja", "translategemma:12b"),
      "v1.2.0からv1.2.1へアップグレード。",
      "translategemma:12b",
      "Upgrade from v1.2.0 to v1.2.1.",
      "ja"
    );
    // Same Levenshtein-near source but only one version mentioned now.
    const result = getFuzzyCached(cache, "Upgrade to v1.2.1.", "ja", "translategemma:12b");
    expect(result).toBeUndefined();
  });

  // ─── Stale-translation guard (si-rpg-engine, 2026-09-25) ─────────
  //
  // translate-all kept the previous run's text for two edited segments of
  // si-rpg-engine's README in 4 of 7 languages: a count that went 174 → 197
  // (0.987 similar to its cached source) and a table cell that gained "and
  // infinities" (0.894). The version-token guard was the only guard, and
  // neither edit touched a version. A cached translation is now reused only
  // when the sources differ in whitespace layout alone.

  const MODEL = "translategemma:27b";

  const seed = (source: string, translation = "OLD TRANSLATION") => {
    const cache = createCache();
    setCached(cache, cacheKey(source, "es", MODEL), translation, MODEL, source, "es");
    return cache;
  };

  /** Similar enough that the threshold alone would reuse it — and it must not. */
  const expectNoReuse = (before: string, after: string) => {
    expect(similarity(before, after)).toBeGreaterThan(FUZZY_THRESHOLD);
    expect(getFuzzyCached(seed(before), after, "es", MODEL)).toBeUndefined();
  };

  it("does not reuse a translation across a changed count (si-rpg-engine README)", () => {
    const before =
      "174 tests, seven behaviour fixtures that replay step for step, and two golden hashes printed by three engines on x64 and by node on ARM64, on every commit.";
    expectNoReuse(before, before.replace("174", "197"));
  });

  it("does not reuse a translation across added words (si-rpg-engine README table cell)", () => {
    const before =
      "A fixed-timestep tick; every step's state hashed with a two-lane FNV-1a over every f64; NaN refused; signed zero canonicalized";
    expectNoReuse(before, before.replace("NaN refused", "NaN and infinities refused"));
  });

  it("does not reuse a translation across a number-only change, whatever the threshold", () => {
    // "174 tests" vs "197 tests" is under the default threshold on its own, so
    // drop the threshold to show the guard, not the score, rejects it.
    expect(getFuzzyCached(seed("174 tests"), "197 tests", "es", MODEL, undefined, 0)).toBeUndefined();
  });

  it("does not reuse a translation across a change in number format", () => {
    const before = "Benchmarked on 1,000 generated scenes with a mean recall of 0.2105 per scene.";
    expectNoReuse(before, before.replace("1,000", "1.000"));
    expectNoReuse(before, before.replace("0.2105", "0.2150"));
  });

  it("does not reuse a translation when an inline code span was added", () => {
    // The cache sees masked text, so the new span shows up as a new placeholder.
    expectNoReuse(
      "Run ⟦0⟧ before the first build so the workspace links resolve.",
      "Run ⟦0⟧ or ⟦1⟧ before the first build so the workspace links resolve.",
    );
  });

  it("does not reuse a translation across a typo fix or a change of case", () => {
    expectNoReuse("Excellent quality", "Excellent qualiti");
    // similarity() ignores case, so this pair scores a perfect 1.
    expectNoReuse("Deploys with Github Actions.", "Deploys with GitHub Actions.");
  });

  it("does not reuse a translation across a punctuation or symbol change", () => {
    expectNoReuse("Hello world", "Hello world!");
    // Each of these reverses what the line says.
    expectNoReuse("Windows support ships in the next release.", "~~Windows support ships in the next release.~~");
    expectNoReuse("✓ Tested on Windows 11", "✗ Tested on Windows 11");
    expectNoReuse("Cold start is +12% after the cache change.", "Cold start is -12% after the cache change.");
  });

  it("does not reuse a translation across a change in line structure", () => {
    // Reflowing a prose paragraph is harmless, but the same edit in a list
    // changes the nesting or merges items, and a segment cannot tell which.
    expectNoReuse("- Install the CLI\n  - then run the doctor", "- Install the CLI\n- then run the doctor");
    expectNoReuse("- Install the CLI\n  - then run the doctor", "- Install the CLI - then run the doctor");
  });

  it("reuses a translation across whitespace-only edits", () => {
    const cache = seed("Seven behaviour fixtures replay step for step.", "Siete fixtures");
    for (const query of [
      "Seven behaviour fixtures  replay step for step.",
      "Seven\tbehaviour fixtures replay step for step. ",
      "Seven behaviour fixtures replay step for step.\r\n",
    ]) {
      expect(getFuzzyCached(cache, query, "es", MODEL)?.translation).toBe("Siete fixtures");
    }
  });
});

describe("extractInvariantTokens", () => {
  it("returns empty array for text with no version tokens", () => {
    expect(extractInvariantTokens("Hello world")).toEqual([]);
  });

  it("extracts a single version token", () => {
    expect(extractInvariantTokens("**v1.2.2** — release")).toEqual(["v1.2.2"]);
  });

  it("extracts multiple version tokens in source order", () => {
    expect(extractInvariantTokens("Upgrade from v1.2.0 to v1.2.1")).toEqual(["v1.2.0", "v1.2.1"]);
  });

  it("keeps source order rather than sorting", () => {
    expect(extractInvariantTokens("Downgrade from v1.2.1 to v1.2.0")).toEqual(["v1.2.1", "v1.2.0"]);
  });

  it("extracts pre-release version tokens", () => {
    expect(extractInvariantTokens("Pre-release v2.0.0-rc.1 lands today")).toEqual(["v2.0.0-rc.1"]);
  });

  it("extracts bare numbers, dotted or not, when there is no leading 'v'", () => {
    expect(extractInvariantTokens("3 packages, 1.2.3 not a real semver here")).toEqual(["3", "1.2.3"]);
  });

  it("keeps a number's decimal and grouping separators", () => {
    expect(extractInvariantTokens("Recall 0.2105 across 1,000 scenes and 174 tests.")).toEqual([
      "0.2105",
      "1,000",
      "174",
    ]);
  });

  it("extracts digits inside identifiers", () => {
    expect(extractInvariantTokens("x64 and ARM64, hashed with FNV-1a")).toEqual(["64", "64", "1"]);
  });

  it("extracts digits from any script", () => {
    expect(extractInvariantTokens("१७४ परीक्षण")).toEqual(["१७४"]);
  });

  it("extracts code-span placeholders without counting their digits again", () => {
    expect(extractInvariantTokens("Use ⟦0⟧ with ⟦1⟧ on 2 hosts")).toEqual(["⟦0⟧", "⟦1⟧", "2"]);
  });

  it("does not count a version token's digits again", () => {
    expect(extractInvariantTokens("v2.0.0-rc.1 ships 3 fixes")).toEqual(["v2.0.0-rc.1", "3"]);
  });
});

describe("hasSameInvariantTokens", () => {
  it("returns true for two strings without any version tokens", () => {
    expect(hasSameInvariantTokens("Hello", "Hello world")).toBe(true);
  });

  it("returns true for two strings with the same version token", () => {
    expect(hasSameInvariantTokens("v1.2.2 release", "release of v1.2.2")).toBe(true);
  });

  it("returns false when version tokens differ", () => {
    expect(hasSameInvariantTokens("**v1.2.1** ships", "**v1.2.2** ships")).toBe(false);
  });

  it("returns false when one string has a version token and the other doesn't", () => {
    expect(hasSameInvariantTokens("**v1.2.1** ships", "ships today")).toBe(false);
  });

  it("returns false when a bare number differs", () => {
    expect(hasSameInvariantTokens("174 tests", "197 tests")).toBe(false);
  });

  it("returns false when a number's separators differ", () => {
    expect(hasSameInvariantTokens("1,000 scenes", "1.000 scenes")).toBe(false);
    expect(hasSameInvariantTokens("1,000 scenes", "1000 scenes")).toBe(false);
  });

  it("returns false when the code-span placeholders differ", () => {
    expect(hasSameInvariantTokens("Run ⟦0⟧ first", "Run ⟦0⟧ or ⟦1⟧ first")).toBe(false);
  });

  it("returns false when the same numbers appear in a different order", () => {
    expect(hasSameInvariantTokens("174 tests, 7 fixtures", "7 tests, 174 fixtures")).toBe(false);
  });

  it("returns true when the numbers match and only the prose differs", () => {
    expect(hasSameInvariantTokens("174 tests pass", "all 174 tests passed")).toBe(true);
  });
});

describe("canonicalWhitespace", () => {
  it("collapses runs of spaces and tabs within a line", () => {
    expect(canonicalWhitespace("a  b\t\tc")).toBe("a b c");
  });

  it("drops whitespace at the start and end of the segment", () => {
    expect(canonicalWhitespace("  Install \n")).toBe("Install");
  });

  it("normalises CRLF to LF", () => {
    expect(canonicalWhitespace("one\r\ntwo")).toBe("one\ntwo");
  });

  it("keeps each line break and the indentation after it", () => {
    expect(canonicalWhitespace("- a\n  - b")).toBe("- a\n  - b");
    expect(canonicalWhitespace("- a\n  - b")).not.toBe(canonicalWhitespace("- a\n- b"));
    expect(canonicalWhitespace("one two\nthree")).not.toBe(canonicalWhitespace("one\ntwo three"));
  });

  it("keeps a hard line break and drops a single trailing space", () => {
    expect(canonicalWhitespace("one   \ntwo")).toBe("one  \ntwo");
    expect(canonicalWhitespace("one \ntwo")).toBe("one\ntwo");
  });

  it("treats a non-breaking space as content, not layout", () => {
    expect(canonicalWhitespace("100 ms")).not.toBe(canonicalWhitespace("100 ms"));
  });

  it("keeps case", () => {
    expect(canonicalWhitespace("GitHub")).not.toBe(canonicalWhitespace("Github"));
  });
});

describe("setCached with source text", () => {
  it("stores source text in the cache entry", () => {
    const cache = createCache();
    setCached(cache, "key1", "translated", "model", "original");
    expect(cache.entries["key1"].source).toBe("original");
  });

  it("works without source text (backward compat)", () => {
    const cache = createCache();
    setCached(cache, "key1", "translated", "model");
    expect(cache.entries["key1"].source).toBeUndefined();
  });

  it("stores targetLang in the cache entry", () => {
    const cache = createCache();
    setCached(cache, "key1", "translated", "model", "original", "ja");
    expect(cache.entries["key1"].targetLang).toBe("ja");
  });

  it("works without targetLang (backward compat)", () => {
    const cache = createCache();
    setCached(cache, "key1", "translated", "model", "original");
    expect(cache.entries["key1"].targetLang).toBeUndefined();
  });
});
