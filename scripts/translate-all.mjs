#!/usr/bin/env node

/**
 * Translate a README.md into all 7 supported languages.
 * Handles the pt → pt-BR rename and language nav bar injection automatically.
 *
 * Usage: node scripts/translate-all.mjs <readme-path> [options]
 *
 * --fast            Use translategemma:2b for speed (lower quality)
 * --no-cache        Skip the segment-level cache
 * --cache-clear     Clear the cached translations of each language before translating it
 * --concurrency=N   Run N languages in parallel (default 2, max 3)
 * --langs=ja,zh,... Translate only the specified comma-separated target languages
 * --timeout=S       Per-language child timeout in seconds (default 900)
 * --no-nav-bar      Skip language nav bar injection
 * --on-lost-span=fail|report
 *                   When a protected span (inline code, a protected term, an
 *                   "N of M" count) is missing from a translation: fail
 *                   (default — this runs before releases) writes the files,
 *                   lists language, segment and missing span, and exits 1;
 *                   report writes the files and the list and exits 0
 * --on-untranslated=fail|report
 *                   When a prose line (6 or more words) comes back identical to
 *                   the English even after its one retry: fail (default) writes
 *                   the files, marks the language "untranslated", lists the
 *                   lines and exits 1; report writes the files and the list and
 *                   exits 0
 */

import { spawn } from "node:child_process";
import { existsSync, renameSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LostSpanError,
  UntranslatedError,
  formatFallbacks,
  formatLostSpans,
  formatUntranslated,
  parseLostSpanPolicy,
  parseUntranslatedPolicy,
} from "../dist/survival.js";
import { checkSourceNavBar, verifyTranslatedFile } from "../dist/translateAll.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const translateScript = resolve(__dirname, "translate-readme.mjs");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [readmePath] = args;

if (!readmePath) {
  console.error("Usage: node scripts/translate-all.mjs <readme-path> [--fast] [--no-cache] [--cache-clear] [--concurrency=N] [--langs=ja,zh,...] [--timeout=S] [--no-nav-bar] [--on-lost-span=fail|report] [--on-untranslated=fail|report]");
  process.exit(1);
}

let onLostSpan;
let onUntranslated;
try {
  onLostSpan = parseLostSpanPolicy(flags.find((f) => f.startsWith("--on-lost-span="))?.split("=")[1], "fail");
  onUntranslated = parseUntranslatedPolicy(flags.find((f) => f.startsWith("--on-untranslated="))?.split("=")[1], "fail");
} catch (err) {
  console.error(err.toUserString?.() ?? String(err));
  process.exit(1);
}

/** translate-readme.mjs exits with this when it wrote a file that lost protected spans. */
const EXIT_LOST_SPAN = 2;

/** translate-readme.mjs exits with this when it wrote a file that left prose in English. */
const EXIT_UNTRANSLATED = 3;

const absReadmePath = resolve(readmePath);
if (!existsSync(absReadmePath)) {
  console.error(`File not found: ${absReadmePath}`);
  process.exit(1);
}

const ALL_LANGUAGES = [
  { code: "ja", name: "Japanese", label: "日本語" },
  { code: "zh", name: "Chinese (Simplified)", label: "中文" },
  { code: "es", name: "Spanish", label: "Español" },
  { code: "fr", name: "French", label: "Français" },
  { code: "hi", name: "Hindi", label: "हिन्दी" },
  { code: "it", name: "Italian", label: "Italiano" },
  { code: "pt", name: "Portuguese", label: "Português (BR)", file: "pt-BR" },
];

// Optional --langs=ja,zh,... filter (defaults to all 7 targets in ALL_LANGUAGES)
const langsFlag = flags.find((f) => f.startsWith("--langs="));
let LANGUAGES = ALL_LANGUAGES;
if (langsFlag) {
  const requested = langsFlag
    .slice("--langs=".length)
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const requestedSet = new Set(requested);
  const unknown = requested.filter((c) => !ALL_LANGUAGES.some((l) => l.code === c || (l.file && l.file.toLowerCase() === c)));
  if (unknown.length > 0 || requested.length === 0) {
    console.error(`Unsupported or empty --langs value: ${langsFlag} (supported: ${ALL_LANGUAGES.map((l) => l.code).join(",")})`);
    process.exit(1);
  }
  LANGUAGES = ALL_LANGUAGES.filter((l) => requestedSet.has(l.code) || (l.file && requestedSet.has(l.file.toLowerCase())));
}

// Parse --concurrency=N flag (default 2, max 3)
const concurrencyFlag = flags.find((f) => f.startsWith("--concurrency="));
const concurrency = Math.min(3, Math.max(1, parseInt(concurrencyFlag?.split("=")[1] ?? "2", 10)));
const noNavBar = flags.includes("--no-nav-bar");

// Parse --timeout=S flag or POLYGLOT_TIMEOUT_MS env var (default 900s = 900_000ms)
const DEFAULT_CHILD_TIMEOUT_MS = 900_000;
const timeoutFlag = flags.find((f) => f.startsWith("--timeout="));
const rawTimeoutMs = timeoutFlag
  ? Number(timeoutFlag.slice("--timeout=".length)) * 1000
  : process.env.POLYGLOT_TIMEOUT_MS
    ? Number(process.env.POLYGLOT_TIMEOUT_MS)
    : DEFAULT_CHILD_TIMEOUT_MS;
const childTimeoutMs = Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0 ? rawTimeoutMs : DEFAULT_CHILD_TIMEOUT_MS;
const timeoutLabel = childTimeoutMs % 1000 === 0 ? `${childTimeoutMs / 1000}s` : `${childTimeoutMs}ms`;

const readmeDir = dirname(absReadmePath);
const sourceMarkdown = readFileSync(absReadmePath, "utf-8");

// Record run start mtime floor above any pre-existing README.<lang>.md files so
// stale files from earlier runs are never counted as written during this run.
let maxPreExistingMtimeMs = 0;
for (const lang of ALL_LANGUAGES) {
  for (const candidate of [`README.${lang.file ?? lang.code}.md`, `README.${lang.code}.md`]) {
    const p = resolve(readmeDir, candidate);
    if (existsSync(p)) {
      const mtimeMs = statSync(p).mtimeMs;
      if (mtimeMs > maxPreExistingMtimeMs) maxPreExistingMtimeMs = mtimeMs;
    }
  }
}
const runStartMs = Math.max(Date.now(), maxPreExistingMtimeMs + 1);
await new Promise((r) => setTimeout(r, 10));

const results = [];
const totalStart = Date.now();
let failed = 0;
let completed = 0;

const passFlags = [
  ...flags.filter(
    (f) =>
      !f.startsWith("--concurrency") &&
      !f.startsWith("--langs=") &&
      !f.startsWith("--timeout=") &&
      f !== "--no-nav-bar" &&
      !f.startsWith("--on-lost-span") &&
      !f.startsWith("--on-untranslated"),
  ),
  `--on-lost-span=${onLostSpan}`,
  `--on-untranslated=${onUntranslated}`,
];

/** Every language's lost spans, from the children's POLYGLOT_LOST_SPANS lines. */
const lostSpans = [];

/** Every language's untranslated prose lines, from the children's POLYGLOT_UNTRANSLATED lines. */
const untranslatedLines = [];

/** Every language's segments that left the plain batch path, from POLYGLOT_FALLBACKS lines. */
const fallbacks = [];

console.log(`Translating ${basename(absReadmePath)} → ${LANGUAGES.length} languages (concurrency=${concurrency})\n`);

const spinner = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
let spinIdx = 0;

/** Per-language segment tracking: { code: { done, total } } */
const segProgress = {};

/** Render a progress bar to stderr with segment-level detail. */
function renderProgress() {
  const elapsed = ((Date.now() - totalStart) / 1000).toFixed(0);
  const tick = completed < LANGUAGES.length ? spinner[spinIdx++ % spinner.length] : "✓";

  // Build per-language status: "ja 12/40  zh 3/40"
  const active = Object.entries(segProgress)
    .map(([code, v]) => v.total > 0 ? `${code} ${v.done}/${v.total}` : `${code} starting…`)
    .join("  ");
  const doneMsg = completed < LANGUAGES.length ? (active || "loading model…") : "done!";

  process.stderr.write(`\r  ${tick} ${completed}/${LANGUAGES.length} langs done | ${doneMsg} | ${elapsed}s  `);
}

renderProgress();
const progressInterval = setInterval(renderProgress, 500);

/** Translate a single language using spawn for streaming progress. */
async function translateLang(lang) {
  const langStart = Date.now();
  segProgress[lang.code] = { done: 0, total: 0 };

  return new Promise((resolve_) => {
    const child = spawn("node", [translateScript, absReadmePath, lang.code, ...passFlags], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill(); }, childTimeoutMs);

    // Read the child's stdout: it carries the lost-span list, and an unread
    // pipe can fill and stall the child.
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      // Parse segment progress lines: "  PROGRESS:12/40"
      const match = text.match(/PROGRESS:(\d+)\/(\d+)/);
      if (match) {
        segProgress[lang.code] = { done: parseInt(match[1]), total: parseInt(match[2]) };
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const elapsed = ((Date.now() - langStart) / 1000).toFixed(1);
      delete segProgress[lang.code];

      // Ensure README.pt.md written during this run is renamed to README.pt-BR.md
      // even if the child later timed out or exited non-zero.
      if (lang.code === "pt") {
        const ptPath = resolve(readmeDir, "README.pt.md");
        const ptBrPath = resolve(readmeDir, "README.pt-BR.md");
        if (existsSync(ptPath) && statSync(ptPath).mtimeMs >= runStartMs) {
          renameSync(ptPath, ptBrPath);
        }
      }

      const lost = stdout
        .split("\n")
        .filter((line) => line.startsWith("POLYGLOT_LOST_SPANS "))
        .flatMap((line) => JSON.parse(line.slice("POLYGLOT_LOST_SPANS ".length)));
      lostSpans.push(...lost);

      const parseLines = (prefix) =>
        stdout
          .split("\n")
          .filter((line) => line.startsWith(prefix))
          .flatMap((line) => JSON.parse(line.slice(prefix.length)));
      const untranslated = parseLines("POLYGLOT_UNTRANSLATED ");
      const langFallbacks = parseLines("POLYGLOT_FALLBACKS ");
      untranslatedLines.push(...untranslated);
      fallbacks.push(...langFallbacks);

      if ((code === 0 || code === EXIT_LOST_SPAN || code === EXIT_UNTRANSLATED) && !killed) {
        // Exit 2: the file was written but lost protected spans (--on-lost-span=fail).
        // Exit 3: the file was written but prose came back in English (--on-untranslated=fail).
        const result = finishLang(lang, langStart);
        if (code === EXIT_UNTRANSLATED) result.status = "untranslated";
        if (code === EXIT_LOST_SPAN) result.status = "lost-span";
        if (lost.length > 0) result.lostSpans = lost.length;
        if (untranslated.length > 0) result.untranslated = untranslated.length;
        if (langFallbacks.length > 0) {
          result.fallbacks = langFallbacks.length;
          result.retried = langFallbacks.filter((f) => f.retried).length;
          result.recovered = langFallbacks.filter((f) => f.retried && f.recovered).length;
        }
        completed++;
        renderProgress();
        const mark = code === 0 ? "✓" : "✗";
        const notes = [];
        if (lost.length > 0) notes.push(`${lost.length} protected span(s) lost`);
        if (untranslated.length > 0) notes.push(`${untranslated.length} prose line(s) untranslated`);
        if (langFallbacks.length > 0) notes.push(`${langFallbacks.length} fallback(s), ${result.retried} retried`);
        const note = notes.length > 0 ? ` — ${notes.join("; ")}` : "";
        process.stderr.write(`\n  ${mark} ${lang.name} — ${result.time}s${note}\n`);
        resolve_(result);
      } else {
        completed++;
        renderProgress();
        const reason = killed ? `timeout (${timeoutLabel})` : `exit code ${code}`;
        process.stderr.write(`\n  ✗ ${lang.name} — FAILED after ${elapsed}s (${reason})\n`);
        resolve_({
          lang: lang.code,
          name: lang.name,
          status: "error",
          time: elapsed,
          file: `README.${lang.file ?? lang.code}.md`,
          error: reason,
        });
      }
    });
  });
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

// Run translations in parallel batches with semaphore
for (let i = 0; i < LANGUAGES.length; i += concurrency) {
  const batch = LANGUAGES.slice(i, i + concurrency);
  const batchResults = await Promise.all(batch.map((lang) => translateLang(lang)));
  for (const r of batchResults) {
    results.push(r);
  }
}

// Verify every target language's README.<lang>.md on disk (polyglot-mcp#65).
// Build the nav bar from verified written files, not from clean child exits.
const verifiedLangCodes = new Set();
for (const r of results) {
  const lang = LANGUAGES.find((l) => l.code === r.lang);
  const expectedFile = `README.${lang?.file ?? r.lang}.md`;
  const filePath = resolve(readmeDir, expectedFile);
  if (!existsSync(filePath)) {
    if (r.status !== "error") {
      r.status = "error";
      r.error = r.error ?? "missing output file";
    }
    continue;
  }
  const verification = verifyTranslatedFile(filePath, sourceMarkdown, runStartMs);
  r.file = expectedFile;
  if (verification.verified) {
    verifiedLangCodes.add(r.lang);
    if (r.status === "error") {
      r.status = "written-after-error";
    }
  } else {
    r.status = "written-unverified";
    r.failedChecks = verification.failedChecks;
    r.verificationError = verification.failedChecks.join("; ");
  }
}

failed = results.filter(
  (r) => r.status === "error" || r.status === "written-after-error" || r.status === "written-unverified",
).length;

// --- Inject language nav bar into all READMEs from verified written files ---
if (!noNavBar) {
  const verifiedLangs = LANGUAGES.filter((lang) => verifiedLangCodes.has(lang.code));
  if (verifiedLangs.length > 0) {
    // Build nav bar HTML
    const links = verifiedLangs.map((lang) => {
      const file = `README.${lang.file ?? lang.code}.md`;
      return `<a href="${file}">${lang.label}</a>`;
    });

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
        // The source README must list English too. LANGUAGES holds only the
        // translation targets, so without this the English README's nav bar
        // starts at the first target language and reads as though the page
        // were in that language. Translated files get English by swapping
        // out their own self-link (see the else branch); the source has no
        // self-link to swap, so it is prepended explicitly.
        thisNav = `<p align="center">
  <a href="README.md">English</a> | ${links.join(" | ")}
</p>`;
      } else {
        const thisFile = basename(filePath);
        const thisLinks = verifiedLangs.map((lang) => {
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

    // Inject into each verified translated README
    for (const lang of verifiedLangs) {
      const translatedPath = resolve(readmeDir, `README.${lang.file ?? lang.code}.md`);
      injectNavBar(translatedPath, false);
    }

    console.log(`\nInjected language nav bar into ${verifiedLangs.length + 1} READMEs`);
  }
}

// Backstop: check that the source README's language nav bar lists every target
// language whose file was written and verified (polyglot-mcp#65).
let navBarCheck = { ok: true, written: [], presentInNavBar: [], missingFromNavBar: [] };
if (!noNavBar) {
  navBarCheck = checkSourceNavBar(readFileSync(absReadmePath, "utf-8"), verifiedLangCodes, LANGUAGES);
}

clearInterval(progressInterval);
renderProgress();
process.stderr.write("\n");
const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);

const writtenAfterErrorResults = results.filter((r) => r.status === "written-after-error");
const unverifiedResults = results.filter((r) => r.status === "written-unverified");

// Emit structured summary
console.log("");
console.log("=".repeat(60));
console.log("POLYGLOT_COMPLETE");
console.log("=".repeat(60));
// Under --on-lost-span=fail any lost span fails the run, in the repo's
// structured error shape (code, message, hint, retryable).
const lostSpanFailure = onLostSpan === "fail" && lostSpans.length > 0 ? new LostSpanError(lostSpans) : undefined;
// Likewise any prose line left in English fails the run under --on-untranslated=fail.
const untranslatedFailure =
  onUntranslated === "fail" && untranslatedLines.length > 0 ? new UntranslatedError(untranslatedLines) : undefined;
console.log(JSON.stringify({
  polyglot: "complete",
  readme: absReadmePath,
  languages: results.length,
  // A language marked "untranslated", "written-after-error", or "written-unverified" is not a clean success.
  succeeded: results.filter((r) => r.status === "ok" || r.status === "lost-span").length,
  untranslatedLanguages: results.filter((r) => r.status === "untranslated").length,
  writtenAfterError: writtenAfterErrorResults.map((r) => r.lang),
  writtenUnverified: unverifiedResults.map((r) => ({
    lang: r.lang,
    file: r.file,
    failedChecks: r.failedChecks,
  })),
  failed,
  totalTime: `${totalElapsed}s`,
  onLostSpan,
  lostSpans,
  onUntranslated,
  untranslated: untranslatedLines,
  fallbacks,
  navBarCheck,
  ...(lostSpanFailure ? { error: lostSpanFailure.toMcpResult() } : {}),
  ...(!lostSpanFailure && untranslatedFailure ? { error: untranslatedFailure.toMcpResult() } : {}),
  results,
}, null, 2));
console.log("=".repeat(60));

if (!navBarCheck.ok) {
  console.error(`\nREFUSED: ${navBarCheck.refusalCode}: ${navBarCheck.why}`);
}

if (writtenAfterErrorResults.length > 0) {
  console.error(
    `\n⚠ ${writtenAfterErrorResults.length} language(s) wrote a verified file before failing (status: written-after-error, included in nav bar):`,
  );
  for (const r of writtenAfterErrorResults) {
    console.error(`  - ${r.lang} (${r.name}, ${r.file}): ${r.error}`);
  }
}

if (unverifiedResults.length > 0) {
  console.error(
    `\n✗ ${unverifiedResults.length} language(s) wrote an unverified file (status: written-unverified, excluded from nav bar):`,
  );
  for (const r of unverifiedResults) {
    console.error(`  - ${r.lang} (${r.name}, ${r.file}): ${r.failedChecks.join("; ")}`);
  }
}

if (lostSpans.length > 0) {
  console.error(`\n${lostSpanFailure ? "✗" : "⚠"} ${lostSpans.length} protected span(s) lost (--on-lost-span=${onLostSpan}):`);
  for (const line of formatLostSpans(lostSpans)) console.error(`  - ${line}`);
  if (lostSpanFailure) console.error(`\n${lostSpanFailure.hint}`);
}

if (untranslatedLines.length > 0) {
  console.error(`\n${untranslatedFailure ? "✗" : "⚠"} ${untranslatedLines.length} prose line(s) came back in English (--on-untranslated=${onUntranslated}):`);
  for (const line of formatUntranslated(untranslatedLines)) console.error(`  - ${line}`);
  if (untranslatedFailure) console.error(`\n${untranslatedFailure.hint}`);
}

if (fallbacks.length > 0) {
  const retried = fallbacks.filter((f) => f.retried);
  console.error(
    `\n${fallbacks.length} segment(s) left the plain batch path; ${retried.length} retried on their own, ${retried.filter((f) => f.recovered).length} translated by the retry:`,
  );
  for (const line of formatFallbacks(fallbacks)) console.error(`  - ${line}`);
}

process.exit(failed > 0 || !navBarCheck.ok || lostSpanFailure || untranslatedFailure ? 1 : 0);
