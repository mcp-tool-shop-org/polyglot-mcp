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

const mock = vi.hoisted(() => ({
  mode: "respell" as "respell" | "counts" | "anchors-fr" | "anchors-hi" | "anchors-swap" | "links-hi",
}));

/** The respellings the Hindi README shipped (xrpl-lab 7acc67c, ai-jam-sessions e4cd2fb/5f8d1e2). */
const RESPELLINGS: Array<[RegExp, string]> = [
  [/DepositPreauth/g, "डिपॉजिटप्रीऑथ"],
  [/DepositAuth/g, "डिपॉजिटऑथ"],
  [/XLS-/g, "एक्सएलएस-"],
  [/Kimi-K3/g, "किमी-के3"],
];

/** The relative-path and bare-file translations found in armature and aspire-si Hindi READMEs. */
const LINK_TARGET_CORRUPTIONS_HI: Array<[RegExp, string]> = [
  [/\.\.\/facet/g, "../फेसट"],
  [/\bLICENSE\b/g, "लाइसेंस"],
  [/\bMIT\b/g, "एमआईटी"],
  [/mailto:support@example\.com/g, "mailto:सहायता@उदाहरण.कॉम"],
  [/path with spaces\/file\.md/g, "स्पेस वाला पथ/फ़ाइल.md"],
  [/docs\/Foo_\(bar\)\.md/g, "दस्तावेज़/फ़ू_(बार).md"],
];

/** The slug corruptions the French and Hindi READMEs shipped at 9fbe43a (#46). */
const ANCHOR_CORRUPTIONS_FR: Array<[RegExp, string]> = [
  [/#ollama-cloud-optional/g, "#ollama-cloud-optionnel"],
  [/#configurable-default-model/g, "#modèle-par-défaut-configurable"],
  [/#protected-terms-polyglot-termsjson/g, "#termes-protégés-polyglot-termsjson"],
  [/#survival-check---on-lost-span/g, "#vérification-de-survie---en-cas-de-portion-manquante"],
];

const HEADING_TRANSLATIONS_FR: Record<string, string> = {
  "Ollama Cloud (optional)": "Ollama Cloud (optionnel)",
  "Configurable Default Model": "Modèle par défaut configurable",
  "Protected Terms (⟦0⟧)": "Termes protégés (⟦0⟧)",
  "Survival Check (⟦0⟧)": "Vérification de survie (⟦0⟧)",
  "⟦0⟧ Guide": "Guide ⟦0⟧",
  FAQ: "Foire aux questions",
};

const HEADING_TRANSLATIONS_HI: Record<string, string> = {
  "Ollama Cloud (optional)": "ओलामा क्लाउड (वैकल्पिक)",
  "Configurable Default Model": "कॉन्फ़िगर करने योग्य डिफ़ॉल्ट मॉडल",
  "Protected Terms (⟦0⟧)": "संरक्षित शब्द (⟦0⟧)",
  "Survival Check (⟦0⟧)": "उत्तरजीविता जाँच (⟦0⟧)",
};

const prefixProse = (tag: string, text: string): string =>
  /^[ \t>]*\[[^\][\r\n]+\]:/.test(text) ? `${text} "${tag}"` : `【${tag}】${text}`;

vi.mock("./translate.js", () => ({
  translateBatch: vi.fn(async (items: Array<{ text: string }>) => ({
    translations: items.map(({ text }) => {
      if (mock.mode === "counts") {
        // The two Chinese slips: the first count reversed, any other ordinalised.
        let n = 0;
        return prefixProse(
          "zh",
          text.replace(/(\d+) of (\d+)/g, (_m, a, b) => (n++ === 0 ? `${a} 首中的 ${b} 首` : `${b}个中的第${a}个`)),
        );
      }
      if (mock.mode === "anchors-fr") {
        if (text in HEADING_TRANSLATIONS_FR) return HEADING_TRANSLATIONS_FR[text];
        let out = text;
        for (const [re, bad] of ANCHOR_CORRUPTIONS_FR) out = out.replace(re, bad);
        for (const [re, hi] of RESPELLINGS) out = out.replace(re, hi);
        return prefixProse("fr", out);
      }
      if (mock.mode === "anchors-hi") {
        if (text in HEADING_TRANSLATIONS_HI) return HEADING_TRANSLATIONS_HI[text];
        return prefixProse("hi", text.replace(/#configurable-default-model/g, "#कनफ़िगर-करने-योग्य-डिफ़ॉल्ट-मॉडल"));
      }
      if (mock.mode === "anchors-swap") {
        if (text === "[Options](⟦0⟧)") return "[Options de ligne de commande](⟦0⟧)";
        if (text === "Options") return "Options";
        return prefixProse("fr", text);
      }
      if (mock.mode === "links-hi") {
        let out = text;
        for (const [re, bad] of LINK_TARGET_CORRUPTIONS_HI) out = out.replace(re, bad);
        return prefixProse("hi", out);
      }
      let out = text;
      for (const [re, hi] of RESPELLINGS) out = out.replace(re, hi);
      return prefixProse("hi", out);
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

describe("translateMarkdown — in-page anchor links", () => {
  const MD_FR = [
    "You can opt in to [Ollama Cloud](#ollama-cloud-optional).",
    "",
    '> **Tip:** Set `POLYGLOT_MODEL=translategemma:12b` first (see [Configurable Default Model](#configurable-default-model)).',
    "",
    "Inline code spans and [protected terms](#protected-terms-polyglot-termsjson) are swapped for placeholders.",
    "",
    "| `onLostSpan` | no | See [Survival Check](#survival-check---on-lost-span) |",
    "",
    "### Protected Terms (`.polyglot-terms.json`)",
    "",
    "### Survival Check (`--on-lost-span`)",
    "",
    "### Ollama Cloud (optional)",
    "",
    "### Configurable Default Model",
    "",
  ].join("\n");

  beforeEach(() => {
    mock.mode = "anchors-fr";
    vi.mocked(translateBatch).mockClear();
  });

  it("masks anchor targets before the model sees them and rewrites them to translated heading slugs", async () => {
    const result = await translateMarkdown(MD_FR, "en", "fr", { cache: false, onLostSpan: "fail" });

    // The model never saw any of the raw #slug targets.
    expect(sentToModel().join("\n")).not.toMatch(
      /#ollama-cloud-optional|#configurable-default-model|#protected-terms-polyglot-termsjson|#survival-check---on-lost-span/,
    );
    // And the finished page carries the exact GitHub slugs of the translated French headings.
    expect(result.markdown).toContain("](#ollama-cloud-optionnel)");
    expect(result.markdown).toContain("](#modèle-par-défaut-configurable)");
    expect(result.markdown).toContain("](#termes-protégés-polyglot-termsjson)");
    expect(result.markdown).toContain("](#vérification-de-survie---on-lost-span)");
    expect(result.markdown).not.toContain("#vérification-de-survie---en-cas-de-portion-manquante");
    expect(result.lostSpans).toEqual([]);
  });

  it("rewrites Hindi anchors to Devanagari slugs and preserves combining marks", async () => {
    mock.mode = "anchors-hi";
    const result = await translateMarkdown(MD_FR, "en", "hi", { cache: false, onLostSpan: "fail" });
    expect(result.markdown).toContain("](#ओलामा-क्लाउड-वैकल्पिक)");
    expect(result.markdown).toContain("](#कॉन्फ़िगर-करने-योग्य-डिफ़ॉल्ट-मॉडल)");
    expect(result.markdown).toContain("](#संरक्षित-शब्द-polyglot-termsjson)");
    expect(result.markdown).toContain("](#उत्तरजीविता-जाँच---on-lost-span)");
    expect(result.lostSpans).toEqual([]);
  });

  it("rewrites inline links with titles, reference definitions, and HTML href='#…' while skipping code", async () => {
    const md = [
      'See [Cloud](#ollama-cloud-optional "cloud section"), [ref][cloud-ref], and <a href="#configurable-default-model">model</a>.',
      "",
      'Inline code `[Cloud](#ollama-cloud-optional)` and `<a href="#ollama-cloud-optional">` stay literal.',
      "",
      "[cloud-ref]: #ollama-cloud-optional",
      "",
      "```markdown",
      "[Cloud](#ollama-cloud-optional)",
      "```",
      "",
      "### Ollama Cloud (optional)",
      "",
      "### Configurable Default Model",
      "",
    ].join("\n");

    const result = await translateMarkdown(md, "en", "fr", { cache: false, onLostSpan: "fail" });
    expect(result.markdown).toContain('(#ollama-cloud-optionnel "cloud section")');
    expect(result.markdown).toContain('<a href="#modèle-par-défaut-configurable">');
    expect(result.markdown).toContain("[cloud-ref]: #ollama-cloud-optionnel");
    expect(result.markdown).toContain("`[Cloud](#ollama-cloud-optional)`");
    expect(result.markdown).toContain('`<a href="#ollama-cloud-optional">`');
    expect(result.markdown).toContain("```markdown\n[Cloud](#ollama-cloud-optional)\n```");
    expect(result.lostSpans).toEqual([]);
  });

  it("masks href='#kimi-k3-guide' and blockquote definitions as anchor rather than term (F3)", async () => {
    const md = [
      'Jump to <a href="#kimi-k3-guide">the guide</a> or [Cloud][cloud-ref].',
      "",
      "> [cloud-ref]: #ollama-cloud-optional",
      "",
      "### Kimi-K3 Guide",
      "",
      "### Ollama Cloud (optional)",
      "",
    ].join("\n");

    const result = await translateMarkdown(md, "en", "fr", { cache: false, onLostSpan: "fail" });
    expect(result.markdown).toContain('<a href="#guide-kimi-k3">');
    expect(result.markdown).toContain("> [cloud-ref]: #ollama-cloud-optionnel");
    expect(result.lostSpans).toEqual([]);
  });

  it("resolves and rewrites uppercase source anchors like [FAQ](#FAQ) beside ## FAQ (F6)", async () => {
    const md = ["See [FAQ](#FAQ) for details.", "", "## FAQ", ""].join("\n");
    const result = await translateMarkdown(md, "en", "fr", { cache: false, onLostSpan: "fail" });
    expect(result.markdown).toContain("](#foire-aux-questions)");
    expect(result.warnings).toEqual([]);
    expect(result.lostSpans).toEqual([]);
  });

  it("handles a CRLF file with a reference-definition anchor end to end (F7)", async () => {
    const md = [
      "Read the [Cloud section][cloud-ref].",
      "",
      "[cloud-ref]: #ollama-cloud-optional",
      "",
      "### Ollama Cloud (optional)",
      "",
    ].join("\r\n");

    const result = await translateMarkdown(md, "en", "fr", { cache: false, onLostSpan: "fail" });
    expect(result.markdown).toContain("[cloud-ref]: #ollama-cloud-optionnel");
    expect(result.warnings).toEqual([]);
    expect(result.lostSpans).toEqual([]);
  });

  it("single-pass rewrite prevents double-rewriting when two headings swap slugs (F6)", async () => {
    mock.mode = "anchors-swap";
    const md = [
      "Compare [first](#options) and [second](#options-1).",
      "",
      "### [Options](https://example.com)",
      "",
      "### Options",
      "",
    ].join("\n");

    const result = await translateMarkdown(md, "en", "fr", { cache: false, onLostSpan: "fail" });
    // First heading (#options) -> #options-de-ligne-de-commande; second (#options-1) -> #options.
    // A multi-pass replaceAll would turn #options-1 into #options and then into #options-de-ligne-de-commande.
    expect(result.markdown).toContain("[first](#options-de-ligne-de-commande)");
    expect(result.markdown).toContain("[second](#options)");
    expect(result.lostSpans).toEqual([]);
  });

  it("decodes percent-encoded source anchors and never throws URIError on malformed % slugs (F4)", async () => {
    const md = [
      "See [Cloud](#ollama-cloud-%6Fptional) and broken [100%](#100%-coverage).",
      "",
      "### Ollama Cloud (optional)",
      "",
    ].join("\n");

    const result = await translateMarkdown(md, "en", "fr", { cache: false, onLostSpan: "fail" });
    expect(result.markdown).toContain("](#ollama-cloud-optionnel)");
    expect(result.markdown).toContain("](#100%-coverage)");
    expect(result.lostSpans).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining("anchor #100%-coverage is unresolved in source"),
    ]);
  });

  it("rewrites pinned segments' English slugs to the translated heading slugs", async () => {
    const pins = createPins();
    setPin(
      pins,
      "You can opt in to [Ollama Cloud](#ollama-cloud-optional).",
      "fr",
      "Vous pouvez activer [Ollama Cloud](#ollama-cloud-optional).",
    );
    const result = await translateMarkdown(MD_FR, "en", "fr", { cache: false, pins, onLostSpan: "fail" });
    expect(result.pinned).toBe(1);
    expect(result.markdown).toContain("Vous pouvez activer [Ollama Cloud](#ollama-cloud-optionnel).");
    expect(result.lostSpans).toEqual([]);
  });

  it("disable: ['anchor'] switches off §1 masking, §2 rewriting, and §3 survival checking (F7)", async () => {
    const terms = buildProtectedTerms({ disable: ["anchor"] });
    const result = await translateMarkdown(MD_FR, "en", "fr", { cache: false, terms, onLostSpan: "fail" });
    // Without §1 masking, the mock sees and corrupts #survival-check---on-lost-span;
    // without §2 rewriting or §3 anchor checking, the corrupted slug stays and does not throw LOST_SPAN.
    expect(result.markdown).toContain("](#vérification-de-survie---en-cas-de-portion-manquante)");
    expect(result.lostSpans).toEqual([]);
  });

  it("adding the anchor rule changes the cache key for segments with an anchor and leaves other segments untouched", () => {
    const withoutAnchor = buildProtectedTerms({ disable: ["anchor"] });
    const withAnchor = DEFAULT_PROTECTED_TERMS;
    const segWithAnchor = "See [Ollama Cloud](#ollama-cloud-optional).";
    const segWithoutAnchor = "Runs locally on your GPU.";

    const mWith1 = maskCodeSpans(segWithAnchor, withoutAnchor);
    const mWith2 = maskCodeSpans(segWithAnchor, withAnchor);
    expect(cacheKey(mWith1.text, "fr", MODEL, mWith1.termsHash)).not.toBe(
      cacheKey(mWith2.text, "fr", MODEL, mWith2.termsHash),
    );

    const mPlain1 = maskCodeSpans(segWithoutAnchor, withoutAnchor);
    const mPlain2 = maskCodeSpans(segWithoutAnchor, withAnchor);
    expect(cacheKey(mPlain1.text, "fr", MODEL, mPlain1.termsHash)).toBe(
      cacheKey(mPlain2.text, "fr", MODEL, mPlain2.termsHash),
    );
  });
});

describe("translateMarkdown — link-target protection (F8.3)", () => {
  beforeEach(() => {
    mock.mode = "links-hi";
    vi.mocked(translateBatch).mockClear();
  });

  it("protects armature's ../facet and aspire-si's [MIT](LICENSE) from a model that translates link targets", async () => {
    const md = "Built on [facet](../facet) and released under [MIT](LICENSE).";
    const result = await translateMarkdown(md, "en", "hi", { cache: false, onLostSpan: "fail" });

    expect(sentToModel().join("\n")).not.toMatch(/\.\.\/facet|\bLICENSE\b/);
    expect(result.markdown).toContain("(../facet)");
    expect(result.markdown).toContain("[एमआईटी](LICENSE)");
    expect(result.markdown).not.toContain("../फेसट");
    expect(result.markdown).not.toContain("(लाइसेंस)");
    expect(result.lostSpans).toEqual([]);
  });

  it("protects mailto:, <path with spaces>, and balanced-paren paths end to end", async () => {
    const md =
      "Contact [support](mailto:support@example.com), read [the doc](<path with spaces/file.md>), or check [spec](docs/Foo_(bar).md).";
    const result = await translateMarkdown(md, "en", "hi", { cache: false, onLostSpan: "fail" });

    expect(result.markdown).toContain("(mailto:support@example.com)");
    expect(result.markdown).toContain("(<path with spaces/file.md>)");
    expect(result.markdown).toContain("(docs/Foo_(bar).md)");
    expect(result.lostSpans).toEqual([]);
  });

  it("disable: ['link-target'] allows a localized relative target to pass --on-lost-span=fail", async () => {
    const terms = buildProtectedTerms({ disable: ["link-target"] });
    const pins = createPins();
    setPin(
      pins,
      "Read the [Guide](./docs/guide.md) and visit [Ollama](https://ollama.com).",
      "fr",
      "Lisez le [Guide](./docs/guide.fr.md) et visitez [Ollama](https://ollama.com).",
    );

    const result = await translateMarkdown(
      "Read the [Guide](./docs/guide.md) and visit [Ollama](https://ollama.com).",
      "en",
      "fr",
      { cache: false, terms, pins, onLostSpan: "fail" },
    );
    expect(result.markdown).toContain("](./docs/guide.fr.md)");
    expect(result.lostSpans).toEqual([]);
  });

  it("changes the cache key only for segments with a relative link-target", () => {
    const withoutLinkTarget = buildProtectedTerms({ disable: ["link-target"] });
    const withLinkTarget = DEFAULT_PROTECTED_TERMS;
    const segWithRel = "See [Guide](./docs/guide.md) and [MIT](LICENSE).";
    const segWithUrlOnly = "Visit [Ollama](https://ollama.com) for details.";
    const segPlain = "Runs locally on your GPU.";

    const mRel1 = maskCodeSpans(segWithRel, withoutLinkTarget);
    const mRel2 = maskCodeSpans(segWithRel, withLinkTarget);
    expect(cacheKey(mRel1.text, "hi", MODEL, mRel1.termsHash)).not.toBe(
      cacheKey(mRel2.text, "hi", MODEL, mRel2.termsHash),
    );

    const mUrl1 = maskCodeSpans(segWithUrlOnly, withoutLinkTarget);
    const mUrl2 = maskCodeSpans(segWithUrlOnly, withLinkTarget);
    expect(cacheKey(mUrl1.text, "hi", MODEL, mUrl1.termsHash)).toBe(
      cacheKey(mUrl2.text, "hi", MODEL, mUrl2.termsHash),
    );

    const mPlain1 = maskCodeSpans(segPlain, withoutLinkTarget);
    const mPlain2 = maskCodeSpans(segPlain, withLinkTarget);
    expect(cacheKey(mPlain1.text, "hi", MODEL, mPlain1.termsHash)).toBe(
      cacheKey(mPlain2.text, "hi", MODEL, mPlain2.termsHash),
    );
  });
});
