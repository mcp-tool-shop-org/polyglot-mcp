/**
 * Core translation logic — builds prompts, calls Ollama, handles chunking.
 * Includes glossary injection and post-translation polish.
 */

import { OllamaClient } from "./ollama.js";
import { resolveLanguage, type Language } from "./languages.js";
import {
  buildGlossaryHint,
  SOFTWARE_GLOSSARY,
  type GlossaryEntry,
} from "./glossary.js";
import { polish } from "./polish.js";

const DEFAULT_MODEL = "translategemma:12b";
const CHUNK_SIZE = 2000; // characters per chunk (conservative for 2K token context)

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
}

export interface TranslateResult {
  translation: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  model: string;
  chunks: number;
  durationMs: number;
}

/** Build the TranslateGemma prompt — two blank lines before text is critical. */
function buildPrompt(
  source: Language,
  target: Language,
  text: string,
  glossaryHint: string
): string {
  return `You are a professional ${source.name} (${source.code}) to ${target.name} (${target.code}) translator. Your goal is to accurately convey the meaning and nuances of the original ${source.name} text while adhering to ${target.name} grammar, vocabulary, and cultural sensitivities.
Produce only the ${target.name} translation, without any additional explanations or commentary.${glossaryHint} Please translate the following ${source.name} text into ${target.name}:


${text}`;
}

/** Split text into chunks at paragraph/sentence boundaries. */
function chunkText(text: string, maxChars: number): string[] {
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

/** Translate text using TranslateGemma via Ollama. */
export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
  options: TranslateOptions = {}
): Promise<TranslateResult> {
  const source = resolveLanguage(sourceLang);
  if (!source) {
    throw new Error(
      `Unsupported source language: "${sourceLang}". Use list_languages to see supported languages.`
    );
  }

  const target = resolveLanguage(targetLang);
  if (!target) {
    throw new Error(
      `Unsupported target language: "${targetLang}". Use list_languages to see supported languages.`
    );
  }

  if (source.code === target.code) {
    throw new Error("Source and target languages must be different.");
  }

  const model = options.model ?? DEFAULT_MODEL;
  const client = new OllamaClient(options.ollamaUrl);

  // Auto-start Ollama if not running
  if (!(await client.ensureRunning())) {
    throw new Error(
      "Could not start Ollama. Install it from https://ollama.com then try again."
    );
  }

  // Auto-pull model if not present
  if (!(await client.ensureModel(model))) {
    throw new Error(
      `Could not pull model "${model}". Run manually: ollama pull ${model}`
    );
  }

  // Build glossary
  const glossaryEntries: GlossaryEntry[] = [];
  if (options.softwareGlossary !== false) {
    glossaryEntries.push(...SOFTWARE_GLOSSARY);
  }
  if (options.glossary) {
    glossaryEntries.push(...options.glossary);
  }

  const chunks = chunkText(text.trim(), CHUNK_SIZE);
  const start = Date.now();
  const translations: string[] = [];

  for (const chunk of chunks) {
    const glossaryHint = buildGlossaryHint(chunk, target.code, glossaryEntries);
    const prompt = buildPrompt(source, target, chunk, glossaryHint);
    const response = await client.generate({
      model,
      prompt,
      options: {
        temperature: options.temperature ?? 0.1,
      },
    });

    let translated = response.response.trim();
    if (options.polish !== false) {
      translated = polish(translated);
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
  };
}
