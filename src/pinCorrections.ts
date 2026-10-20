/**
 * Turn a hand-corrected translation into pins.
 *
 * Given the English README, a language and the corrected README.<lang>.md,
 * pair each translatable segment of the English with its text in the
 * corrected file and compare it with what the next run would produce from the
 * cache (or an existing pin). Every segment whose corrected text differs is
 * pinned in `.polyglot-pins.json`, so the fix wins over the cache and the
 * model from then on.
 *
 * This is the engine behind `scripts/pin-translation.mjs`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cacheKey, getCached, getFuzzyCached, loadCache } from "./cache.js";
import { maskCodeSpans, restoreCodeSpans } from "./codeSpans.js";
import { PolyglotError } from "./errors.js";
import { getPin, getPinsPath, loadPins, savePins, setPin } from "./pins.js";
import { loadProtectedTerms, type ProtectedTermSet } from "./protectedTerms.js";
import { segmentLabel } from "./survival.js";
import { alignUnits, cleanTranslation, type TranslatableUnit } from "./translateMarkdown.js";

export interface PinCorrectionsOptions {
  /**
   * Model whose cached translations to compare against; must match the run
   * that wrote the cache. Default: "translategemma:12b", as translateMarkdown.
   */
  model?: string;
  /** Protected-term set. Default: the `.polyglot-terms.json` beside the README, else the defaults. */
  terms?: ProtectedTermSet;
  /**
   * Also pin segments that have no cached translation to compare with.
   * Default: false — they are counted in `uncached` and left alone.
   */
  includeUncached?: boolean;
  /** Work out the pins without writing them. */
  dryRun?: boolean;
}

export interface PinCorrectionsResult {
  /** The pin file written, or that would be written. */
  pinsPath: string;
  /** Segments pinned, with the English and the translation now pinned for it. */
  pinned: Array<{ segment: string; translation: string }>;
  /** Segments whose corrected text matches what the next run would produce. */
  unchanged: number;
  /** Segments with no cached translation to compare against (pinned only with `includeUncached`). */
  uncached: number;
  /** Whether the pin file was written. */
  written: boolean;
}

const lf = (s: string): string => s.replace(/\r\n?/g, "\n");

/**
 * Pin the segments of `corrected` (the hand-fixed translation of `readmePath`
 * into `lang`) whose text differs from what the cache would produce.
 */
export function pinCorrections(
  readmePath: string,
  lang: string,
  corrected: string,
  options: PinCorrectionsOptions = {},
): PinCorrectionsResult {
  const absPath = resolve(readmePath);
  const source = readFileSync(absPath, "utf-8");
  const model = options.model ?? "translategemma:12b";
  const terms = options.terms ?? loadProtectedTerms(absPath);

  const aligned = alignUnits(source, corrected);
  if (!aligned) {
    throw new PolyglotError({
      code: "CONFIG_ERROR",
      message: `The corrected ${lang} file does not line up with ${absPath}: its headings, paragraphs and tables differ in number or kind.`,
      hint: "Correct the text inside the segments without adding or removing headings, paragraphs, table rows or cells.",
      retryable: false,
    });
  }

  const cache = loadCache(absPath);
  const pins = loadPins(absPath);
  const result: PinCorrectionsResult = { pinsPath: getPinsPath(absPath), pinned: [], unchanged: 0, uncached: 0, written: false };

  for (const { unit, target } of aligned) {
    const current = currentTranslation(unit, lang, model, terms, cache, getPin(pins, unit.text, lang));
    if (current === undefined) {
      result.uncached++;
      if (!options.includeUncached) continue;
    } else if (lf(current) === lf(target)) {
      // Line endings alone are not a correction.
      result.unchanged++;
      continue;
    }
    setPin(pins, unit.text, lang, target);
    result.pinned.push({ segment: segmentLabel(unit.text), translation: target });
  }

  if (result.pinned.length > 0 && !options.dryRun) {
    savePins(absPath, pins);
    result.written = true;
  }
  return result;
}

/**
 * What the next run would write for a unit, without the model: its pin, the
 * restored masked text when nothing is left to translate, or the cached
 * translation cleaned and restored. Undefined when the model would be asked.
 */
function currentTranslation(
  unit: TranslatableUnit,
  lang: string,
  model: string,
  terms: ProtectedTermSet,
  cache: ReturnType<typeof loadCache>,
  pin: string | undefined,
): string | undefined {
  if (pin !== undefined) return pin;
  const { text: masked, spans, termsHash } = maskCodeSpans(unit.text, terms);
  if (!/\p{L}/u.test(masked)) return restoreCodeSpans(masked, spans).text;
  const cached =
    getCached(cache, cacheKey(masked, lang, model, termsHash)) ?? getFuzzyCached(cache, masked, lang, model)?.translation;
  if (!cached) return undefined;
  const cleaned = cleanTranslation(cached, unit.kind === "heading");
  if (spans.length === 0) return cleaned;
  const restored = restoreCodeSpans(cleaned, spans);
  return restored.intact ? restored.text : restoreCodeSpans(masked, spans).text;
}
