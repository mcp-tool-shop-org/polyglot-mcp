/**
 * Tests for translateAll module (src/translateAll.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock translateMarkdown — we don't want actual Ollama calls
vi.mock("./translateMarkdown.js", () => ({
  translateMarkdown: vi.fn(),
}));

import {
  translateAll,
  buildNavBar,
  injectNavBar,
  TRANSLATE_ALL_LANGUAGES,
  type TargetLanguage,
} from "./translateAll.js";
import { translateMarkdown } from "./translateMarkdown.js";

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
        markdown: "# OK",
        segments: 1,
        cached: 0,
        translated: 1,
        deduplicated: 0,
        fuzzyMatched: 0,
        ollamaCalls: 1,
        durationMs: 200,
        warnings: [],
      })
      .mockRejectedValueOnce(new Error("Ollama down"));

    const result = await translateAll("# Test", {
      targetLangs: ["ja", "es"],
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    const failed = result.results.find((r) => r.status === "error");
    expect(failed).toBeDefined();
    expect(failed!.error).toContain("Ollama down");
  });

  it("reports progress for each completed language", async () => {
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

    const progress: Array<{ completed: number; total: number; lang: string }> = [];
    await translateAll("# Hi", {
      targetLangs: ["ja", "es"],
      onProgress: (completed, total, lang) => {
        progress.push({ completed, total, lang });
      },
    });

    expect(progress).toHaveLength(2);
    expect(progress[0].total).toBe(2);
    expect(progress[1].total).toBe(2);
    // Both languages should be reported
    const langs = progress.map((p) => p.lang);
    expect(langs).toContain("Japanese");
    expect(langs).toContain("Spanish");
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
});
