/**
 * File-based README translation — the disk-writing layer over translateAll.
 *
 * Reads a source README.md, translates it into the target languages, writes the
 * README.<suffix>.md files to disk, and refreshes the language nav bar in both
 * the source and the translated files. Returns a STATUS SUMMARY (per-language
 * ok/fail, timings, files written) — never the translated content. This is the
 * in-process equivalent of scripts/translate-all.mjs, so it ships in dist/ and
 * is reachable from the MCP server.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import {
  translateAll,
  buildNavBar,
  injectNavBar,
  TRANSLATE_ALL_LANGUAGES,
} from "./translateAll.js";
import { DEFAULT_MODEL } from "./translate.js";
import { loadProtectedTerms } from "./protectedTerms.js";
import { loadPins } from "./pins.js";
import type { LostSpan, LostSpanPolicy } from "./survival.js";

export interface TranslateReadmeOptions {
  /** Source language code (default: "en"). */
  sourceLang?: string;
  /** Subset of target language codes (default: all 7). */
  targetLangs?: string[];
  /** Ollama model override (e.g. "translategemma:27b"). */
  model?: string;
  /** Max concurrent language translations (default: 2). */
  concurrency?: number;
  /** Inject/refresh the language nav bar in source + translated READMEs (default: true). */
  navBar?: boolean;
  /** Progress callback — fired after each language completes. */
  onProgress?: (completed: number, total: number, lang: string) => void;
  /**
   * "report" (default) writes every translation and lists lost protected
   * spans; "fail" leaves a language with any lost span unwritten, as an error.
   */
  onLostSpan?: LostSpanPolicy;
}

export interface TranslateReadmeLanguageResult {
  lang: string;
  name: string;
  status: "ok" | "error";
  /** Output filename for this language (e.g. "README.ja.md"). */
  file: string;
  durationMs: number;
  error?: string;
  /** Protected spans this language's translation lost (the survival check). */
  lostSpans?: LostSpan[];
}

export interface TranslateReadmeResult {
  /** Absolute path of the source README that was translated. */
  readme: string;
  /** Model actually used. */
  model: string;
  /** Number of target languages attempted. */
  languages: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  /** Filenames written to disk (successes only). */
  outputFiles: string[];
  /** Whether the source README's nav bar was (re)written. */
  sourceNavBarUpdated: boolean;
  /** Every language's lost protected spans, in language order. */
  lostSpans: LostSpan[];
  results: TranslateReadmeLanguageResult[];
}

/** Resolve which TRANSLATE_ALL_LANGUAGES entries a targetLangs filter selects. */
function resolveTargets(targetLangs?: string[]) {
  if (!targetLangs || targetLangs.length === 0) return TRANSLATE_ALL_LANGUAGES;
  const codes = new Set(targetLangs.map((c) => c.toLowerCase()));
  return TRANSLATE_ALL_LANGUAGES.filter((l) => codes.has(l.code));
}

/**
 * Translate a README FILE into the target languages and write the results to disk.
 *
 * Writes README.<suffix>.md siblings of the source (only for languages that
 * succeed) and refreshes the source README's nav bar to link every successful
 * translation. Returns a status summary; the translated bytes stay on disk.
 */
export async function translateReadme(
  readmePath: string,
  options: TranslateReadmeOptions = {}
): Promise<TranslateReadmeResult> {
  const absPath = resolve(readmePath);
  const dir = dirname(absPath);
  const markdown = await readFile(absPath, "utf-8");

  // The repository's protected terms and pinned hand fixes sit beside the README.
  const all = await translateAll(markdown, {
    sourceLang: options.sourceLang,
    targetLangs: options.targetLangs,
    model: options.model,
    concurrency: options.concurrency,
    navBar: options.navBar,
    onProgress: options.onProgress,
    terms: loadProtectedTerms(absPath),
    pins: loadPins(absPath),
    onLostSpan: options.onLostSpan ?? "report",
  });

  // Write each successful translation to disk; record every language's outcome.
  const results: TranslateReadmeLanguageResult[] = [];
  const outputFiles: string[] = [];
  for (const r of all.results) {
    const file = `README.${r.fileSuffix}.md`;
    if (r.status === "ok" && r.markdown !== undefined) {
      await writeFile(resolve(dir, file), r.markdown, "utf-8");
      outputFiles.push(file);
    }
    results.push({
      lang: r.lang,
      name: r.name,
      status: r.status,
      file,
      durationMs: r.durationMs,
      error: r.error,
      ...(r.lostSpans && r.lostSpans.length > 0 ? { lostSpans: r.lostSpans } : {}),
    });
  }

  // Refresh the source README's nav bar (links to every successful translation).
  const addNavBar = options.navBar !== false;
  let sourceNavBarUpdated = false;
  if (addNavBar && all.succeeded > 0) {
    const targets = resolveTargets(options.targetLangs);
    const succeededCodes = new Set(
      all.results.filter((r) => r.status === "ok").map((r) => r.lang)
    );
    const newSource = injectNavBar(markdown, buildNavBar(targets, succeededCodes));
    if (newSource !== markdown) {
      await writeFile(absPath, newSource, "utf-8");
      sourceNavBarUpdated = true;
    }
  }

  return {
    readme: absPath,
    model: options.model ?? DEFAULT_MODEL,
    languages: all.results.length,
    succeeded: all.succeeded,
    failed: all.failed,
    durationMs: all.durationMs,
    outputFiles,
    sourceNavBarUpdated,
    lostSpans: results.flatMap((r) => r.lostSpans ?? []),
    results,
  };
}
