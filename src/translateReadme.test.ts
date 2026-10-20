/**
 * Tests for translateReadme module (src/translateReadme.ts).
 *
 * translateAll is mocked (no real Ollama); fs/promises is mocked (no real disk).
 * buildNavBar / injectNavBar / TRANSLATE_ALL_LANGUAGES are kept real so the
 * source-nav-bar refresh is exercised for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./translateAll.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./translateAll.js")>();
  return { ...actual, translateAll: vi.fn() };
});

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import { translateReadme } from "./translateReadme.js";
import { translateAll } from "./translateAll.js";
import { readFile, writeFile } from "node:fs/promises";

const okLang = (
  lang: string,
  fileSuffix: string,
  markdown: string,
  name = lang
) => ({ lang, name, status: "ok" as const, fileSuffix, markdown, durationMs: 100 });

describe("translateReadme", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
    vi.mocked(writeFile).mockReset();
    vi.mocked(translateAll).mockReset();
    vi.mocked(readFile).mockResolvedValue("# Hello\n\nWorld" as never);
    vi.mocked(writeFile).mockResolvedValue(undefined as never);
  });

  it("writes a README.<suffix>.md for each successful language and summarizes", async () => {
    vi.mocked(translateAll).mockResolvedValue({
      results: [
        okLang("ja", "ja", "# こんにちは", "Japanese"),
        okLang("pt", "pt-BR", "# Olá", "Portuguese"),
      ],
      succeeded: 2,
      failed: 0,
      durationMs: 250,
    });

    const result = await translateReadme("/repo/README.md", {
      model: "translategemma:27b",
      navBar: false,
    });

    expect(result.succeeded).toBe(2);
    expect(result.model).toBe("translategemma:27b");
    expect(result.outputFiles).toEqual(["README.ja.md", "README.pt-BR.md"]);

    const written = vi.mocked(writeFile).mock.calls.map((c) => String(c[0]));
    expect(written.some((p) => p.endsWith("README.ja.md"))).toBe(true);
    expect(written.some((p) => p.endsWith("README.pt-BR.md"))).toBe(true);
  });

  it("does not write files for failed languages but still reports them", async () => {
    vi.mocked(translateAll).mockResolvedValue({
      results: [
        okLang("ja", "ja", "# こんにちは", "Japanese"),
        {
          lang: "zh",
          name: "Chinese (Simplified)",
          status: "error",
          fileSuffix: "zh",
          error: "Ollama down",
          durationMs: 50,
        },
      ],
      succeeded: 1,
      failed: 1,
      durationMs: 200,
    });

    const result = await translateReadme("/repo/README.md", { navBar: false });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.outputFiles).toEqual(["README.ja.md"]);

    const written = vi.mocked(writeFile).mock.calls.map((c) => String(c[0]));
    expect(written.some((p) => p.endsWith("README.zh.md"))).toBe(false);

    const zh = result.results.find((r) => r.lang === "zh");
    expect(zh?.status).toBe("error");
    expect(zh?.error).toContain("Ollama down");
  });

  it("refreshes the source README nav bar when navBar is enabled", async () => {
    vi.mocked(translateAll).mockResolvedValue({
      results: [okLang("ja", "ja", "# X", "Japanese")],
      succeeded: 1,
      failed: 0,
      durationMs: 100,
    });

    const result = await translateReadme("/repo/README.md", { navBar: true });

    expect(result.sourceNavBarUpdated).toBe(true);
    const sourceWrite = vi
      .mocked(writeFile)
      .mock.calls.find((c) => String(c[0]).endsWith("README.md"));
    expect(sourceWrite).toBeDefined();
    expect(String(sourceWrite![1])).toContain('<p align="center">');
    expect(String(sourceWrite![1])).toContain("README.ja.md");
  });

  it("returns a summary that never contains the translated body", async () => {
    vi.mocked(translateAll).mockResolvedValue({
      results: [okLang("ja", "ja", "# SECRET_TRANSLATED_BODY", "Japanese")],
      succeeded: 1,
      failed: 0,
      durationMs: 100,
    });

    const result = await translateReadme("/repo/README.md", { navBar: false });

    expect(JSON.stringify(result)).not.toContain("SECRET_TRANSLATED_BODY");
  });

  it("falls back to DEFAULT_MODEL in the summary when no model is given", async () => {
    vi.mocked(translateAll).mockResolvedValue({
      results: [okLang("ja", "ja", "# X", "Japanese")],
      succeeded: 1,
      failed: 0,
      durationMs: 100,
    });

    const result = await translateReadme("/repo/README.md", { navBar: false });
    expect(result.model).toMatch(/^translategemma:/);
  });

  it("passes the terms and pins beside the README, reports by default, and collects lost spans", async () => {
    const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "polyglot-readme-"));
    try {
      writeFileSync(join(dir, ".polyglot-terms.json"), JSON.stringify({ terms: ["Gemma"] }));
      writeFileSync(
        join(dir, ".polyglot-pins.json"),
        JSON.stringify({ version: 1, pins: { "abc:hi": { lang: "hi", source: "x", translation: "y", pinnedAt: "" } } }),
      );
      const lost = { lang: "hi", segment: "Built by Kimi-K3.", span: "Kimi-K3", kind: "term" as const };
      vi.mocked(translateAll).mockResolvedValue({
        results: [{ ...okLang("hi", "hi", "# X", "Hindi"), lostSpans: [lost] }],
        succeeded: 1,
        failed: 0,
        durationMs: 100,
      });

      const result = await translateReadme(join(dir, "README.md"), { navBar: false });

      const opts = vi.mocked(translateAll).mock.calls[0][1]!;
      expect(opts.onLostSpan).toBe("report");
      expect(opts.pins?.pins["abc:hi"].translation).toBe("y");
      expect(opts.terms?.rules.some((r) => r.id === "term:Gemma")).toBe(true);
      expect(result.lostSpans).toEqual([lost]);
      expect(result.results[0].lostSpans).toEqual([lost]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
