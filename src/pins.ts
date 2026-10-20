/**
 * Pinned translations: hand fixes that win over the cache and the model.
 *
 * ai-jam-sessions' Hindi README transliterated `Kimi-K3` to `किमी-के3`. It
 * was fixed by hand in e4cd2fb, came back from `.polyglot-cache.json` on the
 * next run, and was fixed by hand again in 5f8d1e2. A hand fix that the next
 * run quietly undoes is not a fix.
 *
 * So a fix can be pinned. `.polyglot-pins.json` sits beside the cache; each
 * entry is keyed by a hash of the English segment plus the target language,
 * and holds the translation to use for it. A pinned segment never reaches the
 * cache or the model, and the pin survives every rerun, `--cache-clear`
 * included. Change the English and the hash changes, so a pin cannot outlive
 * the text it was written for.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalWhitespace } from "./cache.js";
import { PolyglotError } from "./errors.js";

/** File name of the pin file, beside the README and its cache. */
export const PINS_FILE = ".polyglot-pins.json";

export interface PinEntry {
  /** Target language code. */
  lang: string;
  /** The English segment, for a person reading the file. Not used to match. */
  source: string;
  /** The translation that always wins. */
  translation: string;
  /** When the pin was written (ISO 8601). */
  pinnedAt: string;
}

export interface PinFile {
  version: 1;
  pins: Record<string, PinEntry>;
}

/** An empty pin set. */
export const createPins = (): PinFile => ({ version: 1, pins: {} });

/**
 * The pin key for an English segment and a language: a hash of the segment
 * with its whitespace laid out canonically (CRLF or LF, trailing spaces), so a
 * checkout with other line endings still finds its pins, then the language.
 */
export function pinKey(source: string, lang: string): string {
  const hash = createHash("sha256").update(canonicalWhitespace(source)).digest("hex").slice(0, 16);
  return `${hash}:${lang.toLowerCase()}`;
}

/** Path of the pin file beside `readmePath`. */
export function getPinsPath(readmePath: string): string {
  return join(resolve(dirname(readmePath)), PINS_FILE);
}

function pinsError(message: string, cause?: unknown): PolyglotError {
  return new PolyglotError({
    code: "CONFIG_ERROR",
    message,
    hint: `Fix or remove ${PINS_FILE}; it holds { "version": 1, "pins": { "<hash>:<lang>": { "translation": "…" } } }.`,
    retryable: false,
    ...(cause instanceof Error ? { cause } : {}),
  });
}

/**
 * Load the pins beside a README. No file means no pins. A file that cannot be
 * read or parsed throws: pins are hand fixes, and translating without them
 * would ship the very slips they were written to stop.
 */
export function loadPins(readmePath: string): PinFile {
  const path = getPinsPath(readmePath);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return createPins();
    throw pinsError(`Cannot read ${path}.`, err);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw pinsError(`${path} is not valid JSON.`, err);
  }
  const file = data as Partial<PinFile> | null;
  if (!file || file.version !== 1 || !file.pins || typeof file.pins !== "object") {
    throw pinsError(`${path} is not a version 1 pin file.`);
  }
  for (const [key, entry] of Object.entries(file.pins)) {
    if (!entry || typeof entry.translation !== "string") throw pinsError(`Pin ${key} has no "translation".`);
  }
  return { version: 1, pins: file.pins };
}

/** Write the pins beside a README, keys sorted so diffs stay small. */
export function savePins(readmePath: string, pins: PinFile): void {
  const path = getPinsPath(readmePath);
  const sorted = Object.fromEntries(Object.entries(pins.pins).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const tmp = `${path}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: 1, pins: sorted }, null, 2) + "\n", "utf-8");
  try {
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // Already gone.
    }
    throw err;
  }
}

/** The pinned translation for an English segment and language, if any. */
export function getPin(pins: PinFile, source: string, lang: string): string | undefined {
  return pins.pins[pinKey(source, lang)]?.translation;
}

/** Pin `translation` for an English segment and language. */
export function setPin(pins: PinFile, source: string, lang: string, translation: string): void {
  pins.pins[pinKey(source, lang)] = {
    lang: lang.toLowerCase(),
    source,
    translation,
    pinnedAt: new Date().toISOString(),
  };
}
