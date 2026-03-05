import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cacheKey,
  createCache,
  getCached,
  setCached,
  pruneCache,
  clearCache,
  getCachePath,
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
