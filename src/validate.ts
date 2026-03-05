/**
 * Output validation for translations.
 *
 * Catches common failure modes: empty output, identical to source,
 * truncation, garbled text. Used both in the core translate pipeline
 * and in the translate-markdown module.
 */

import { PolyglotError } from "./errors.js";

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

/** Minimum expected output/input length ratio (catches severe truncation). */
const MIN_LENGTH_RATIO = 0.15;
/** Maximum expected output/input length ratio (catches hallucination blowup). */
const MAX_LENGTH_RATIO = 8.0;
/** Miniumum text length before length-ratio checks kick in. */
const LENGTH_CHECK_THRESHOLD = 20;

/**
 * Validate a translation result. Returns a list of warnings (empty = all good).
 * Throws PolyglotError for critical failures (empty output).
 */
export function validateTranslation(
  source: string,
  translation: string,
  sourceLang: string,
  targetLang: string
): ValidationResult {
  const warnings: string[] = [];

  // Critical: empty output
  if (!translation || translation.trim().length === 0) {
    throw new PolyglotError({
      code: "TRANSLATE_ERROR",
      message: "Translation returned empty output.",
      hint: "The model may be overloaded or the input may be too short to translate.",
      retryable: true,
    });
  }

  const srcTrimmed = source.trim();
  const tgtTrimmed = translation.trim();

  // Identical to source (model echoed input) — skip for short/technical text
  if (srcTrimmed === tgtTrimmed && sourceLang !== targetLang) {
    // Don't warn for short technical strings that legitimately stay the same
    const isTechnical = /^[`~<>@#$*|\-\d\s.,:;/\\()[\]{}]+$/.test(srcTrimmed)
      || /^`[^`]+`$/.test(srcTrimmed)
      || srcTrimmed.length <= 15;
    if (!isTechnical) {
      warnings.push(
        `Translation is identical to source text (possible echo). Source lang: ${sourceLang}, target: ${targetLang}.`
      );
    }
  }

  // Length ratio checks (only meaningful for non-trivial text)
  if (srcTrimmed.length >= LENGTH_CHECK_THRESHOLD) {
    const ratio = tgtTrimmed.length / srcTrimmed.length;

    if (ratio < MIN_LENGTH_RATIO) {
      warnings.push(
        `Translation may be truncated: output is ${(ratio * 100).toFixed(0)}% of source length (expected ≥${(MIN_LENGTH_RATIO * 100).toFixed(0)}%).`
      );
    }

    if (ratio > MAX_LENGTH_RATIO) {
      warnings.push(
        `Translation may contain hallucinated text: output is ${(ratio * 100).toFixed(0)}% of source length (expected ≤${(MAX_LENGTH_RATIO * 100).toFixed(0)}%).`
      );
    }
  }

  // Garbled text detection: high ratio of replacement characters or control chars
  const controlChars = (tgtTrimmed.match(/[\uFFFD\u0000-\u0008\u000E-\u001F]/g) || []).length;
  if (controlChars > tgtTrimmed.length * 0.05) {
    warnings.push(
      `Translation contains ${controlChars} replacement/control characters — possible encoding issue.`
    );
  }

  // Check for model meta-commentary leaking into output
  const metaPatterns = [
    /^(here(?:'s| is) (?:the|my|a) translation)/i,
    /^(translation:)/i,
    /^(note:|disclaimer:)/i,
  ];
  for (const pat of metaPatterns) {
    const match = tgtTrimmed.match(pat);
    if (match) {
      warnings.push(
        `Translation may contain model commentary: "${match[1]}…". Consider stripping the prefix.`
      );
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Quick boolean check — for use in pipelines where you just need pass/fail.
 */
export function isValidTranslation(
  source: string,
  translation: string,
  sourceLang: string,
  targetLang: string
): boolean {
  try {
    const result = validateTranslation(source, translation, sourceLang, targetLang);
    return result.valid;
  } catch {
    return false;
  }
}
