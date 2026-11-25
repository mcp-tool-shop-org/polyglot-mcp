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
  extractCodeSpans,
  strayBacktickCount,
  codeSpansMatch,
  escapeForTerminal,
  diffCandidateSpans,
  formatSpanDiff,
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

  it("masks CommonMark multi-backtick code spans whole", () => {
    const simple = maskCodeSpans("Use ``x`` to start.");
    expect(simple.text).toBe("Use ⟦0⟧ to start.");
    expect(simple.spans).toEqual(["``x``"]);

    const nested = maskCodeSpans("Use ``foo `bar` baz`` to inspect.");
    expect(nested.text).toBe("Use ⟦0⟧ to inspect.");
    expect(nested.spans).toEqual(["``foo `bar` baz``"]);
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

describe("placeholder patterns — linear time", () => {
  it("rejects an unclosed bracket followed by a long digit run quickly", () => {
    const hostile = "⟦" + "0".repeat(50_000);
    const start = Date.now();
    expect(containsCodePlaceholder(hostile)).toBe(false);
    expect(restoreCodeSpans(hostile, ["`x`"]).text).toBe(hostile);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("still matches padded and decorated placeholders", () => {
    expect(restoreCodeSpans("a ⟦ 0 ⟧ b ⟦x1y⟧", ["`p`", "`q`"])).toEqual({ text: "a `p` b `q`", intact: true });
    expect(containsCodePlaceholder("⟦12⟧")).toBe(true);
    expect(containsCodePlaceholder("⟦ab⟧")).toBe(false);
  });

  it("reports NOT intact when placeholders are reordered, wrapped in backticks, or an extra span appears", () => {
    const { spans } = maskCodeSpans("Run `first` before `second`.");
    expect(restoreCodeSpans("Execute `⟦0⟧` antes de ⟦1⟧.", spans).intact).toBe(false);
    expect(restoreCodeSpans("Execute ⟦1⟧ antes de ⟦0⟧.", spans).intact).toBe(false);
    expect(restoreCodeSpans("Execute ⟦0⟧ antes de ⟦1⟧ y `extra`.", spans).intact).toBe(false);
  });

  it("extracts code spans, counts stray backticks, and compares spans in order", () => {
    expect(extractCodeSpans("Use `a` and `b`.")).toEqual(["`a`", "`b`"]);
    expect(extractCodeSpans("Plain prose.")).toEqual([]);
    expect(strayBacktickCount("An unclosed ` tick and `real` here.")).toBe(1);
    expect(codeSpansMatch(["`a`", "`b`"], "Usa `a` y `b`.", 0)).toBe(true);
    expect(codeSpansMatch(["`a`", "`b`"], "Usa `b` y `a`.", 0)).toBe(false);
    expect(codeSpansMatch(["`a`"], "Usa `a` y `.", 0)).toBe(false);
    expect(codeSpansMatch([], "Usa `a`.", 1)).toBe(false);
    expect(codeSpansMatch([], "Usa `a`.", 0)).toBe(true);
  });

  it("restores clean multi-backtick spans and rejects wrapped, downgraded, or substituted ones", () => {
    const { spans } = maskCodeSpans("Use ``x`` and ``foo `bar` baz`` here.");
    expect(restoreCodeSpans("Usa ⟦0⟧ y ⟦1⟧ aquí.", spans)).toEqual({
      text: "Usa ``x`` y ``foo `bar` baz`` aquí.",
      intact: true,
    });
    expect(restoreCodeSpans("Usa `⟦0⟧` y ⟦1⟧ aquí.", spans).intact).toBe(false);
    expect(restoreCodeSpans("Usa ``y`` y ⟦1⟧ aquí.", spans).intact).toBe(false);
    expect(restoreCodeSpans("Usa `x` y ⟦1⟧ aquí.", spans).intact).toBe(false);
    expect(strayBacktickCount("Use ``foo `bar` baz`` here.")).toBe(0);
    expect(strayBacktickCount("An unclosed `` tick here.")).toBe(2);
  });

  it("handles many unmatched multi-backtick runs in linear time", () => {
    const hostile = Array.from({ length: 1_000 }, (_, i) => "`".repeat(i + 1)).join(" ");
    const start = Date.now();
    expect(extractCodeSpans(hostile)).toEqual([]);
    expect(strayBacktickCount(hostile)).toBe(500_500);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("escapes control characters and caps length for terminal span-diff display", () => {
    const dirty = "a\x1b[31m\n\r\t\x00\u200bb\"c\\d";
    const escaped = escapeForTerminal(dirty, 80);
    expect(escaped).toBe("a\\x1b[31m\\n\\r\\t\\x00\\u200bb\\\"c\\\\d");
    expect(escaped).not.toMatch(/[\x00-\x1f\u200b]/);
    const capped = escapeForTerminal("x".repeat(120), 20);
    expect(capped.length).toBeLessThanOrEqual(20);
    expect(capped.endsWith("…")).toBe(true);
  });

  it("computes and formats span diffs for missing, extra, swapped, wrapped, and unmasked mismatches", () => {
    const masked = "Run ⟦0⟧ with ⟦1⟧ today.";
    const spans = ["`first`", "`second`"];

    const dropped = diffCandidateSpans(masked, spans, "Ejecuta ⟦0⟧ hoy.");
    expect(dropped).toMatchObject({
      spanIndex: 1,
      expected: "`second`",
      received: "missing",
      expectedStrayBackticks: 0,
      receivedStrayBackticks: 0,
    });
    expect(dropped?.candidate).toContain("Ejecuta");
    expect(formatSpanDiff(dropped!)).toContain('span[1] expected "`second`", received missing');

    const wrapped = diffCandidateSpans(masked, spans, "Ejecuta `⟦0⟧` con ⟦1⟧ hoy.");
    expect(wrapped).toMatchObject({
      spanIndex: 0,
      expected: "`first`",
      received: "``first``",
      expectedStrayBackticks: 0,
      receivedStrayBackticks: 0,
    });

    const swapped = diffCandidateSpans(masked, spans, "Ejecuta ⟦1⟧ con ⟦0⟧ hoy.");
    expect(swapped).toMatchObject({
      spanIndex: 0,
      expected: "`first`",
      received: "`second`",
    });

    const extra = diffCandidateSpans(masked, spans, "Ejecuta ⟦0⟧ con ⟦1⟧ y `extra` hoy.");
    expect(extra).toMatchObject({
      spanIndex: 2,
      expected: "none",
      received: "extra: `extra`",
    });

    const stray = diffCandidateSpans("plain prose", [], "texto `suelto");
    expect(stray).toMatchObject({
      spanIndex: 0,
      expected: "none",
      received: "missing",
      expectedStrayBackticks: 0,
      receivedStrayBackticks: 1,
    });

    const unmasked = diffCandidateSpans("Literal ⟦7⟧ and `foo_bar`.", [], "Literal ⟦7⟧ y `foo-bar`.");
    expect(unmasked).toMatchObject({
      spanIndex: 0,
      expected: "`foo_bar`",
      received: "`foo-bar`",
    });

    // Protected-term (non-code-span) placeholder issues still produce structured diffs.
    expect(diffCandidateSpans("Run ⟦0⟧ now.", ["Node.js"], "Ejecuta hoy.")).toMatchObject({
      spanIndex: 0,
      expected: "Node.js",
      received: "missing",
    });
    expect(diffCandidateSpans("Run ⟦0⟧ now.", ["Node.js"], "Ejecuta ⟦0⟧ y ⟦5⟧ hoy.")).toMatchObject({
      spanIndex: 5,
      expected: "none",
      received: "extra: ⟦5⟧",
    });
    expect(diffCandidateSpans("Run ⟦0⟧ now.", ["Node.js"], "Ejecuta ⟦0⟧ y ⟦0⟧ hoy.")).toMatchObject({
      spanIndex: 0,
      expected: "Node.js",
      received: "extra: Node.js",
    });
    expect(formatSpanDiff(extra!)).toContain('extra "`extra`"');
    expect(escapeForTerminal("plain", 0)).toBe("");
    expect(escapeForTerminal("ab", 1)).toBe("…");
  });
});