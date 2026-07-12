/**
 * Round-trip test — HTML comments must survive translation byte-for-byte.
 *
 * Generated markers like `<!-- BEGIN curriculum:auto readme-table -->` are
 * document structure, not prose. This drives the full translateMarkdown engine
 * with the Ollama batch layer mocked, and asserts that the comment markers come
 * out byte-identical and were never handed to the translator. Regression guard
 * for the xrpl-lab v2.4.0 corruption (27B translated/dropped INICIO/FIN markers).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Ollama-backed batch translator. Every prose item gets a deterministic,
// visibly-different "translation" (wrapped in 【 】) so the test can prove prose
// WAS translated while comment markers were left untouched — no live Ollama.
vi.mock("./translate.js", () => ({
  translateBatch: vi.fn(async (items: Array<{ text: string }>) => ({
    translations: items.map((it) => `【${it.text}】`),
    model: "mock",
    ollamaCalls: 1,
    durationMs: 0,
  })),
}));

import { translateMarkdown } from "./translateMarkdown.js";
import { translateBatch } from "./translate.js";

describe("translateMarkdown — HTML comment round-trip", () => {
  beforeEach(() => {
    vi.mocked(translateBatch).mockClear();
  });

  it("passes single-line and multi-line HTML comments through byte-identically", async () => {
    const md = [
      "# XRPL Lab",
      "",
      "Learn to build on the XRP Ledger.",
      "",
      "<!-- BEGIN curriculum:auto readme-table -->",
      "| Module | Track |",
      "| --- | --- |",
      "| Receipts | foundations |",
      "<!-- END curriculum:auto readme-table -->",
      "",
      "<!-- multi-line",
      "generated block — do not hand-edit",
      "-->",
      "",
      "More prose to translate.",
    ].join("\n");

    const result = await translateMarkdown(md, "en", "es", { cache: false });

    // Every comment marker survives verbatim.
    expect(result.markdown).toContain("<!-- BEGIN curriculum:auto readme-table -->");
    expect(result.markdown).toContain("<!-- END curriculum:auto readme-table -->");
    expect(result.markdown).toContain("<!-- multi-line\ngenerated block — do not hand-edit\n-->");

    // Prose WAS translated (proves the pipeline actually ran).
    expect(result.markdown).toContain("【Learn to build on the XRP Ledger.】");
    expect(result.markdown).toContain("【More prose to translate.】");

    // The translator NEVER received a comment marker.
    const sentTexts = vi
      .mocked(translateBatch)
      .mock.calls.flatMap(([items]) => items.map((it) => it.text));
    expect(sentTexts.some((t) => t.includes("<!--"))).toBe(false);
  });

  it("preserves a document that is only a comment (byte-identical, no translation call)", async () => {
    const md = "<!-- BEGIN curriculum:auto readme-table -->";
    const result = await translateMarkdown(md, "en", "ja", { cache: false });
    expect(result.markdown).toBe(md);
    // A protected-only document has nothing to translate.
    expect(translateBatch).not.toHaveBeenCalled();
  });
});
