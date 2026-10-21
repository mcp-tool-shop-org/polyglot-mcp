/**
 * The survival check — every protected span in the English is on the page in
 * the translation, character for character, every table cell keeps its
 * numbers (as a multiset, not in order), and every source-valid in-page
 * anchor resolves in the translation.
 *
 * Fixtures are extracts of the real slips:
 * - src/fixtures/issue-44:
 *   - xrpl-lab README.hi.md at 7acc67c: XLS-nn IDs and DepositAuth /
 *     DepositPreauth respelled in Devanagari.
 *   - ai-jam-sessions README.zh.md at 5f8d1e2^: "218 of 224" as 218 首中的 224 首.
 * - src/fixtures/issue-46:
 *   - polyglot-mcp README.{es,fr,hi,ja,zh}.md at 9fbe43a: broken in-page anchors
 *     from both Cause 1 (English slug kept) and Cause 2 (slug translated by model).
 *   - github-slugs.json: ground-truth `id="user-content-…"` slugs rendered by GitHub.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHeadingSlugMap, checkSurvival, rewriteAnchors, segmentMarkdown } from "./translateMarkdown.js";
import {
  LostSpanError,
  cellNumbersMatch,
  checkAnchors,
  checkLinks,
  checkPlaceholders,
  checkSegment,
  countCodeStructure,
  enforceLostSpanPolicy,
  expectedSpans,
  extractDocumentAnchors,
  extractLinks,
  formatLostSpans,
  normalizeDigits,
  parseLostSpanPolicy,
  safeDecodeSlug,
  slugifyHeadings,
  stripHeadingMarkup,
} from "./survival.js";
import { buildProtectedTerms, findProtectedSpans } from "./protectedTerms.js";
import { PolyglotError } from "./errors.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "issue-44");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf-8").replace(/\r\n/g, "\n");

const FIXTURES_46 = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "issue-46");
const fixture46 = (name: string) => readFileSync(join(FIXTURES_46, name), "utf-8").replace(/\r\n/g, "\n");
const GITHUB_SLUGS = JSON.parse(fixture46("github-slugs.json")) as {
  ref: string;
  sourceRef: string;
  fixtures: Record<string, string[]>;
};

const FIXTURES_50 = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "issue-50");
const SLIPS_50 = JSON.parse(readFileSync(join(FIXTURES_50, "slips.json"), "utf-8")) as {
  sourceRef: string;
  slips: Array<{
    id: string;
    lang: string;
    pinKey: string;
    source: string;
    broken: string;
    sourceHeading?: string;
    targetHeading?: string;
  }>;
};
const PINS_99B69E6 = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".polyglot-pins.json"), "utf-8"),
) as {
  pins: Record<string, { lang: string; source: string; translation: string }>;
};

const KIMI_EN =
  "The piano arrangements were written for this project by Kimi-K3 and are dedicated to the public domain (CC0).";
const KIMI_HI_SLIP = "इस परियोजना के लिए पियानो की धुनें किमी-के3 द्वारा लिखी गई हैं और इन्हें सार्वजनिक डोमेन को समर्पित किया गया है (CC0)।";
const KIMI_HI_FIXED = KIMI_HI_SLIP.replace("किमी-के3", "Kimi-K3");

describe("survival check — protected spans", () => {
  it("lists Kimi-K3 when a mocked output respells it", () => {
    const lost = checkSurvival(`# Credits\n\n${KIMI_EN}\n`, `# श्रेय\n\n${KIMI_HI_SLIP}\n`, { lang: "hi" });
    expect(lost).toEqual([
      { lang: "hi", segment: expect.stringContaining("The piano arrangements"), span: "Kimi-K3", kind: "term" },
    ]);
  });

  it("passes the hand-fixed paragraph", () => {
    expect(checkSurvival(`# Credits\n\n${KIMI_EN}\n`, `# श्रेय\n\n${KIMI_HI_FIXED}\n`, { lang: "hi" })).toEqual([]);
  });

  it("fails under fail with language, segment and missing span, and only reports under report", () => {
    const lost = checkSurvival(KIMI_EN, KIMI_HI_SLIP, { lang: "hi" });

    expect(() => enforceLostSpanPolicy(lost, "report")).not.toThrow();

    let caught: unknown;
    try {
      enforceLostSpanPolicy(lost, "fail", { markdown: KIMI_HI_SLIP });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LostSpanError);
    expect(caught).toBeInstanceOf(PolyglotError);
    const err = caught as LostSpanError<{ markdown: string }>;
    expect(err.code).toBe("LOST_SPAN");
    expect(err.retryable).toBe(false);
    expect(err.lostSpans).toEqual(lost);
    expect(err.result).toEqual({ markdown: KIMI_HI_SLIP });
    expect(err.message).toContain(`[hi] "The piano arrangements were written for this project by Kimi…": missing term "Kimi-K3"`);
    expect(err.toMcpResult()).toMatchObject({ code: "LOST_SPAN", retryable: false });
  });

  it("finds every respelled identifier in xrpl-lab's Hindi README at 7acc67c", () => {
    const en = fixture("xrpl-lab.README.7acc67c.md");
    const hi = fixture("xrpl-lab.README.hi.7acc67c.md");
    const lost = checkSurvival(en, hi, { lang: "hi" });

    const missing = new Set(lost.map((l) => l.span));
    const xlsIds = new Set(en.match(/XLS-\d+/g));
    expect(xlsIds.size).toBeGreaterThanOrEqual(8);
    for (const id of [...xlsIds, "DepositAuth", "DepositPreauth"]) expect(missing, id).toContain(id);
    // Only identifiers were lost: every cell kept its numbers (85, 101, …).
    expect(lost.every((l) => l.kind === "term")).toBe(true);
  });

  it("counts repeats: one of two XLS-70s missing is still a loss", () => {
    const lost = checkSegment("XLS-70 builds on XLS-70.", "XLS-70 एक्सएलएस-70 पर बनता है।", "hi");
    expect(lost.map((l) => l.span)).toEqual(["XLS-70"]);
  });

  it("expects an N of M count as N/M: the reversed zh slip fails, the hand fix passes", () => {
    const en = fixture("ai-jam-sessions.README.5f8d1e2-parent.md");
    const zh = fixture("ai-jam-sessions.README.zh.5f8d1e2-parent.md");
    expect(zh).toContain("218 首中的 224 首");

    const lost = checkSurvival(en, zh, { lang: "zh" });
    expect(lost).toEqual([{ lang: "zh", segment: "218 of 224", span: "218/224", kind: "count" }]);

    const fixed = zh.replace("| 218 首中的 224 首 |", "| 218/224 |");
    expect(checkSurvival(en, fixed, { lang: "zh" })).toEqual([]);
  });

  it("checks inline code spans too", () => {
    const lost = checkSurvival("Run `npm install` first.", "पहले `एनपीएम इंस्टॉल` चलाएँ।", { lang: "hi" });
    expect(lost.map((l) => [l.kind, l.span])).toEqual([
      ["code", "`npm install`"],
    ]);
  });

  it("falls back to the whole file when the structure no longer lines up", () => {
    const en = `# Title\n\nBuilt by Kimi-K3.\n\nUses XLS-30.\n`;
    // Two paragraphs merged into one: positions no longer pair up.
    expect(checkSurvival(en, `# शीर्षक\n\nKimi-K3 द्वारा निर्मित। XLS-30 का उपयोग करता है।\n`, { lang: "hi" })).toEqual([]);
    expect(checkSurvival(en, `# शीर्षक\n\nकिमी-के3 द्वारा निर्मित। XLS-30 का उपयोग।\n`, { lang: "hi" })).toEqual([
      { lang: "hi", segment: "(whole file)", span: "Kimi-K3", kind: "term" },
    ]);
  });
});

describe("survival check — table-cell numbers", () => {
  const NO_COUNTS = buildProtectedTerms({ nOfM: false });
  const table = (cell: string) => `| | Battle Hymn |\n|---|---|\n| notes within 50 cents | ${cell} |\n`;

  it("passes a correct total-first zh cell", () => {
    expect(cellNumbersMatch("218 of 224", "224 首中的 218 首")).toBe(true);
    expect(checkSurvival(table("218 of 224"), table("224 首中的 218 首"), { lang: "zh", terms: NO_COUNTS })).toEqual([]);
  });

  it("fails a cell whose numbers change", () => {
    expect(cellNumbersMatch("285 of 414", "283/414")).toBe(false);
    const lost = checkSurvival(table("285 of 414"), table("414个中的第283个"), { lang: "zh", terms: NO_COUNTS });
    expect(lost).toEqual([
      { lang: "zh", segment: "285 of 414", span: "285 414", kind: "number", found: "283 414" },
    ]);
  });

  it("fails a cell that drops or adds a number", () => {
    expect(cellNumbersMatch("40 ms of the score", "乐谱内")).toBe(false);
    expect(cellNumbersMatch("40 ms of the score", "40 毫秒 2")).toBe(false);
  });

  it("normalises digits from other scripts and ignores separators", () => {
    expect(normalizeDigits("२१८/२२४ ٣ ３")).toBe("218/224 3 3");
    expect(cellNumbersMatch("218 of 224", "२२४ में से २१८")).toBe(true);
    expect(cellNumbersMatch("1,000 of 2,000", "2 000 dont 1 000")).toBe(true);
    expect(cellNumbersMatch("0.25 s", "0,25 s")).toBe(true);
  });
});

describe("survival check — fenced blocks and inline code counts", () => {
  it("counts fences and the inline spans outside them", () => {
    expect(countCodeStructure("Use `a` and `b`.\n\n```sh\necho `x`\n```\n")).toEqual({ fences: 1, inlineSpans: 2 });
  });

  it("reports a file that lost a fenced block or inline spans, not one that gained them", () => {
    const en = "Run `a`.\n\n```sh\nnpm test\n```\n";
    const lost = checkSurvival(en, "चलाएँ a।\n\nnpm test\n", { lang: "hi" });
    expect(lost.map((l) => l.kind)).toEqual(expect.arrayContaining(["fence-count", "code-span-count"]));
    expect(checkSurvival("Run a.", "चलाएँ `a`।", { lang: "hi" })).toEqual([]);
  });
});

describe("survival check — policy flag", () => {
  it("parses --on-lost-span values and rejects others", () => {
    expect(parseLostSpanPolicy(undefined, "fail")).toBe("fail");
    expect(parseLostSpanPolicy(undefined, "report")).toBe("report");
    expect(parseLostSpanPolicy("report", "fail")).toBe("report");
    expect(() => parseLostSpanPolicy("ignore", "fail")).toThrow(/--on-lost-span/);
  });

  it("formats one line per lost span", () => {
    expect(
      formatLostSpans([{ lang: "zh", segment: "285 of 414", span: "285 414", kind: "number", found: "283 414" }]),
    ).toEqual([`[zh] "285 of 414": missing number "285 414" (found 283 414)`]);
  });
});

describe("survival check — GitHub-rendered heading slugs", () => {
  for (const [file, expectedSlugs] of Object.entries(GITHUB_SLUGS.fixtures)) {
    it(`matches GitHub's rendered user-content- ids for ${file} (${expectedSlugs.length} headings)`, () => {
      const md = fixture46(file);
      const { headings } = extractDocumentAnchors(md);
      expect(headings).toEqual(expectedSlugs);
    });
  }

  it("strips inline markup in the F6 order: inline code masked first, then links/images/HTML/emphasis, then closing # and trim", () => {
    expect(stripHeadingMarkup("## Type `<T>` and `__init__`")).toBe("Type <T> and __init__");
    expect(stripHeadingMarkup("## Built by [MCP Tool Shop](https://mcp-tool-shop.github.io/)")).toBe(
      "Built by MCP Tool Shop",
    );
    expect(stripHeadingMarkup("## ![Logo](logo.png) Guide")).toBe("Logo Guide");
    expect(stripHeadingMarkup("## <span>HTML</span> *italic* **bold** _under_ __strong__ foo_bar")).toBe(
      "HTML italic bold under strong foo_bar",
    );
    expect(stripHeadingMarkup("## Closing Hash ##")).toBe("Closing Hash");
    expect(stripHeadingMarkup("## C#")).toBe("C#");
    expect(slugifyHeadings(["## Options", "### Options", "## C#"])).toEqual(["options", "options-1", "c"]);
  });
});

describe("survival check — in-page anchors", () => {
  const EN_9FBE43A = fixture46("polyglot-mcp.README.9fbe43a.md");

  it("exempts anchor and link-target spans from expectedSpans, checkSegment, and whole-file fallback (§1, F8.3)", () => {
    const line = "See [Ollama Cloud](#ollama-cloud-optional) and [MIT](LICENSE).";
    expect([...expectedSpans(line).keys()]).toEqual([]);
    expect(checkSegment(line, "Voir [Ollama Cloud](#ollama-cloud-facultatif) et [MIT](LICENSE).", "fr")).toEqual([]);
  });

  it("detects the broken anchors in polyglot-mcp's 1.9.0 translations at 9fbe43a (Cause 1 and Cause 2)", () => {
    // es, hi, ja, zh: all 4 anchors kept the English slug while headings were translated (Cause 1).
    for (const [lang, expectedFound] of [
      [
        "es",
        [
          "#ollama-cloud-opcional",
          "#modelo-predeterminado-configurable",
          "#términos-protegidos-polyglot-termsjson",
          "#comprobación-de-supervivencia---on-lost-span",
        ],
      ],
      [
        "hi",
        [
          "#ओलामा-क्लाउड-वैकल्पिक",
          "#कॉन्फ़िगर-करने-योग्य-डिफ़ॉल्ट-मॉडल",
          "#सुरक्षित-शब्द-polyglot-termsjson",
          "#उत्तरजीविता-जाँच---on-lost-span",
        ],
      ],
      [
        "ja",
        [
          "#ollama-cloudオプション",
          "#構成可能なデフォルトモデル",
          "#保護された用語polyglot-termsjson",
          "#生存チェック--on-lost-span",
        ],
      ],
      [
        "zh",
        [
          "#ollama-cloud可选",
          "#可配置的默认模型",
          "#受保护的术语polyglot-termsjson",
          "#生存检查--on-lost-span",
        ],
      ],
    ] as const) {
      const tr = fixture46(`polyglot-mcp.README.${lang}.9fbe43a.md`);
      const lost = checkAnchors(EN_9FBE43A, tr, lang);
      expect(lost.map((l) => l.span)).toEqual([
        "#ollama-cloud-optional",
        "#configurable-default-model",
        "#protected-terms-polyglot-termsjson",
        "#survival-check---on-lost-span",
      ]);
      expect(lost.map((l) => l.found)).toEqual(expectedFound);
      expect(lost.every((l) => l.kind === "anchor")).toBe(true);
    }

    // fr: 3 of 4 broken — 1 Cause 1 (#ollama-cloud-optional) + 2 Cause 2 (corrupted foreign slugs).
    const fr = fixture46("polyglot-mcp.README.fr.9fbe43a.md");
    const frLost = checkAnchors(EN_9FBE43A, fr, "fr");
    expect(frLost).toEqual([
      {
        lang: "fr",
        segment: "Translates text between 57 languages using [TranslateGemma](…",
        span: "#ollama-cloud-optional",
        kind: "anchor",
        found: "#ollama-cloud-facultatif",
      },
      {
        lang: "fr",
        segment: "Translate an entire markdown document while preserving struc…",
        span: "#termes-protégés-polyglot-terms.json",
        kind: "anchor",
        found: "#termes-protégés-polyglot-termsjson",
      },
      {
        lang: "fr",
        segment: "| `onLostSpan` | no | `report` (default) lists protected spa…",
        span: "#vérification-de-survie---en-cas-de-portion-manquante",
        kind: "anchor",
        found: "#vérification-de-la-survie---on-lost-span",
      },
    ]);
  });

  it("passes a correctly rewritten file under fail, with no LOST_SPAN for any rewritten anchor", () => {
    const enSegs = segmentMarkdown(EN_9FBE43A);
    const frSegs = segmentMarkdown(fixture46("polyglot-mcp.README.fr.9fbe43a.md"));
    const translationMap = new Map<number, string>();
    enSegs.forEach((seg, i) => {
      if (seg.type === "heading") translationMap.set(i, frSegs[i].text);
    });
    const slugMap = buildHeadingSlugMap(enSegs, translationMap);
    // Start from the French file with English slugs restored (as §1 masking produces), then run §2 rewrite.
    const frRestored = fixture46("polyglot-mcp.README.fr.9fbe43a.md")
      .replace("#termes-protégés-polyglot-terms.json", "#protected-terms-polyglot-termsjson")
      .replace("#vérification-de-survie---en-cas-de-portion-manquante", "#survival-check---on-lost-span")
      .replace("⟦1⟧", "Ollama");
    const rewritten = rewriteAnchors(frRestored, slugMap);

    const warnings: string[] = [];
    const lost = checkSurvival(EN_9FBE43A, rewritten, { lang: "fr", warnings });
    expect(lost).toEqual([]);
    expect(warnings).toEqual([]);
    expect(() => enforceLostSpanPolicy(lost, "fail")).not.toThrow();
  });

  it("fails a translated file with a broken anchor under fail and lists the span under report", () => {
    const en = "## Usage\n\nSee [Usage](#usage).\n";
    const frBroken = "## Utilisation\n\nVoir [Utilisation](#usage).\n";
    const lost = checkSurvival(en, frBroken, { lang: "fr" });

    expect(lost).toEqual([
      { lang: "fr", segment: "See [Usage](#usage).", span: "#usage", kind: "anchor", found: "#utilisation" },
    ]);
    expect(() => enforceLostSpanPolicy(lost, "report")).not.toThrow();
    expect(() => enforceLostSpanPolicy(lost, "fail")).toThrow(LostSpanError);
  });

  it("reports a link to a setext heading as a warning and does not fail under fail (F5)", () => {
    const en = "Setext Title\n============\n\nSee [the title](#setext-title).\n";
    const fr = "Titre Setext\n============\n\nVoir [le titre](#setext-title).\n";
    const warnings: string[] = [];
    const lost = checkSurvival(en, fr, { lang: "fr", warnings });

    expect(lost).toEqual([]);
    expect(() => enforceLostSpanPolicy(lost, "fail")).not.toThrow();
    expect(warnings).toEqual([
      expect.stringContaining("anchor #setext-title is unresolved in source"),
    ]);
  });

  it("reports an anchor broken in the English source once as a warning and never fails (F5)", () => {
    const en = "## Usage\n\nSee [missing](#no-such-heading) and [again](#no-such-heading).\n";
    const fr = "## Utilisation\n\nVoir [manquant](#no-such-heading) et [encore](#no-such-heading).\n";
    const warnings: string[] = [];
    const lost = checkSurvival(en, fr, { lang: "fr", warnings });

    expect(lost).toEqual([]);
    expect(() => enforceLostSpanPolicy(lost, "fail")).not.toThrow();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("anchor #no-such-heading is unresolved in source");
  });

  it("resolves percent-encoded links and safely handles malformed % sequences without URIError (F4)", () => {
    expect(safeDecodeSlug("100%-coverage")).toBe("100%-coverage");
    expect(safeDecodeSlug("%E3")).toBe("%E3");
    expect(safeDecodeSlug("%E7%94%9F%E5%AD%98")).toBe("生存");

    const en = "## 生存\n\nSee [section](#%E7%94%9F%E5%AD%98) and [bad](#100%-coverage).\n";
    const ja = "## 生存チェック\n\n[セクション](#%E7%94%9F%E5%AD%98%E3%83%81%E3%82%A7%E3%83%83%E3%82%AF) と [bad](#100%-coverage) を参照。\n";
    const warnings: string[] = [];
    const lost = checkSurvival(en, ja, { lang: "ja", warnings });
    expect(lost).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining("anchor #100%-coverage is unresolved in source")]);
  });

  it("passes an explicit <a id> or name= anchor", () => {
    const en = '<p><a id="custom-top"></a><a name="legacy-top"></a></p>\n\n## Intro\n\nBack to [top](#custom-top) or [legacy](#legacy-top).\n';
    const es = '<p><a id="custom-top"></a><a name="legacy-top"></a></p>\n\n## Introducción\n\nVolver [arriba](#custom-top) o [legacy](#legacy-top).\n';
    const warnings: string[] = [];
    expect(checkSurvival(en, es, { lang: "es", warnings })).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("skips fenced code blocks and inline code when extracting headings, explicit ids, and anchors (F3)", () => {
    const en = [
      "```sh",
      "# comment inside fenced block — not a heading",
      "# another [fake](#fake-fence-anchor)",
      "```",
      "",
      "## Usage",
      "",
      "Inline example `[Usage](#usage)` and `<a id=\"fake\">` stay untouched; real link [Usage](#usage).",
      "",
    ].join("\n");
    const fr = [
      "```sh",
      "# comment inside fenced block — not a heading",
      "# another [fake](#fake-fence-anchor)",
      "```",
      "",
      "## Utilisation",
      "",
      "Exemple en ligne `[Usage](#usage)` et `<a id=\"fake\">` intacts ; vrai lien [Utilisation](#utilisation).",
      "",
    ].join("\n");

    const warnings: string[] = [];
    expect(checkSurvival(en, fr, { lang: "fr", warnings })).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("falls back to a plain resolve check and warns when anchor counts differ (F2 step 4)", () => {
    const en = "## Usage\n\nSee [Usage](#usage).\n";
    const frExtra = "## Utilisation\n\nVoir [Utilisation](#utilisation) et [Extra](#missing-target).\n";
    const warnings: string[] = [];
    const lost = checkAnchors(en, frExtra, "fr", { warnings });

    expect(warnings).toEqual([expect.stringContaining("anchor count mismatch (source has 1, translation has 2)")]);
    expect(lost).toEqual([
      {
        lang: "fr",
        segment: "Voir [Utilisation](#utilisation) et [Extra](#missing-target)…",
        span: "#missing-target",
        kind: "anchor",
      },
    ]);
  });
});

describe("survival check — broken links and placeholder leakage (#50)", () => {
  it("each 1.10.0 slip fixture fails under fail with kind link and is listed under report", () => {
    expect(SLIPS_50.slips).toHaveLength(6);
    for (const slip of SLIPS_50.slips) {
      const srcDoc = slip.sourceHeading ? `${slip.source}\n\n${slip.sourceHeading}\n` : `${slip.source}\n`;
      const tgtDoc = slip.targetHeading ? `${slip.broken}\n\n${slip.targetHeading}\n` : `${slip.broken}\n`;

      const lost = checkSurvival(srcDoc, tgtDoc, { lang: slip.lang });
      expect(lost.some((l) => l.kind === "link"), `${slip.id} should report a link LostSpan`).toBe(true);
      expect(() => enforceLostSpanPolicy(lost, "report")).not.toThrow();
      expect(() => enforceLostSpanPolicy(lost, "fail")).toThrow(LostSpanError);
    }
  });

  it("the hand-fixed versions in .polyglot-pins.json at 99b69e6 pass", () => {
    for (const slip of SLIPS_50.slips) {
      const pin = PINS_50_LOOKUP(slip.pinKey);
      const srcDoc = slip.sourceHeading ? `${slip.source}\n\n${slip.sourceHeading}\n` : `${slip.source}\n`;
      const tgtDoc = slip.targetHeading ? `${pin.translation}\n\n${slip.targetHeading}\n` : `${pin.translation}\n`;

      const lost = checkSurvival(srcDoc, tgtDoc, { lang: slip.lang });
      expect(lost, `${slip.id} hand-fixed pin should pass`).toEqual([]);
      expect(() => enforceLostSpanPolicy(lost, "fail")).not.toThrow();
    }
  });

  it("passes a correct translation that reorders two links within a sentence (multiset, not sequence)", () => {
    const en = "Uses [TranslateGemma](https://ollama.com/library/translategemma) via [Ollama](https://ollama.com).";
    const ja = "[Ollama](https://ollama.com) 経由で [TranslateGemma](https://ollama.com/library/translategemma) を使用します。";
    expect(checkSegment(en, ja, "ja")).toEqual([]);
  });

  it("counts an image and a reference link", () => {
    const en = "![Logo](https://example.com/logo.png) and [Guide][guide-ref].\n\n[guide-ref]: https://example.com/guide";
    const frOk = "![Logo](https://example.com/logo.png) et [Guide][guide-ref].\n\n[guide-ref]: https://example.com/guide";
    const frMissingImg = "Logo(https://example.com/logo.png) et [Guide][guide-ref].\n\n[guide-ref]: https://example.com/guide";

    expect(checkSurvival(en, frOk, { lang: "fr" })).toEqual([]);
    const lost = checkSurvival(en, frMissingImg, { lang: "fr" });
    expect(lost).toEqual([
      {
        lang: "fr",
        segment: "![Logo](https://example.com/logo.png) and [Guide][guide-ref]…",
        span: "https://example.com/logo.png",
        kind: "link",
        found: "https://example.com/guide",
      },
    ]);
  });

  it("ignores a link inside inline code or a fenced code block", () => {
    const en = [
      "Write `[example](https://example.com)` in prose, or:",
      "",
      "```markdown",
      "[fenced](https://example.com/fenced)",
      "```",
    ].join("\n");
    const fr = [
      "Écrivez `[example](https://example.com)` en prose, ou :",
      "",
      "```markdown",
      "[fenced](https://example.com/fenced)",
      "```",
    ].join("\n");

    expect(extractLinks(en)).toEqual({ nonAnchorTargets: [], anchorCount: 0 });
    expect(checkSurvival(en, fr, { lang: "fr" })).toEqual([]);
  });

  it("fails when a translation renames a label in the reference link but not in its definition, and the reverse", () => {
    const en = [
      "Read the [Quick Start][quick-start] and [FAQ][] and [roadmap].",
      "",
      "[quick-start]: https://example.com/start",
      "[FAQ]: https://example.com/faq",
      "[roadmap]: https://example.com/roadmap",
    ].join("\n");

    const renamedInLink = [
      "Lisez le [Démarrage rapide][demarrage-rapide] et [FAQ][] et [roadmap].",
      "",
      "[quick-start]: https://example.com/start",
      "[FAQ]: https://example.com/faq",
      "[roadmap]: https://example.com/roadmap",
    ].join("\n");

    const renamedInDef = [
      "Lisez le [Démarrage rapide][quick-start] et [FAQ][] et [roadmap].",
      "",
      "[demarrage-rapide]: https://example.com/start",
      "[FAQ]: https://example.com/faq",
      "[roadmap]: https://example.com/roadmap",
    ].join("\n");

    const lostLink = checkSurvival(en, renamedInLink, { lang: "fr" });
    expect(lostLink).toEqual([
      {
        lang: "fr",
        segment: "Read the [Quick Start][quick-start] and [FAQ][] and [roadmap…",
        span: "https://example.com/start",
        kind: "link",
        found: "https://example.com/faq https://example.com/roadmap",
      },
    ]);

    const lostDef = checkSurvival(en, renamedInDef, { lang: "fr" });
    expect(lostDef).toEqual([
      {
        lang: "fr",
        segment: "Read the [Quick Start][quick-start] and [FAQ][] and [roadmap…",
        span: "https://example.com/start",
        kind: "link",
        found: "https://example.com/faq https://example.com/roadmap",
      },
    ]);
  });

  it("counts a badge [![alt](img)](url) as two targets", () => {
    const badge = "[![CI](https://example.com/badge.svg)](https://example.com/actions)";
    const extracted = extractLinks(badge);
    expect(extracted.nonAnchorTargets.sort()).toEqual([
      "https://example.com/actions",
      "https://example.com/badge.svg",
    ]);

    const brokenBadge = "[!CI(https://example.com/badge.svg)](https://example.com/actions)";
    expect(checkLinks(badge, brokenBadge, "fr")).toEqual([
      {
        lang: "fr",
        segment: "[![CI](https://example.com/badge.svg)](https://example.com/a…",
        span: "https://example.com/badge.svg",
        kind: "link",
        found: "https://example.com/actions",
      },
    ]);
  });

  it("treats a URL with balanced parentheses as one target", () => {
    const en = "See [Foo](https://en.wikipedia.org/wiki/Foo_(bar)) for details.";
    expect(extractLinks(en)).toEqual({
      nonAnchorTargets: ["https://en.wikipedia.org/wiki/Foo_(bar)"],
      anchorCount: 0,
    });
    const fr = "Voir [Foo](https://en.wikipedia.org/wiki/Foo_(bar)) pour plus de détails.";
    expect(checkSegment(en, fr, "fr")).toEqual([]);
  });

  it("finishes in well under a second on long unclosed runs of '[' and '(' (50,000 chars each)", () => {
    const hostile = "[".repeat(50_000) + "(".repeat(50_000) + "[a](".repeat(10_000) + "⟦".repeat(50_000);
    const start = performance.now();
    const links = extractLinks(hostile);
    const placeholders = checkPlaceholders("plain", hostile, "fr");
    const elapsedMs = performance.now() - start;

    expect(links).toEqual({ nonAnchorTargets: [], anchorCount: 0 });
    expect(placeholders).toHaveLength(50_000);
    expect(elapsedMs).toBeLessThan(500);
  });

  it("flags ⟦Ollama⟧(…) with kind placeholder and passes a source that documents ⟦n⟧ in prose", () => {
    const en = "Download from [ollama.com](https://ollama.com) and start it:";
    const fr = "Téléchargez-le à partir de ⟦ollama.com⟧(https://ollama.com) et démarrez-le :";
    const lost = checkSegment(en, fr, "fr");
    expect(lost).toContainEqual({
      lang: "fr",
      segment: en,
      span: "⟦ollama.com⟧",
      kind: "placeholder",
    });

    const docEn = "Protected terms go through letter-free ⟦n⟧ placeholders just like ⟦0⟧.";
    const docFr = "Les termes protégés passent par des espaces réservés ⟦n⟧ sans lettres comme ⟦0⟧.";
    expect(checkSegment(docEn, docFr, "fr")).toEqual([]);
  });

  it("anchor fallback: fails under fail on a count mismatch with a source-valid anchor", () => {
    const en = "## Usage\n\nSee [Usage](#usage).\n";
    const frDropped = "## Utilisation\n\nVoir Utilisation.\n";
    const warnings: string[] = [];
    const lost = checkAnchors(en, frDropped, "fr", { warnings });

    expect(warnings).toEqual([expect.stringContaining("anchor count mismatch (source has 1, translation has 0)")]);
    expect(lost).toEqual([
      {
        lang: "fr",
        segment: "(whole file)",
        span: "anchor count 1 → 0",
        kind: "anchor",
        found: "0",
      },
    ]);
    expect(() => enforceLostSpanPolicy(lost, "fail")).toThrow(LostSpanError);
  });

  it("anchor fallback: warns and passes when a count mismatch is caused only by a link broken in the source", () => {
    const en = "## Usage\n\nSee [Usage](#usage) and [Broken](#no-such-heading).\n";
    const fr = "## Utilisation\n\nVoir [Utilisation](#utilisation).\n";
    const warnings: string[] = [];
    const lost = checkAnchors(en, fr, "fr", { warnings });

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("anchor #no-such-heading is unresolved in source");
    expect(warnings[1]).toContain("anchor count mismatch (source has 2, translation has 1)");
    expect(lost).toEqual([]);
    expect(() => enforceLostSpanPolicy(lost, "fail")).not.toThrow();
  });

  it("anchor fallback: reports the ja fixture once, not twice (one slip, one report)", () => {
    const jaSlip = SLIPS_50.slips.find((s) => s.id === "ja-line-100")!;
    const srcDoc = `${jaSlip.source}\n\n${jaSlip.sourceHeading}\n`;
    const tgtDoc = `${jaSlip.broken}\n\n${jaSlip.targetHeading}\n`;
    const warnings: string[] = [];
    const lost = checkSurvival(srcDoc, tgtDoc, { lang: "ja", warnings });

    expect(lost).toEqual([
      {
        lang: "ja",
        segment: "`report` (default) lists protected spans missing from the tr…",
        span: "1 anchor links",
        kind: "link",
        found: "0",
      },
    ]);
    expect(warnings).toEqual([expect.stringContaining("anchor count mismatch (source has 1, translation has 0)")]);
  });

  it("applies the link and placeholder rules in the whole-file fallback when structure diverges", () => {
    const en = "# Title\n\nVisit [Ollama](https://ollama.com).\n\nSecond paragraph.\n";
    const frMergedBroken = "# Titre\n\nVisitez ⟦Ollama⟧(https://ollama.com). Deuxième paragraphe.\n";
    const lost = checkSurvival(en, frMergedBroken, { lang: "fr" });

    expect(lost).toEqual([
      {
        lang: "fr",
        segment: "(whole file)",
        span: "https://ollama.com",
        kind: "link",
        found: "(no links)",
      },
      {
        lang: "fr",
        segment: "(whole file)",
        span: "⟦Ollama⟧",
        kind: "placeholder",
      },
    ]);
  });

  it("extracts [WIP][Ollama](https://ollama.com) without dropping the inline link (F1)", () => {
    expect(extractLinks("[WIP][Ollama](https://ollama.com)").nonAnchorTargets).toEqual(["https://ollama.com"]);
  });

  it("extracts angle-bracketed destinations with spaces and unbalanced parens, brackets, escapes, and escaped quotes in titles (F2)", () => {
    expect(extractLinks("[doc](<path with spaces/file.md>)").nonAnchorTargets).toEqual(["path with spaces/file.md"]);
    expect(extractLinks("[doc](<https://example.com/a)b>)").nonAnchorTargets).toEqual(["https://example.com/a)b"]);
    expect(extractLinks("[doc](<https://example.com/a(b>)").nonAnchorTargets).toEqual(["https://example.com/a(b"]);
    expect(extractLinks("[api](https://example.com/api?filter[a]=1)").nonAnchorTargets).toEqual([
      "https://example.com/api?filter[a]=1",
    ]);
    expect(extractLinks("[doc](https://example.com/a\\)b)").nonAnchorTargets).toEqual(["https://example.com/a\\)b"]);
    expect(extractLinks('[doc](https://example.com "say \\"hi\\"")').nonAnchorTargets).toEqual([
      "https://example.com",
    ]);
    expect(
      extractLinks('[![CI](https://example.com/badge.svg "a ] b")](https://example.com/actions)')
        .nonAnchorTargets.sort(),
    ).toEqual(["https://example.com/actions", "https://example.com/badge.svg"]);
  });

  it("finishes '[a](b ('.repeat(32000) in under 100 ms (F2 linear-time deadFrom)", () => {
    const input = "[a](b (".repeat(32_000);
    const start = performance.now();
    const res = extractLinks(input);
    const elapsedMs = performance.now() - start;
    expect(res).toEqual({ nonAnchorTargets: [], anchorCount: 0 });
    expect(elapsedMs).toBeLessThan(100);
  });

  it("passes F4's reordered sentence with a source-broken link, and fails when #イントロ in it is broken (F4)", () => {
    const en = "## Intro\n\nSee [Intro](#intro) and [Broken](#no-such-heading).\n";
    const jaOk = "## イントロ\n\n[Broken](#no-such-heading) と [Intro](#イントロ) を参照してください。\n";
    const jaBroken = "## はじめに\n\n[Broken](#no-such-heading) と [Intro](#イントロ) を参照してください。\n";

    const warningsOk: string[] = [];
    expect(checkSurvival(en, jaOk, { lang: "ja", warnings: warningsOk })).toEqual([]);
    expect(warningsOk).toEqual([expect.stringContaining("anchor #no-such-heading is unresolved in source")]);

    const warningsBroken: string[] = [];
    const lost = checkSurvival(en, jaBroken, { lang: "ja", warnings: warningsBroken });
    expect(lost).toEqual([
      {
        lang: "ja",
        segment: "[Broken](#no-such-heading) と [Intro](#イントロ) を参照してください。",
        span: "#イントロ",
        kind: "anchor",
      },
    ]);
    expect(() => enforceLostSpanPolicy(lost, "fail")).toThrow(LostSpanError);
  });

  it("fails both of Argon's F5 count-mismatch cases (#a dropped + 2 broken added; #b and source-broken dropped + #a duplicated)", () => {
    // Case 1: #a dropped, #b kept, and two broken anchors added.
    const en1 = "## A\n\n## B\n\nSee [A](#a) and [B](#b).\n";
    const fr1 = "## A\n\n## B\n\nVoir [B](#b), [X](#broken-1) et [Y](#broken-2).\n";
    const lost1 = checkAnchors(en1, fr1, "fr");
    expect(lost1).toEqual([
      { lang: "fr", segment: "(whole file)", span: "anchor count 2 → 3", kind: "anchor", found: "3" },
      { lang: "fr", segment: "Voir [B](#b), [X](#broken-1) et [Y](#broken-2).", span: "#broken-1", kind: "anchor" },
      { lang: "fr", segment: "Voir [B](#b), [X](#broken-1) et [Y](#broken-2).", span: "#broken-2", kind: "anchor" },
    ]);
    expect(() => enforceLostSpanPolicy(checkSurvival(en1, fr1, { lang: "fr" }), "fail")).toThrow(LostSpanError);

    // Case 2: #b and a link broken in the source dropped, and #a duplicated.
    const en2 = '## A\n\n## B\n\nSee [A](#a) and [Broken](#no-such).\n\nJump to <a href="#b">B</a>.\n';
    const fr2 = "## A\n\n## B\n\nVoir [A](#a) et [A](#a).\n\nAller à B.\n";
    const lost2 = checkAnchors(en2, fr2, "fr");
    expect(lost2).toEqual([
      { lang: "fr", segment: "(whole file)", span: "anchor count 3 → 2", kind: "anchor", found: "2" },
    ]);
    const survivalLost2 = checkSurvival(en2, fr2, { lang: "fr" });
    expect(survivalLost2.length).toBeGreaterThan(0);
    expect(() => enforceLostSpanPolicy(survivalLost2, "fail")).toThrow(LostSpanError);
  });

  it("resolves [FAQ](#FAQ) beside ## FAQ without warning 'unresolved in source' (F6)", () => {
    const en = "## FAQ\n\nSee [FAQ](#FAQ).\n";
    const fr = "## FAQ\n\nVoir [FAQ](#FAQ).\n";
    const warnings: string[] = [];
    expect(checkSurvival(en, fr, { lang: "fr", warnings })).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("respects disable: ['link-target'] and disable: ['url'] in checkLinks (F8.3)", () => {
    const en = "Read [Guide](./docs/guide.md) and visit [Ollama](https://ollama.com).";
    const frLocalized = "Lisez [Guide](./docs/guide.fr.md) et visitez [Ollama](https://ollama.com).";
    const frUrlChanged = "Lisez [Guide](./docs/guide.md) et visitez [Ollama](https://ollama.org).";

    expect(
      checkLinks(en, frLocalized, "fr", { terms: buildProtectedTerms({ disable: ["link-target"] }) }),
    ).toEqual([]);
    expect(
      checkLinks(en, frUrlChanged, "fr", { terms: buildProtectedTerms({ disable: ["link-target"] }) }),
    ).toHaveLength(1);
    expect(
      checkLinks(en, frUrlChanged, "fr", { terms: buildProtectedTerms({ disable: ["url"] }) }),
    ).toEqual([]);
  });

  it("reports a link that drops or gains '#' ([Text](#slug) ↔ [Text](slug)) once, not 2–3 times (F9)", () => {
    const enAnchor = "## Slug\n\nSee [Text](#slug).\n";
    const frDroppedHash = "## Slug\n\nVoir [Text](slug).\n";
    expect(checkLinks("See [Text](#slug).", "Voir [Text](slug).", "fr")).toHaveLength(1);
    expect(checkSurvival(enAnchor, frDroppedHash, { lang: "fr" })).toHaveLength(1);

    const enRel = "## Slug\n\nSee [Text](slug).\n";
    const frGainedHash = "## Slug\n\nVoir [Text](#slug).\n";
    expect(checkLinks("See [Text](slug).", "Voir [Text](#slug).", "fr")).toHaveLength(1);
    expect(checkSurvival(enRel, frGainedHash, { lang: "fr" })).toHaveLength(1);
  });

  it("finishes F1's parenthesised-title and whitespace-run cases in under 100 ms each at N = 32,000 (round 3 F1)", () => {
    const N = 32_000;
    const cases: Array<() => unknown> = [
      () => findProtectedSpans("[a](b (".repeat(N)),
      () => findProtectedSpans("[a](#b (".repeat(N)),
      () => extractLinks("[a](b (".repeat(N) + ")"),
      () => {
        const s = "[a](" + " ".repeat(N) + "x";
        findProtectedSpans(s);
        return extractLinks(s);
      },
      () => {
        const s = "[a]:" + " ".repeat(N) + "x";
        findProtectedSpans(s);
        return extractLinks(s);
      },
    ];
    for (const run of cases) {
      const start = performance.now();
      run();
      const elapsedMs = performance.now() - start;
      expect(elapsedMs).toBeLessThan(100);
    }
  });

  it("checks multi-line links and '\\[text\\](…)' cases when extractLinks does not extract them, failing under fail (round 3 F2)", () => {
    const multiEn = "Read [the complete\nguide](docs/Kimi-K3.md).";
    const multiHiBad = "पढ़ें [पूरा\nगाइड](docs/किमी-के3.md)।";
    expect(extractLinks(multiEn).nonAnchorTargets).toEqual([]);
    const multiLost = checkSegment(multiEn, multiHiBad, "hi");
    expect(multiLost).toEqual([
      {
        lang: "hi",
        segment: "Read [the complete guide](docs/Kimi-K3.md).",
        span: "docs/Kimi-K3.md",
        kind: "link-target",
      },
    ]);
    expect(() => enforceLostSpanPolicy(multiLost, "fail")).toThrow(LostSpanError);

    // Whole-file fallback path when segment alignment diverges
    const fallbackLost = checkSurvival(`${multiEn}\n\nExtra paragraph.\n`, multiHiBad, { lang: "hi" });
    expect(fallbackLost).toContainEqual({
      lang: "hi",
      segment: "(whole file)",
      span: "docs/Kimi-K3.md",
      kind: "link-target",
    });

    for (const escapedEn of ["Read \\[text\\](docs/Kimi-K3.md).", "Read \\[text](docs/Kimi-K3.md)."]) {
      const escapedHiBad = escapedEn.replace("Kimi-K3", "किमी-के3");
      const lost = checkSegment(escapedEn, escapedHiBad, "hi");
      expect(lost.length).toBeGreaterThan(0);
      expect(() => enforceLostSpanPolicy(lost, "fail")).toThrow(LostSpanError);
    }
  });

  it("either extracts or checks as exact text '[ ]: docs/Kimi-K3.md' and '[ref]: <docs/Kimi-K3\\>guide.md>', never neither (round 3 F2)", () => {
    const blankLabelEn = "[ ]: docs/Kimi-K3.md";
    const blankLabelHiBad = "[ ]: docs/किमी-के3.md";
    expect(extractLinks(blankLabelEn).nonAnchorTargets).toEqual([]);
    expect(expectedSpans(blankLabelEn).get("Kimi-K3.md")).toEqual({ kind: "term", count: 1 });
    const blankLost = checkSegment(blankLabelEn, blankLabelHiBad, "hi");
    expect(blankLost).toEqual([
      { lang: "hi", segment: blankLabelEn, span: "Kimi-K3.md", kind: "term" },
    ]);
    expect(() => enforceLostSpanPolicy(blankLost, "fail")).toThrow(LostSpanError);

    const escapedAngleEn = "[ref]: <docs/Kimi-K3\\>guide.md>";
    const escapedAngleHiBad = "[ref]: <docs/किमी-के3\\>guide.md>";
    expect(extractLinks(escapedAngleEn).nonAnchorTargets).toEqual(["docs/Kimi-K3\\>guide.md"]);
    expect(expectedSpans(escapedAngleEn).size).toBe(0);
    const angleLost = checkSegment(escapedAngleEn, escapedAngleHiBad, "hi");
    expect(angleLost).toEqual([
      {
        lang: "hi",
        segment: escapedAngleEn,
        span: "docs/Kimi-K3\\>guide.md",
        kind: "link",
        found: "docs/किमी-के3\\>guide.md",
      },
    ]);
    expect(() => enforceLostSpanPolicy(angleLost, "fail")).toThrow(LostSpanError);
  });

  it("does not allow a backslash to escape whitespace in a bare destination: '[a](C:\\ \"title\")' (round 3 F3)", () => {
    expect(extractLinks('[a](C:\\ "title")').nonAnchorTargets).toEqual(["C:\\"]);
  });
});

function PINS_50_LOOKUP(key: string) {
  const entry = PINS_99B69E6.pins[key];
  if (!entry) throw new Error(`Missing pin ${key}`);
  return entry;
}
