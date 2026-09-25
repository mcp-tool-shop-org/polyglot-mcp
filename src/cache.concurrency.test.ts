/**
 * One cache file, several writers — regression guard for lost updates.
 *
 * translate-all.mjs translates two or three languages at once, one child
 * process each, and every child loaded `.polyglot-cache.json` when it started
 * and overwrote it when it finished. The last language to finish in each pair
 * kept its entries and the others lost theirs: facet's cache held ja, fr, it
 * and pt, and nothing for zh, es or hi. With `--cache-clear` each child also
 * cleared every language on start, so a full run ended with only pt cached.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import ts from "typescript";
import {
  cacheKey,
  createCache,
  loadCache,
  saveCache,
  setCached,
  clearCache,
  pruneCache,
  mergeCacheEntries,
  type CacheEntry,
  type TranslationCache,
} from "./cache.js";

const MODEL = "translategemma:27b";

/** Cache a translation of `text` into `lang` the way translateMarkdown does. */
const put = (cache: TranslationCache, text: string, lang: string, translation = `[${lang}] ${text}`) =>
  setCached(cache, cacheKey(text, lang, MODEL), translation, MODEL, text, lang);

const entry = (translation: string, lang: string, timestamp = 1): CacheEntry => ({
  translation,
  model: MODEL,
  timestamp,
  source: "Hello",
  targetLang: lang,
});

describe("saveCache — one file, several writers", () => {
  let dir: string;
  let readme: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-cache-"));
    readme = join(dir, "README.md");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** The languages the cache file holds entries for. */
  const languagesOnDisk = () =>
    [...new Set(Object.values(loadCache(readme).entries).map((e) => e.targetLang))].sort();

  const seed = (...langs: string[]) => {
    const cache = createCache();
    for (const lang of langs) put(cache, "Hello", lang);
    saveCache(readme, cache);
  };

  it("keeps both languages' entries across two interleaved load/save cycles", () => {
    seed("es");
    const ja = loadCache(readme);
    const zh = loadCache(readme);
    put(ja, "Hello", "ja");
    put(zh, "Hello", "zh");
    saveCache(readme, ja);
    saveCache(readme, zh);
    expect(languagesOnDisk()).toEqual(["es", "ja", "zh"]);
  });

  it("clears one language and keeps the rest, including entries saved after the clearing run loaded", () => {
    seed("ja", "zh");
    const ja = loadCache(readme);
    const es = loadCache(readme);
    put(es, "Hello", "es");
    saveCache(readme, es);

    expect(clearCache(ja, "ja")).toBe(1);
    saveCache(readme, ja);
    expect(languagesOnDisk()).toEqual(["es", "zh"]);
  });

  it("keeps entries saved after the clearing run loaded, even when it clears every language", () => {
    seed("ja", "zh");
    const clearing = loadCache(readme);
    const es = loadCache(readme);
    put(es, "Hello", "es");
    saveCache(readme, es);

    clearCache(clearing);
    saveCache(readme, clearing);
    expect(languagesOnDisk()).toEqual(["es"]);
  });

  it("does not bring back entries another writer removed", () => {
    seed("ja");
    const stale = loadCache(readme);
    const clearing = loadCache(readme);
    clearCache(clearing, "ja");
    saveCache(readme, clearing);

    put(stale, "Hello", "zh");
    saveCache(readme, stale); // still holds the old ja entry, untouched
    expect(languagesOnDisk()).toEqual(["zh"]);
  });

  it("does not overwrite another writer's newer translation with an untouched copy", () => {
    seed("ja");
    const key = cacheKey("Hello", "ja", MODEL);
    const untouched = loadCache(readme);
    const updater = loadCache(readme);
    put(updater, "Hello", "ja", "newer");
    saveCache(readme, updater);

    put(untouched, "Other", "ja");
    saveCache(readme, untouched);
    expect(loadCache(readme).entries[key].translation).toBe("newer");
  });

  it("removes pruned entries from the file", () => {
    const expired = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const key = cacheKey("Old", "ja", MODEL);
    writeFileSync(
      join(dir, ".polyglot-cache.json"),
      JSON.stringify({ version: 1, entries: { [key]: { ...entry("old", "ja"), timestamp: expired } } }),
    );
    const cache = loadCache(readme);
    expect(pruneCache(cache)).toBe(1);
    put(cache, "Hello", "ja");
    saveCache(readme, cache);
    expect(loadCache(readme).entries[key]).toBeUndefined();
    expect(languagesOnDisk()).toEqual(["ja"]);
  });

  it("rewrites an unreadable cache file from the saving process's copy", () => {
    seed("ja", "zh");
    const cache = loadCache(readme);
    writeFileSync(join(dir, ".polyglot-cache.json"), "{ truncated");
    put(cache, "Hello", "es");
    saveCache(readme, cache);
    expect(languagesOnDisk()).toEqual(["es", "ja", "zh"]);
  });

  it("respects a cache file deleted while a run was in progress", () => {
    seed("ja", "zh");
    const cache = loadCache(readme);
    rmSync(join(dir, ".polyglot-cache.json"));
    put(cache, "Hello", "es");
    saveCache(readme, cache);
    expect(languagesOnDisk()).toEqual(["es"]);
  });

  it("leaves no lock or temporary file behind", () => {
    seed("ja");
    const cache = loadCache(readme);
    expect(readdirSync(dir)).toEqual([".polyglot-cache.json"]);
    put(cache, "Hello", "zh");
    saveCache(readme, cache);
    expect(readdirSync(dir)).toEqual([".polyglot-cache.json"]);
  });

  it("breaks a lock left behind by a process that died holding it", () => {
    const lock = join(dir, ".polyglot-cache.json.lock");
    writeFileSync(lock, "4242");
    const aMinuteAgo = new Date(Date.now() - 60_000);
    utimesSync(lock, aMinuteAgo, aMinuteAgo);

    seed("ja");
    expect(languagesOnDisk()).toEqual(["ja"]);
    expect(readdirSync(dir)).toEqual([".polyglot-cache.json"]);
  });

  it(
    "loses no entries when separate processes save at the same time",
    async () => {
      // The children need JavaScript, and Node 20 cannot strip types, so run
      // them on this module transpiled. It imports only node: builtins.
      const source = readFileSync(new URL("./cache.ts", import.meta.url), "utf-8");
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      writeFileSync(join(dir, "cache.mjs"), outputText);
      writeFileSync(
        join(dir, "writer.mjs"),
        [
          'import { loadCache, saveCache, setCached, cacheKey } from "./cache.mjs";',
          "const [readme, lang, count] = process.argv.slice(2);",
          "for (let i = 0; i < Number(count); i++) {",
          "  const cache = loadCache(readme);",
          "  // Every load must still see all of this writer's earlier entries.",
          "  const mine = Object.values(cache.entries).filter((e) => e.targetLang === lang).length;",
          "  if (mine !== i) process.exit(3);",
          "  const text = `segment ${i}`;",
          '  setCached(cache, cacheKey(text, lang, "m"), `${lang} ${i}`, "m", text, lang);',
          "  saveCache(readme, cache);",
          "}",
        ].join("\n"),
      );

      const langs = ["ja", "zh", "es", "fr"];
      const perWriter = 40;
      const exitCodes = await Promise.all(
        langs.map(
          (lang) =>
            new Promise<number | null>((done) => {
              const child = spawn(process.execPath, [join(dir, "writer.mjs"), readme, lang, String(perWriter)], {
                stdio: "inherit",
              });
              child.on("exit", done);
            }),
        ),
      );
      expect(exitCodes).toEqual(langs.map(() => 0));

      const counts = Object.fromEntries(langs.map((lang) => [lang, 0]));
      for (const e of Object.values(loadCache(readme).entries)) counts[e.targetLang!]++;
      expect(counts).toEqual(Object.fromEntries(langs.map((lang) => [lang, perWriter])));
    },
    60_000,
  );
});

describe("clearCache with a language", () => {
  it("clears that language and untagged entries, and nothing else", () => {
    const cache = createCache();
    put(cache, "Hello", "ja");
    put(cache, "Hello", "zh");
    setCached(cache, "legacy", "こんにちは", MODEL, "Hello"); // written before entries were tagged
    expect(clearCache(cache, "ja")).toBe(2);
    expect(Object.values(cache.entries).map((e) => e.targetLang)).toEqual(["zh"]);
  });
});

describe("mergeCacheEntries", () => {
  it("keeps what others added and adds what we added", () => {
    const merged = mergeCacheEntries(new Map(), { ours: entry("a", "ja") }, { theirs: entry("b", "zh") });
    expect(Object.keys(merged).sort()).toEqual(["ours", "theirs"]);
  });

  it("applies our removal only to an entry nobody has rewritten since", () => {
    const base = new Map([
      ["same", entry("x", "ja")],
      ["rewritten", entry("y", "ja")],
    ]);
    const merged = mergeCacheEntries(base, {}, { same: entry("x", "ja"), rewritten: entry("y2", "ja", 2) });
    expect(merged).toEqual({ rewritten: entry("y2", "ja", 2) });
  });

  it("takes their copy of an entry we left untouched, and ours of one we replaced", () => {
    const base = new Map([
      ["untouched", entry("x", "ja")],
      ["replaced", entry("y", "ja")],
    ]);
    const merged = mergeCacheEntries(
      base,
      { untouched: entry("x", "ja"), replaced: entry("ours", "ja", 2) },
      { untouched: entry("theirs", "ja", 3), replaced: entry("theirs", "ja", 3) },
    );
    expect(merged.untouched.translation).toBe("theirs");
    expect(merged.replaced.translation).toBe("ours");
  });
});
