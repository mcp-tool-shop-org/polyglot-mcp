/**
 * Pinned translations — a hand fix wins over the cache and the model, and
 * survives every rerun.
 *
 * The Kimi-K3 case, end to end: ai-jam-sessions' Hindi README transliterated
 * Kimi-K3 to किमी-के3; it was fixed by hand in e4cd2fb, came back from
 * `.polyglot-cache.json` on the next run, and was fixed by hand again in
 * 5f8d1e2. Here the mock respells it (with the model-id default switched off,
 * as before 1.9), the fix is pinned from the corrected file, and the same mock
 * and the same cache then run again.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("./translate.js", () => ({
  translateBatch: vi.fn(async (items: Array<{ text: string }>) => ({
    translations: items.map(({ text }) => `【hi】${text.replace(/Kimi-K3/g, "किमी-के3")}`),
    model: "mock",
    ollamaCalls: 1,
    durationMs: 0,
  })),
}));

import { translateMarkdown } from "./translateMarkdown.js";
import { translateBatch } from "./translate.js";
import { PINS_FILE, createPins, getPin, loadPins, pinKey, savePins, setPin } from "./pins.js";
import { pinCorrections } from "./pinCorrections.js";
import { TERMS_FILE } from "./protectedTerms.js";
import { PolyglotError } from "./errors.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "issue-44");
const MODEL = "translategemma:27b";

/** The credits paragraph as ai-jam-sessions' README.md has it, CRLF line ends and all. */
const CREDITS = JSON.parse(readFileSync(join(FIXTURES, "ai-jam-sessions.polyglot-cache.5f8d1e2.json"), "utf-8")).entries
  .d80ff4f64eeb47f5.source as string;

/** The Hindi paragraph as hand-fixed in 5f8d1e2. */
const HI_FIXED = readFileSync(join(FIXTURES, "ai-jam-sessions.README.hi.5f8d1e2.md"), "utf-8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((l) => l && !l.startsWith("<!--"))[0];

describe("pins — the Kimi-K3 case", () => {
  let dir: string;
  const readme = () => join(dir, "README.md");
  const options = () => ({ model: MODEL, filePath: readme() });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-pins-"));
    vi.mocked(translateBatch).mockClear();
    writeFileSync(readme(), `# Credits\r\n\r\n${CREDITS}\n`);
    // Before 1.9 nothing masked Kimi-K3; switching the default off reproduces that.
    writeFileSync(join(dir, TERMS_FILE), JSON.stringify({ disable: ["model-id"] }));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("translate, pin the hand fix, rerun with the same mock: the fix survives", async () => {
    const source = readFileSync(readme(), "utf-8");

    // 1. The model respells Kimi-K3, and the cache keeps the slip.
    const first = await translateMarkdown(source, "en", "hi", options());
    expect(first.markdown).toContain("किमी-के3");

    // 2. A person fixes the file by hand and pins the fix.
    const corrected = first.markdown.replace("किमी-के3", "Kimi-K3");
    const pinned = pinCorrections(readme(), "hi", corrected, { model: MODEL });
    expect(pinned.pinned).toHaveLength(1);
    expect(pinned.pinned[0].segment).toMatch(/^The voice is synthetic/);
    expect(pinned.unchanged).toBe(1); // the heading
    expect(pinned.written).toBe(true);
    expect(existsSync(join(dir, PINS_FILE))).toBe(true);

    // 3. The same mock, the same cache: the pin wins over both.
    vi.mocked(translateBatch).mockClear();
    const second = await translateMarkdown(source, "en", "hi", options());
    expect(second.markdown).toBe(corrected);
    expect(second.markdown).not.toContain("किमी-के3");
    expect(second.pinned).toBe(1);
    expect(translateBatch).not.toHaveBeenCalled();

    // 4. And again after the cache is cleared, when the model is asked afresh.
    const third = await translateMarkdown(source, "en", "hi", { ...options(), cacheClear: true });
    expect(third.markdown).toBe(corrected);
    expect(third.pinned).toBe(1);
  });

  it("pins the real hand fix from 5f8d1e2", async () => {
    const source = readFileSync(readme(), "utf-8");
    await translateMarkdown(source, "en", "hi", options());

    const corrected = `# 【hi】Credits\n\n${HI_FIXED}\n`;
    const result = pinCorrections(readme(), "hi", corrected, { model: MODEL });
    expect(result.pinned.map((p) => p.translation)).toEqual([HI_FIXED]);

    const rerun = await translateMarkdown(source, "en", "hi", options());
    expect(rerun.markdown).toContain(HI_FIXED);
    expect(rerun.markdown).toContain("Kimi-K3 द्वारा");
    expect(rerun.lostSpans).toEqual([]);
  });

  it("writes nothing when the corrected file matches the cache, or on a dry run", async () => {
    const source = readFileSync(readme(), "utf-8");
    const first = await translateMarkdown(source, "en", "hi", options());

    expect(pinCorrections(readme(), "hi", first.markdown, { model: MODEL })).toMatchObject({
      pinned: [],
      unchanged: 2,
      written: false,
    });
    const dry = pinCorrections(readme(), "hi", first.markdown.replace("किमी-के3", "Kimi-K3"), { model: MODEL, dryRun: true });
    expect(dry.pinned).toHaveLength(1);
    expect(dry.written).toBe(false);
    expect(existsSync(join(dir, PINS_FILE))).toBe(false);
  });

  it("leaves segments with no cached translation alone unless asked", () => {
    const corrected = `# श्रेय\n\n${HI_FIXED}\n`;
    expect(pinCorrections(readme(), "hi", corrected, { model: MODEL })).toMatchObject({ pinned: [], uncached: 2 });
    const all = pinCorrections(readme(), "hi", corrected, { model: MODEL, includeUncached: true });
    expect(all.pinned).toHaveLength(2);
    expect(getPin(loadPins(readme()), "Credits", "hi")).toBe("श्रेय");
  });

  it("refuses a corrected file whose structure does not line up", () => {
    expect(() => pinCorrections(readme(), "hi", `# श्रेय\n`, { model: MODEL })).toThrow(/does not line up/);
  });
});

describe("pins — the pin file", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-pinfile-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("keys by source hash plus language, the same for CRLF and LF", () => {
    expect(pinKey("a line\r\nanother", "hi")).toBe(pinKey("a line\nanother", "hi"));
    expect(pinKey("a line", "hi")).not.toBe(pinKey("a line", "zh"));
    expect(pinKey("a line", "hi")).toMatch(/^[0-9a-f]{16}:hi$/);
  });

  it("round-trips through .polyglot-pins.json, keys sorted", () => {
    const readme = join(dir, "README.md");
    const pins = createPins();
    setPin(pins, "Second", "zh", "第二");
    setPin(pins, "First", "hi", "पहला");
    savePins(readme, pins);

    const loaded = loadPins(readme);
    expect(getPin(loaded, "First", "hi")).toBe("पहला");
    expect(getPin(loaded, "Second", "zh")).toBe("第二");
    expect(getPin(loaded, "Second", "hi")).toBeUndefined();
    const keys = Object.keys(JSON.parse(readFileSync(join(dir, PINS_FILE), "utf-8")).pins);
    expect(keys).toEqual([...keys].sort());
  });

  it("is empty when there is no file, and refuses a broken one", () => {
    const readme = join(dir, "README.md");
    expect(loadPins(readme)).toEqual(createPins());
    for (const bad of ["{ nope", JSON.stringify({ version: 2, pins: {} }), JSON.stringify({ version: 1, pins: { k: {} } })]) {
      writeFileSync(join(dir, PINS_FILE), bad);
      expect(() => loadPins(readme)).toThrow(PolyglotError);
    }
  });
});
