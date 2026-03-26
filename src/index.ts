#!/usr/bin/env node

/**
 * Polyglot MCP — Local GPU translation via TranslateGemma + Ollama.
 * Zero cloud dependency, 57 languages, runs on your GPU.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { translate } from "./translate.js";
import { translateMarkdown } from "./translateMarkdown.js";
import { translateAll, TRANSLATE_ALL_LANGUAGES } from "./translateAll.js";
import { LANGUAGES } from "./languages.js";
import { OllamaClient } from "./ollama.js";
import { VERSION } from "./version.js";
import { friendlyError } from "./errors.js";

const server = new McpServer({
  name: "polyglot-mcp",
  version: VERSION,
});

// ─── Helper: send MCP progress notifications ─────────────────────

type Extra = {
  sendNotification: (n: ServerNotification) => Promise<void>;
  _meta?: { progressToken?: string | number };
  [k: string]: unknown;
};

/**
 * Build a progress reporter from the MCP `extra` parameter.
 * Returns a no-op if the client didn't request progress or extra is undefined.
 */
function makeProgress(extra?: Extra) {
  const token = extra?._meta?.progressToken;
  if (token === undefined || !extra) return { report: (_p: number, _t: number, _msg?: string) => {} };

  return {
    report: (progress: number, total: number, message?: string) => {
      extra.sendNotification({
        method: "notifications/progress",
        params: { progressToken: token, progress, total, ...(message ? { message } : {}) },
      } as ServerNotification).catch(() => {});
    },
  };
}

// --- Tools ---

server.tool(
  "translate",
  "Translate text between any of 57 supported languages using TranslateGemma running locally on your GPU via Ollama. Automatically starts Ollama and pulls the model if needed. Includes a built-in software glossary for accurate technical translations.",
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
  async ({ text, from, to, model, glossary }, extra) => {
    try {
      const { report } = makeProgress(extra as Extra);
      report(0, 1, "Starting translation…");

      // Convert flat glossary to GlossaryEntry format
      const customGlossary = glossary
        ? Object.entries(glossary).map(([term, translation]) => ({
            term,
            translations: { [to.split("-")[0].toLowerCase()]: translation },
          }))
        : undefined;

      const result = await translate(text, from, to, { model, glossary: customGlossary });
      report(1, 1, "Translation complete");
      const secs = (result.durationMs / 1000).toFixed(1);
      const content: Array<{ type: "text"; text: string }> = [
        {
          type: "text" as const,
          text: result.translation,
        },
        {
          type: "text" as const,
          text: `\n---\n${result.sourceLanguage.name} → ${result.targetLanguage.name} | ${result.model} | ${result.chunks} chunk(s) | ${secs}s`,
        },
      ];
      if (result.warnings.length > 0) {
        content.push({
          type: "text" as const,
          text: `\n⚠ Warnings:\n${result.warnings.map(w => `  - ${w}`).join("\n")}`,
        });
      }
      return { content };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: friendlyError(err),
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "list_languages",
  "List all 57 languages supported by TranslateGemma for translation.",
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
  "translate_markdown",
  "Translate a markdown document while preserving its structure. Code blocks, HTML elements, URLs, badges, and table formatting are kept intact. Only prose content (headings, paragraphs, taglines, table cells) is translated. Supports segment-level caching.",
  {
    markdown: z.string().describe("The full markdown content to translate"),
    from: z
      .string()
      .describe('Source language code or name (e.g., "en", "English")'),
    to: z
      .string()
      .describe('Target language code or name (e.g., "ja", "Japanese")'),
    model: z
      .string()
      .optional()
      .describe('Ollama model (default: "translategemma:12b")'),
  },
  async ({ markdown, from, to, model }, extra) => {
    try {
      const { report } = makeProgress(extra as Extra);
      report(0, 1, "Segmenting markdown…");

      const result = await translateMarkdown(markdown, from, to, {
        model,
        cache: false,
        onProgress: (completed, total) => {
          report(completed, total, `Translated ${completed}/${total} segments`);
        },
      });
      const secs = (result.durationMs / 1000).toFixed(1);
      const content: Array<{ type: "text"; text: string }> = [
        {
          type: "text" as const,
          text: result.markdown,
        },
        {
          type: "text" as const,
          text: `\n---\n${result.segments} segments | ${result.translated} translated | ${result.cached} cached | ${result.fuzzyMatched} fuzzy | ${result.ollamaCalls} Ollama call(s) | ${secs}s`,
        },
      ];
      if (result.warnings.length > 0) {
        content.push({
          type: "text" as const,
          text: `\n⚠ Warnings:\n${result.warnings.map(w => `  - ${w}`).join("\n")}`,
        });
      }
      return { content };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: friendlyError(err),
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "translate_all",
  "Translate markdown content into multiple languages at once (default: 7 languages — Japanese, Chinese, Spanish, French, Hindi, Italian, Portuguese). Runs translations concurrently with GPU-safe semaphore limiting. Returns translated content for each language with optional nav bar injection.",
  {
    markdown: z.string().describe("The full markdown content to translate"),
    from: z
      .string()
      .optional()
      .describe('Source language code (default: "en")'),
    languages: z
      .array(z.string())
      .optional()
      .describe(
        'Target language codes to translate into (default: all 7 — ["ja", "zh", "es", "fr", "hi", "it", "pt"])'
      ),
    model: z
      .string()
      .optional()
      .describe('Ollama model (default: "translategemma:12b")'),
    concurrency: z
      .number()
      .optional()
      .describe("Max concurrent language translations (default: 2, max: 3)"),
    navBar: z
      .boolean()
      .optional()
      .describe("Inject a language nav bar at the top of each output (default: true)"),
  },
  async ({ markdown, from, languages, model, concurrency, navBar }, extra) => {
    try {
      const { report } = makeProgress(extra as Extra);
      const targetLangs = languages ?? TRANSLATE_ALL_LANGUAGES.map((l) => l.code);
      report(0, targetLangs.length, "Starting multi-language translation…");

      const result = await translateAll(markdown, {
        sourceLang: from ?? "en",
        targetLangs: languages,
        model,
        concurrency,
        navBar,
        onProgress: (completed, total, lang) => {
          report(completed, total, `Completed ${lang} (${completed}/${total})`);
        },
      });

      const secs = (result.durationMs / 1000).toFixed(1);
      const content: Array<{ type: "text"; text: string }> = [];

      // Emit each translated language as a separate text block
      for (const r of result.results) {
        if (r.status === "ok" && r.markdown) {
          content.push({
            type: "text" as const,
            text: `--- README.${r.fileSuffix}.md ---\n${r.markdown}`,
          });
        } else {
          content.push({
            type: "text" as const,
            text: `--- README.${r.fileSuffix}.md --- ERROR: ${r.error}`,
          });
        }
      }

      content.push({
        type: "text" as const,
        text: `\n---\n${result.succeeded} succeeded | ${result.failed} failed | ${secs}s total`,
      });

      return { content };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: friendlyError(err),
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "check_status",
  "Check if Ollama is running and TranslateGemma models are available. Attempts to auto-start Ollama if not running.",
  {},
  async (_args, extra) => {
    const { report } = makeProgress(extra as Extra);
    report(0, 3, "Checking Ollama…");
    const client = new OllamaClient();

    const available = await client.ensureRunning();
    report(1, 3, "Ollama checked");
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
    report(2, 3, "Models listed");
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

    report(3, 3, "Ready");

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

// --- CLI flags ---

const arg = process.argv[2];
if (arg === "--version" || arg === "-V") {
  process.stdout.write(`polyglot-mcp ${VERSION}\n`);
  process.exit(0);
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
