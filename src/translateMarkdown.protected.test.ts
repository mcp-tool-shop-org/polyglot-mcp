/**
 * translateMarkdown with protected terms — the real slips of issue #44, driven
 * through the engine with only the Ollama batch layer mocked.
 *
 * The mocks below ARE the failures, not stand-ins for them: one respells every
 * identifier it is handed the way TranslateGemma did (XLS → एक्सएलएस,
 * DepositAuth → डिपॉजिटऑथ, Kimi-K3 → किमी-के3); the other reverses or
 * ordinalises any "N of M" it sees, as the Chinese README got. If masking
 * regresses, these tests fail the way the published pages did.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mock = vi.hoisted(() => ({ mode: "respell" as "respell" | "counts" }));

/** The respellings the Hindi README shipped (xrpl-lab 7acc67c, ai-jam-sessions e4cd2fb/5f8d1e2). */
const RESPELLINGS: Array<[RegExp, string]> = [
  [/DepositPreauth/g, "डिपॉजिटप्रीऑथ"],
  [/DepositAuth/g, "डिपॉजिटऑथ"],
  [/XLS-/g, "एक्सएलएस-"],
  [/Kimi-K3/g, "किमी-के3"],
];

vi.mock("./translate.js", () => ({
  translateBatch: vi.fn(async (items: Array<{ text: string }>) => ({
    translations: items.map(({ text }) => {
      if (mock.mode === "counts") {
        // The two Chinese slips: the first count reversed, any other ordinalised.
        let n = 0;
        return `【zh】${text.replace(/(\d+) of (\d+)/g, (_m, a, b) => (n++ === 0 ? `${a} 首中的 ${b} 首` : `${b}个中的第${a}个`))}`;
      }
      let out = text;
      for (const [re, hi] of RESPELLINGS) out = out.replace(re, hi);
      return `【hi】${out}`;
    }),
    model: "mock",
    ollamaCalls: 1,
    durationMs: 0,
  })),
}));

import { translateMarkdown } from "./translateMarkdown.js";
import { translateBatch } from "./translate.js";
import { cacheKey, getCached, loadCache } from "./cache.js";
import { maskCodeSpans } from "./codeSpans.js";
import { buildProtectedTerms, DEFAULT_PROTECTED_TERMS, TERMS_FILE, type ProtectedTermSet } from "./protectedTerms.js";
import { setPin, createPins } from "./pins.js";
import { LostSpanError } from "./survival.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "issue-44");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf-8").replace(/\r\n/g, "\n");
const MODEL = "translategemma:27b";
const DEVANAGARI_RESPELLING = /एक्सएलएस|डिपॉजिट|किमी-के3/;

const sentToModel = () => vi.mocked(translateBatch).mock.calls.flatMap(([items]) => items.map((i) => i.text));

describe("translateMarkdown — protected terms survive a respelling model", () => {
  beforeEach(() => {
    mock.mode = "respell";
    vi.mocked(translateBatch).mockClear();
  });

  it("keeps every XLS ID and DepositAuth in xrpl-lab's module table and track list", async () => {
    const en = fixture("xrpl-lab.README.7acc67c.md");
    const result = await translateMarkdown(en, "en", "hi", { cache: false });

    // The mock respelled whatever it saw; it saw none of the identifiers.
    expect(sentToModel().join("\n")).not.toMatch(/XLS-|DepositAuth|DepositPreauth/);
    expect(result.markdown).not.toMatch(DEVANAGARI_RESPELLING);
    for (const id of [...new Set(en.match(/XLS-\d+|DepositAuth|DepositPreauth/g))]) {
      expect(result.markdown).toContain(id);
    }
    expect(result.markdown).toContain("【hi】");
    expect(result.lostSpans).toEqual([]);
  });

  it("keeps Kimi-K3 in the credits paragraph", async () => {
    const md = "The piano arrangements were written for this project by Kimi-K3 and are dedicated to the public domain (CC0).";
    const result = await translateMarkdown(md, "en", "hi", { cache: false });
    expect(result.markdown).toContain("by Kimi-K3 and");
    expect(result.markdown).not.toContain("किमी-के3");
  });

  it("respells them again when the defaults are switched off — the mock is the real failure", async () => {
    const md = "Deposit Gate (DepositAuth + DepositPreauth), per XLS-70, arranged by Kimi-K3.";
    const terms = buildProtectedTerms({ disable: ["caps-id", "camel-case", "model-id"] });
    const result = await translateMarkdown(md, "en", "hi", { cache: false, terms });
    expect(result.markdown).toBe("【hi】Deposit Gate (डिपॉजिटऑथ + डिपॉजिटप्रीऑथ), per एक्सएलएस-70, arranged by किमी-के3.");
  });
});

describe("translateMarkdown — N of M counts", () => {
  const TABLE = fixture("ai-jam-sessions.README.5f8d1e2-parent.md");

  beforeEach(() => {
    mock.mode = "counts";
    vi.mocked(translateBatch).mockClear();
  });

  it("writes every count in the ai-jam-sessions table as N/M, without asking the model", async () => {
    const result = await translateMarkdown(TABLE, "en", "zh", { cache: false });

    expect(result.markdown).toContain("| 218/224 |");
    expect(result.markdown).toContain("| 283/414 |");
    expect(result.markdown).not.toMatch(/首中的|个中的第/);
    // A cell that is only a count has nothing left to translate.
    expect(sentToModel().some((t) => /\d/.test(t) && !/[a-z]/i.test(t))).toBe(false);
    expect(sentToModel().join("\n")).not.toMatch(/\d+ of \d+/);
    expect(result.lostSpans).toEqual([]);
  });

  it("restores N/M in prose even from a model that reverses and ordinalises counts", async () => {
    const md = "The Battle Hymn landed 285 of 414 syllables on time and 218 of 224 notes in tune.";
    const result = await translateMarkdown(md, "en", "zh", { cache: false });
    expect(result.markdown).toBe("【zh】The Battle Hymn landed 285/414 syllables on time and 218/224 notes in tune.");
  });

  it("garbles them without the N of M rule — the mock is the real failure", async () => {
    const md = "The Battle Hymn landed 218 of 224 notes and 285 of 414 syllables.";
    const result = await translateMarkdown(md, "en", "zh", { cache: false, terms: buildProtectedTerms({ nOfM: false }) });
    expect(result.markdown).toContain("218 首中的 224 首");
    expect(result.markdown).toContain("414个中的第285个");
  });
});

describe("translateMarkdown — the real cache from ai-jam-sessions 5f8d1e2", () => {
  let dir: string;
  const readme = () => join(dir, "README.md");

  /** Load the fixture entries into a cache file, timestamps refreshed so the TTL keeps them. */
  const seedCache = () => {
    const file = JSON.parse(readFileSync(join(FIXTURES, "ai-jam-sessions.polyglot-cache.5f8d1e2.json"), "utf-8"));
    for (const entry of Object.values(file.entries) as Array<{ timestamp: number }>) entry.timestamp = Date.now();
    writeFileSync(join(dir, ".polyglot-cache.json"), JSON.stringify({ version: 1, entries: file.entries }));
    return file.entries as Record<string, { source: string; translation: string; targetLang: string }>;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-protected-"));
    mock.mode = "respell";
    vi.mocked(translateBatch).mockClear();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not replay the किमी-के3 entry that 1.8 would have", async () => {
    const entries = seedCache();
    const slip = entries["d80ff4f64eeb47f5"];
    expect(slip.translation).toContain("किमी-के3");

    // The entry is keyed exactly as 1.8 keyed this paragraph, so 1.8 replayed it.
    expect(cacheKey(slip.source, "hi", MODEL)).toBe("d80ff4f64eeb47f5");
    expect(getCached(loadCache(readme()), cacheKey(slip.source, "hi", MODEL))).toBe(slip.translation);

    // The README holds the paragraph byte for byte (CRLF line ends included).
    const md = `${slip.source}\n`;
    const result = await translateMarkdown(md, "en", "hi", { model: MODEL, filePath: readme() });

    expect(result.cached).toBe(0);
    expect(result.markdown).not.toContain("किमी-के3");
    expect(result.markdown).toContain("Kimi-K3");
    expect(result.markdown).toContain("[SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)");
    expect(translateBatch).toHaveBeenCalledTimes(1);
  });

  it("does not replay the ordinal 414个中的第285个 entry", async () => {
    const entries = seedCache();
    expect(entries["85e2645f8a0662fb"].translation).toBe("414个中的第285个");
    expect(cacheKey("285 of 414", "zh", MODEL)).toBe("85e2645f8a0662fb");

    const md = "| | Battle Hymn |\n|---|---|\n| syllables within 40 ms of the score | 285 of 414 |\n";
    mock.mode = "counts";
    const result = await translateMarkdown(md, "en", "zh", { model: MODEL, filePath: readme() });
    expect(result.markdown).toContain("| 285/414 |");
    expect(result.markdown).not.toContain("414个中的第285个");
  });
});

describe("translateMarkdown — the cache key carries the protected-term rules", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-termskey-"));
    mock.mode = "respell";
    vi.mocked(translateBatch).mockClear();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const key = (raw: string, set: ProtectedTermSet) => {
    const m = maskCodeSpans(raw, set);
    return cacheKey(m.text, "hi", MODEL, m.termsHash);
  };

  it("adding a term changes the key for segments containing it, and not for others", () => {
    const withGemma = buildProtectedTerms({ terms: ["Gemma"] });
    expect(key("Runs on Gemma locally.", withGemma)).not.toBe(key("Runs on Gemma locally.", DEFAULT_PROTECTED_TERMS));
    expect(key("Runs locally.", withGemma)).toBe(key("Runs locally.", DEFAULT_PROTECTED_TERMS));
    expect(key("Built for XLS-30.", withGemma)).toBe(key("Built for XLS-30.", DEFAULT_PROTECTED_TERMS));
  });

  it("changes the key even when the masked text is the same (a default already covered the term)", () => {
    const withKimi = buildProtectedTerms({ terms: ["Kimi-K3"] });
    const text = "Arranged by Kimi-K3.";
    expect(maskCodeSpans(text, withKimi).text).toBe(maskCodeSpans(text, DEFAULT_PROTECTED_TERMS).text);
    expect(key(text, withKimi)).not.toBe(key(text, DEFAULT_PROTECTED_TERMS));
  });

  it("keeps the 1.8 key for a segment no rule touches", () => {
    expect(key("Runs locally.", DEFAULT_PROTECTED_TERMS)).toBe(cacheKey("Runs locally.", "hi", MODEL));
  });

  it("retranslates only the segments containing a newly added term", async () => {
    const md = "# Gemma notes\n\nRuns locally.\n\nRuns on Gemma, fast.\n";
    const options = { model: MODEL, filePath: join(dir, "README.md") };
    await translateMarkdown(md, "en", "hi", options);
    vi.mocked(translateBatch).mockClear();

    writeFileSync(join(dir, TERMS_FILE), JSON.stringify({ terms: ["Gemma"] }));
    const result = await translateMarkdown(md, "en", "hi", options);

    expect(sentToModel().sort()).toEqual(["Runs on ⟦0⟧, fast.", "⟦0⟧ notes"]);
    expect(result.cached).toBe(1);
  });
});

describe("translateMarkdown — --on-lost-span", () => {
  // A pin is a person's word, so it is the one road by which a respelled
  // identifier can still reach the page; the survival check reads the page.
  const MD = "# Credits\n\nThe piano arrangements were written by Kimi-K3.\n";
  const badPins = () => {
    const pins = createPins();
    setPin(pins, "The piano arrangements were written by Kimi-K3.", "hi", "पियानो की धुनें किमी-के3 द्वारा लिखी गई हैं।");
    return pins;
  };

  beforeEach(() => {
    mock.mode = "respell";
    vi.mocked(translateBatch).mockClear();
  });

  it("report: lists the lost span with the result", async () => {
    const result = await translateMarkdown(MD, "en", "hi", { cache: false, pins: badPins() });
    expect(result.pinned).toBe(1);
    expect(result.lostSpans).toEqual([
      { lang: "hi", segment: "The piano arrangements were written by Kimi-K3.", span: "Kimi-K3", kind: "term" },
    ]);
  });

  it("fail: throws LOST_SPAN carrying the list and the result", async () => {
    const run = translateMarkdown(MD, "en", "hi", { cache: false, pins: badPins(), onLostSpan: "fail" });
    await expect(run).rejects.toBeInstanceOf(LostSpanError);
    const err = (await run.catch((e) => e)) as LostSpanError<{ markdown: string }>;
    expect(err.code).toBe("LOST_SPAN");
    expect(err.lostSpans.map((l) => l.span)).toEqual(["Kimi-K3"]);
    expect(err.result?.markdown).toContain("किमी-के3");
  });

  it("fail: passes a clean translation", async () => {
    const result = await translateMarkdown(MD, "en", "hi", { cache: false, onLostSpan: "fail" });
    expect(result.lostSpans).toEqual([]);
  });
});
