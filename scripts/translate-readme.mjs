#!/usr/bin/env node

/**
 * CLI wrapper — translate a README using the core translateMarkdown engine.
 *
 * Usage: node scripts/translate-readme.mjs <readme-path> <target-lang-code> [options]
 *
 * --fast        Use translategemma:2b for speed (lower quality)
 * --no-cache    Skip the segment-level cache
 * --cache-clear Clear all cached translations before translating
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { translateMarkdown } from "../dist/translateMarkdown.js";

// --- Parse args ---
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const [readmePath, targetCode] = args;

if (!readmePath || !targetCode) {
  console.error(
    "Usage: node scripts/translate-readme.mjs <readme> <lang-code> [--fast] [--no-cache] [--cache-clear]"
  );
  process.exit(1);
}

const useFast = flags.has("--fast");
const useCache = !flags.has("--no-cache");
const doCacheClear = flags.has("--cache-clear");
const model = useFast ? "translategemma:2b" : "translategemma:12b";
const absReadmePath = resolve(readmePath);

const readme = readFileSync(absReadmePath, "utf-8");
console.log(
  `Translating ${readmePath} → ${targetCode}${useFast ? " [fast mode]" : ""}`
);

const start = Date.now();

const result = await translateMarkdown(readme, "en", targetCode, {
  model,
  cache: useCache,
  cacheClear: doCacheClear,
  filePath: absReadmePath,
  onProgress: (completed, total) => {
    process.stdout.write(".");
  },
});

const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log(
  `\n${result.segments} translatable segments (${result.cached} cached, ${result.translated} to translate${result.deduplicated > 0 ? `, ${result.deduplicated} deduplicated` : ""})`
);
console.log(`${result.ollamaCalls} Ollama call(s) for ${result.translated} unique segments`);

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
