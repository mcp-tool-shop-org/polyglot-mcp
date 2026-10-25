#!/usr/bin/env node

/**
 * CLI wrapper — translate a README using the core translateMarkdown engine.
 *
 * Usage: node scripts/translate-readme.mjs <readme-path> <target-lang-code> [options]
 *
 * --fast                      Use translategemma:2b for speed (lower quality)
 * --no-cache                  Skip the segment-level cache
 * --cache-clear               Clear this language's cached translations before translating
 * --on-lost-span=fail|report  When a protected span is missing from the translation:
 *                             fail (default) writes the file, lists the spans and exits 2;
 *                             report writes the file, lists the spans and exits 0
 * --on-untranslated=fail|report
 *                             When a prose line (6 or more words) comes back identical to
 *                             the English after its one retry: fail (default) writes the
 *                             file, lists the lines and exits 3; report writes the file,
 *                             lists the lines and exits 0
 *
 * Protected terms come from .polyglot-terms.json and pinned hand fixes from
 * .polyglot-pins.json, both beside the README.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { translateMarkdown } from "../dist/translateMarkdown.js";
import {
  LostSpanError,
  UntranslatedError,
  formatFallbacks,
  formatLostSpans,
  formatUntranslated,
  parseLostSpanPolicy,
  parseUntranslatedPolicy,
} from "../dist/survival.js";

/** Exit code for a run that translated but lost protected spans under --on-lost-span=fail. */
const EXIT_LOST_SPAN = 2;

/** Exit code for a run that translated but left prose in English under --on-untranslated=fail. */
const EXIT_UNTRANSLATED = 3;

// --- Parse args ---
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flagList = process.argv.slice(2).filter((a) => a.startsWith("--"));
const flags = new Set(flagList);
const [readmePath, targetCode] = args;

if (!readmePath || !targetCode) {
  console.error(
    "Usage: node scripts/translate-readme.mjs <readme> <lang-code> [--fast] [--no-cache] [--cache-clear] [--on-lost-span=fail|report] [--on-untranslated=fail|report]"
  );
  process.exit(1);
}

let onLostSpan;
let onUntranslated;
try {
  onLostSpan = parseLostSpanPolicy(flagList.find((f) => f.startsWith("--on-lost-span="))?.split("=")[1], "fail");
  onUntranslated = parseUntranslatedPolicy(
    flagList.find((f) => f.startsWith("--on-untranslated="))?.split("=")[1],
    "fail",
  );
} catch (err) {
  console.error(err.toUserString?.() ?? String(err));
  process.exit(1);
}

const useFast = flags.has("--fast");
const useCache = !flags.has("--no-cache");
const doCacheClear = flags.has("--cache-clear");
const model = useFast ? "translategemma:2b" : (process.env.POLYGLOT_MODEL || "translategemma:27b");
const absReadmePath = resolve(readmePath);

const readme = readFileSync(absReadmePath, "utf-8");
console.log(
  `Translating ${readmePath} → ${targetCode}${useFast ? " [fast mode]" : ""}`
);

const start = Date.now();

let result;
let lostSpanError;
let untranslatedError;
try {
  result = await translateMarkdown(readme, "en", targetCode, {
    model,
    cache: useCache,
    cacheClear: doCacheClear,
    filePath: absReadmePath,
    onLostSpan,
    onUntranslated,
    onProgress: (completed, total) => {
      const pct = Math.round((completed / total) * 100);
      process.stderr.write(`\r  PROGRESS:${completed}/${total} (${pct}%) segments`);
    },
  });
} catch (err) {
  // Still write the file: a person fixes it by hand and pins the fix.
  if (err instanceof LostSpanError && err.result) {
    lostSpanError = err;
    result = err.result;
  } else if (err instanceof UntranslatedError && err.result) {
    untranslatedError = err;
    result = err.result;
  } else {
    throw err;
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log(
  `\n${result.segments} translatable segments (${result.cached} cached${result.fuzzyMatched > 0 ? `, ${result.fuzzyMatched} fuzzy` : ""}${result.pinned > 0 ? `, ${result.pinned} pinned` : ""}, ${result.translated} to translate${result.deduplicated > 0 ? `, ${result.deduplicated} deduplicated` : ""})`
);
console.log(`${result.ollamaCalls} Ollama call(s) for ${result.translated} unique segments`);
if (result.fallbacks.length > 0) {
  const retried = result.fallbacks.filter((f) => f.retried);
  console.log(
    `${result.fallbacks.length} segment(s) left the plain batch path; ${result.retries} re-sent on their own, ${retried.filter((f) => f.recovered).length} translated by the retry`,
  );
  for (const line of formatFallbacks(result.fallbacks)) console.log(`  - ${line}`);
  console.log(`POLYGLOT_FALLBACKS ${JSON.stringify(result.fallbacks)}`);
}

if (result.warnings.length > 0) {
  console.warn(`\n⚠ ${result.warnings.length} warning(s):`);
  for (const w of result.warnings) {
    console.warn(`  - ${w}`);
  }
}

console.log(`\nDone! ${result.segments} segments in ${elapsed}s`);

// Write output
const ext = targetCode.toLowerCase();
const outPath = readmePath.replace(/README\.md$/, `README.${ext}.md`);
writeFileSync(outPath, result.markdown, "utf-8");
console.log(`Written to: ${outPath}`);

// The survival check's list: language, segment, missing span. One machine-
// readable line for translate-all.mjs, then the same list for a person.
if (result.lostSpans.length > 0) {
  console.log(`POLYGLOT_LOST_SPANS ${JSON.stringify(result.lostSpans)}`);
  console.error(`\n✗ ${result.lostSpans.length} protected span(s) lost (--on-lost-span=${onLostSpan}):`);
  for (const line of formatLostSpans(result.lostSpans)) console.error(`  - ${line}`);
  if (lostSpanError) {
    console.error(`\n${lostSpanError.hint}`);
  }
}

// The untranslated-prose list: a machine-readable line, then the list for a person.
const untranslatedFailed = onUntranslated === "fail" && result.untranslated.length > 0;
if (result.untranslated.length > 0) {
  console.log(`POLYGLOT_UNTRANSLATED ${JSON.stringify(result.untranslated)}`);
  console.error(`\n${untranslatedFailed ? "✗" : "⚠"} ${result.untranslated.length} prose line(s) came back in English (--on-untranslated=${onUntranslated}):`);
  for (const line of formatUntranslated(result.untranslated)) console.error(`  - ${line}`);
  if (untranslatedError) console.error(`\n${untranslatedError.hint}`);
}

if (lostSpanError) process.exit(EXIT_LOST_SPAN);
if (untranslatedFailed) process.exit(EXIT_UNTRANSLATED);
