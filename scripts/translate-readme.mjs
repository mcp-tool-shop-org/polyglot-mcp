#!/usr/bin/env node

/**
 * Translate a README.md using polyglot-mcp's translate engine.
 * Preserves code blocks, HTML, URLs, package names, and ASCII art.
 *
 * Usage: node scripts/translate-readme.mjs <readme-path> <target-lang-code> [--fast] [--no-cache] [--cache-clear]
 *
 * --fast        Use translategemma:2b for speed (lower quality)
 * --no-cache    Skip the segment-level cache
 * --cache-clear Clear all cached translations before translating
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
  clearCache,
  pruneCache,
} from "../dist/cache.js";

// --- Parse args ---
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const [readmePath, targetCode] = args;

if (!readmePath || !targetCode) {
  console.error(
    "Usage: node scripts/translate-readme.mjs <readme> <lang-code> [--fast] [--no-cache]"
  );
  process.exit(1);
}

const target = resolveLanguage(targetCode);
if (!target) {
  console.error(`Unsupported language: ${targetCode}`);
  process.exit(1);
}

const useFast = flags.has("--fast");
const useCache = !flags.has("--no-cache");
const doCacheClear = flags.has("--cache-clear");
const model = useFast ? "translategemma:2b" : "translategemma:12b";
const absReadmePath = resolve(readmePath);
const readme = readFileSync(absReadmePath, "utf-8");

// --- Segmentation ---

function segmentReadme(md) {
  const segments = [];
  let i = 0;
  const lines = md.split("\n");

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — protect entire block
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

    // HTML tagline like <p><strong>text</strong></p> — translate the inner text
    if (/^<p[^>]*><strong>[^<]+<\/strong><\/p>/.test(line.trim())) {
      segments.push({ type: "html-tagline", text: line });
      i++;
      continue;
    }

    // HTML block (badges, images, etc.) — protect
    if (/^<[a-z]/.test(line.trim())) {
      const block = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^(---|##)/.test(lines[i])
      ) {
        block.push(lines[i]);
        i++;
      }
      segments.push({ type: "protected", text: block.join("\n") });
      continue;
    }

    // Horizontal rule — protect
    if (/^---\s*$/.test(line)) {
      segments.push({ type: "protected", text: line });
      i++;
      continue;
    }

    // Empty line — protect
    if (line.trim() === "") {
      segments.push({ type: "protected", text: "" });
      i++;
      continue;
    }

    // Table — translate cell contents but preserve structure
    if (/^\|/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      segments.push({ type: "table", text: tableLines.join("\n") });
      continue;
    }

    // Heading — translate text, preserve ## prefix
    if (/^#{1,6}\s/.test(line)) {
      const match = line.match(/^(#{1,6}\s+)(.*)/);
      segments.push({
        type: "heading",
        prefix: match[1],
        text: match[2],
      });
      i++;
      continue;
    }

    // Regular text — collect consecutive lines as a paragraph
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

/**
 * Clean up common TranslateGemma quirks:
 * - "Translation A\nまたは\nTranslation B" → keep only first option
 * - Trailing periods on short text (headings)
 */
function cleanTranslation(text, isHeading = false) {
  const orPatterns = [
    /\nまたは\n.*/s,
    /\n또는\n.*/s,
    /\no\n[A-Z].*/s,
    /\nou\n.*/s,
    /\noder\n.*/s,
    /\nили\n.*/s,
    /\nया\n.*/s,
    /\nveya\n.*/s,
    /\nหรือ\n.*/s,
    /\nhoặc\n.*/s,
  ];
  let cleaned = text;
  for (const pat of orPatterns) {
    cleaned = cleaned.replace(pat, "");
  }
  if (isHeading) {
    cleaned = cleaned.replace(/[。．.]\s*$/, "");
  }
  return cleaned.trim();
}

/** Check if a table cell should be translated. */
function isTranslatableCell(trimmed) {
  // Single backtick term: `Read`
  if (/^`[^`]+`$/.test(trimmed)) return false;
  // Multiple backtick terms: `Read`, `WebFetch`, `WebSearch`
  if (/^(`[^`]+`[,\s]*)+$/.test(trimmed)) return false;
  // Scoped package name
  if (/^@\w+\//.test(trimmed)) return false;
  // Bold short label: **intake**
  if (/^\*\*[A-Za-z]/.test(trimmed) && trimmed.length < 30) return false;
  // Pure number
  if (/^\d+$/.test(trimmed)) return false;
  // Markdown link
  if (/^\[.*\]\(.*\)$/.test(trimmed)) return false;
  // Em dash alone
  if (trimmed === "—" || trimmed === "-") return false;
  // Too short to be meaningful prose (2 chars or less)
  if (trimmed.length <= 2) return false;
  return true;
}

/** Parse table into rows/cells and identify translatable cells. */
function parseTable(tableText) {
  const rows = tableText.split("\n");
  const parsed = [];
  const translatableCells = []; // { rowIdx, cellIdx, text }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
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

/** Reassemble table from parsed data with translated cells. */
function reassembleTable(parsed, translatedMap) {
  const rows = [];
  for (const row of parsed) {
    if (row.type === "separator") {
      rows.push(row.raw);
      continue;
    }
    const cells = row.cells.map((c, idx) => {
      const key = `${parsed.indexOf(row)}:${idx}`;
      if (c.translatable && translatedMap.has(key)) {
        return ` ${translatedMap.get(key)} `;
      }
      return c.original;
    });
    rows.push("|" + cells.join("|") + "|");
  }
  return rows.join("\n");
}

async function main() {
  console.log(
    `Translating ${readmePath} → ${target.name} (${target.code})${useFast ? " [fast mode]" : ""}`
  );
  const start = Date.now();

  const cache = useCache ? loadCache(absReadmePath) : createCache();

  // Handle --cache-clear: wipe all entries, save, and continue with fresh cache
  if (doCacheClear && useCache) {
    const cleared = clearCache(cache);
    saveCache(absReadmePath, cache);
    if (cleared > 0) console.log(`Cleared ${cleared} cached entries`);
  } else if (useCache) {
    // Prune expired entries (30-day TTL)
    const pruned = pruneCache(cache);
    if (pruned > 0) console.log(`Pruned ${pruned} expired cache entries`);
  }

  const segments = segmentReadme(readme);
  const output = [];

  // Collect all translatable items for batching
  const batchItems = []; // { segIndex, kind, text, cacheHit?, tableKey? }

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];

    if (seg.type === "protected") {
      continue; // nothing to translate
    }

    if (seg.type === "html-tagline") {
      const match = seg.text.match(/^(.+<strong>)([^<]+)(<\/strong>.+)$/);
      if (match) {
        const key = cacheKey(match[2], targetCode, model);
        const cached = getCached(cache, key);
        if (cached) {
          batchItems.push({ segIndex: s, kind: "text", text: match[2], cacheHit: cached });
        } else {
          batchItems.push({ segIndex: s, kind: "text", text: match[2] });
        }
      }
      continue;
    }

    if (seg.type === "heading") {
      const key = cacheKey(seg.text, targetCode, model);
      const cached = getCached(cache, key);
      if (cached) {
        batchItems.push({ segIndex: s, kind: "heading", text: seg.text, cacheHit: cached });
      } else {
        batchItems.push({ segIndex: s, kind: "heading", text: seg.text });
      }
      continue;
    }

    if (seg.type === "text") {
      // Skip if it's just a package name or command
      if (/^`[^`]+`$/.test(seg.text.trim())) continue;
      const key = cacheKey(seg.text, targetCode, model);
      const cached = getCached(cache, key);
      if (cached) {
        batchItems.push({ segIndex: s, kind: "text", text: seg.text, cacheHit: cached });
      } else {
        batchItems.push({ segIndex: s, kind: "text", text: seg.text });
      }
      continue;
    }

    if (seg.type === "table") {
      const { parsed, translatableCells } = parseTable(seg.text);
      seg._parsed = parsed; // stash for reassembly
      for (const cell of translatableCells) {
        const key = cacheKey(cell.text, targetCode, model);
        const cached = getCached(cache, key);
        const tableKey = `${cell.rowIdx}:${cell.cellIdx}`;
        if (cached) {
          batchItems.push({ segIndex: s, kind: "cell", text: cell.text, cacheHit: cached, tableKey });
        } else {
          batchItems.push({ segIndex: s, kind: "cell", text: cell.text, tableKey });
        }
      }
      continue;
    }
  }

  // Split into cache hits and misses
  const misses = batchItems.filter((b) => !b.cacheHit);
  const cacheHits = batchItems.length - misses.length;

  console.log(
    `${batchItems.length} translatable segments (${cacheHits} cached, ${misses.length} to translate)`
  );

  // Translate all misses in batches
  let translations = [];
  if (misses.length > 0) {
    const items = misses.map((m) => ({ text: m.text, kind: m.kind }));
    const result = await translateBatch(items, "en", targetCode, { model });
    translations = result.translations;

    // Store in cache
    for (let i = 0; i < misses.length; i++) {
      const key = cacheKey(misses[i].text, targetCode, model);
      setCached(cache, key, translations[i], model);
    }

    console.log(`${result.ollamaCalls} Ollama call(s) for ${misses.length} segments`);
  }

  // Build a map of segIndex → translations
  const translationMap = new Map(); // segIndex → translation (for non-table)
  const tableTranslationMaps = new Map(); // segIndex → Map<tableKey, translation>

  let missIdx = 0;
  for (const item of batchItems) {
    let translated;
    if (item.cacheHit) {
      translated = item.cacheHit;
    } else {
      translated = translations[missIdx++];
    }

    const cleaned =
      item.kind === "heading"
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
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];

    if (seg.type === "protected") {
      output.push(seg.text);
      continue;
    }

    if (seg.type === "html-tagline") {
      const match = seg.text.match(/^(.+<strong>)([^<]+)(<\/strong>.+)$/);
      if (match && translationMap.has(s)) {
        output.push(match[1] + translationMap.get(s) + match[3]);
        process.stdout.write("H");
      } else {
        output.push(seg.text);
      }
      continue;
    }

    if (seg.type === "heading") {
      if (translationMap.has(s)) {
        output.push(seg.prefix + translationMap.get(s));
        process.stdout.write(".");
      } else {
        output.push(seg.prefix + seg.text);
      }
      continue;
    }

    if (seg.type === "text") {
      if (translationMap.has(s)) {
        output.push(translationMap.get(s));
        process.stdout.write(".");
      } else {
        output.push(seg.text);
      }
      continue;
    }

    if (seg.type === "table") {
      const tMap = tableTranslationMaps.get(s) ?? new Map();
      if (seg._parsed) {
        output.push(reassembleTable(seg._parsed, tMap));
        process.stdout.write("T");
      } else {
        output.push(seg.text);
      }
      continue;
    }
  }

  const result = output.join("\n");
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Validate: line count should match source (translations don't add/remove lines)
  const srcLines = readme.split("\n").length;
  const outLines = result.split("\n").length;
  if (outLines !== srcLines) {
    console.warn(`\n⚠ Line count mismatch: source=${srcLines}, translated=${outLines} (delta=${outLines - srcLines})`);
  }

  console.log(`\n\nDone! ${batchItems.length} segments in ${elapsed}s`);

  // Write output
  const ext = targetCode.toLowerCase();
  const outPath = readmePath.replace(/README\.md$/, `README.${ext}.md`);
  writeFileSync(outPath, result, "utf-8");
  console.log(`Written to: ${outPath}`);

  // Save cache
  if (useCache) {
    saveCache(absReadmePath, cache);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
