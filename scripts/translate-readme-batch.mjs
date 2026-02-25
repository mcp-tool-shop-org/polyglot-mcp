#!/usr/bin/env node

/**
 * Translate a README.md to multiple languages in parallel.
 * Uses segment batching and caching for maximum speed.
 *
 * Usage:
 *   node scripts/translate-readme-batch.mjs <readme-path> <lang1> [lang2] [lang3] ...
 *   node scripts/translate-readme-batch.mjs <readme-path> --all [--fast] [--no-cache] [--concurrency N]
 *
 * --all          Translate to all 7 default languages (ja zh es fr hi it pt)
 * --fast         Use translategemma:12b for speed (lower quality)
 * --no-cache     Skip the segment-level cache
 * --concurrency  Max parallel languages (default: 3)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { translateBatch } from "../dist/translate.js";
import { resolveLanguage } from "../dist/languages.js";
import {
  loadCache,
  saveCache,
  cacheKey,
  getCached,
  setCached,
  createCache,
} from "../dist/cache.js";

const ALL_LANGUAGES = ["ja", "zh", "es", "fr", "hi", "it", "pt"];

// --- Parse args ---
const rawArgs = process.argv.slice(2);
const flags = new Set();
let concurrency = 3;
const positional = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--concurrency" && rawArgs[i + 1]) {
    concurrency = parseInt(rawArgs[++i], 10) || 3;
  } else if (rawArgs[i].startsWith("--")) {
    flags.add(rawArgs[i]);
  } else {
    positional.push(rawArgs[i]);
  }
}

const readmePath = positional[0];
const useFast = flags.has("--fast");
const useCache = !flags.has("--no-cache");
const useAll = flags.has("--all");
const model = useFast ? "translategemma:12b" : "translategemma:27b";

if (!readmePath) {
  console.error(
    "Usage: node scripts/translate-readme-batch.mjs <readme> <lang1> [lang2] ... [--all] [--fast] [--no-cache]"
  );
  process.exit(1);
}

const targetCodes = useAll ? ALL_LANGUAGES : positional.slice(1);
if (targetCodes.length === 0) {
  console.error("No target languages specified. Use --all or provide language codes.");
  process.exit(1);
}

// Validate all languages upfront
const targets = targetCodes.map((code) => {
  const lang = resolveLanguage(code);
  if (!lang) {
    console.error(`Unsupported language: ${code}`);
    process.exit(1);
  }
  return lang;
});

const absReadmePath = resolve(readmePath);
const readme = readFileSync(absReadmePath, "utf-8");

// --- Segmentation (same as translate-readme.mjs) ---

function segmentReadme(md) {
  const segments = [];
  let i = 0;
  const lines = md.split("\n");

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const block = [line];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      if (i < lines.length) block.push(lines[i++]);
      segments.push({ type: "protected", text: block.join("\n") });
      continue;
    }

    if (/^<p[^>]*><strong>[^<]+<\/strong><\/p>/.test(line.trim())) {
      segments.push({ type: "html-tagline", text: line });
      i++;
      continue;
    }

    if (/^<[a-z]/.test(line.trim())) {
      const block = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== "" && !/^(---|##)/.test(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      segments.push({ type: "protected", text: block.join("\n") });
      continue;
    }

    if (/^---\s*$/.test(line)) {
      segments.push({ type: "protected", text: line });
      i++;
      continue;
    }

    if (line.trim() === "") {
      segments.push({ type: "protected", text: "" });
      i++;
      continue;
    }

    if (/^\|/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      segments.push({ type: "table", text: tableLines.join("\n") });
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const match = line.match(/^(#{1,6}\s+)(.*)/);
      segments.push({ type: "heading", prefix: match[1], text: match[2] });
      i++;
      continue;
    }

    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(```|<[a-z]|---|#{1,6}\s|\|)/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length > 0) {
      segments.push({ type: "text", text: para.join("\n") });
    }
  }

  return segments;
}

function cleanTranslation(text, isHeading = false) {
  const orPatterns = [
    /\nまたは\n.*/s, /\n또는\n.*/s, /\no\n[A-Z].*/s, /\nou\n.*/s,
    /\noder\n.*/s, /\nили\n.*/s, /\nया\n.*/s, /\nveya\n.*/s,
    /\nหรือ\n.*/s, /\nhoặc\n.*/s,
  ];
  let cleaned = text;
  for (const pat of orPatterns) cleaned = cleaned.replace(pat, "");
  if (isHeading) cleaned = cleaned.replace(/[。．.]\s*$/, "");
  return cleaned.trim();
}

function isTranslatableCell(trimmed) {
  if (/^`[^`]+`$/.test(trimmed)) return false;
  if (/^@\w+\//.test(trimmed)) return false;
  if (/^\*\*[A-Z]/.test(trimmed) && trimmed.length < 30) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^\[.*\]\(.*\)$/.test(trimmed)) return false;
  if (trimmed.length <= 5) return false;
  return true;
}

function parseTable(tableText) {
  const rows = tableText.split("\n");
  const parsed = [];
  const translatableCells = [];

  for (const row of rows) {
    if (/^\|[\s-:|]+\|$/.test(row)) {
      parsed.push({ type: "separator", raw: row });
      continue;
    }
    const cells = row.split("|").slice(1, -1);
    const cellData = cells.map((cell, c) => {
      const trimmed = cell.trim();
      if (isTranslatableCell(trimmed)) {
        translatableCells.push({ rowIdx: parsed.length, cellIdx: c, text: trimmed });
        return { translatable: true, original: cell };
      }
      return { translatable: false, original: cell };
    });
    parsed.push({ type: "data", cells: cellData });
  }

  return { parsed, translatableCells };
}

function reassembleTable(parsed, translatedMap) {
  const rows = [];
  for (const row of parsed) {
    if (row.type === "separator") { rows.push(row.raw); continue; }
    const cells = row.cells.map((c, idx) => {
      const key = `${parsed.indexOf(row)}:${idx}`;
      if (c.translatable && translatedMap.has(key)) return ` ${translatedMap.get(key)} `;
      return c.original;
    });
    rows.push("|" + cells.join("|") + "|");
  }
  return rows.join("\n");
}

// --- Translate a single language ---

async function translateLanguage(segments, targetCode, cache) {
  // Collect translatable items
  const batchItems = [];

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    if (seg.type === "protected") continue;

    if (seg.type === "html-tagline") {
      const match = seg.text.match(/^(.+<strong>)([^<]+)(<\/strong>.+)$/);
      if (match) {
        const key = cacheKey(match[2], targetCode, model);
        const cached = getCached(cache, key);
        batchItems.push({ segIndex: s, kind: "text", text: match[2], cacheHit: cached });
      }
      continue;
    }

    if (seg.type === "heading") {
      const key = cacheKey(seg.text, targetCode, model);
      const cached = getCached(cache, key);
      batchItems.push({ segIndex: s, kind: "heading", text: seg.text, cacheHit: cached });
      continue;
    }

    if (seg.type === "text") {
      if (/^`[^`]+`$/.test(seg.text.trim())) continue;
      const key = cacheKey(seg.text, targetCode, model);
      const cached = getCached(cache, key);
      batchItems.push({ segIndex: s, kind: "text", text: seg.text, cacheHit: cached });
      continue;
    }

    if (seg.type === "table") {
      const { parsed, translatableCells } = parseTable(seg.text);
      seg[`_parsed_${targetCode}`] = parsed;
      for (const cell of translatableCells) {
        const key = cacheKey(cell.text, targetCode, model);
        const cached = getCached(cache, key);
        const tableKey = `${cell.rowIdx}:${cell.cellIdx}`;
        batchItems.push({ segIndex: s, kind: "cell", text: cell.text, cacheHit: cached, tableKey });
      }
      continue;
    }
  }

  const misses = batchItems.filter((b) => !b.cacheHit);
  const cacheHits = batchItems.length - misses.length;

  // Translate misses
  let translations = [];
  let ollamaCalls = 0;
  if (misses.length > 0) {
    const items = misses.map((m) => ({ text: m.text, kind: m.kind }));
    const result = await translateBatch(items, "en", targetCode, { model });
    translations = result.translations;
    ollamaCalls = result.ollamaCalls;

    for (let i = 0; i < misses.length; i++) {
      const key = cacheKey(misses[i].text, targetCode, model);
      setCached(cache, key, translations[i], model);
    }
  }

  // Build translation maps
  const translationMap = new Map();
  const tableTranslationMaps = new Map();
  let missIdx = 0;

  for (const item of batchItems) {
    let translated = item.cacheHit ?? translations[missIdx++];
    const cleaned = item.kind === "heading"
      ? cleanTranslation(translated, true)
      : cleanTranslation(translated);

    if (item.tableKey !== undefined) {
      if (!tableTranslationMaps.has(item.segIndex)) {
        tableTranslationMaps.set(item.segIndex, new Map());
      }
      tableTranslationMaps.get(item.segIndex).set(item.tableKey, cleaned);
    } else {
      translationMap.set(item.segIndex, cleaned);
    }
  }

  // Assemble output
  const output = [];
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    if (seg.type === "protected") { output.push(seg.text); continue; }
    if (seg.type === "html-tagline") {
      const match = seg.text.match(/^(.+<strong>)([^<]+)(<\/strong>.+)$/);
      output.push(match && translationMap.has(s) ? match[1] + translationMap.get(s) + match[3] : seg.text);
      continue;
    }
    if (seg.type === "heading") {
      output.push(translationMap.has(s) ? seg.prefix + translationMap.get(s) : seg.prefix + seg.text);
      continue;
    }
    if (seg.type === "text") {
      output.push(translationMap.has(s) ? translationMap.get(s) : seg.text);
      continue;
    }
    if (seg.type === "table") {
      const tMap = tableTranslationMaps.get(s) ?? new Map();
      const parsed = seg[`_parsed_${targetCode}`];
      output.push(parsed ? reassembleTable(parsed, tMap) : seg.text);
      continue;
    }
  }

  return { content: output.join("\n"), cacheHits, misses: misses.length, ollamaCalls };
}

// --- Concurrency limiter ---

async function pMap(items, fn, limit) {
  const results = new Array(items.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// --- Main ---

async function main() {
  const langNames = targets.map((t) => t.name).join(", ");
  console.log(
    `Translating ${readmePath} → ${targets.length} languages: ${langNames}${useFast ? " [fast]" : ""}`
  );
  console.log(`Concurrency: ${concurrency} | Cache: ${useCache ? "on" : "off"} | Model: ${model}`);
  const start = Date.now();

  const cache = useCache ? loadCache(absReadmePath) : createCache();
  const segments = segmentReadme(readme);

  const results = await pMap(
    targetCodes,
    async (code) => {
      const langStart = Date.now();
      const target = resolveLanguage(code);
      const result = await translateLanguage(segments, code, cache);
      const elapsed = ((Date.now() - langStart) / 1000).toFixed(1);

      const ext = code.toLowerCase();
      const outPath = readmePath.replace(/README\.md$/, `README.${ext}.md`);
      writeFileSync(outPath, result.content, "utf-8");

      console.log(
        `  ${target.name} (${code}): ${result.misses} translated, ${result.cacheHits} cached, ${result.ollamaCalls} calls — ${elapsed}s → ${outPath}`
      );
      return result;
    },
    concurrency
  );

  const totalElapsed = ((Date.now() - start) / 1000).toFixed(1);
  const totalSegments = results.reduce((sum, r) => sum + r.misses + r.cacheHits, 0);
  const totalCalls = results.reduce((sum, r) => sum + r.ollamaCalls, 0);
  console.log(
    `\nDone! ${targets.length} languages, ${totalSegments} segments, ${totalCalls} Ollama calls in ${totalElapsed}s`
  );

  if (useCache) {
    saveCache(absReadmePath, cache);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
