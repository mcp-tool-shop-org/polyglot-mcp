/**
 * Multi-language translation orchestrator.
 *
 * Translates markdown content into multiple languages concurrently,
 * with optional language nav bar injection. This is the engine behind
 * the `translate_all` MCP tool and the `scripts/translate-all.mjs` CLI.
 */

import { translateMarkdown, type TranslateMarkdownOptions } from "./translateMarkdown.js";
import { Semaphore } from "./semaphore.js";

// ─── Language definitions ─────────────────────────────────────────

export interface TargetLanguage {
  code: string;
  name: string;
  label: string;
  /** Override output file suffix (e.g. "pt-BR" instead of "pt"). */
  file?: string;
}

/** Default set of translation targets — matches scripts/translate-all.mjs. */
export const TRANSLATE_ALL_LANGUAGES: TargetLanguage[] = [
  { code: "ja", name: "Japanese", label: "日本語" },
  { code: "zh", name: "Chinese (Simplified)", label: "中文" },
  { code: "es", name: "Spanish", label: "Español" },
  { code: "fr", name: "French", label: "Français" },
  { code: "hi", name: "Hindi", label: "हिन्दी" },
  { code: "it", name: "Italian", label: "Italiano" },
  { code: "pt", name: "Portuguese", label: "Português (BR)", file: "pt-BR" },
];

// ─── Types ────────────────────────────────────────────────────────

export interface TranslateAllOptions {
  /** Source language code (default: "en"). */
  sourceLang?: string;
  /** Subset of target language codes to translate. Defaults to all 7. */
  targetLangs?: string[];
  /** Ollama model override. */
  model?: string;
  /** Max concurrent language translations (default: 2). */
  concurrency?: number;
  /** Inject a language nav bar at the top of each output. */
  navBar?: boolean;
  /** Progress callback — called after each language completes. */
  onProgress?: (completed: number, total: number, lang: string) => void;
}

export interface TranslateAllLanguageResult {
  lang: string;
  name: string;
  status: "ok" | "error";
  /** Output filename suffix (e.g. "ja", "pt-BR"). */
  fileSuffix: string;
  /** Translated markdown content (undefined on error). */
  markdown?: string;
  /** Error message (undefined on success). */
  error?: string;
  durationMs: number;
}

export interface TranslateAllResult {
  results: TranslateAllLanguageResult[];
  succeeded: number;
  failed: number;
  durationMs: number;
}

// ─── Nav bar builder ──────────────────────────────────────────────

/**
 * Build a language nav bar HTML block.
 * For translated READMEs, replaces the self-link with "English" pointing to README.md.
 */
export function buildNavBar(
  languages: TargetLanguage[],
  succeeded: Set<string>,
  currentLangCode?: string
): string {
  const links = languages
    .filter((lang) => succeeded.has(lang.code))
    .map((lang) => {
      const file = `README.${lang.file ?? lang.code}.md`;
      if (lang.code === currentLangCode) {
        return `<a href="README.md">English</a>`;
      }
      return `<a href="${file}">${lang.label}</a>`;
    });
  return `<p align="center">\n  ${links.join(" | ")}\n</p>`;
}

/**
 * Inject a nav bar at the top of markdown content, replacing any existing nav bars.
 */
export function injectNavBar(markdown: string, navBar: string): string {
  const lines = markdown.split("\n");

  // Strip existing nav bars from the top
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === "") { i++; continue; }
    if (/^<p\s+align="center">/.test(lines[i].trim())) {
      // Check if this is a nav bar block
      let isNav = false;
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        if (/href="README\.\w/.test(lines[j]) || /href="README\.md"/.test(lines[j])) {
          isNav = true;
          break;
        }
        if (lines[j].includes("</p>")) break;
      }
      if (isNav) {
        while (i < lines.length && !lines[i].includes("</p>")) i++;
        i++; // skip the </p> line itself
        continue;
      }
    }
    break;
  }

  const rest = lines.slice(i);
  return navBar + "\n\n" + rest.join("\n");
}

// ─── Core orchestrator ────────────────────────────────────────────

/**
 * Translate markdown content into multiple languages concurrently.
 *
 * Returns translated content for each language — the caller is responsible
 * for writing files to disk (the MCP tool returns content, doesn't write files).
 */
export async function translateAll(
  markdown: string,
  options: TranslateAllOptions = {}
): Promise<TranslateAllResult> {
  const sourceLang = options.sourceLang ?? "en";
  const concurrency = Math.min(3, Math.max(1, options.concurrency ?? 2));
  const addNavBar = options.navBar !== false;

  // Resolve target languages
  let targets = TRANSLATE_ALL_LANGUAGES;
  if (options.targetLangs && options.targetLangs.length > 0) {
    const codes = new Set(options.targetLangs.map((c) => c.toLowerCase()));
    targets = TRANSLATE_ALL_LANGUAGES.filter((l) => codes.has(l.code));
  }

  const start = Date.now();
  const results: TranslateAllLanguageResult[] = [];
  let completed = 0;

  const sem = new Semaphore(concurrency);

  // Translate all languages with semaphore-limited concurrency
  const promises = targets.map(async (lang) => {
    const release = await sem.acquire();
    const langStart = Date.now();
    try {
      const translateOptions: TranslateMarkdownOptions = {
        model: options.model,
        cache: false, // no file-based cache in MCP tool mode
      };

      const result = await translateMarkdown(markdown, sourceLang, lang.code, translateOptions);

      const langResult: TranslateAllLanguageResult = {
        lang: lang.code,
        name: lang.name,
        status: "ok",
        fileSuffix: lang.file ?? lang.code,
        markdown: result.markdown,
        durationMs: Date.now() - langStart,
      };

      results.push(langResult);
      completed++;
      options.onProgress?.(completed, targets.length, lang.name);
      return langResult;
    } catch (err) {
      const langResult: TranslateAllLanguageResult = {
        lang: lang.code,
        name: lang.name,
        status: "error",
        fileSuffix: lang.file ?? lang.code,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - langStart,
      };

      results.push(langResult);
      completed++;
      options.onProgress?.(completed, targets.length, lang.name);
      return langResult;
    } finally {
      release();
    }
  });

  await Promise.all(promises);

  // Sort results to match language order
  const langOrder = new Map(targets.map((l, i) => [l.code, i]));
  results.sort((a, b) => (langOrder.get(a.lang) ?? 0) - (langOrder.get(b.lang) ?? 0));

  // Inject nav bars if requested
  if (addNavBar) {
    const succeededCodes = new Set(results.filter((r) => r.status === "ok").map((r) => r.lang));
    if (succeededCodes.size > 0) {
      for (const r of results) {
        if (r.status === "ok" && r.markdown) {
          const nav = buildNavBar(targets, succeededCodes, r.lang);
          r.markdown = injectNavBar(r.markdown, nav);
        }
      }
    }
  }

  const succeeded = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "error").length;

  return {
    results,
    succeeded,
    failed,
    durationMs: Date.now() - start,
  };
}
