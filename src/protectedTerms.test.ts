/**
 * Protected terms — the default patterns, the per-repo terms file, and "N of M".
 *
 * Issue #44: TranslateGemma respelled bare identifiers in Devanagari (xrpl-lab's
 * XLS-nn spec IDs and DepositAuth / DepositPreauth; ai-jam-sessions' Kimi-K3)
 * and garbled "N of M" counts in Chinese. These pin what each default masks,
 * what it must leave alone, and how `.polyglot-terms.json` adds and removes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PATTERNS,
  DEFAULT_PROTECTED_TERMS,
  TERMS_FILE,
  buildProtectedTerms,
  findProtectedSpans,
  hashRules,
  loadProtectedTerms,
} from "./protectedTerms.js";
import { maskCodeSpans, restoreCodeSpans } from "./codeSpans.js";
import { PolyglotError } from "./errors.js";

const spansIn = (text: string, set = DEFAULT_PROTECTED_TERMS) => findProtectedSpans(text, set).map((m) => m.source);

describe("protected terms — default patterns", () => {
  for (const d of DEFAULT_PATTERNS) {
    for (const example of d.examples) {
      it(`${d.name} masks ${example}`, () => {
        const matches = findProtectedSpans(`See ${example} in the docs.`);
        expect(matches.map((m) => m.source)).toEqual([example]);
        expect(matches[0].rule.startsWith(`default:${d.name}:`)).toBe(true);
      });
    }
  }

  it("masks every identifier the Hindi README respelled in xrpl-lab", () => {
    const row = "Deposit Gate (DepositAuth + DepositPreauth): Credential-Gated Treasury Deposits, per XLS-70 and XLS-80/81";
    expect(spansIn(row)).toEqual(["DepositAuth", "DepositPreauth", "XLS-70", "XLS-80"]);
  });

  it("masks Kimi-K3, gemma4:31b and Qwen2.5-32B as whole model IDs", () => {
    expect(spansIn("Arranged by Kimi-K3, checked with gemma4:31b and Qwen2.5-32B.")).toEqual([
      "Kimi-K3",
      "gemma4:31b",
      "Qwen2.5-32B",
    ]);
  });

  it("masks HOST_REJECTED and AMMCreate", () => {
    expect(spansIn("AMMCreate fails with HOST_REJECTED.")).toEqual(["AMMCreate", "HOST_REJECTED"]);
  });

  it("leaves ordinary capitalised English alone", () => {
    for (const prose of [
      "The Quick Brown Fox Jumps Over The Lazy Dog.",
      "Read the README and the API docs.",
      "All URLs, GPUs and IDs are listed by NASA in English.",
      "Install it with Node.js, e.g. on Windows or Linux.",
      "Our Top-10 picks for a Self-Hosted, Step-by-Step setup.",
      "I said OK to the FAQ in the U.S. and the UK.",
      "A T-shirt, an X-Ray and three PRs.",
    ]) {
      expect(spansIn(prose), prose).toEqual([]);
    }
  });

  it("does not take part of a longer token", () => {
    // FNV-1a is a model-id (1a), not FNV plus prose; XLS-85-compliant keeps XLS-85.
    expect(spansIn("hashed with FNV-1a, XLS-85-compliant")).toEqual(["FNV-1a", "XLS-85"]);
  });

  it("ends a URL at the closing parenthesis of a Markdown link", () => {
    const md = "See [the singer](https://github.com/Soul-AILab/SoulX-Singer).";
    expect(spansIn(md)).toEqual(["https://github.com/Soul-AILab/SoulX-Singer"]);
  });
});

describe("protected terms — N of M", () => {
  it("masks a count as one span and restores it as N/M", () => {
    const masked = maskCodeSpans("Timing landed 285 of 414; pitch 1,000 of 2,000.", DEFAULT_PROTECTED_TERMS);
    expect(masked.text).toBe("Timing landed ⟦0⟧; pitch ⟦1⟧.");
    expect(masked.spans).toEqual(["285/414", "1,000/2,000"]);
    expect(masked.kinds).toEqual(["count", "count"]);
    expect(restoreCodeSpans(masked.text, masked.spans).text).toBe("Timing landed 285/414; pitch 1,000/2,000.");
  });

  it("is on by default and switched off by nOfM: false", () => {
    expect(spansIn("218 of 224")).toEqual(["218 of 224"]);
    expect(spansIn("218 of 224", buildProtectedTerms({ nOfM: false }))).toEqual([]);
  });
});

describe("protected terms — masking with code spans", () => {
  it("numbers terms after the code spans and restores both", () => {
    const masked = maskCodeSpans("Run `xrpl-lab start` for XLS-30 and DepositAuth.", DEFAULT_PROTECTED_TERMS);
    expect(masked.text).toBe("Run ⟦0⟧ for ⟦1⟧ and ⟦2⟧.");
    expect(masked.kinds).toEqual(["code", "term", "term"]);
    expect(restoreCodeSpans("चलाएँ ⟦0⟧, ⟦1⟧ और ⟦2⟧।", masked.spans)).toEqual({
      text: "चलाएँ `xrpl-lab start`, XLS-30 और DepositAuth।",
      intact: true,
    });
  });

  it("never matches a term inside a code span", () => {
    const masked = maskCodeSpans("Use `XLS-30` here.", DEFAULT_PROTECTED_TERMS);
    expect(masked.spans).toEqual(["`XLS-30`"]);
    expect(masked.rules).toEqual([]);
    expect(masked.termsHash).toBe("");
  });

  it("without a term set masks code spans only, as before", () => {
    expect(maskCodeSpans("XLS-30 and `x`.").spans).toEqual(["`x`"]);
  });

  it("hashes the rules that fired, order-free, and nothing for none", () => {
    expect(hashRules([])).toBe("");
    expect(hashRules(["b", "a", "a"])).toBe(hashRules(["a", "b"]));
  });
});

describe("protected terms — .polyglot-terms.json", () => {
  let dir: string;
  const readme = () => join(dir, "README.md");
  const writeTerms = (content: unknown) =>
    writeFileSync(join(dir, TERMS_FILE), typeof content === "string" ? content : JSON.stringify(content));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-terms-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses the defaults when there is no terms file", () => {
    expect(loadProtectedTerms(readme())).toBe(DEFAULT_PROTECTED_TERMS);
  });

  it("adds exact terms and patterns to the defaults", () => {
    writeTerms({ terms: ["Gemma", "Soul AILab"], patterns: ["\\bTX-[a-z]+\\b"] });
    const set = loadProtectedTerms(readme());
    expect(spansIn("Gemma runs TX-alpha for Soul AILab; XLS-30 still holds.", set)).toEqual([
      "Gemma",
      "TX-alpha",
      "Soul AILab",
      "XLS-30",
    ]);
  });

  it("matches exact terms case-sensitively and as whole words", () => {
    writeTerms({ terms: ["Gemma"] });
    const set = loadProtectedTerms(readme());
    expect(spansIn("gemma and Gemmas are not Gemma.", set)).toEqual(["Gemma"]);
  });

  it("switches defaults off with disable, and counts off with nOfM: false", () => {
    writeTerms({ disable: ["camel-case", "model-id"], nOfM: false });
    const set = loadProtectedTerms(readme());
    expect(spansIn("DepositAuth by Kimi-K3, 218 of 224, XLS-30.", set)).toEqual(["XLS-30"]);
  });

  it("rejects a file it cannot use, with CONFIG_ERROR", () => {
    for (const bad of [
      "{ not json",
      "[]",
      { terms: "Gemma" },
      { patterns: ["("] },
      { disable: ["no-such-default"] },
      { nOfM: "yes" },
      { terms: [""] },
    ]) {
      writeTerms(bad);
      let caught: unknown;
      try {
        loadProtectedTerms(readme());
      } catch (err) {
        caught = err;
      }
      expect(caught, JSON.stringify(bad)).toBeInstanceOf(PolyglotError);
      expect((caught as PolyglotError).code).toBe("CONFIG_ERROR");
    }
  });
});
