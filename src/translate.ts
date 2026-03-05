/**
 * Core translation logic — builds prompts, calls Ollama, handles chunking.
 * Includes glossary injection, post-translation polish, and batch mode.
 */

import { OllamaClient, type StreamCallback } from "./ollama.js";
import { resolveLanguage, type Language } from "./languages.js";
import {
  buildGlossaryHint,
  SOFTWARE_GLOSSARY,
  type GlossaryEntry,
} from "./glossary.js";
import { polish } from "./polish.js";
import { PolyglotError } from "./errors.js";
import { validateTranslation } from "./validate.js";

/** Default model — override with POLYGLOT_MODEL env var. */
export const DEFAULT_MODEL =
  process.env.POLYGLOT_MODEL || "translategemma:12b";

/** @internal Exported for testing. */
export const BATCH_SEPARATOR = "\n---POLYGLOT_SEP---\n";

/** @internal Chunk size varies by model — bigger models handle more context. */
export function getChunkSize(model: string): number {
  if (model.includes(":2b") || model.includes(":4b")) return 2000;
  if (model.includes(":27b")) return 6000;
  return 4000; // 12b and default
}

export interface TranslateOptions {
  model?: string;
  temperature?: number;
  ollamaUrl?: string;
  /** Custom glossary entries (merged with built-in software glossary). */
  glossary?: GlossaryEntry[];
  /** Set to false to disable the built-in software glossary. Default: true. */
  softwareGlossary?: boolean;
  /** Set to false to skip post-translation polish. Default: true. */
  polish?: boolean;
  /** Streaming callback — receives tokens as they arrive. */
  onToken?: StreamCallback;
  /** Set to false to skip output validation. Default: true. */
  validate?: boolean;
}

export interface TranslateResult {
  translation: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  model: string;
  chunks: number;
  durationMs: number;
  /** Validation warnings (empty if all checks pass). */
  warnings: string[];
}

// --- Batch types ---

export interface BatchItem {
  text: string;
  /** Hint for post-processing (e.g., "heading" strips trailing periods). */
  kind?: "heading" | "text" | "cell";
}

export interface TranslateBatchOptions extends TranslateOptions {
  /** Max combined characters before flushing a batch. Auto-derived from model if omitted. */
  batchCharLimit?: number;
}

export interface TranslateBatchResult {
  translations: string[];
  model: string;
  ollamaCalls: number;
  durationMs: number;
}

/** @internal Build the TranslateGemma prompt — two blank lines before text is critical. */
export function buildPrompt(
  source: Language,
  target: Language,
  text: string,
  glossaryHint: string
): string {
  return `You are a professional ${source.name} (${source.code}) to ${target.name} (${target.code}) translator. Your goal is to accurately convey the meaning and nuances of the original ${source.name} text while adhering to ${target.name} grammar, vocabulary, and cultural sensitivities.
Produce only the ${target.name} translation, without any additional explanations or commentary.${glossaryHint} Please translate the following ${source.name} text into ${target.name}:


${text}`;
}

/** @internal Build a batch prompt with separator instructions. */
export function buildBatchPrompt(
  source: Language,
  target: Language,
  joinedText: string,
  glossaryHint: string
): string {
  return `You are a professional ${source.name} (${source.code}) to ${target.name} (${target.code}) translator. Your goal is to accurately convey the meaning and nuances of the original ${source.name} text while adhering to ${target.name} grammar, vocabulary, and cultural sensitivities.
Produce only the ${target.name} translation, without any additional explanations or commentary.
IMPORTANT: The text contains separator lines "---POLYGLOT_SEP---". Keep each separator exactly as-is in your output. Do NOT translate, remove, or modify the separators.${glossaryHint} Please translate the following ${source.name} text into ${target.name}:


${joinedText}`;
}

/** @internal Split text into chunks at paragraph/sentence boundaries. */
export function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph boundary
    let splitAt = remaining.lastIndexOf("\n\n", maxChars);
    if (splitAt < maxChars * 0.3) {
      // Try sentence boundary
      splitAt = remaining.lastIndexOf(". ", maxChars);
      if (splitAt < maxChars * 0.3) {
        // Try any newline
        splitAt = remaining.lastIndexOf("\n", maxChars);
        if (splitAt < maxChars * 0.3) {
          // Hard split at max
          splitAt = maxChars;
        }
      }
      if (splitAt > 0 && remaining[splitAt] === ".") splitAt += 1; // include the period
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/** Resolve languages and ensure Ollama + model are ready. Returns shared setup. */
async function resolveSetup(
  sourceLang: string,
  targetLang: string,
  options: TranslateOptions
) {
  const source = resolveLanguage(sourceLang);
  if (!source) {
    throw new PolyglotError({
      code: "UNSUPPORTED_LANGUAGE",
      message: `Unsupported source language: "${sourceLang}".`,
      hint: "Use the list_languages tool to see all 55 supported languages.",
      retryable: false,
    });
  }

  const target = resolveLanguage(targetLang);
  if (!target) {
    throw new PolyglotError({
      code: "UNSUPPORTED_LANGUAGE",
      message: `Unsupported target language: "${targetLang}".`,
      hint: "Use the list_languages tool to see all 55 supported languages.",
      retryable: false,
    });
  }

  if (source.code === target.code) {
    throw new PolyglotError({
      code: "SAME_LANGUAGE",
      message: "Source and target languages must be different.",
      hint: "Nothing to translate — source and target are the same.",
      retryable: false,
    });
  }

  const model = options.model ?? DEFAULT_MODEL;
  const client = new OllamaClient(options.ollamaUrl);

  if (!(await client.ensureRunning())) {
    throw new PolyglotError({
      code: "OLLAMA_UNAVAILABLE",
      message: "Could not start Ollama.",
      hint: "Install it from https://ollama.com then try again.",
      retryable: true,
    });
  }

  if (!(await client.ensureModel(model))) {
    throw new PolyglotError({
      code: "MODEL_PULL_FAILED",
      message: `Could not pull model "${model}".`,
      hint: `Run manually: ollama pull ${model}`,
      retryable: true,
    });
  }

  const glossaryEntries: GlossaryEntry[] = [];
  if (options.softwareGlossary !== false) {
    glossaryEntries.push(...SOFTWARE_GLOSSARY);
  }
  if (options.glossary) {
    glossaryEntries.push(...options.glossary);
  }

  return { source, target, model, client, glossaryEntries };
}

/** Translate text using TranslateGemma via Ollama. */
export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
  options: TranslateOptions = {}
): Promise<TranslateResult> {
  const { source, target, model, client, glossaryEntries } = await resolveSetup(
    sourceLang,
    targetLang,
    options
  );

  const chunks = chunkText(text.trim(), getChunkSize(model));
  const start = Date.now();
  const translations: string[] = [];
  const warnings: string[] = [];
  const useStream = !!options.onToken;

  for (const chunk of chunks) {
    const glossaryHint = buildGlossaryHint(chunk, target.code, glossaryEntries);
    const prompt = buildPrompt(source, target, chunk, glossaryHint);

    let response;
    if (useStream) {
      response = await client.generateStream(
        { model, prompt, options: { temperature: options.temperature ?? 0.1 } },
        options.onToken!
      );
    } else {
      response = await client.generate({
        model,
        prompt,
        options: { temperature: options.temperature ?? 0.1 },
      });
    }

    let translated = response.response.trim();
    if (options.polish !== false) {
      translated = polish(translated);
    }

    // Validate
    if (options.validate !== false) {
      try {
        const validation = validateTranslation(chunk, translated, sourceLang, targetLang);
        warnings.push(...validation.warnings);
      } catch {
        warnings.push(`Chunk translation returned empty output — using source text.`);
        translated = chunk;
      }
    }

    translations.push(translated);
  }

  return {
    translation: translations.join("\n\n"),
    sourceLanguage: source,
    targetLanguage: target,
    model,
    chunks: chunks.length,
    durationMs: Date.now() - start,
    warnings,
  };
}

/**
 * Translate multiple text segments in as few Ollama calls as possible.
 * Joins segments with a separator, translates in batches, splits results back.
 * Falls back to individual translation if the model mangles the separators.
 */
export async function translateBatch(
  items: BatchItem[],
  sourceLang: string,
  targetLang: string,
  options: TranslateBatchOptions = {}
): Promise<TranslateBatchResult> {
  if (items.length === 0) {
    return { translations: [], model: options.model ?? DEFAULT_MODEL, ollamaCalls: 0, durationMs: 0 };
  }

  const { source, target, model, client, glossaryEntries } = await resolveSetup(
    sourceLang,
    targetLang,
    options
  );

  const batchLimit = options.batchCharLimit ?? getChunkSize(model);
  const start = Date.now();
  const results: string[] = new Array(items.length);
  let ollamaCalls = 0;

  // Group items into batches that fit within the char limit
  let batchStart = 0;
  while (batchStart < items.length) {
    const batchItems: { index: number; text: string }[] = [];
    let batchSize = 0;

    for (let i = batchStart; i < items.length; i++) {
      const addedSize = items[i].text.length + (batchItems.length > 0 ? BATCH_SEPARATOR.length : 0);
      if (batchSize + addedSize > batchLimit && batchItems.length > 0) break;
      batchItems.push({ index: i, text: items[i].text });
      batchSize += addedSize;
    }

    if (batchItems.length === 1) {
      // Single item — use normal prompt (no separator overhead)
      const item = batchItems[0];
      const glossaryHint = buildGlossaryHint(item.text, target.code, glossaryEntries);
      const prompt = buildPrompt(source, target, item.text, glossaryHint);
      const response = await client.generate({
        model,
        prompt,
        options: { temperature: options.temperature ?? 0.1 },
      });
      ollamaCalls++;
      let translated = response.response.trim();
      if (options.polish !== false) translated = polish(translated);
      results[item.index] = translated;
    } else {
      // Multiple items — join with separator
      const joinedText = batchItems.map((b) => b.text).join(BATCH_SEPARATOR);
      const glossaryHint = buildGlossaryHint(joinedText, target.code, glossaryEntries);
      const prompt = buildBatchPrompt(source, target, joinedText, glossaryHint);
      const response = await client.generate({
        model,
        prompt,
        options: { temperature: options.temperature ?? 0.1 },
      });
      ollamaCalls++;

      const outputParts = response.response.split(/---POLYGLOT_SEP---/);

      if (outputParts.length === batchItems.length) {
        // Separator count matches — split worked
        for (let j = 0; j < batchItems.length; j++) {
          let translated = outputParts[j].trim();
          if (options.polish !== false) translated = polish(translated);
          results[batchItems[j].index] = translated;
        }
      } else {
        // Fallback: re-translate each item individually
        for (const item of batchItems) {
          const hint = buildGlossaryHint(item.text, target.code, glossaryEntries);
          const fallbackPrompt = buildPrompt(source, target, item.text, hint);
          const fallbackResponse = await client.generate({
            model,
            prompt: fallbackPrompt,
            options: { temperature: options.temperature ?? 0.1 },
          });
          ollamaCalls++;
          let translated = fallbackResponse.response.trim();
          if (options.polish !== false) translated = polish(translated);
          results[item.index] = translated;
        }
      }
    }

    batchStart += batchItems.length;
  }

  return {
    translations: results,
    model,
    ollamaCalls,
    durationMs: Date.now() - start,
  };
}
