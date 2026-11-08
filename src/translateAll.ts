/**
 * Multi-language translation orchestrator.
 *
 * Translates markdown content into multiple languages concurrently,
 * with optional language nav bar injection. This is the engine behind
 * the `translate_all` MCP tool and the `scripts/translate-all.mjs` CLI.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { translateMarkdown, type TranslateMarkdownOptions } from "./translateMarkdown.js";
import { Semaphore } from "./semaphore.js";
import type { ProtectedTermSet } from "./protectedTerms.js";
import type { PinFile } from "./pins.js";
import {
  LostSpanError,
  UntranslatedError,
  type LostSpan,
  type LostSpanPolicy,
  type SegmentFallback,
  type UntranslatedPolicy,
  type UntranslatedSegment,
} from "./survival.js";

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

/** Per-language status values reported by `scripts/translate-all.mjs`. */
export type CliLanguageStatus =
  | "ok"
  | "lost-span"
  | "untranslated"
  | "written-after-error"
  | "written-unverified"
  | "error";

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
  /** Protected-term set (default: the built-in defaults; there is no file path here). */
  terms?: ProtectedTermSet;
  /** Pinned translations, which win over the model (default: none). */
  pins?: PinFile;
  /**
   * "report" (default) lists lost protected spans per language; "fail" turns
   * a language with any into an error.
   */
  onLostSpan?: LostSpanPolicy;
  /**
   * "report" (default) lists prose that came back in English after its retry
   * with each language; "fail" turns a language with any into an error.
   */
  onUntranslated?: UntranslatedPolicy;
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
  /** Protected spans the translation lost (the survival check). */
  lostSpans?: LostSpan[];
  /** Prose lines still English after the segment's retry. */
  untranslated?: UntranslatedSegment[];
  /** Segments that left the plain batch path, with why and whether the retry recovered them. */
  fallbacks?: SegmentFallback[];
  durationMs: number;
}

export interface TranslateAllResult {
  results: TranslateAllLanguageResult[];
  succeeded: number;
  failed: number;
  durationMs: number;
}

// ─── Nav bar builder, structural verifier & checker ──────────────

export interface NavBarCheckResult {
  ok: boolean;
  /** Target language codes whose `README.<file>.md` exists on disk. */
  written: string[];
  /** Target language codes found in the source README's language nav bar. */
  presentInNavBar: string[];
  /** Target language codes whose file was written on disk but are missing from the source README's nav bar. */
  missingFromNavBar: string[];
  /** Named refusal code (`NAV_BAR_INCOMPLETE`) when `ok` is false. */
  refusalCode?: "NAV_BAR_INCOMPLETE";
  /** Human-readable refusal message (`REFUSED: NAV_BAR_INCOMPLETE: ...`) when `ok` is false. */
  why?: string;
}

export interface MarkdownStructure {
  /** Count of ATX headings (`#` .. `######`) outside fenced code blocks and top nav bar. */
  headingCount: number;
  /** Count of fenced code blocks outside top nav bar. */
  codeBlockCount: number;
  /** Raw fenced code blocks (normalized to LF) in document order. */
  codeBlocks: string[];
  /** Whether a fenced code block was left unclosed at EOF. */
  unclosedFence: boolean;
  /** Remaining body text after stripping top nav bar block(s). */
  bodyText: string;
}

export interface WriteReceipt {
  /** Relative path printed on the `POLYGLOT_WRITTEN` line (e.g. `README.ja.md`). */
  path: string;
  /** Lowercase hex SHA-256 of the bytes written by the child. */
  sha256: string;
}

export interface TranslationVerificationResult {
  verified: boolean;
  exists: boolean;
  writtenThisRun: boolean;
  nonEmpty: boolean;
  headingCount: { source: number; candidate: number };
  codeBlockCount: { source: number; candidate: number };
  codeBlocksByteIdentical: boolean;
  failedChecks: string[];
  failed_checks: string[];
  diskSha256?: string;
  receiptSha256?: string | null;
}

const FENCE_OPEN_RE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^#{1,6}\s+\S/;

function isNavBarBlockAt(lines: string[], i: number): boolean {
  if (!/^<p\s+align="center">/.test(lines[i]?.trim() ?? "")) return false;
  for (let j = i; j < Math.min(i + 5, lines.length); j++) {
    if (/href="README\.\w/.test(lines[j]) || /href="README\.md"/.test(lines[j])) {
      return true;
    }
    if (lines[j].includes("</p>")) break;
  }
  return false;
}

function stripLeadingNavBarLines(lines: string[]): string[] {
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    if (isNavBarBlockAt(lines, i)) {
      while (i < lines.length && !lines[i].includes("</p>")) i++;
      i++; // skip the </p> line itself
      continue;
    }
    break;
  }
  return lines.slice(i);
}

/**
 * Parse structural metrics from a README markdown document:
 * ATX heading count (`#` .. `######` outside fenced code blocks) and
 * fenced code blocks (count and exact contents).
 */
export function parseMarkdownStructure(markdown: string): MarkdownStructure {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n");
  const bodyLines = stripLeadingNavBarLines(rawLines);

  const codeBlocks: string[] = [];
  const nonCodeLines: string[] = [];

  let inFence = false;
  let fenceChar = "";
  let fenceMarker = "";
  let currentBlock: string[] = [];

  for (const line of bodyLines) {
    if (!inFence) {
      const m = FENCE_OPEN_RE.exec(line);
      if (m) {
        inFence = true;
        fenceChar = m[2][0];
        fenceMarker = fenceChar.repeat(m[2].length);
        currentBlock = [line];
        nonCodeLines.push("");
        continue;
      }
      nonCodeLines.push(line);
    } else {
      currentBlock.push(line);
      const stripped = line.trim();
      if (stripped.startsWith(fenceMarker) && stripped.replaceAll(fenceChar, "") === "") {
        codeBlocks.push(currentBlock.join("\n"));
        inFence = false;
        fenceChar = "";
        fenceMarker = "";
        currentBlock = [];
      }
    }
  }

  const unclosedFence = inFence && currentBlock.length > 0;
  if (unclosedFence) {
    codeBlocks.push(currentBlock.join("\n"));
  }

  let headingCount = 0;
  for (const line of nonCodeLines) {
    const stripped = line.trim();
    if (HEADING_RE.test(stripped)) {
      headingCount++;
    }
  }

  return {
    headingCount,
    codeBlockCount: codeBlocks.length,
    codeBlocks,
    unclosedFence,
    bodyText: bodyLines.join("\n"),
  };
}

/**
 * Parse the `POLYGLOT_WRITTEN <relative-path> <sha256-of-bytes-written>` line
 * emitted by `scripts/translate-readme.mjs` immediately after writing its file.
 */
export function parseWriteReceipt(stdout: string): WriteReceipt | null {
  const lines = stdout
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.startsWith("POLYGLOT_WRITTEN "));
  if (lines.length === 0) return null;
  const raw = lines[lines.length - 1].slice("POLYGLOT_WRITTEN ".length).trim();
  const lastSpace = raw.lastIndexOf(" ");
  if (lastSpace <= 0) return null;
  const path = raw.slice(0, lastSpace).trim();
  const sha256 = raw.slice(lastSpace + 1).trim().toLowerCase();
  if (!path || !sha256) return null;
  return { path, sha256 };
}

/**
 * Verify that translated markdown is non-empty and structurally whole against
 * the source markdown (same ATX heading count, same fenced code block count,
 * and every fenced code block byte-identical).
 */
export function verifyTranslatedMarkdown(
  sourceMarkdown: string,
  candidateMarkdown: string
): Omit<TranslationVerificationResult, "exists" | "writtenThisRun"> {
  const srcStruct = parseMarkdownStructure(sourceMarkdown);
  const candStruct = parseMarkdownStructure(candidateMarkdown);
  const failedChecks: string[] = [];

  const nonEmpty = candidateMarkdown.trim().length > 0 && candStruct.bodyText.trim().length > 0;
  if (!nonEmpty) {
    failedChecks.push("empty_file");
  }

  if (candStruct.headingCount !== srcStruct.headingCount) {
    failedChecks.push(
      `heading_count_mismatch (expected ${srcStruct.headingCount}, got ${candStruct.headingCount})`
    );
  }

  if (candStruct.codeBlockCount !== srcStruct.codeBlockCount) {
    failedChecks.push(
      `code_block_count_mismatch (expected ${srcStruct.codeBlockCount}, got ${candStruct.codeBlockCount})`
    );
  }

  if (candStruct.unclosedFence !== srcStruct.unclosedFence) {
    failedChecks.push("unclosed_code_block");
  }

  const mismatchIndices: number[] = [];
  const minBlocks = Math.min(srcStruct.codeBlocks.length, candStruct.codeBlocks.length);
  for (let idx = 0; idx < minBlocks; idx++) {
    const srcBytes = Buffer.from(srcStruct.codeBlocks[idx], "utf-8");
    const candBytes = Buffer.from(candStruct.codeBlocks[idx], "utf-8");
    if (!srcBytes.equals(candBytes)) {
      mismatchIndices.push(idx);
    }
  }

  if (mismatchIndices.length > 0) {
    failedChecks.push(`code_block_bytes_mismatch (index ${mismatchIndices.join(", ")})`);
  }

  const codeBlocksByteIdentical =
    candStruct.codeBlockCount === srcStruct.codeBlockCount &&
    candStruct.unclosedFence === srcStruct.unclosedFence &&
    mismatchIndices.length === 0;

  return {
    verified: failedChecks.length === 0,
    nonEmpty,
    headingCount: { source: srcStruct.headingCount, candidate: candStruct.headingCount },
    codeBlockCount: { source: srcStruct.codeBlockCount, candidate: candStruct.codeBlockCount },
    codeBlocksByteIdentical,
    failedChecks,
    failed_checks: failedChecks,
  };
}

/**
 * Verify a written `README.<lang>.md` file on disk against the source `README.md`:
 * must exist, have a `POLYGLOT_WRITTEN` receipt whose SHA-256 equals the current
 * on-disk SHA-256 (written during this run), be non-empty, and be structurally
 * whole against the source.
 */
export function verifyTranslatedFile(
  filePath: string,
  sourceMarkdown: string,
  receipt?: WriteReceipt | string | null
): TranslationVerificationResult {
  if (!existsSync(filePath)) {
    const srcStruct = parseMarkdownStructure(sourceMarkdown);
    const failedChecks = ["missing_file"];
    return {
      verified: false,
      exists: false,
      writtenThisRun: false,
      nonEmpty: false,
      headingCount: { source: srcStruct.headingCount, candidate: 0 },
      codeBlockCount: { source: srcStruct.codeBlockCount, candidate: 0 },
      codeBlocksByteIdentical: false,
      failedChecks,
      failed_checks: failedChecks,
    };
  }

  const diskBytes = readFileSync(filePath);
  const diskSha256 = createHash("sha256").update(diskBytes).digest("hex");
  const rawReceiptSha = typeof receipt === "string" ? receipt : receipt?.sha256;
  const receiptSha256 = rawReceiptSha?.trim().toLowerCase() || null;

  const failedChecks: string[] = [];
  let writtenThisRun = false;
  if (!receiptSha256) {
    failedChecks.push("no_write_receipt");
  } else if (diskSha256 !== receiptSha256) {
    failedChecks.push("receipt_sha_mismatch");
  } else {
    writtenThisRun = true;
  }

  const candidateMarkdown = diskBytes.toString("utf-8");
  const mdRes = verifyTranslatedMarkdown(sourceMarkdown, candidateMarkdown);
  failedChecks.push(...mdRes.failedChecks);

  return {
    ...mdRes,
    exists: true,
    writtenThisRun,
    diskSha256,
    receiptSha256,
    verified: failedChecks.length === 0,
    failedChecks,
    failed_checks: failedChecks,
  };
}

/**
 * Resolve the full set of target language codes (`ALL_LANGUAGES`) that belong in
 * the README language nav bar:
 * 1. Target languages with a verified write receipt from this run (`verifiedThisRunCodes`).
 * 2. Target languages that were already linked in the source README's top nav bar,
 *    were not rejected for a receipt SHA mismatch in this run, and whose
 *    `README.<file>.md` still exists on disk and passes the structure check
 *    (`verifyTranslatedMarkdown`) against the source README.
 */
export function resolveNavBarLangCodes(
  readmeDir: string,
  sourceMarkdown: string,
  verifiedThisRunCodes: Iterable<string>,
  languages: TargetLanguage[] = TRANSLATE_ALL_LANGUAGES,
  rejectedReceiptCodes: Iterable<string> = []
): Set<string> {
  const verifiedSet = new Set(Array.from(verifiedThisRunCodes, (c) => c.toLowerCase()));
  const rejectedSet = new Set(Array.from(rejectedReceiptCodes, (c) => c.toLowerCase()));
  const sourceNavBlock = extractTopNavBarBlock(sourceMarkdown) ?? "";
  const navBarCodes = new Set<string>();

  for (const lang of languages) {
    const codeLower = lang.code.toLowerCase();
    if (verifiedSet.has(codeLower)) {
      navBarCodes.add(lang.code);
      continue;
    }
    if (rejectedSet.has(codeLower)) {
      continue;
    }
    const suffix = lang.file ?? lang.code;
    const expectedHref = `href="README.${suffix}.md"`;
    if (!sourceNavBlock.includes(expectedHref)) {
      continue;
    }
    const filePath = resolve(readmeDir, `README.${suffix}.md`);
    if (!existsSync(filePath)) {
      continue;
    }
    const candidateMarkdown = readFileSync(filePath, "utf-8");
    const mdCheck = verifyTranslatedMarkdown(sourceMarkdown, candidateMarkdown);
    if (mdCheck.verified) {
      navBarCodes.add(lang.code);
    }
  }

  return navBarCodes;
}

/**
 * Extract the first language nav bar `<p align="center">...</p>` block from the
 * top of a markdown document, or `null` if no language nav bar block is present.
 */
export function extractTopNavBarBlock(markdown: string): string | null {
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    if (isNavBarBlockAt(lines, i)) {
      const blockLines: string[] = [];
      while (i < lines.length) {
        blockLines.push(lines[i]);
        if (lines[i].includes("</p>")) break;
        i++;
      }
      return blockLines.join("\n");
    }
    break;
  }
  return null;
}

/**
 * Check that the source README's language nav bar lists every target language
 * whose translated file was written (polyglot-mcp#65).
 *
 * @param sourceMarkdown Full contents of the source `README.md`.
 * @param writtenLangCodes Target language codes (e.g. `["ja", "zh", ...]`) whose `README.<file>.md` was written.
 * @param languages Target language definitions (defaults to `TRANSLATE_ALL_LANGUAGES`).
 */
export function checkSourceNavBar(
  sourceMarkdown: string,
  writtenLangCodes: Iterable<string>,
  languages: TargetLanguage[] = TRANSLATE_ALL_LANGUAGES
): NavBarCheckResult {
  const writtenSet = new Set(Array.from(writtenLangCodes, (c) => c.toLowerCase()));
  const expectedLangs = languages.filter((l) => writtenSet.has(l.code.toLowerCase()));
  const written = expectedLangs.map((l) => l.code);

  const navBlock = extractTopNavBarBlock(sourceMarkdown) ?? "";
  const presentInNavBar: string[] = [];
  const missingFromNavBar: string[] = [];

  for (const lang of expectedLangs) {
    const suffix = lang.file ?? lang.code;
    const expectedHref = `href="README.${suffix}.md"`;
    if (navBlock.includes(expectedHref)) {
      presentInNavBar.push(lang.code);
    } else {
      missingFromNavBar.push(lang.code);
    }
  }

  if (missingFromNavBar.length > 0) {
    return {
      ok: false,
      written,
      presentInNavBar,
      missingFromNavBar,
      refusalCode: "NAV_BAR_INCOMPLETE",
      why: `source README nav bar is missing written target language(s): ${missingFromNavBar.join(", ")}`,
    };
  }

  return {
    ok: true,
    written,
    presentInNavBar,
    missingFromNavBar: [],
  };
}

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
  const rest = stripLeadingNavBarLines(lines);
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
        terms: options.terms,
        pins: options.pins,
        onLostSpan: options.onLostSpan ?? "report",
        onUntranslated: options.onUntranslated ?? "report",
      };

      const result = await translateMarkdown(markdown, sourceLang, lang.code, translateOptions);

      const langResult: TranslateAllLanguageResult = {
        lang: lang.code,
        name: lang.name,
        status: "ok",
        fileSuffix: lang.file ?? lang.code,
        markdown: result.markdown,
        lostSpans: result.lostSpans,
        untranslated: result.untranslated,
        fallbacks: result.fallbacks,
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
        ...(err instanceof LostSpanError ? { lostSpans: err.lostSpans } : {}),
        ...(err instanceof UntranslatedError ? { untranslated: err.untranslated } : {}),
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
