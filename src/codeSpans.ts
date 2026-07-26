/**
 * Inline code-span protection.
 *
 * Fenced code blocks are protected by `segmentMarkdown`, but an inline span
 * embedded in a prose sentence used to reach the model unguarded — and a target
 * language written in another script transliterated the identifier inside it.
 * ai-rpg-engine's Hindi README shipped `रन <पथ>` for `run <path>`,
 * `--चेकपॉइंट` for `--checkpoint`, `@ai-rpg-इंजन/कोर` for
 * `@ai-rpg-engine/core`, and `बिल्डकॉम्बैटस्टैक` for `buildCombatStack`:
 * a CLI command, a flag, an npm package name, and a function — none of which
 * work when copied out of the docs. 122 spans across three files.
 *
 * So every inline span is swapped for a placeholder before translation and
 * swapped back after. The placeholder is a bracket pair around a digit run and
 * nothing else: it carries no letters, so there is nothing in it for a
 * transliterating model to convert. Contrast `POLYGLOT_SEP`-style word tokens,
 * which are themselves transliterable — exactly the failure being fixed.
 */

/** Matches an inline code span, backticks included. Never spans a newline. */
export const CODE_SPAN_PATTERN = /`[^`\n]+`/g;

/** Build the placeholder for span `index`. */
export const codePlaceholder = (index: number): string => `⟦${index}⟧`;

/**
 * Matches a placeholder on the way back, tolerantly: any bracket pair whose
 * contents include a digit run. Models pad brackets and occasionally slip a
 * stray character inside; anything looser than this would start eating prose.
 */
const PLACEHOLDER_PATTERN = /⟦[^⟦⟧]*?(\d+)[^⟦⟧]*?⟧/g;

/** Non-global twin of the above — safe for `.test()` (no `lastIndex` state). */
const HAS_PLACEHOLDER = /⟦[^⟦⟧]*?\d+[^⟦⟧]*?⟧/;

/** True when `text` already contains something shaped like a placeholder. */
export const containsCodePlaceholder = (text: string): boolean => HAS_PLACEHOLDER.test(text);

export interface MaskedText {
  /** Text with every inline code span replaced by its placeholder. */
  text: string;
  /** The removed spans, indexed by placeholder number. Backticks included. */
  spans: string[];
}

/**
 * Replace every inline code span in `text` with a placeholder.
 *
 * If `text` already contains placeholder-shaped bracket pairs, masking is
 * skipped entirely (spans stay inline and translate as prose) rather than
 * producing a document whose restore step cannot be trusted. Prose that
 * genuinely uses ⟦ ⟧ around a number is vanishingly rare in a README; a
 * mangled identifier is not worth the risk of guessing.
 */
export function maskCodeSpans(text: string): MaskedText {
  if (containsCodePlaceholder(text)) return { text, spans: [] };

  const spans: string[] = [];
  const masked = text.replace(CODE_SPAN_PATTERN, (span) => {
    spans.push(span);
    return codePlaceholder(spans.length - 1);
  });
  return { text: masked, spans };
}

export interface RestoreResult {
  /** Text with every recognised placeholder swapped back to its code span. */
  text: string;
  /**
   * True only when every masked span came back exactly once and no unknown
   * placeholder appeared. False means the translation cannot be trusted to
   * carry the identifiers, and the caller should fall back to the source.
   */
  intact: boolean;
}

/**
 * Swap placeholders in `text` back to the code spans they stand for.
 *
 * `intact` is the load-bearing half of the return value. A model that drops,
 * duplicates, or invents a placeholder produces a sentence that has silently
 * lost or doubled an identifier — which is the same class of defect as
 * transliterating it. Callers are expected to fail closed on `intact: false`.
 */
export function restoreCodeSpans(text: string, spans: string[]): RestoreResult {
  if (spans.length === 0) {
    // Nothing was masked, so any placeholder-shaped text is the model's own
    // invention — but there is nothing to restore it to. Report it as intact
    // only if none appeared.
    return { text, intact: !containsCodePlaceholder(text) };
  }

  const seen = new Array<number>(spans.length).fill(0);
  let unknown = false;

  const restored = text.replace(PLACEHOLDER_PATTERN, (whole, digits: string) => {
    const index = Number(digits);
    if (!Number.isInteger(index) || index < 0 || index >= spans.length) {
      unknown = true;
      return whole;
    }
    seen[index]++;
    return spans[index];
  });

  return { text: restored, intact: !unknown && seen.every((count) => count === 1) };
}
