#!/usr/bin/env node

/**
 * Polyglot MCP — Local GPU translation via TranslateGemma + Ollama.
 * Zero cloud dependency, 55 languages, runs on your GPU.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { translate } from "./translate.js";
import { LANGUAGES } from "./languages.js";
import { OllamaClient } from "./ollama.js";

const server = new McpServer({
  name: "polyglot-mcp",
  version: "1.0.1",
});

// --- Tools ---

server.tool(
  "translate",
  "Translate text between any of 55 supported languages using TranslateGemma running locally on your GPU via Ollama. Automatically starts Ollama and pulls the model if needed. Includes a built-in software glossary for accurate technical translations.",
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
        'Ollama model (default: "translategemma:12b"). Use "translategemma:4b" for speed or "translategemma:27b" for max quality.'
      ),
    glossary: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Custom term overrides as {"source term": "target translation"}. Merged with the built-in software glossary.'
      ),
  },
  async ({ text, from, to, model, glossary }) => {
    try {
      // Convert flat glossary to GlossaryEntry format
      const customGlossary = glossary
        ? Object.entries(glossary).map(([term, translation]) => ({
            term,
            translations: { [to.split("-")[0].toLowerCase()]: translation },
          }))
        : undefined;

      const result = await translate(text, from, to, { model, glossary: customGlossary });
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
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: friendlyError(msg),
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
  "Check if Ollama is running and TranslateGemma models are available. Attempts to auto-start Ollama if not running.",
  {},
  async () => {
    const client = new OllamaClient();

    const available = await client.ensureRunning();
    if (!available) {
      return {
        content: [
          {
            type: "text" as const,
            text: [
              "Ollama is not installed or could not be started.",
              "",
              "To fix this:",
              "  1. Install Ollama from https://ollama.com",
              "  2. Run: ollama serve",
              "  3. Try again",
            ].join("\n"),
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
            text: [
              "Ollama is running but no TranslateGemma model is installed.",
              "",
              "Pick a model based on your GPU:",
              "  ollama pull translategemma:4b    3.3 GB  (fast, good quality)",
              "  ollama pull translategemma:12b   8.1 GB  (balanced — recommended)",
              "  ollama pull translategemma:27b   17 GB   (slow, best quality)",
              "",
              "Note: The translate tool will auto-pull the model on first use,",
              "so you can also just start translating and it will download automatically.",
            ].join("\n"),
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
          text: `Ready to translate. TranslateGemma models installed:\n${modelList}`,
        },
      ],
    };
  }
);

// --- Friendly error messages ---

function friendlyError(msg: string): string {
  // Connection errors
  if (msg.includes("Cannot connect") || msg.includes("fetch failed")) {
    return [
      "Cannot reach Ollama.",
      "",
      "Polyglot tried to auto-start it but couldn't connect.",
      "Make sure Ollama is installed (https://ollama.com) and try again.",
    ].join("\n");
  }

  // Model not found
  if (msg.includes("not found")) {
    return [
      msg,
      "",
      "The translate tool normally auto-pulls models, but the pull may have",
      "failed. Check your internet connection and try: ollama pull translategemma:12b",
    ].join("\n");
  }

  // Unsupported language
  if (msg.includes("Unsupported")) {
    return [
      msg,
      "",
      "Use the list_languages tool to see all 55 supported languages.",
      "You can use either language codes (\"en\") or names (\"English\").",
    ].join("\n");
  }

  // Same language
  if (msg.includes("must be different")) {
    return "Source and target languages are the same — nothing to translate.";
  }

  // Generic fallback
  return `Translation failed: ${msg}`;
}

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `Polyglot MCP failed to start: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
