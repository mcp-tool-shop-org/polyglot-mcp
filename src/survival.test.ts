/**
 * The survival check — every protected span in the English is on the page in
 * the translation, character for character, and every table cell keeps its
 * numbers (as a multiset, not in order).
 *
 * Fixtures are extracts of the real slips (src/fixtures/issue-44):
 * - xrpl-lab README.hi.md at 7acc67c: XLS-nn IDs and DepositAuth /
 *   DepositPreauth respelled in Devanagari.
 * - ai-jam-sessions README.zh.md at 5f8d1e2^: "218 of 224" as 218 首中的 224 首.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSurvival } from "./translateMarkdown.js";
import {
  LostSpanError,
  cellNumbersMatch,
  checkSegment,
  countCodeStructure,
  enforceLostSpanPolicy,
  formatLostSpans,
  normalizeDigits,
  parseLostSpanPolicy,
} from "./survival.js";
import { buildProtectedTerms } from "./protectedTerms.js";
import { PolyglotError } from "./errors.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "issue-44");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf-8").replace(/\r\n/g, "\n");

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
