import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getChunkSize,
  buildPrompt,
  buildBatchPrompt,
  chunkText,
  DEFAULT_MODEL,
  BATCH_SEPARATOR,
} from "./translate.js";
import type { Language } from "./languages.js";

// --- getChunkSize ---

describe("getChunkSize", () => {
  it("returns 2000 for 2b models", () => {
    expect(getChunkSize("translategemma:2b")).toBe(2000);
  });

  it("returns 2000 for 4b models", () => {
    expect(getChunkSize("translategemma:4b")).toBe(2000);
  });

  it("returns 6000 for 27b models", () => {
    expect(getChunkSize("translategemma:27b")).toBe(6000);
  });

  it("returns 4000 for 12b models", () => {
    expect(getChunkSize("translategemma:12b")).toBe(4000);
  });

  it("returns 4000 for unknown models", () => {
    expect(getChunkSize("some-other-model")).toBe(4000);
  });
});

// --- DEFAULT_MODEL ---

describe("DEFAULT_MODEL", () => {
  it("defaults to translategemma:12b when POLYGLOT_MODEL is not set", () => {
    // The env var is not set in test environment, so default should apply
    if (!process.env.POLYGLOT_MODEL) {
      expect(DEFAULT_MODEL).toBe("translategemma:12b");
    }
  });
});

// --- buildPrompt ---

describe("buildPrompt", () => {
  const en: Language = { code: "en", name: "English" };
  const ja: Language = { code: "ja", name: "Japanese" };

  it("includes source and target language names", () => {
    const prompt = buildPrompt(en, ja, "Hello", "");
    expect(prompt).toContain("English (en)");
    expect(prompt).toContain("Japanese (ja)");
  });

  it("includes the text to translate after two blank lines", () => {
    const prompt = buildPrompt(en, ja, "Hello world", "");
    expect(prompt).toContain("\n\nHello world");
  });

  it("includes glossary hint when provided", () => {
    const hint = '\nIMPORTANT: "Deploy" → "デプロイ"\n';
    const prompt = buildPrompt(en, ja, "Deploy the app", hint);
    expect(prompt).toContain("Deploy");
    expect(prompt).toContain("デプロイ");
  });

  it("includes no glossary hint when empty", () => {
    const prompt = buildPrompt(en, ja, "Hello", "");
    expect(prompt).not.toContain("IMPORTANT:");
  });

  it("asks for translation only without explanations", () => {
    const prompt = buildPrompt(en, ja, "Hello", "");
    expect(prompt).toContain("without any additional explanations or commentary");
  });
});

// --- buildBatchPrompt ---

describe("buildBatchPrompt", () => {
  const en: Language = { code: "en", name: "English" };
  const fr: Language = { code: "fr", name: "French" };

  it("includes separator preservation instruction", () => {
    const prompt = buildBatchPrompt(en, fr, "A\n---POLYGLOT_SEP---\nB", "");
    expect(prompt).toContain("---POLYGLOT_SEP---");
    expect(prompt).toContain("Keep each separator exactly as-is");
  });

  it("includes language info", () => {
    const prompt = buildBatchPrompt(en, fr, "text", "");
    expect(prompt).toContain("English (en)");
    expect(prompt).toContain("French (fr)");
  });
});

// --- chunkText ---

describe("chunkText", () => {
  it("returns single chunk when text fits", () => {
    const chunks = chunkText("Hello world", 100);
    expect(chunks).toEqual(["Hello world"]);
  });

  it("returns single chunk when text exactly equals max", () => {
    const text = "a".repeat(100);
    const chunks = chunkText(text, 100);
    expect(chunks).toEqual([text]);
  });

  it("splits at paragraph boundary (double newline)", () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const chunks = chunkText(text, 25);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("First paragraph.");
    expect(chunks[1]).toBe("Second paragraph.");
  });

  it("splits at sentence boundary when no paragraph break", () => {
    const text = "First sentence. Second sentence. Third sentence end.";
    const chunks = chunkText(text, 35);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk should end at a sentence boundary
    expect(chunks[0]).toMatch(/\.$/);
  });

  it("handles very long text without natural breaks", () => {
    const text = "a".repeat(200);
    const chunks = chunkText(text, 50);
    // Should split into chunks, each at most 50 chars
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });

  it("preserves all text content across chunks", () => {
    const text = "Hello world.\n\nThis is a test.\n\nThird paragraph here.";
    const chunks = chunkText(text, 25);
    // All original content should be recoverable (modulo whitespace trimming at boundaries)
    const reassembled = chunks.join(" ");
    expect(reassembled).toContain("Hello world.");
    expect(reassembled).toContain("This is a test.");
    expect(reassembled).toContain("Third paragraph here.");
  });

  it("handles empty text", () => {
    const chunks = chunkText("", 100);
    expect(chunks).toEqual([""]);
  });

  it("splits at newline when no sentence boundary", () => {
    const text = "Line one\nLine two\nLine three\nLine four";
    const chunks = chunkText(text, 20);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// --- BATCH_SEPARATOR ---

describe("BATCH_SEPARATOR", () => {
  it("contains the expected separator string", () => {
    expect(BATCH_SEPARATOR).toContain("---POLYGLOT_SEP---");
  });
});
