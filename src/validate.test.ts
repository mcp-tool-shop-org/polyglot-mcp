/**
 * Tests for src/validate.ts — translation output validation.
 */

import { describe, it, expect } from "vitest";
import { validateTranslation, isValidTranslation } from "./validate.js";

describe("validateTranslation", () => {
  it("passes valid translation", () => {
    const result = validateTranslation("Hello world", "こんにちは世界", "en", "ja");
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("throws on empty translation", () => {
    expect(() => validateTranslation("Hello", "", "en", "ja")).toThrow(
      /empty output/i
    );
  });

  it("throws on whitespace-only translation", () => {
    expect(() => validateTranslation("Hello", "   \n  ", "en", "ja")).toThrow(
      /empty output/i
    );
  });

  it("warns when translation is identical to source (non-technical)", () => {
    const text = "This is a regular English sentence for translation";
    const result = validateTranslation(text, text, "en", "ja");
    expect(result.valid).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/identical to source/i);
  });

  it("does NOT warn for short technical echo", () => {
    // Short technical strings like "`translate`" or "~600 ms" are expected identical
    const result = validateTranslation("`translate`", "`translate`", "en", "es");
    expect(result.valid).toBe(true);
  });

  it("does NOT warn when same-language echo", () => {
    // If source and target are the same, identity is expected
    const result = validateTranslation("Hello world", "Hello world", "en", "en");
    expect(result.valid).toBe(true);
  });

  it("warns on severely truncated output", () => {
    const source = "This is a fairly long sentence that should produce a decent translation.";
    const translation = "短い";  // very short
    const result = validateTranslation(source, translation, "en", "ja");
    expect(result.warnings.some((w) => /truncated/i.test(w))).toBe(true);
  });

  it("warns on hallucinated blowup", () => {
    const source = "Hello";
    // Short source but this won't trigger length check because source < 20 chars
    const longSource = "This is a moderately long input text.";
    const translation = "x".repeat(500); // way too long
    const result = validateTranslation(longSource, translation, "en", "ja");
    expect(result.warnings.some((w) => /hallucinated/i.test(w))).toBe(true);
  });

  it("warns on garbled output with replacement chars", () => {
    const source = "Hello world test input text here.";
    const garbled = "\uFFFD".repeat(10) + "some text";
    const result = validateTranslation(source, garbled, "en", "ja");
    expect(result.warnings.some((w) => /replacement|control/i.test(w))).toBe(true);
  });

  it("warns on model meta-commentary", () => {
    const source = "This is a test sentence for translation purposes.";
    const result = validateTranslation(
      source,
      "Here's the translation: これはテストです",
      "en",
      "ja"
    );
    expect(result.warnings.some((w) => /commentary/i.test(w))).toBe(true);
  });

  it("does not warn on normal short text below threshold", () => {
    const result = validateTranslation("Hi", "こんにちは", "en", "ja");
    expect(result.valid).toBe(true);
  });

  it("does not false-positive on CJK length differences", () => {
    // CJK text is shorter in character count but valid
    const source = "This is a test sentence for translation testing purposes.";
    const translation = "これは翻訳テスト用のテスト文です。";
    const result = validateTranslation(source, translation, "en", "ja");
    // Should not warn about truncation — CJK is naturally shorter
    expect(result.valid).toBe(true);
  });
});

describe("isValidTranslation", () => {
  it("returns true for valid translation", () => {
    expect(isValidTranslation("Hello", "Hola", "en", "es")).toBe(true);
  });

  it("returns false for empty translation", () => {
    expect(isValidTranslation("Hello", "", "en", "es")).toBe(false);
  });

  it("returns false for identical echo", () => {
    const text = "This is a regular English sentence that should be translated";
    expect(isValidTranslation(text, text, "en", "ja")).toBe(false);
  });
});
