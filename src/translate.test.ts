import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getChunkSize,
  buildPrompt,
  buildBatchPrompt,
  chunkText,
  DEFAULT_MODEL,
  BATCH_SEPARATOR,
  PLACEHOLDER_INSTRUCTION,
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
  it("defaults to translategemma:27b when POLYGLOT_MODEL is not set", () => {
    // The env var is not set in test environment, so default should apply
    if (!process.env.POLYGLOT_MODEL) {
      expect(DEFAULT_MODEL).toBe("translategemma:27b");
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

// --- code-placeholder instruction ---
//
// The instruction is conditional on purpose. Adding it unconditionally would
// change the prompt for every placeholder-free paragraph in the corpus, so
// protecting code spans would churn translations that have nothing to do with
// code. These tests pin that boundary in both prompt builders.

describe("code-placeholder instruction", () => {
  const en: Language = { code: "en", name: "English" };
  const hi: Language = { code: "hi", name: "Hindi" };

  it("is added when the text carries placeholders", () => {
    const prompt = buildPrompt(en, hi, "Run ⟦0⟧ to start.", "");
    expect(prompt).toContain(PLACEHOLDER_INSTRUCTION.trim());
    expect(prompt).toContain("Do NOT translate, transliterate, renumber, drop, or duplicate them.");
  });

  it("is absent when the text carries none", () => {
    const prompt = buildPrompt(en, hi, "Run the engine to start.", "");
    expect(prompt).not.toContain("⟦0⟧");
    expect(prompt).not.toContain("renumber");
  });

  it("is added to the batch prompt alongside the separator instruction", () => {
    const prompt = buildBatchPrompt(en, hi, "Run ⟦0⟧\n---POLYGLOT_SEP---\nStop ⟦1⟧", "");
    expect(prompt).toContain("Keep each separator exactly as-is");
    expect(prompt).toContain("renumber");
  });

  it("leaves the batch prompt free of the instruction when unused", () => {
    const prompt = buildBatchPrompt(en, hi, "A\n---POLYGLOT_SEP---\nB", "");
    expect(prompt).not.toContain("renumber");
    expect(prompt).toContain("Keep each separator exactly as-is");
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

// --- translate() with mocked Ollama ---

// We mock the entire ollama module so no real server is needed
vi.mock("./ollama.js", () => {
  const MockOllamaClient = vi.fn().mockImplementation(function() { return ({
    ensureRunning: vi.fn().mockResolvedValue(true),
    ensureModel: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue({
      model: "translategemma:12b",
      response: "Bonjour le monde",
      done: true,
    }),
    generateStream: vi.fn().mockImplementation(async (_req: unknown, onToken: (t: string) => void) => {
      onToken("Bon");
      onToken("jour");
      return {
        model: "translategemma:12b",
        response: "Bonjour",
        done: true,
      };
    }),
  });});
  return { OllamaClient: MockOllamaClient };
});

import { translate, translateBatch } from "./translate.js";
import { OllamaClient } from "./ollama.js";

describe("translate()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("translates text and returns result", async () => {
    const result = await translate("Hello world", "en", "fr");
    expect(result.translation).toBe("Bonjour le monde");
    expect(result.sourceLanguage.code).toBe("en");
    expect(result.targetLanguage.code).toBe("fr");
    expect(result.model).toBe("translategemma:27b");
    expect(result.chunks).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.warnings).toEqual([]);
  });

  it("throws UNSUPPORTED_LANGUAGE for bad source", async () => {
    await expect(translate("hello", "klingon", "fr")).rejects.toThrow("Unsupported source language");
  });

  it("throws UNSUPPORTED_LANGUAGE for bad target", async () => {
    await expect(translate("hello", "en", "klingon")).rejects.toThrow("Unsupported target language");
  });

  it("throws SAME_LANGUAGE when source equals target", async () => {
    await expect(translate("hello", "en", "en")).rejects.toThrow("Source and target languages must be different");
  });

  it("throws SAME_LANGUAGE using names too", async () => {
    await expect(translate("hello", "English", "english")).rejects.toThrow("Source and target languages must be different");
  });

  it("resolves language names case-insensitively", async () => {
    const result = await translate("Hello", "english", "FRENCH");
    expect(result.sourceLanguage.code).toBe("en");
    expect(result.targetLanguage.code).toBe("fr");
  });

  it("throws OLLAMA_UNAVAILABLE when ensureRunning returns false", async () => {
    const mockInstances = vi.mocked(OllamaClient).mock.results;
    // Get the next instance that will be created
    vi.mocked(OllamaClient).mockImplementationOnce(function() { return ({
      ensureRunning: vi.fn().mockResolvedValue(false),
      ensureModel: vi.fn().mockResolvedValue(true),
      generate: vi.fn(),
      generateStream: vi.fn(),
    }) as unknown as OllamaClient;});

    await expect(translate("hello", "en", "fr")).rejects.toThrow("Could not start Ollama");
  });

  it("throws MODEL_PULL_FAILED when ensureModel returns false", async () => {
    vi.mocked(OllamaClient).mockImplementationOnce(function() { return ({
      ensureRunning: vi.fn().mockResolvedValue(true),
      ensureModel: vi.fn().mockResolvedValue(false),
      generate: vi.fn(),
      generateStream: vi.fn(),
    }) as unknown as OllamaClient;});

    await expect(translate("hello", "en", "fr")).rejects.toThrow("Could not pull model");
  });

  it("uses streaming when onToken is provided", async () => {
    const tokens: string[] = [];
    const result = await translate("Hello", "en", "fr", {
      onToken: (t) => tokens.push(t),
    });
    expect(tokens).toEqual(["Bon", "jour"]);
    expect(result.translation).toBe("Bonjour");
  });

  it("respects custom model option", async () => {
    const result = await translate("hello", "en", "fr", { model: "translategemma:4b" });
    expect(result.model).toBe("translategemma:4b");
  });

  it("adds validation warnings for echoed text", async () => {
    // Mock generate to echo source text
    vi.mocked(OllamaClient).mockImplementationOnce(function() { return ({
      ensureRunning: vi.fn().mockResolvedValue(true),
      ensureModel: vi.fn().mockResolvedValue(true),
      generate: vi.fn().mockResolvedValue({
        model: "translategemma:12b",
        response: "This is a long sentence that should definitely be translated but was echoed",
        done: true,
      }),
      generateStream: vi.fn(),
    }) as unknown as OllamaClient;});

    const result = await translate(
      "This is a long sentence that should definitely be translated but was echoed",
      "en",
      "fr"
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("echo");
  });

  it("skips validation when validate=false", async () => {
    vi.mocked(OllamaClient).mockImplementationOnce(function() { return ({
      ensureRunning: vi.fn().mockResolvedValue(true),
      ensureModel: vi.fn().mockResolvedValue(true),
      generate: vi.fn().mockResolvedValue({
        model: "translategemma:12b",
        response: "This is a long sentence that should definitely be translated but was echoed",
        done: true,
      }),
      generateStream: vi.fn(),
    }) as unknown as OllamaClient;});

    const result = await translate(
      "This is a long sentence that should definitely be translated but was echoed",
      "en",
      "fr",
      { validate: false }
    );
    expect(result.warnings).toEqual([]);
  });
});

// --- translateBatch() with mocked Ollama ---

describe("translateBatch()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty results for empty items", async () => {
    const result = await translateBatch([], "en", "fr");
    expect(result.translations).toEqual([]);
    expect(result.ollamaCalls).toBe(0);
    expect(result.durationMs).toBe(0);
  });

  it("translates a single item without separator overhead", async () => {
    const result = await translateBatch(
      [{ text: "Hello", kind: "text" }],
      "en",
      "fr"
    );
    expect(result.translations).toHaveLength(1);
    expect(result.translations[0]).toBe("Bonjour le monde");
    expect(result.ollamaCalls).toBe(1);
  });

  it("batches multiple items with separator", async () => {
    // Mock generate to return text with separator intact
    vi.mocked(OllamaClient).mockImplementationOnce(function() { return ({
      ensureRunning: vi.fn().mockResolvedValue(true),
      ensureModel: vi.fn().mockResolvedValue(true),
      generate: vi.fn().mockResolvedValue({
        model: "translategemma:12b",
        response: "Bonjour\n---POLYGLOT_SEP---\nAu revoir",
        done: true,
      }),
      generateStream: vi.fn(),
    }) as unknown as OllamaClient;});

    const result = await translateBatch(
      [{ text: "Hello" }, { text: "Goodbye" }],
      "en",
      "fr"
    );
    expect(result.translations).toHaveLength(2);
    expect(result.translations[0]).toBe("Bonjour");
    expect(result.translations[1]).toBe("Au revoir");
    expect(result.ollamaCalls).toBe(1);
  });

  it("falls back to individual calls when separator is mangled", async () => {
    let callCount = 0;
    vi.mocked(OllamaClient).mockImplementationOnce(function() { return ({
      ensureRunning: vi.fn().mockResolvedValue(true),
      ensureModel: vi.fn().mockResolvedValue(true),
      generate: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: batch attempt — mangled separator (wrong number of parts)
          return {
            model: "translategemma:12b",
            response: "Bonjour Au revoir merged together",
            done: true,
          };
        }
        // Subsequent calls: individual fallback
        return {
          model: "translategemma:12b",
          response: callCount === 2 ? "Bonjour" : "Au revoir",
          done: true,
        };
      }),
      generateStream: vi.fn(),
    }) as unknown as OllamaClient;});

    const result = await translateBatch(
      [{ text: "Hello" }, { text: "Goodbye" }],
      "en",
      "fr"
    );
    expect(result.translations).toHaveLength(2);
    expect(result.translations[0]).toBe("Bonjour");
    expect(result.translations[1]).toBe("Au revoir");
    // 1 batch attempt + 2 individual fallbacks = 3
    expect(result.ollamaCalls).toBe(3);
  });

  it("rejects unsupported languages", async () => {
    await expect(
      translateBatch([{ text: "hi" }], "en", "klingon")
    ).rejects.toThrow("Unsupported target language");
  });
});
