/**
 * Round-trip test — inline code spans must survive translation byte-for-byte.
 *
 * Regression guard for the ai-rpg-engine README.hi.md defect: TranslateGemma
 * transliterated the identifiers inside inline code spans, so the shipped Hindi
 * README told readers to run `रन <पथ>` instead of `run <path>`, pass
 * `--चेकपॉइंट` instead of `--checkpoint`, and `npm install @ai-rpg-इंजन/कोर`
 * instead of `@ai-rpg-engine/core`. 122 spans across three files, shipped for at
 * least one release. Fenced blocks were fine — `segmentMarkdown` protects them;
 * inline spans had no protection at all.
 *
 * The mock below is the failure, not a stand-in for it: it transliterates every
 * ASCII letter it is handed. If masking regresses, these tests fail the same way
 * the real pipeline did.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/** Crude but faithful: map ASCII letters to Devanagari, like the model did. */
const transliterate = (s: string) =>
  s.replace(/[a-z]/gi, (ch) => String.fromCharCode(0x0915 + (ch.toLowerCase().charCodeAt(0) - 97)));

vi.mock("./translate.js", () => ({
  translateBatch: vi.fn(async (items: Array<{ text: string }>) => ({
    translations: items.map((it) => transliterate(it.text)),
    model: "mock-transliterator",
    ollamaCalls: 1,
    durationMs: 0,
  })),
}));

import { translateMarkdown } from "./translateMarkdown.js";
import { translateBatch } from "./translate.js";

const DEVANAGARI = /[ऀ-ॿ]/;
const inlineSpans = (md: string) => md.match(/`[^`\n]+`/g) ?? [];

describe("translateMarkdown — inline code-span protection", () => {
  beforeEach(() => {
    vi.mocked(translateBatch).mockClear();
  });

  it("keeps identifiers in the source script even when the model transliterates everything", async () => {
    const md = [
      "# AI RPG Engine",
      "",
      "Run `run <path>` to play, and pass `--checkpoint` to resume.",
      "",
      "Install `@ai-rpg-engine/core` and `@ai-rpg-engine/modules` from npm.",
      "",
      "| Verb | Notes |",
      "| --- | --- |",
      "| Combat | Composed by `buildCombatStack` at pack-load time. |",
    ].join("\n");

    const result = await translateMarkdown(md, "en", "hi", { cache: false });

    // Every identifier comes back exactly as authored.
    for (const span of [
      "`run <path>`",
      "`--checkpoint`",
      "`@ai-rpg-engine/core`",
      "`@ai-rpg-engine/modules`",
      "`buildCombatStack`",
    ]) {
      expect(result.markdown).toContain(span);
    }

    // And no code span anywhere carries the target script — the assertion the
    // shipped README.hi.md would have failed 105 times.
    const contaminated = inlineSpans(result.markdown).filter((s) => DEVANAGARI.test(s));
    expect(contaminated).toEqual([]);

    // The prose around them WAS translated, proving the pipeline really ran and
    // this is not a "nothing happened" pass.
    expect(DEVANAGARI.test(result.markdown)).toBe(true);
  });

  it("never hands a raw code span to the model", async () => {
    const md = "Install `@ai-rpg-engine/ledger-adapter` before settling a checkpoint.";
    await translateMarkdown(md, "en", "hi", { cache: false });

    const sent = vi.mocked(translateBatch).mock.calls.flatMap(([items]) => items.map((i) => i.text));
    expect(sent.some((t) => t.includes("`"))).toBe(false);
    expect(sent.some((t) => t.includes("@ai-rpg-engine"))).toBe(false);
    // What it saw instead was the placeholder.
    expect(sent.some((t) => t.includes("⟦0⟧"))).toBe(true);
  });

  it("falls back to source text when the model destroys the placeholders", async () => {
    // A model that drops the placeholder loses the identifier entirely. Shipping
    // untranslated prose is the honest outcome; shipping a sentence that quietly
    // lost its `npm install` target is not.
    vi.mocked(translateBatch).mockResolvedValueOnce({
      translations: ["प्लेसहोल्डर गायब"],
      model: "mock",
      ollamaCalls: 1,
      durationMs: 0,
    });

    const md = "Install `@ai-rpg-engine/core` first.";
    const result = await translateMarkdown(md, "en", "hi", { cache: false });

    expect(result.markdown).toBe(md);
    expect(result.warnings.join("\n")).toMatch(/placeholders did not survive/);
  });

  it("still protects spans inside headings and table cells", async () => {
    const md = [
      "## The `reconcile()` pass",
      "",
      "| Package | Purpose |",
      "| --- | --- |",
      "| `@ai-rpg-engine/equipment` | Chronicle via `item-chronicle-core` at tick time. |",
    ].join("\n");

    const result = await translateMarkdown(md, "en", "hi", { cache: false });

    expect(result.markdown).toContain("`reconcile()`");
    expect(result.markdown).toContain("`item-chronicle-core`");
    expect(inlineSpans(result.markdown).filter((s) => DEVANAGARI.test(s))).toEqual([]);
  });

  it("leaves a fenced block untouched and still protects the prose around it", async () => {
    const md = [
      "Call `createGame()` like so:",
      "",
      "```ts",
      "const game = createGame({ starter: 'starter-pirate' });",
      "```",
    ].join("\n");

    const result = await translateMarkdown(md, "en", "hi", { cache: false });

    expect(result.markdown).toContain("const game = createGame({ starter: 'starter-pirate' });");
    expect(result.markdown).toContain("`createGame()`");
  });

  it("dedups sentences that differ only in which identifier they name", async () => {
    // Masking collapses these to one unique text, so the model is called once
    // and each sentence restores its own span. A regression here shows up as a
    // second batch item, not as wrong output.
    const md = ["Pass `--checkpoint` to resume.", "", "Pass `--list-checkpoints` to resume."].join(
      "\n",
    );

    const result = await translateMarkdown(md, "en", "hi", { cache: false });

    const sent = vi.mocked(translateBatch).mock.calls.flatMap(([items]) => items.map((i) => i.text));
    expect(sent).toHaveLength(1);
    expect(result.deduplicated).toBe(1);
    expect(result.markdown).toContain("`--checkpoint`");
    expect(result.markdown).toContain("`--list-checkpoints`");
  });
});
