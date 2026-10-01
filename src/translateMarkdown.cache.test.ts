/**
 * Stale-translation regression — an edited segment must be retranslated, never
 * served from the fuzzy cache as the translation of its old wording.
 *
 * si-rpg-engine, 2026-09-25: `translate-all` kept the previous run's text for two
 * edited README segments in 4 of 7 languages. "174 tests, …" became "197 tests, …"
 * and a table cell gained "and infinities", and both came back with the old
 * wording: the fuzzy cache reused translations of sources 0.987 and 0.894 similar.
 *
 * This drives the real engine and its on-disk cache across two runs, with only
 * the Ollama batch layer mocked. Each run tags what it translates, so every
 * segment in the output shows which run produced it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = vi.hoisted(() => ({ run: 0 }));

vi.mock("./translate.js", () => ({
  translateBatch: vi.fn(async (items: Array<{ text: string }>) => ({
    translations: items.map((it) => `【run${state.run}】${it.text}`),
    model: "mock",
    ollamaCalls: 1,
    durationMs: 0,
  })),
}));

import { translateMarkdown } from "./translateMarkdown.js";
import { translateBatch } from "./translate.js";

const CELL_BEFORE =
  "A fixed-timestep tick; every step's state hashed with a two-lane FNV-1a over every f64; NaN refused; signed zero canonicalized";
const COUNT_BEFORE =
  "174 tests, seven behaviour fixtures that replay step for step, and two golden hashes printed by three engines on x64 and by node on ARM64, on every commit.";
const CELL_AFTER = CELL_BEFORE.replace("NaN refused", "NaN and infinities refused");
const COUNT_AFTER = COUNT_BEFORE.replace("174", "197");

const readme = (cell: string, count: string, closing: string) =>
  [
    "# si-rpg-engine",
    "",
    "| Guarantee | Where |",
    "| --- | --- |",
    `| ${cell} | \`packages/tick\` |`,
    "",
    count,
    "",
    closing,
  ].join("\n");

describe("translateMarkdown — edited segments bypass the fuzzy cache", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-cache-"));
    vi.mocked(translateBatch).mockClear();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Translate `before`, then `after`, against the same cache file. */
  const translateTwice = async (before: string, after: string) => {
    const options = { model: "translategemma:27b", filePath: join(dir, "README.md") };
    state.run = 1;
    await translateMarkdown(before, "en", "es", options);
    vi.mocked(translateBatch).mockClear();
    state.run = 2;
    return translateMarkdown(after, "en", "es", options);
  };

  it("retranslates a changed count and a cell with added words", async () => {
    const result = await translateTwice(
      readme(CELL_BEFORE, COUNT_BEFORE, "The engine is deterministic by construction."),
      readme(CELL_AFTER, COUNT_AFTER, "The engine is deterministic by construction."),
    );

    expect(result.markdown).toContain(`【run2】${COUNT_AFTER}`);
    expect(result.markdown).toContain(`【run2】${CELL_AFTER}`);
    // The failure being fixed: the previous run's wording surviving the edit.
    expect(result.markdown).not.toContain("174 tests");
    expect(result.markdown).not.toContain("NaN refused");

    // Only the two edited segments went to the model.
    const sent = vi.mocked(translateBatch).mock.calls.flatMap(([items]) => items.map((it) => it.text));
    expect(sent.sort()).toEqual([CELL_AFTER, COUNT_AFTER].sort());
    expect(result.translated).toBe(2);
    expect(result.fuzzyMatched).toBe(0);
  });

  it("still serves unchanged and whitespace-only-edited segments from the cache", async () => {
    const result = await translateTwice(
      readme(CELL_BEFORE, COUNT_BEFORE, "The engine is deterministic by construction."),
      readme(CELL_BEFORE, COUNT_BEFORE, "The engine is  deterministic by construction. "),
    );

    // Exact hits for the untouched segments, a fuzzy hit for the respaced one.
    expect(result.markdown).toContain("# 【run1】si-rpg-engine");
    expect(result.markdown).toContain(`【run1】${COUNT_BEFORE}`);
    expect(result.markdown).toContain("【run1】The engine is deterministic by construction.");
    // Heading, both header cells, the guarantee cell and the count.
    expect(result.cached).toBe(5);
    expect(result.fuzzyMatched).toBe(1);
    expect(translateBatch).not.toHaveBeenCalled();
  });
});
