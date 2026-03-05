/**
 * Tests for src/translateMarkdown.ts — markdown-aware translation engine.
 *
 * These test the pure functions (segmentation, table parsing, tagline handling,
 * cleaning) without calling Ollama.
 */

import { describe, it, expect } from "vitest";
import {
  segmentMarkdown,
  isTranslatableCell,
  parseTable,
  reassembleTable,
  cleanTranslation,
  extractTaglineText,
  rebuildTagline,
} from "./translateMarkdown.js";

// ─── segmentMarkdown ───────────────────────────────────────────────

describe("segmentMarkdown", () => {
  it("protects fenced code blocks", () => {
    const md = "text before\n```js\nconst x = 1;\n```\ntext after";
    const segs = segmentMarkdown(md);
    const codeBlock = segs.find((s) => s.type === "protected" && s.text.includes("const x"));
    expect(codeBlock).toBeDefined();
    expect(codeBlock!.text).toBe("```js\nconst x = 1;\n```");
  });

  it("detects html-tagline segments", () => {
    const md = '<p align="center"><strong>Hello World</strong></p>';
    const segs = segmentMarkdown(md);
    expect(segs[0].type).toBe("html-tagline");
    expect(segs[0].text).toContain("Hello World");
  });

  it("protects HTML badge blocks", () => {
    const md = '<p align="center">\n  <a href="foo"><img src="bar"></a>\n</p>';
    const segs = segmentMarkdown(md);
    expect(segs[0].type).toBe("protected");
  });

  it("protects horizontal rules", () => {
    const segs = segmentMarkdown("---");
    expect(segs[0].type).toBe("protected");
    expect(segs[0].text).toBe("---");
  });

  it("protects empty lines", () => {
    const segs = segmentMarkdown("text\n\nmore text");
    const empties = segs.filter((s) => s.type === "protected" && s.text === "");
    expect(empties.length).toBeGreaterThan(0);
  });

  it("parses headings with prefix", () => {
    const segs = segmentMarkdown("## Quick Start");
    expect(segs[0].type).toBe("heading");
    expect(segs[0].prefix).toBe("## ");
    expect(segs[0].text).toBe("Quick Start");
  });

  it("parses tables", () => {
    const md = "| Col A | Col B |\n|-------|-------|\n| foo | bar |";
    const segs = segmentMarkdown(md);
    expect(segs[0].type).toBe("table");
  });

  it("collects consecutive text lines as a paragraph", () => {
    const md = "First line.\nSecond line.\nThird line.";
    const segs = segmentMarkdown(md);
    expect(segs[0].type).toBe("text");
    expect(segs[0].text).toBe("First line.\nSecond line.\nThird line.");
  });

  it("handles block quotes", () => {
    const md = "> This is a quote.\n> Continued here.";
    const segs = segmentMarkdown(md);
    expect(segs[0].type).toBe("text");
    expect(segs[0].text).toContain("> This is a quote.");
  });

  it("handles mixed content correctly", () => {
    const md = [
      "## Title",
      "",
      "Some text.",
      "",
      "```bash",
      "npm install",
      "```",
      "",
      "---",
      "",
      "More text.",
    ].join("\n");
    const segs = segmentMarkdown(md);
    const types = segs.map((s) => s.type);
    expect(types).toContain("heading");
    expect(types).toContain("text");
    expect(types).toContain("protected");
  });
});

// ─── isTranslatableCell ────────────────────────────────────────────

describe("isTranslatableCell", () => {
  it("returns false for backtick terms", () => {
    expect(isTranslatableCell("`translate`")).toBe(false);
  });

  it("returns false for multiple backtick terms", () => {
    expect(isTranslatableCell("`Read`, `WebFetch`")).toBe(false);
  });

  it("returns false for scoped package names", () => {
    expect(isTranslatableCell("@mcptoolshop/polyglot-mcp")).toBe(false);
  });

  it("returns false for bold short labels", () => {
    expect(isTranslatableCell("**intake**")).toBe(false);
  });

  it("returns false for pure numbers", () => {
    expect(isTranslatableCell("3.14")).toBe(false);
  });

  it("returns false for markdown links", () => {
    expect(isTranslatableCell("[LICENSE](LICENSE)")).toBe(false);
  });

  it("returns false for em dash", () => {
    expect(isTranslatableCell("—")).toBe(false);
  });

  it("returns false for short text", () => {
    expect(isTranslatableCell("no")).toBe(false);
  });

  it("returns true for descriptive prose", () => {
    expect(isTranslatableCell("Text to translate")).toBe(true);
  });

  it("returns true for yes/no labels with letters", () => {
    expect(isTranslatableCell("yes")).toBe(true);
  });
});

// ─── parseTable / reassembleTable ──────────────────────────────────

describe("parseTable", () => {
  it("identifies separator rows", () => {
    const table = "| A | B |\n|---|---|\n| foo | bar |";
    const { parsed } = parseTable(table);
    expect(parsed[1].type).toBe("separator");
  });

  it("finds translatable cells", () => {
    const table = "| Parameter | Description |\n|---|---|\n| `text` | The text to translate |";
    const { translatableCells } = parseTable(table);
    expect(translatableCells.length).toBeGreaterThan(0);
    expect(translatableCells.some((c) => c.text === "The text to translate")).toBe(true);
  });

  it("skips backtick-only cells", () => {
    const table = "| `name` | Description |\n|---|---|";
    const { translatableCells } = parseTable(table);
    expect(translatableCells.every((c) => c.text !== "name")).toBe(true);
  });
});

describe("reassembleTable", () => {
  it("injects translated cells", () => {
    const table = "| Header | Desc |\n|---|---|\n| foo | bar |";
    const { parsed } = parseTable(table);
    const map = new Map<string, string>();
    // Row 2 (index in parsed = 2), cell 1 = "bar" → translate
    const barCell = parsed.findIndex(
      (r) => r.type === "data" && r.cells?.some((c) => c.original.includes("bar"))
    );
    if (barCell >= 0) {
      map.set(`${barCell}:1`, "バー");
    }
    const result = reassembleTable(parsed, map);
    expect(result).toContain("バー");
  });

  it("preserves separator rows unchanged", () => {
    const table = "| A |\n|---|\n| B |";
    const { parsed } = parseTable(table);
    const result = reassembleTable(parsed, new Map());
    expect(result).toContain("|---|");
  });
});

// ─── cleanTranslation ──────────────────────────────────────────────

describe("cleanTranslation", () => {
  it("strips Japanese 'or' alternatives", () => {
    const text = "翻訳A\nまたは\n翻訳B";
    expect(cleanTranslation(text)).toBe("翻訳A");
  });

  it("strips Korean 'or' alternatives", () => {
    const text = "번역A\n또는\n번역B";
    expect(cleanTranslation(text)).toBe("번역A");
  });

  it("strips trailing period from headings", () => {
    expect(cleanTranslation("タイトル。", true)).toBe("タイトル");
  });

  it("does not strip trailing period from non-headings", () => {
    expect(cleanTranslation("文章。")).toBe("文章。");
  });

  it("trims whitespace", () => {
    expect(cleanTranslation("  hello  ")).toBe("hello");
  });
});

// ─── extractTaglineText / rebuildTagline ───────────────────────────

describe("extractTaglineText", () => {
  it("extracts text from simple tagline", () => {
    const line = '<p align="center"><strong>Hello World</strong></p>';
    expect(extractTaglineText(line)).toBe("Hello World");
  });

  it("extracts text with em dash and special chars", () => {
    const line = '<p align="center"><strong>Local GPU translation — 55 languages, zero cloud.</strong></p>';
    expect(extractTaglineText(line)).toBe("Local GPU translation — 55 languages, zero cloud.");
  });

  it("returns null for non-tagline HTML", () => {
    expect(extractTaglineText('<p align="center"><img src="foo"></p>')).toBeNull();
  });
});

describe("rebuildTagline", () => {
  it("replaces inner text", () => {
    const line = '<p align="center"><strong>Hello World</strong></p>';
    const result = rebuildTagline(line, "こんにちは世界");
    expect(result).toBe('<p align="center"><strong>こんにちは世界</strong></p>');
  });

  it("preserves surrounding HTML attributes", () => {
    const line = '<p align="center"><strong>Some text here.</strong></p>';
    const result = rebuildTagline(line, "Du texte ici.");
    expect(result).toContain('align="center"');
    expect(result).toContain("Du texte ici.");
  });
});
