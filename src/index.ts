#!/usr/bin/env node

/**
 * Polyglot MCP — Local GPU translation via TranslateGemma + Ollama.
 * Zero cloud dependency, 55 languages, runs on your GPU.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { translate } from "./translate.js";
import { LANGUAGES, resolveLanguage, isSupported } from "./languages.js";
import { OllamaClient } from "./ollama.js";

const server = new McpServer({
  name: "polyglot-mcp",
  version: "0.1.0",
});

// --- Tools ---

server.tool(
  "translate",
  "Translate text between any of 55 supported languages using TranslateGemma running locally on your GPU via Ollama. Fast, private, zero cloud dependency.",
  {
    text: z.string().describe("The text to translate"),
    from: z
      .string()
      .describe(
        'Source language code or name (e.g., "en", "English", "ja", "Japanese")'
      ),
    to: z
      .string()
      .describe(
        'Target language code or name (e.g., "es", "Spanish", "fr", "French")'
      ),
    model: z
      .string()
      .optional()
      .describe(
        'Ollama model to use (default: "translategemma:12b"). Use "translategemma:4b" for faster but lower quality.'
      ),
  },
  async ({ text, from, to, model }) => {
    try {
      const result = await translate(text, from, to, { model });
      const secs = (result.durationMs / 1000).toFixed(1);
      return {
        content: [
          {
            type: "text" as const,
            text: result.translation,
          },
          {
            type: "text" as const,
            text: `\n---\n${result.sourceLanguage.name} → ${result.targetLanguage.name} | ${result.model} | ${result.chunks} chunk(s) | ${secs}s`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Translation error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "list_languages",
  "List all 55 languages supported by TranslateGemma for translation.",
  {},
  async () => {
    const lines = LANGUAGES.map((l) => `${l.code.padEnd(8)} ${l.name}`);
    return {
      content: [
        {
          type: "text" as const,
          text: `Supported languages (${LANGUAGES.length}):\n\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

server.tool(
  "check_status",
  "Check if Ollama is running and TranslateGemma models are available.",
  {},
  async () => {
    const client = new OllamaClient();
    const available = await client.isAvailable();
    if (!available) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Ollama is not running. Start it with: ollama serve",
          },
        ],
        isError: true,
      };
    }

    const models = await client.listModels();
    const tgModels = models.filter((m) =>
      m.name.startsWith("translategemma")
    );

    if (tgModels.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Ollama is running but no TranslateGemma model is installed.\n\nInstall with:\n  ollama pull translategemma:12b   (8.1 GB, best quality)\n  ollama pull translategemma:4b    (3.3 GB, faster)\n  ollama pull translategemma:27b   (17 GB, highest quality)",
          },
        ],
      };
    }

    const modelList = tgModels
      .map((m) => `  ${m.name} (${(m.size / 1e9).toFixed(1)} GB)`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Ollama is running. TranslateGemma models available:\n${modelList}`,
        },
      ],
    };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
