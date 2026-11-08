/**
 * Tests for translateAll module (src/translateAll.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock translateMarkdown — we don't want actual Ollama calls
vi.mock("./translateMarkdown.js", () => ({
  translateMarkdown: vi.fn(),
}));

import {
  translateAll,
  buildNavBar,
  injectNavBar,
  extractTopNavBarBlock,
  checkSourceNavBar,
  parseMarkdownStructure,
  parseWriteReceipt,
  resolveNavBarLangCodes,
  verifyTranslatedMarkdown,
  verifyTranslatedFile,
  TRANSLATE_ALL_LANGUAGES,
  type TargetLanguage,
} from "./translateAll.js";
import { translateMarkdown } from "./translateMarkdown.js";
import { LostSpanError } from "./survival.js";

describe("TRANSLATE_ALL_LANGUAGES", () => {
  it("contains 7 languages", () => {
    expect(TRANSLATE_ALL_LANGUAGES).toHaveLength(7);
  });

  it("includes Japanese, Spanish, Portuguese", () => {
    const codes = TRANSLATE_ALL_LANGUAGES.map((l) => l.code);
    expect(codes).toContain("ja");
    expect(codes).toContain("es");
    expect(codes).toContain("pt");
  });

  it("Portuguese has file override 'pt-BR'", () => {
    const pt = TRANSLATE_ALL_LANGUAGES.find((l) => l.code === "pt");
    expect(pt?.file).toBe("pt-BR");
  });
});

describe("buildNavBar", () => {
  const langs: TargetLanguage[] = [
    { code: "ja", name: "Japanese", label: "日本語" },
    { code: "es", name: "Spanish", label: "Español" },
    { code: "fr", name: "French", label: "Français" },
  ];

  it("builds HTML with links for succeeded languages", () => {
    const nav = buildNavBar(langs, new Set(["ja", "es", "fr"]));
    expect(nav).toContain('<p align="center">');
    expect(nav).toContain("README.ja.md");
    expect(nav).toContain("日本語");
    expect(nav).toContain("Español");
  });

  it("excludes languages not in succeeded set", () => {
    const nav = buildNavBar(langs, new Set(["ja"]));
    expect(nav).toContain("日本語");
    expect(nav).not.toContain("Español");
  });

  it("replaces self-link with English link", () => {
    const nav = buildNavBar(langs, new Set(["ja", "es", "fr"]), "ja");
    expect(nav).toContain('href="README.md">English</a>');
    expect(nav).not.toContain('href="README.ja.md"');
  });
});

describe("injectNavBar", () => {
  it("prepends nav bar to markdown content", () => {
    const md = "# Hello\n\nWorld";
    const result = injectNavBar(md, '<p align="center">NAV</p>');
    expect(result).toMatch(/^<p align="center">NAV<\/p>/);
    expect(result).toContain("# Hello");
    expect(result).toContain("World");
  });

  it("replaces existing nav bar", () => {
    const md = '<p align="center">\n  <a href="README.ja.md">日本語</a>\n</p>\n\n# Hello';
    const result = injectNavBar(md, '<p align="center">NEW NAV</p>');
    expect(result).toContain("NEW NAV");
    expect(result).toContain("# Hello");
    // Should not have the old nav
    expect(result.match(/<p align="center">/g)?.length).toBe(1);
  });

  it("handles content without existing nav bar", () => {
    const md = "# Title\n\nContent";
    const result = injectNavBar(md, "NAV");
    expect(result.startsWith("NAV")).toBe(true);
    expect(result).toContain("# Title");
  });
});

describe("translateAll", () => {
  beforeEach(() => {
    vi.mocked(translateMarkdown).mockReset();
  });

  it("translates markdown into all requested languages", async () => {
    vi.mocked(translateMarkdown).mockResolvedValue({
      markdown: "# Translated",
      segments: 2,
      cached: 0,
      translated: 2,
      deduplicated: 0,
      fuzzyMatched: 0,
      ollamaCalls: 1,
      durationMs: 500,
      warnings: [],
    });

    const result = await translateAll("# Hello", {
      targetLangs: ["ja", "es"],
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].lang).toBe("ja");
    expect(result.results[1].lang).toBe("es");
    expect(result.results[0].status).toBe("ok");
    expect(result.results[0].markdown).toContain("# Translated");
  });

  it("handles translation failures gracefully", async () => {
    vi.mocked(translateMarkdown)
      .mockResolvedValueOnce({
        markdown: "# Japanese OK",
        segments: 1,
        cached: 0,
        translated: 1,
        deduplicated: 0,
        fuzzyMatched: 0,
        ollamaCalls: 1,
        durationMs: 300,
        warnings: [],
      })
      .mockRejectedValueOnce(new Error("Ollama connection refused"));

    const result = await translateAll("# Hello", {
      targetLangs: ["ja", "es"],
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);

    const ja = result.results.find((r) => r.lang === "ja")!;
    const es = result.results.find((r) => r.lang === "es")!;
    expect(ja.status).toBe("ok");
    expect(es.status).toBe("error");
    expect(es.error).toContain("Ollama connection refused");
  });

  it("maintains language order regardless of completion order", async () => {
    // Make first language slow, second fast
    vi.mocked(translateMarkdown)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  markdown: "# Slow",
                  segments: 1,
                  cached: 0,
                  translated: 1,
                  deduplicated: 0,
                  fuzzyMatched: 0,
                  ollamaCalls: 1,
                  durationMs: 200,
                  warnings: [],
                }),
              50,
            ),
          ),
      )
      .mockResolvedValueOnce({
        markdown: "# Fast",
        segments: 1,
        cached: 0,
        translated: 1,
        deduplicated: 0,
        fuzzyMatched: 0,
        ollamaCalls: 1,
        durationMs: 10,
        warnings: [],
      });

    const result = await translateAll("# Hello", {
      targetLangs: ["ja", "es"],
      concurrency: 2,
    });

    // Should still be in TRANSLATE_ALL_LANGUAGES order: ja, es
    expect(result.results[0].lang).toBe("ja");
    expect(result.results[1].lang).toBe("es");
  });

  it("calls onProgress after each language", async () => {
    vi.mocked(translateMarkdown).mockResolvedValue({
      markdown: "# Done",
      segments: 1,
      cached: 0,
      translated: 1,
      deduplicated: 0,
      fuzzyMatched: 0,
      ollamaCalls: 1,
      durationMs: 100,
      warnings: [],
    });

    const progress: Array<[number, number, string]> = [];
    await translateAll("# Hello", {
      targetLangs: ["ja", "es"],
      concurrency: 1,
      onProgress: (completed, total, lang) => {
        progress.push([completed, total, lang]);
      },
    });

    expect(progress).toHaveLength(2);
    expect(progress[0]).toEqual([1, 2, "Japanese"]);
    expect(progress[1]).toEqual([2, 2, "Spanish"]);
  });

  it("injects nav bars by default", async () => {
    vi.mocked(translateMarkdown).mockResolvedValue({
      markdown: "# Bonjour",
      segments: 1,
      cached: 0,
      translated: 1,
      deduplicated: 0,
      fuzzyMatched: 0,
      ollamaCalls: 1,
      durationMs: 100,
      warnings: [],
    });

    const result = await translateAll("# Hello", {
      targetLangs: ["ja", "es"],
    });

    // Should have nav bars injected
    for (const r of result.results) {
      if (r.status === "ok") {
        expect(r.markdown).toContain('<p align="center">');
        expect(r.markdown).toContain('href="README.md">English</a>');
      }
    }
  });

  it("skips nav bars when navBar=false", async () => {
    vi.mocked(translateMarkdown).mockResolvedValue({
      markdown: "# Bonjour",
      segments: 1,
      cached: 0,
      translated: 1,
      deduplicated: 0,
      fuzzyMatched: 0,
      ollamaCalls: 1,
      durationMs: 100,
      warnings: [],
    });

    const result = await translateAll("# Hello", {
      targetLangs: ["ja"],
      navBar: false,
    });

    expect(result.results[0].markdown).toBe("# Bonjour");
    expect(result.results[0].markdown).not.toContain('<p align="center">');
  });

  it("uses correct file suffix for Portuguese (pt-BR)", async () => {
    vi.mocked(translateMarkdown).mockResolvedValue({
      markdown: "# Olá",
      segments: 1,
      cached: 0,
      translated: 1,
      deduplicated: 0,
      fuzzyMatched: 0,
      ollamaCalls: 1,
      durationMs: 100,
      warnings: [],
    });

    const result = await translateAll("# Hello", {
      targetLangs: ["pt"],
    });

    expect(result.results[0].fileSuffix).toBe("pt-BR");
  });

  it("returns empty results for unrecognized target language codes", async () => {
    const result = await translateAll("# Hello", {
      targetLangs: ["klingon"],
    });
    // "klingon" doesn't match any TRANSLATE_ALL_LANGUAGES entry
    expect(result.results).toHaveLength(0);
    expect(result.succeeded).toBe(0);
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let current = 0;

    vi.mocked(translateMarkdown).mockImplementation(async () => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      await new Promise((r) => setTimeout(r, 20));
      current--;
      return {
        markdown: "# Done",
        segments: 1,
        cached: 0,
        translated: 1,
        deduplicated: 0,
        fuzzyMatched: 0,
        ollamaCalls: 1,
        durationMs: 20,
        warnings: [],
      };
    });

    await translateAll("# Hello", {
      targetLangs: ["ja", "es", "fr", "it"],
      concurrency: 2,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("passes the survival-check policy (report by default) and each language's lost spans", async () => {
    const lost = { lang: "ja", segment: "Built by Kimi-K3.", span: "Kimi-K3", kind: "term" as const };
    vi.mocked(translateMarkdown).mockReset();
    vi.mocked(translateMarkdown)
      .mockResolvedValueOnce({
        markdown: "# OK",
        segments: 1,
        cached: 0,
        translated: 1,
        deduplicated: 0,
        fuzzyMatched: 0,
        pinned: 0,
        ollamaCalls: 1,
        durationMs: 200,
        warnings: [],
        lostSpans: [lost],
      })
      .mockRejectedValueOnce(new LostSpanError([{ ...lost, lang: "es" }]));

    const result = await translateAll("# Test", { targetLangs: ["ja", "es"], navBar: false });

    expect(vi.mocked(translateMarkdown).mock.calls[0][3]).toMatchObject({ cache: false, onLostSpan: "report" });
    const ja = result.results.find((r) => r.lang === "ja")!;
    const es = result.results.find((r) => r.lang === "es")!;
    expect(ja).toMatchObject({ status: "ok", lostSpans: [lost] });
    expect(es.status).toBe("error");
    expect(es.error).toMatch(/protected span/);
    expect(es.lostSpans).toEqual([{ ...lost, lang: "es" }]);
  });
});

describe("extractTopNavBarBlock & checkSourceNavBar (polyglot-mcp#65)", () => {
  it("extracts the top language nav bar block when present", () => {
    const md = [
      "",
      '<p align="center">',
      '  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.pt-BR.md">Português (BR)</a>',
      "</p>",
      "",
      "# Title",
    ].join("\n");
    const block = extractTopNavBarBlock(md);
    expect(block).toContain('href="README.ja.md"');
    expect(block).toContain('href="README.pt-BR.md"');
  });

  it("returns null when no language nav bar block is at the top", () => {
    expect(extractTopNavBarBlock("# Title\n\nBody")).toBeNull();
    expect(extractTopNavBarBlock('<p align="center"><img src="logo.png"></p>\n\n# Title')).toBeNull();
  });

  it("passes when every written target language appears in the source README nav bar", () => {
    const md = [
      '<p align="center">',
      '  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>',
      "</p>",
      "",
      "# Title",
    ].join("\n");
    const res = checkSourceNavBar(md, ["ja", "zh", "es", "fr", "hi", "it", "pt"]);
    expect(res).toEqual({
      ok: true,
      written: ["ja", "zh", "es", "fr", "hi", "it", "pt"],
      presentInNavBar: ["ja", "zh", "es", "fr", "hi", "it", "pt"],
      missingFromNavBar: [],
    });
  });

  it("refuses NAV_BAR_INCOMPLETE with missing languages when a written file is dropped from the nav bar (#65)", () => {
    const mdMissingJaAndPt = [
      '<p align="center">',
      '  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a>',
      "</p>",
      "",
      "# Title",
    ].join("\n");
    const res = checkSourceNavBar(mdMissingJaAndPt, ["ja", "zh", "es", "fr", "hi", "it", "pt"]);
    expect(res.ok).toBe(false);
    expect(res.refusalCode).toBe("NAV_BAR_INCOMPLETE");
    expect(res.missingFromNavBar).toEqual(["ja", "pt"]);
    expect(res.why).toContain("ja, pt");
  });
});

describe("parseMarkdownStructure, verifyTranslatedMarkdown & verifyTranslatedFile (polyglot-mcp#65)", () => {
  const sourceMd = [
    "# Main Title",
    "",
    "Intro paragraph.",
    "",
    "## Usage",
    "",
    "```bash",
    "# comment inside fence is not a heading",
    "polyglot-mcp --help",
    "```",
    "",
    "### Notes",
    "",
    "~~~json",
    '{"ok": true}',
    "~~~",
  ].join("\n");

  it("counts ATX headings outside fenced code blocks and strips top nav bars", () => {
    const withNav = [
      '<p align="center">',
      '  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a>',
      "</p>",
      "",
      sourceMd,
    ].join("\n");
    const struct = parseMarkdownStructure(withNav);
    expect(struct.headingCount).toBe(3);
    expect(struct.codeBlockCount).toBe(2);
    expect(struct.unclosedFence).toBe(false);
  });

  it("detects unclosed fenced code blocks, empty files, heading mismatches, and code block byte mismatches", () => {
    const emptyRes = verifyTranslatedMarkdown(sourceMd, "   \n  ");
    expect(emptyRes.verified).toBe(false);
    expect(emptyRes.failedChecks).toContain("empty_file");

    const missingHeading = sourceMd.replace("### Notes\n\n", "");
    const hRes = verifyTranslatedMarkdown(sourceMd, missingHeading);
    expect(hRes.verified).toBe(false);
    expect(hRes.failedChecks.join("; ")).toMatch(/heading_count_mismatch \(expected 3, got 2\)/);

    const missingFence = sourceMd.replace(/~~~json[\s\S]*?~~~/, "");
    const fRes = verifyTranslatedMarkdown(sourceMd, missingFence);
    expect(fRes.verified).toBe(false);
    expect(fRes.failedChecks.join("; ")).toMatch(/code_block_count_mismatch \(expected 2, got 1\)/);

    const modifiedFence = sourceMd.replace('{"ok": true}', '{"ok": false}');
    const bRes = verifyTranslatedMarkdown(sourceMd, modifiedFence);
    expect(bRes.verified).toBe(false);
    expect(bRes.codeBlocksByteIdentical).toBe(false);
    expect(bRes.failedChecks.join("; ")).toMatch(/code_block_bytes_mismatch \(index 1\)/);

    const unclosedFence = sourceMd.replace(/~~~$/, "");
    const uRes = verifyTranslatedMarkdown(sourceMd, unclosedFence);
    expect(uRes.verified).toBe(false);
    expect(uRes.failedChecks).toContain("unclosed_code_block");
  });

  it("parses POLYGLOT_WRITTEN receipts and returns null when absent or malformed", () => {
    expect(parseWriteReceipt("Done!\nWritten to: README.ja.md\n")).toBeNull();
    expect(parseWriteReceipt("POLYGLOT_WRITTEN onlyonepart\n")).toBeNull();
    expect(parseWriteReceipt("POLYGLOT_WRITTEN   \n")).toBeNull();
    const sha = "a".repeat(64);
    expect(
      parseWriteReceipt(`Translating...\r\nPOLYGLOT_WRITTEN README.ja.md ${sha.toUpperCase()}\r\nWritten to: README.ja.md`),
    ).toEqual({
      path: "README.ja.md",
      sha256: sha,
    });
  });

  it("verifies files with matching receipts and rejects missing, unreceipted, or sha-mismatched files on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "polyglot-verify-"));
    try {
      const missing = verifyTranslatedFile(join(dir, "README.ja.md"), sourceMd, null);
      expect(missing.verified).toBe(false);
      expect(missing.exists).toBe(false);
      expect(missing.failedChecks).toEqual(["missing_file"]);
      expect(missing.failed_checks).toEqual(["missing_file"]);

      const filePath = join(dir, "README.ja.md");
      const content = sourceMd.replace("# Main Title", "# タイトル");
      writeFileSync(filePath, content, "utf-8");
      const validSha = createHash("sha256").update(Buffer.from(content, "utf-8")).digest("hex");

      const fresh = verifyTranslatedFile(filePath, sourceMd, { path: "README.ja.md", sha256: validSha });
      expect(fresh.verified).toBe(true);
      expect(fresh.writtenThisRun).toBe(true);
      expect(fresh.failedChecks).toEqual([]);
      expect(fresh.failed_checks).toEqual([]);

      const noReceipt = verifyTranslatedFile(filePath, sourceMd, null);
      expect(noReceipt.verified).toBe(false);
      expect(noReceipt.writtenThisRun).toBe(false);
      expect(noReceipt.failedChecks).toEqual(["no_write_receipt"]);
      expect(noReceipt.failed_checks).toEqual(["no_write_receipt"]);

      const mismatch = verifyTranslatedFile(filePath, sourceMd, "0".repeat(64));
      expect(mismatch.verified).toBe(false);
      expect(mismatch.writtenThisRun).toBe(false);
      expect(mismatch.failedChecks).toEqual(["receipt_sha_mismatch"]);
      expect(mismatch.failed_checks).toEqual(["receipt_sha_mismatch"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolveNavBarLangCodes keeps already-linked valid languages and excludes unlinked stale, broken, or sha-rejected files", () => {
    const dir = mkdtempSync(join(tmpdir(), "polyglot-resolve-nav-"));
    try {
      const sourceWithLinks = [
        '<p align="center">',
        '  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a>',
        "</p>",
        "",
        sourceMd,
      ].join("\n");

      // ja: already linked + valid on disk, not re-run -> kept
      writeFileSync(join(dir, "README.ja.md"), sourceMd.replace("# Main Title", "# 日本語"), "utf-8");
      // zh: already linked + truncated on disk (missing heading) -> excluded
      writeFileSync(join(dir, "README.zh.md"), sourceMd.replace("### Notes\n\n", ""), "utf-8");
      // es: already linked, missing on disk -> excluded
      // fr: already linked + valid on disk, but rejected for receipt_sha_mismatch -> excluded
      writeFileSync(join(dir, "README.fr.md"), sourceMd.replace("# Main Title", "# Français"), "utf-8");
      // hi: NOT linked in source nav bar, stale valid file on disk -> excluded
      writeFileSync(join(dir, "README.hi.md"), sourceMd.replace("# Main Title", "# हिन्दी"), "utf-8");

      const codes = resolveNavBarLangCodes(
        dir,
        sourceWithLinks,
        ["it", "pt"],
        TRANSLATE_ALL_LANGUAGES,
        ["fr"],
      );
      expect(Array.from(codes)).toEqual(["ja", "it", "pt"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
