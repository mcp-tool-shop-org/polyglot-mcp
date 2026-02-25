/**
 * Post-translation polish layer.
 *
 * Cleans up common TranslateGemma output quirks so the result
 * reads naturally without manual fixup.
 */

/**
 * Patterns where TranslateGemma outputs alternative translations
 * separated by "or" in the target language.
 * e.g. "翻訳A\nまたは\n翻訳B" → keep only "翻訳A"
 */
const OR_PATTERNS = [
  /\nまたは\n.*/s,       // Japanese
  /\n또는\n.*/s,         // Korean
  /\no\n(?=[A-Z]).*/s,   // Spanish/Italian/Portuguese "o" (only before uppercase)
  /\nou\n.*/s,            // French/Portuguese "ou"
  /\noder\n.*/s,          // German
  /\nили\n.*/s,           // Russian
  /\nया\n.*/s,            // Hindi
  /\nveya\n.*/s,          // Turkish
  /\nหรือ\n.*/s,          // Thai
  /\nhoặc\n.*/s,          // Vietnamese
  /\natau\n.*/s,          // Indonesian/Malay
  /\nof\n(?=[A-Z]).*/s,   // Afrikaans
];

/** Patterns for trailing sentence-end punctuation across languages */
const TRAILING_PERIOD = /[。．.。]\s*$/;

/** Clean up a translated string. */
export function polish(text: string): string {
  let result = text;

  // Strip "or" alternatives — keep only the first translation
  for (const pat of OR_PATTERNS) {
    result = result.replace(pat, "");
  }

  // Normalize excessive whitespace (but preserve paragraph breaks)
  result = result.replace(/[ \t]+\n/g, "\n");        // trailing spaces
  result = result.replace(/\n{3,}/g, "\n\n");         // triple+ newlines
  result = result.replace(/^[ \t]+|[ \t]+$/gm, "");   // leading/trailing per line (but not indentation in code)

  return result.trim();
}

/** Polish with heading-specific rules (strip trailing periods). */
export function polishHeading(text: string): string {
  let result = polish(text);
  result = result.replace(TRAILING_PERIOD, "");
  return result;
}

/**
 * Polish a table cell — strip alternatives and trailing periods,
 * but preserve the cell's inline formatting.
 */
export function polishCell(text: string): string {
  let result = polish(text);
  // Table cells shouldn't have embedded newlines
  result = result.replace(/\n/g, " ");
  return result;
}
