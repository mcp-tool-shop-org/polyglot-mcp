/**
 * Tests for src/codeSpans.ts — inline code-span masking and restore.
 *
 * The defect these guard against: ai-rpg-engine's README.hi.md shipped 105
 * transliterated code spans (plus 17 more across two package READMEs) because
 * inline spans reached TranslateGemma unmasked. `run <path>` came back as
 * `रन <पथ>`, `@ai-rpg-engine/core` as `@ai-rpg-इंजन/कोर`.
 */

import { describe, it, expect } from "vitest";
import {
  maskCodeSpans,
  restoreCodeSpans,
  containsCodePlaceholder,
  codePlaceholder,
  CODE_SPAN_PATTERN,
} from "./codeSpans.js";

// ─── maskCodeSpans ─────────────────────────────────────────────────

describe("maskCodeSpans", () => {
  it("replaces every inline span with a numbered placeholder", () => {
    const { text, spans } = maskCodeSpans("Run `run <path>` with `@ai-rpg-engine/core` today.");
    expect(text).toBe("Run ⟦0⟧ with ⟦1⟧ today.");
    expect(spans).toEqual(["`run <path>`", "`@ai-rpg-engine/core`"]);
  });

  it("leaves placeholder-free prose untouched", () => {
    const md = "No identifiers in this sentence at all.";
    const { text, spans } = maskCodeSpans(md);
    expect(text).toBe(md);
    expect(spans).toEqual([]);
  });

  it("keeps the backticks inside the lifted span so restore rebuilds markdown exactly", () => {
    const { spans } = maskCodeSpans("Use `--checkpoint`.");
    expect(spans[0]).toBe("`--checkpoint`");
  });

  it("does not let a span swallow a line break", () => {
    // A stray backtick on one line must not mask through to the next — that
    // would eat real prose and lose it on restore.
    const { text, spans } = maskCodeSpans("An unclosed ` tick\nand `real` here.");
    expect(spans).toEqual(["`real`"]);
    expect(text).toBe("An unclosed ` tick\nand ⟦0⟧ here.");
  });

  it("masks repeated identical spans separately so each restores independently", () => {
    const { text, spans } = maskCodeSpans("Both `run` and `run` again.");
    expect(text).toBe("Both ⟦0⟧ and ⟦1⟧ again.");
    expect(spans).toHaveLength(2);
  });

  it("skips masking when the source already contains placeholder-shaped brackets", () => {
    // Restore could not tell the source's brackets from its own, so the safe
    // move is to not mask at all rather than to guess.
    const md = "Footnote ⟦1⟧ and code `run`.";
    const { text, spans } = maskCodeSpans(md);
    expect(text).toBe(md);
    expect(spans).toEqual([]);
  });
});

// ─── restoreCodeSpans ──────────────────────────────────────────────

describe("restoreCodeSpans", () => {
  it("round-trips text unchanged when nothing translated it", () => {
    const original = "Run `run <path>` with `@ai-rpg-engine/core` today.";
    const { text, spans } = maskCodeSpans(original);
    const restored = restoreCodeSpans(text, spans);
    expect(restored.text).toBe(original);
    expect(restored.intact).toBe(true);
  });

  it("restores identifiers into translated prose, in the model's word order", () => {
    const { spans } = maskCodeSpans("Run `run <path>` to start.");
    // Hindi word order puts the verb last — the placeholder moves with it.
    const restored = restoreCodeSpans("शुरू करने के लिए ⟦0⟧ चलाएँ।", spans);
    expect(restored.text).toBe("शुरू करने के लिए `run <path>` चलाएँ।");
    expect(restored.intact).toBe(true);
  });

  it("tolerates a model padding the brackets", () => {
    const { spans } = maskCodeSpans("Use `--checkpoint` here.");
    const restored = restoreCodeSpans("यहाँ ⟦ 0 ⟧ का उपयोग करें।", spans);
    expect(restored.text).toContain("`--checkpoint`");
    expect(restored.intact).toBe(true);
  });

  it("reports NOT intact when the model dropped a placeholder", () => {
    const { spans } = maskCodeSpans("Run `run` with `--checkpoint`.");
    const restored = restoreCodeSpans("केवल ⟦0⟧ चलाएँ।", spans);
    expect(restored.intact).toBe(false);
  });

  it("reports NOT intact when the model duplicated a placeholder", () => {
    // A doubled identifier reads as authored text and is as wrong as a
    // transliterated one, so it must not pass as intact.
    const { spans } = maskCodeSpans("Run `run` now.");
    const restored = restoreCodeSpans("⟦0⟧ और ⟦0⟧ चलाएँ।", spans);
    expect(restored.intact).toBe(false);
  });

  it("reports NOT intact when the model invented an out-of-range placeholder", () => {
    const { spans } = maskCodeSpans("Run `run` now.");
    const restored = restoreCodeSpans("⟦0⟧ और ⟦7⟧ चलाएँ।", spans);
    expect(restored.intact).toBe(false);
    // The unknown placeholder is left alone rather than resolved to a guess.
    expect(restored.text).toContain("⟦7⟧");
  });

  it("treats an invented placeholder in never-masked text as not intact", () => {
    expect(restoreCodeSpans("plain prose", []).intact).toBe(true);
    expect(restoreCodeSpans("hallucinated ⟦0⟧", []).intact).toBe(false);
  });

  it("survives every span in the real README.hi.md failure set", () => {
    // The exact identifiers that shipped transliterated, all in one sentence.
    const original =
      "Run `run <path>` with `--checkpoint` and `--list-checkpoints`, " +
      "install `@ai-rpg-engine/core`, then call `buildCombatStack` and `Engine.serialize()`.";
    const { text, spans } = maskCodeSpans(original);
    expect(spans).toHaveLength(6);
    // Nothing Latin is left for a transliterating model to damage inside a span.
    expect(text).not.toContain("`");
    expect(restoreCodeSpans(text, spans).text).toBe(original);
  });
});

// ─── helpers ───────────────────────────────────────────────────────

describe("containsCodePlaceholder", () => {
  it("detects a placeholder and is not left stateful between calls", () => {
    // A global regex reused via .test() would alternate true/false on the same
    // input — the exact bug that would make masking silently skip segments.
    for (let i = 0; i < 4; i++) {
      expect(containsCodePlaceholder("a ⟦0⟧ b")).toBe(true);
      expect(containsCodePlaceholder("no brackets here")).toBe(false);
    }
  });

  it("carries no letters for a transliterating model to convert", () => {
    expect(codePlaceholder(3)).toBe("⟦3⟧");
    expect(/[A-Za-z]/.test(codePlaceholder(3))).toBe(false);
  });
});

describe("CODE_SPAN_PATTERN", () => {
  it("matches inline spans without crossing newlines", () => {
    const matches = "a `one` b\nc `two` d".match(CODE_SPAN_PATTERN);
    expect(matches).toEqual(["`one`", "`two`"]);
  });
});
