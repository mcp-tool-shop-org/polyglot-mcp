#!/usr/bin/env node

/**
 * Pin hand fixes so the next translation run keeps them.
 *
 * Usage: node scripts/pin-translation.mjs <readme-path> <lang-code> <corrected-file> [options]
 *
 *   node scripts/pin-translation.mjs README.md hi README.hi.md
 *
 * Pairs each segment of the English README with its text in the corrected
 * translation, and writes a pin to .polyglot-pins.json (beside the README) for
 * every segment whose text differs from what the cache would produce. A pin
 * beats the cache and the model on every later run, --cache-clear included.
 *
 * --model=NAME        Model whose cache entries to compare with
 *                     (default: $POLYGLOT_MODEL or translategemma:27b, as translate-readme.mjs)
 * --fast              Compare with translategemma:2b's entries
 * --include-uncached  Also pin segments the cache has no translation for
 * --dry-run           List the pins without writing them
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pinCorrections } from "../dist/pinCorrections.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [readmePath, lang, correctedPath] = args;

if (!readmePath || !lang || !correctedPath) {
  console.error(
    "Usage: node scripts/pin-translation.mjs <readme> <lang-code> <corrected-file> [--model=NAME] [--fast] [--include-uncached] [--dry-run]"
  );
  process.exit(1);
}

const modelFlag = flags.find((f) => f.startsWith("--model="))?.split("=").slice(1).join("=");
const model = modelFlag || (flags.includes("--fast") ? "translategemma:2b" : (process.env.POLYGLOT_MODEL || "translategemma:27b"));

try {
  const corrected = readFileSync(resolve(correctedPath), "utf-8");
  const result = pinCorrections(resolve(readmePath), lang, corrected, {
    model,
    includeUncached: flags.includes("--include-uncached"),
    dryRun: flags.includes("--dry-run"),
  });

  for (const p of result.pinned) {
    console.log(`  📌 [${lang}] "${p.segment}"\n      → ${p.translation.replace(/\n/g, "\n        ")}`);
  }
  console.log(
    `\n${result.pinned.length} pinned, ${result.unchanged} unchanged, ${result.uncached} with no cached translation` +
      `${result.uncached > 0 && !flags.includes("--include-uncached") ? " (left alone; --include-uncached pins them)" : ""}`
  );
  if (result.written) console.log(`Written to: ${result.pinsPath}`);
  else if (result.pinned.length > 0) console.log(`Dry run: ${result.pinsPath} not written.`);
} catch (err) {
  console.error(err?.toUserString?.() ?? (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}
