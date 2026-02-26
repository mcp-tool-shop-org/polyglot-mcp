#!/usr/bin/env node

/**
 * Translate a README.md into all 7 supported languages.
 * Handles the pt → pt-BR rename and language nav bar injection automatically.
 *
 * Usage: node scripts/translate-all.mjs <readme-path> [options]
 *
 * --fast            Use translategemma:2b for speed (lower quality)
 * --no-cache        Skip the segment-level cache
 * --cache-clear     Clear all cached translations before translating
 * --concurrency=N   Run N languages in parallel (default 1, max 3)
 * --no-nav-bar      Skip language nav bar injection
 */

import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import { existsSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const translateScript = resolve(__dirname, "translate-readme.mjs");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [readmePath] = args;

if (!readmePath) {
  console.error("Usage: node scripts/translate-all.mjs <readme-path> [--fast] [--no-cache] [--cache-clear] [--concurrency=N] [--no-nav-bar]");
  process.exit(1);
}

const absReadmePath = resolve(readmePath);
if (!existsSync(absReadmePath)) {
  console.error(`File not found: ${absReadmePath}`);
  process.exit(1);
}

const LANGUAGES = [
  { code: "ja", name: "Japanese", label: "日本語" },
  { code: "zh", name: "Chinese (Simplified)", label: "中文" },
  { code: "es", name: "Spanish", label: "Español" },
  { code: "fr", name: "French", label: "Français" },
  { code: "hi", name: "Hindi", label: "हिन्दी" },
  { code: "it", name: "Italian", label: "Italiano" },
  { code: "pt", name: "Portuguese", label: "Português (BR)", file: "pt-BR" },
];

// Parse --concurrency=N flag (default 1 = sequential, max 3)
const concurrencyFlag = flags.find((f) => f.startsWith("--concurrency="));
const concurrency = Math.min(3, Math.max(1, parseInt(concurrencyFlag?.split("=")[1] ?? "1", 10)));
const noNavBar = flags.includes("--no-nav-bar");

const readmeDir = dirname(absReadmePath);
const results = [];
const totalStart = Date.now();
let failed = 0;

const passFlags = flags.filter((f) => !f.startsWith("--concurrency") && f !== "--no-nav-bar");

/** Translate a single language (sync). Returns a result object. */
function translateLangSync(lang) {
  const langStart = Date.now();
  try {
    execFileSync("node", [translateScript, absReadmePath, lang.code, ...passFlags], {
      stdio: "inherit",
      timeout: 300_000,
    });
    return finishLang(lang, langStart);
  } catch (err) {
    const elapsed = ((Date.now() - langStart) / 1000).toFixed(1);
    return { lang: lang.code, name: lang.name, status: "error", time: elapsed, error: err.message };
  }
}

/** Translate a single language (async). Returns a result object. */
async function translateLangAsync(lang) {
  const langStart = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync("node", [translateScript, absReadmePath, lang.code, ...passFlags], {
      timeout: 300_000,
    });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return finishLang(lang, langStart);
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    const elapsed = ((Date.now() - langStart) / 1000).toFixed(1);
    return { lang: lang.code, name: lang.name, status: "error", time: elapsed, error: err.message };
  }
}

/** Common post-translation handling (rename, result). */
function finishLang(lang, langStart) {
  const elapsed = ((Date.now() - langStart) / 1000).toFixed(1);
  let outputFile = `README.${lang.file ?? lang.code}.md`;
  if (lang.code === "pt") {
    const ptPath = resolve(readmeDir, "README.pt.md");
    const ptBrPath = resolve(readmeDir, "README.pt-BR.md");
    if (existsSync(ptPath)) {
      renameSync(ptPath, ptBrPath);
      outputFile = "README.pt-BR.md";
    }
  }
  return { lang: lang.code, name: lang.name, status: "ok", time: elapsed, file: outputFile };
}

// Run translations with concurrency
if (concurrency <= 1) {
  // Sequential (original behavior, uses inherit stdio for live progress)
  for (const lang of LANGUAGES) {
    const result = translateLangSync(lang);
    results.push(result);
    if (result.status === "error") failed++;
  }
} else {
  // Parallel batches (output buffered per language)
  console.log(`Running with concurrency=${concurrency}`);
  for (let i = 0; i < LANGUAGES.length; i += concurrency) {
    const batch = LANGUAGES.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((lang) => translateLangAsync(lang)));
    for (const r of batchResults) {
      results.push(r);
      if (r.status === "error") failed++;
    }
  }
}

// --- Inject language nav bar into all READMEs ---
if (!noNavBar) {
  const succeeded = results.filter((r) => r.status === "ok");
  if (succeeded.length > 0) {
    // Build nav bar HTML
    const links = LANGUAGES
      .filter((lang) => results.some((r) => r.lang === lang.code && r.status === "ok"))
      .map((lang) => {
        const file = `README.${lang.file ?? lang.code}.md`;
        return `<a href="${file}">${lang.label}</a>`;
      });
    const navBar = `<p align="center">\n  ${links.join(" | ")}\n</p>`;

    /**
     * Check if a block starting at line index i is a language nav bar.
     * Nav bars are <p align="center"> blocks containing <a href="README.*.md"> links.
     */
    function isNavBarBlock(lines, i) {
      if (!/^<p\s+align="center">/.test(lines[i]?.trim())) return false;
      // Look ahead within the block for README links
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        if (/href="README\.\w/.test(lines[j]) || /href="README\.md"/.test(lines[j])) return true;
        if (lines[j].includes("</p>")) break;
      }
      return false;
    }

    /**
     * Strip all language nav bar blocks from the top of a file.
     * Returns content with nav bars removed (and any trailing blank lines between them).
     */
    function stripNavBars(lines) {
      let i = 0;
      while (i < lines.length) {
        // Skip blank lines between blocks
        if (lines[i].trim() === "") { i++; continue; }
        // If it's a nav bar block, skip past its </p>
        if (isNavBarBlock(lines, i)) {
          while (i < lines.length && !lines[i].includes("</p>")) i++;
          i++; // skip the </p> line
          continue;
        }
        break; // hit non-nav-bar content
      }
      return lines.slice(i);
    }

    /**
     * Inject the nav bar at line 1 of a README, replacing any existing nav bars.
     * For translated READMEs, swaps self-link with "English" link.
     */
    function injectNavBar(filePath, isSource = false) {
      if (!existsSync(filePath)) return;
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      // Build the nav bar for this file
      let thisNav;
      if (isSource) {
        thisNav = navBar;
      } else {
        const thisFile = basename(filePath);
        const thisLinks = LANGUAGES
          .filter((lang) => results.some((r) => r.lang === lang.code && r.status === "ok"))
          .map((lang) => {
            const file = `README.${lang.file ?? lang.code}.md`;
            if (file === thisFile) return `<a href="README.md">English</a>`;
            return `<a href="${file}">${lang.label}</a>`;
          });
        thisNav = `<p align="center">\n  ${thisLinks.join(" | ")}\n</p>`;
      }

      // Strip any existing nav bars from the top, then prepend the new one
      const rest = stripNavBars(lines);
      const newContent = thisNav + "\n\n" + rest.join("\n");
      writeFileSync(filePath, newContent, "utf-8");
    }

    // Inject into source README
    injectNavBar(absReadmePath, true);

    // Inject into each translated README
    for (const r of succeeded) {
      const translatedPath = resolve(readmeDir, r.file);
      injectNavBar(translatedPath, false);
    }

    console.log(`\nInjected language nav bar into ${succeeded.length + 1} READMEs`);
  }
}

const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);

// Emit structured summary
console.log("");
console.log("=".repeat(60));
console.log("POLYGLOT_COMPLETE");
console.log("=".repeat(60));
console.log(JSON.stringify({
  polyglot: "complete",
  readme: absReadmePath,
  languages: results.length,
  succeeded: results.length - failed,
  failed,
  totalTime: `${totalElapsed}s`,
  results,
}, null, 2));
console.log("=".repeat(60));

process.exit(failed > 0 ? 1 : 0);
