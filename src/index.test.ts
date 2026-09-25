/**
 * Tests for MCP tool handlers defined in index.ts.
 *
 * We mock the core modules (translate, translateMarkdown, ollama)
 * and test that the MCP wrappers properly format responses, surface
 * errors with isError: true, and pass options through.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

// Mock translate module
vi.mock("./translate.js", () => ({
  translate: vi.fn(),
}));

// Mock translateMarkdown module
vi.mock("./translateMarkdown.js", () => ({
  translateMarkdown: vi.fn(),
}));

// Mock translateAll module
vi.mock("./translateAll.js", () => ({
  translateAll: vi.fn(),
  TRANSLATE_ALL_LANGUAGES: [
    { code: "ja", name: "Japanese", label: "日本語" },
    { code: "es", name: "Spanish", label: "Español" },
  ],
}));

// Mock ollama module
vi.mock("./ollama.js", () => {
  const MockOllamaClient = vi.fn().mockImplementation(function() { return {
    ensureRunning: vi.fn().mockResolvedValue(true),
    listModels: vi.fn().mockResolvedValue([
      { name: "translategemma:12b", size: 8.1e9, digest: "abc" },
    ]),
  };});
  return { OllamaClient: MockOllamaClient };
});

import { translate } from "./translate.js";
import { translateMarkdown } from "./translateMarkdown.js";
import { OllamaClient } from "./ollama.js";
import { LANGUAGES } from "./languages.js";
import { PolyglotError } from "./errors.js";

// ── Helpers ──────────────────────────────────────────────────────

// We can't easily import the McpServer tool handlers directly.
// Instead, we capture the handlers registered via server.tool() by
// intercepting the McpServer constructor.
//
// Strategy: We mock @modelcontextprotocol/sdk to capture tool registrations,
// then call the handlers directly.

interface ToolRegistration {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const registeredTools: ToolRegistration[] = [];

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: vi.fn().mockImplementation(function() { return {
      tool: (name: string, description: string, schema: unknown, handler: unknown) => {
        registeredTools.push({
          name,
          description,
          schema: schema as Record<string, unknown>,
          handler: handler as ToolRegistration["handler"],
        });
      },
      connect: vi.fn().mockResolvedValue(undefined),
    };}),
  };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(),
}));

// ── Load index.ts (triggers tool registrations) ──────────────────

// Suppress the main() startup by mocking process.exit
const originalExit = process.exit;
beforeEach(() => {
  registeredTools.length = 0;
});

function getToolHandler(name: string): ToolRegistration["handler"] {
  // Re-import index.ts to populate registeredTools if needed
  const tool = registeredTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not registered`);
  return tool.handler;
}

// ── Tests ────────────────────────────────────────────────────────

describe("MCP tool handlers", () => {
  // Load index module once (triggers tool registrations)
  beforeEach(async () => {
    registeredTools.length = 0;
    vi.resetModules();
    // Re-apply mocks since resetModules clears them
    vi.doMock("./translate.js", () => ({ translate: vi.fn() }));
    vi.doMock("./translateMarkdown.js", () => ({ translateMarkdown: vi.fn() }));
    vi.doMock("./translateAll.js", () => ({
      translateAll: vi.fn(),
      TRANSLATE_ALL_LANGUAGES: [
        { code: "ja", name: "Japanese", label: "日本語" },
        { code: "es", name: "Spanish", label: "Español" },
      ],
    }));
    vi.doMock("./ollama.js", () => ({
      OllamaClient: vi.fn().mockImplementation(function() { return {
        ensureRunning: vi.fn().mockResolvedValue(true),
        listModels: vi.fn().mockResolvedValue([
          { name: "translategemma:12b", size: 8.1e9, digest: "abc" },
        ]),
      };}),
    }));
    vi.doMock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
      McpServer: vi.fn().mockImplementation(function() { return {
        tool: (name: string, description: string, schema: unknown, handler: unknown) => {
          registeredTools.push({
            name,
            description,
            schema: schema as Record<string, unknown>,
            handler: handler as ToolRegistration["handler"],
          });
        },
        connect: vi.fn().mockResolvedValue(undefined),
      };}),
    }));
    vi.doMock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
      StdioServerTransport: vi.fn(),
    }));
    await import("./index.js");
  });

  describe("tool registration", () => {
    it("registers exactly 6 tools", () => {
      expect(registeredTools.length).toBe(6);
    });

    it("registers translate, translate_markdown, translate_all, translate_readme, list_languages, check_status", () => {
      const names = registeredTools.map((t) => t.name);
      expect(names).toContain("translate");
      expect(names).toContain("translate_markdown");
      expect(names).toContain("translate_all");
      expect(names).toContain("translate_readme");
      expect(names).toContain("list_languages");
      expect(names).toContain("check_status");
    });
  });

  describe("list_languages", () => {
    it("returns all language codes", async () => {
      const handler = getToolHandler("list_languages");
      const result = (await handler({})) as {
        content: Array<{ type: string; text: string }>;
      };
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain("Supported languages");
      // Check a few specific languages
      expect(result.content[0].text).toContain("en");
      expect(result.content[0].text).toContain("English");
      expect(result.content[0].text).toContain("ja");
      expect(result.content[0].text).toContain("Japanese");
    });

    it("includes all languages from LANGUAGES array", async () => {
      const handler = getToolHandler("list_languages");
      const result = (await handler({})) as {
        content: Array<{ type: string; text: string }>;
      };
      for (const lang of LANGUAGES) {
        expect(result.content[0].text).toContain(lang.code);
        expect(result.content[0].text).toContain(lang.name);
      }
    });
  });

  describe("translate", () => {
    it("returns translated text on success", async () => {
      const handler = getToolHandler("translate");
      const { translate: mockTranslate } = await import("./translate.js");
      vi.mocked(mockTranslate).mockResolvedValue({
        translation: "Bonjour",
        sourceLanguage: { code: "en", name: "English" },
        targetLanguage: { code: "fr", name: "French" },
        model: "translategemma:12b",
        chunks: 1,
        durationMs: 1234,
        warnings: [],
      });

      const result = (await handler({
        text: "Hello",
        from: "en",
        to: "fr",
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe("Bonjour");
      expect(result.content[1].text).toContain("English → French");
      expect(result.content[1].text).toContain("1.2s");
    });

    it("surfaces warnings in response", async () => {
      const handler = getToolHandler("translate");
      const { translate: mockTranslate } = await import("./translate.js");
      vi.mocked(mockTranslate).mockResolvedValue({
        translation: "output",
        sourceLanguage: { code: "en", name: "English" },
        targetLanguage: { code: "fr", name: "French" },
        model: "translategemma:12b",
        chunks: 1,
        durationMs: 500,
        warnings: ["Translation may be truncated"],
      });

      const result = (await handler({
        text: "Hello",
        from: "en",
        to: "fr",
      })) as { content: Array<{ type: string; text: string }> };

      const warningText = result.content.find((c) =>
        c.text.includes("Warning")
      );
      expect(warningText).toBeDefined();
      expect(warningText!.text).toContain("truncated");
    });

    it("returns isError: true on PolyglotError", async () => {
      const handler = getToolHandler("translate");
      const { translate: mockTranslate } = await import("./translate.js");
      vi.mocked(mockTranslate).mockRejectedValue(
        new PolyglotError({
          code: "UNSUPPORTED_LANGUAGE",
          message: 'Unsupported source language: "klingon".',
          hint: "Use the list_languages tool to see all supported languages.",
          retryable: false,
        })
      );

      const result = (await handler({
        text: "Hello",
        from: "klingon",
        to: "fr",
      })) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("klingon");
    });

    it("returns isError: true for generic errors", async () => {
      const handler = getToolHandler("translate");
      const { translate: mockTranslate } = await import("./translate.js");
      vi.mocked(mockTranslate).mockRejectedValue(new Error("Unexpected crash"));

      const result = (await handler({
        text: "Hello",
        from: "en",
        to: "fr",
      })) as { isError: boolean };

      expect(result.isError).toBe(true);
    });
  });

  describe("translate_markdown", () => {
    it("returns translated markdown on success", async () => {
      const handler = getToolHandler("translate_markdown");
      const { translateMarkdown: mockMd } = await import(
        "./translateMarkdown.js"
      );
      vi.mocked(mockMd).mockResolvedValue({
        markdown: "# Bonjour\n\nLe monde",
        segments: 4,
        cached: 1,
        translated: 2,
        deduplicated: 0,
        fuzzyMatched: 0,
        ollamaCalls: 1,
        durationMs: 2000,
        warnings: [],
      });

      const result = (await handler({
        markdown: "# Hello\n\nWorld",
        from: "en",
        to: "fr",
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe("# Bonjour\n\nLe monde");
      expect(result.content[1].text).toContain("4 segments");
      expect(result.content[1].text).toContain("2 translated");
    });

    it("returns isError: true on failure", async () => {
      const handler = getToolHandler("translate_markdown");
      const { translateMarkdown: mockMd } = await import(
        "./translateMarkdown.js"
      );
      vi.mocked(mockMd).mockRejectedValue(
        new PolyglotError({
          code: "OLLAMA_UNAVAILABLE",
          message: "Could not start Ollama.",
          retryable: true,
        })
      );

      const result = (await handler({
        markdown: "# Hello",
        from: "en",
        to: "fr",
      })) as { isError: boolean };

      expect(result.isError).toBe(true);
    });
  });

  describe("check_status", () => {
    it("returns ready message when Ollama and models present", async () => {
      const handler = getToolHandler("check_status");
      const result = (await handler({})) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Ready to translate");
      expect(result.content[0].text).toContain("translategemma:12b");
    });

    it("returns error when Ollama not available", async () => {
      const handler = getToolHandler("check_status");
      // check_status creates new OllamaClient() at call time —
      // mock the next instantiation to return unavailable.
      const { OllamaClient: MockClient } = await import("./ollama.js");
      vi.mocked(MockClient).mockImplementationOnce(
        function() {
          return ({
            ensureRunning: vi.fn().mockResolvedValue(false),
            listModels: vi.fn(),
          }) as unknown as OllamaClient;
        }
      );

      const result = (await handler({})) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not installed");
    });

    it("shows pull instructions when no TranslateGemma models", async () => {
      const handler = getToolHandler("check_status");
      const { OllamaClient: MockClient } = await import("./ollama.js");
      vi.mocked(MockClient).mockImplementationOnce(
        function() {
          return ({
            ensureRunning: vi.fn().mockResolvedValue(true),
            listModels: vi.fn().mockResolvedValue([
              { name: "llama3:8b", size: 4e9, digest: "xyz" },
            ]),
          }) as unknown as OllamaClient;
        }
      );

      const result = (await handler({})) as {
        content: Array<{ type: string; text: string }>;
      };

      expect(result.content[0].text).toContain("no TranslateGemma model");
    });
  });
});
