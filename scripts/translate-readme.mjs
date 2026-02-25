#!/usr/bin/env node

/**
 * Translate a README.md using polyglot-mcp's translate engine.
 * Preserves code blocks, HTML, URLs, package names, and ASCII art.
 *
 * Usage: node scripts/translate-readme.mjs <readme-path> <target-lang-code>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { translate } from "../dist/translate.js";
import { resolveLanguage } from "../dist/languages.js";

const [readmePath, targetCode] = process.argv.slice(2);
if (!readmePath || !targetCode) {
  console.error("Usage: node scripts/translate-readme.mjs <readme> <lang-code>");
  process.exit(1);
}

const target = resolveLanguage(targetCode);
if (!target) {
  console.error(`Unsupported language: ${targetCode}`);
  process.exit(1);
}

const readme = readFileSync(readmePath, "utf-8");

// Split README into segments: translatable text vs protected blocks
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
      // Collect until closing tag or empty line
      while (i < lines.length && lines[i].trim() !== "" && !/^(---|##)/.test(lines[i])) {
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
 * - "Translation A\no\nTranslation B" (Spanish "or") → keep first
 * - "Translation A\nou\nTranslation B" (French/Portuguese "or") → keep first
 * - Trailing periods on short text (headings)
 */
function cleanTranslation(text, isHeading = false) {
  // Strip "or" alternatives in various languages
  const orPatterns = [
    /\nまたは\n.*/s,      // Japanese
    /\n또는\n.*/s,        // Korean
    /\no\n[A-Z].*/s,      // Spanish/Italian/Portuguese "o"
    /\nou\n.*/s,           // French/Portuguese "ou"
    /\noder\n.*/s,         // German
    /\nили\n.*/s,          // Russian
    /\nया\n.*/s,           // Hindi
    /\nveya\n.*/s,         // Turkish
    /\nหรือ\n.*/s,         // Thai
    /\nhoặc\n.*/s,         // Vietnamese
  ];
  let cleaned = text;
  for (const pat of orPatterns) {
    cleaned = cleaned.replace(pat, "");
  }

  // Remove trailing period on headings
  if (isHeading) {
    cleaned = cleaned.replace(/[。．.]\s*$/, "");
  }

  return cleaned.trim();
}

// Translate a single text string, preserving inline markdown
async function translateText(text, from, to, isHeading = false) {
  // Skip if it's just a package name or command
  if (/^`[^`]+`$/.test(text.trim())) return text;
  if (/^@attestia\//.test(text.trim())) return text;

  const result = await translate(text, from, to);
  return cleanTranslation(result.translation, isHeading);
}

// Translate table cells (skip separator row and code/package cells)
async function translateTable(tableText, from, to) {
  const rows = tableText.split("\n");
  const translated = [];

  for (const row of rows) {
    // Separator row (|---|---|)
    if (/^\|[\s-:|]+\|$/.test(row)) {
      translated.push(row);
      continue;
    }

    const cells = row.split("|").slice(1, -1); // remove empty first/last
    const newCells = [];

    for (const cell of cells) {
      const trimmed = cell.trim();
      // Skip cells that are mostly code, packages, or numbers
      if (
        /^`[^`]+`$/.test(trimmed) ||
        /^@attestia\//.test(trimmed) ||
        /^\*\*[A-Z]/.test(trimmed) && trimmed.length < 30 ||
        /^\d+$/.test(trimmed) ||
        /^\[.*\]\(.*\)$/.test(trimmed)
      ) {
        newCells.push(cell);
      } else if (trimmed.length > 5) {
        try {
          const t = await translateText(trimmed, from, to);
          newCells.push(` ${t} `);
        } catch {
          newCells.push(cell);
        }
      } else {
        newCells.push(cell);
      }
    }

    translated.push("|" + newCells.join("|") + "|");
  }

  return translated.join("\n");
}

async function main() {
  console.log(`Translating ${readmePath} → ${target.name} (${target.code})`);
  const start = Date.now();

  const segments = segmentReadme(readme);
  const output = [];
  let translatedCount = 0;

  for (const seg of segments) {
    switch (seg.type) {
      case "protected":
        output.push(seg.text);
        break;

      case "html-tagline": {
        // Extract inner text from <p><strong>text</strong></p>
        const match = seg.text.match(/^(.+<strong>)([^<]+)(<\/strong>.+)$/);
        if (match) {
          const t = await translateText(match[2], "en", targetCode);
          output.push(match[1] + t + match[3]);
          translatedCount++;
          process.stdout.write("H");
        } else {
          output.push(seg.text);
        }
        break;
      }

      case "heading": {
        const t = await translateText(seg.text, "en", targetCode, true);
        output.push(seg.prefix + t);
        translatedCount++;
        process.stdout.write(".");
        break;
      }

      case "text": {
        const t = await translateText(seg.text, "en", targetCode);
        output.push(t);
        translatedCount++;
        process.stdout.write(".");
        break;
      }

      case "table": {
        const t = await translateTable(seg.text, "en", targetCode);
        output.push(t);
        translatedCount++;
        process.stdout.write("T");
        break;
      }
    }
  }

  const result = output.join("\n");
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\nDone! ${translatedCount} segments translated in ${elapsed}s`);

  // Write output
  const ext = targetCode.toLowerCase();
  const outPath = readmePath.replace(/README\.md$/, `README.${ext}.md`);
  writeFileSync(outPath, result, "utf-8");
  console.log(`Written to: ${outPath}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
