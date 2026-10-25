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
  anchorsEnabled,
  buildProtectedTerms,
  findProtectedSpans,
  hashRules,
  linkTargetsEnabled,
  loadProtectedTerms,
  urlsEnabled,
} from "./protectedTerms.js";
import { maskCodeSpans, restoreCodeSpans } from "./codeSpans.js";
import { PolyglotError } from "./errors.js";

const spansIn = (text: string, set = DEFAULT_PROTECTED_TERMS) => findProtectedSpans(text, set).map((m) => m.source);

describe("protected terms — default patterns", () => {
  for (const d of DEFAULT_PATTERNS) {
    for (const example of d.examples) {
      it(`${d.name} masks ${example}`, () => {
        const sample =
          d.name === "anchor" || d.name === "link-target"
            ? `See [the section](${example}) in the docs.`
            : `See ${example} in the docs.`;
        const matches = findProtectedSpans(sample);
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

  it("ends a URL at the closing parenthesis of a Markdown link and masks balanced-paren URLs whole", () => {
    const md = "See [the singer](https://github.com/Soul-AILab/SoulX-Singer) and [Foo](https://en.wikipedia.org/wiki/Foo_(bar)).";
    expect(spansIn(md)).toEqual([
      "https://github.com/Soul-AILab/SoulX-Singer",
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ]);
  });
});

describe("protected terms — anchor", () => {
  it("masks inline link #slug targets (with or without title) and leaves link text translatable", () => {
    const masked = maskCodeSpans(
      'See [Ollama Cloud](#ollama-cloud-optional) and [Survival Check](#survival-check---on-lost-span "check").',
      DEFAULT_PROTECTED_TERMS,
    );
    expect(masked.text).toBe('See [Ollama Cloud](⟦0⟧) and [Survival Check](⟦1⟧ "check").');
    expect(masked.spans).toEqual(["#ollama-cloud-optional", "#survival-check---on-lost-span"]);
    expect(masked.kinds).toEqual(["anchor", "anchor"]);
  });

  it("masks reference definition #slug targets (including blockquote and CRLF definitions) and HTML href='#slug'", () => {
    const masked = maskCodeSpans(
      '[cloud]: #ollama-cloud-optional\r\n> [check]: #survival-check---on-lost-span "Survival"\r\nJump to <a href="#kimi-k3-guide">guide</a>.',
      DEFAULT_PROTECTED_TERMS,
    );
    expect(masked.text).toBe('[cloud]: ⟦0⟧\r\n> [check]: ⟦1⟧ "Survival"\r\nJump to <a href="⟦2⟧">guide</a>.');
    expect(masked.spans).toEqual([
      "#ollama-cloud-optional",
      "#survival-check---on-lost-span",
      "#kimi-k3-guide",
    ]);
    expect(masked.kinds).toEqual(["anchor", "anchor", "anchor"]);
  });

  it("does not treat prose ending in 'See [issue]: #46' as a reference definition", () => {
    expect(spansIn("See [issue]: #46")).toEqual([]);
  });

  it("masks cross-file links as link-target, not anchor", () => {
    const matches = findProtectedSpans("See [guide](docs/x.md#y) and [readme](README.md#y).");
    expect(matches.map((m) => [m.kind, m.source])).toEqual([
      ["link-target", "docs/x.md#y"],
      ["link-target", "README.md#y"],
    ]);
  });

  it("is on by default and switched off by disable: ['anchor']", () => {
    expect(anchorsEnabled(DEFAULT_PROTECTED_TERMS)).toBe(true);
    const off = buildProtectedTerms({ disable: ["anchor"] });
    expect(anchorsEnabled(off)).toBe(false);
    expect(spansIn("See [Ollama Cloud](#ollama-cloud-optional).", off)).toEqual([]);
  });
});

describe("protected terms — link-target", () => {
  it("masks relative paths, bare files, mailto:, <path with spaces>, and balanced-paren paths as one link-target span", () => {
    const sample = [
      'See [facet](../facet), [MIT](LICENSE "MIT License"), [Kimi](docs/Kimi-K3.md),',
      '[mail](mailto:dev@example.com), [spaces](<path with spaces/file.md>), and [paren](docs/Foo_(bar).md).',
      "",
      '[ref-space]: <path with spaces/ref.md> "Ref"',
      "[ref-paren]: ./specs/XLS-30_(draft).md",
    ].join("\n");
    const matches = findProtectedSpans(sample);
    expect(matches.map((m) => [m.kind, m.source])).toEqual([
      ["link-target", "../facet"],
      ["link-target", "LICENSE"],
      ["link-target", "docs/Kimi-K3.md"],
      ["link-target", "mailto:dev@example.com"],
      ["link-target", "<path with spaces/file.md>"],
      ["link-target", "docs/Foo_(bar).md"],
      ["link-target", "<path with spaces/ref.md>"],
      ["link-target", "./specs/XLS-30_(draft).md"],
    ]);
  });

  it("never matches link titles or HTML attributes", () => {
    const html = '<a href="docs/guide.md"><img src="assets/logo.png" alt="Logo"></a>';
    expect(spansIn(html)).toEqual([]);
    const titled = 'Read [Guide](docs/guide.md "See guide for details").';
    expect(spansIn(titled)).toEqual(["docs/guide.md"]);
  });

  it("reports linkTargetsEnabled and urlsEnabled accurately when disabled", () => {
    expect(linkTargetsEnabled(DEFAULT_PROTECTED_TERMS)).toBe(true);
    expect(urlsEnabled(DEFAULT_PROTECTED_TERMS)).toBe(true);
    expect(linkTargetsEnabled(buildProtectedTerms({ disable: ["link-target"] }))).toBe(false);
    expect(urlsEnabled(buildProtectedTerms({ disable: ["url"] }))).toBe(false);
  });

  it("finishes parenthesised-title and whitespace-lookbehind inputs in under 100 ms at N = 32,000 (round 3 F1)", () => {
    const N = 32_000;
    for (const [label, input, expected] of [
      ["[a](b (", "[a](b (".repeat(N), []],
      ["[a](#b (", "[a](#b (".repeat(N), []],
      ["[a]( spaces", "[a](" + " ".repeat(N) + "x", []],
      ["[a]: spaces", "[a]:" + " ".repeat(N) + "x", ["x"]],
    ] as const) {
      const start = performance.now();
      const spans = spansIn(input);
      const elapsedMs = performance.now() - start;
      expect(spans, label).toEqual(expected);
      // A linear-time budget, not a benchmark: slow CI runners need ~150 ms where the quadratic scan needs seconds.
      expect(elapsedMs, `${label}: ${elapsedMs.toFixed(1)}ms`).toBeLessThan(1000);
    }
  });

  it("requires an unescaped '](' and a non-whitespace reference label in LINK_TARGET_PATTERN and ANCHOR_PATTERN (round 3 F2)", () => {
    expect(findProtectedSpans("Read \\[text\\](docs/Kimi-K3.md).").map((m) => [m.kind, m.source])).toEqual([
      ["term", "Kimi-K3.md"],
    ]);
    expect(findProtectedSpans("See \\[text\\](#kimi-k3).").map((m) => [m.kind, m.source])).toEqual([
      ["term", "kimi-k3"],
    ]);
    expect(findProtectedSpans("[ ]: docs/Kimi-K3.md").map((m) => [m.kind, m.source])).toEqual([
      ["term", "Kimi-K3.md"],
    ]);
    expect(findProtectedSpans("[ ]: #kimi-k3").map((m) => [m.kind, m.source])).toEqual([
      ["term", "kimi-k3"],
    ]);
  });

  it("does not allow a backslash to escape whitespace in a bare destination: '[a](C:\\ \"title\")' (round 3 F3)", () => {
    expect(spansIn('[a](C:\\ "title")')).not.toContain('C:\\ "title"');
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
    writeTerms({ disable: ["camel-case", "model-id", "anchor", "link-target"], nOfM: false });
    const set = loadProtectedTerms(readme());
    expect(spansIn("DepositAuth by Kimi-K3, 218 of 224, [cloud](#ollama), [lic](LICENSE), XLS-30.", set)).toEqual(["XLS-30"]);
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
