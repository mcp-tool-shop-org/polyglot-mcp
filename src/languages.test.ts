import { describe, it, expect } from "vitest";
import { LANGUAGES, resolveLanguage, isSupported } from "./languages.js";

describe("LANGUAGES", () => {
  it("contains all supported languages", () => {
    // README says 55 but array includes Korean + Welsh variants = 57
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(55);
  });

  it("has unique codes", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has unique names", () => {
    const names = LANGUAGES.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes major languages", () => {
    const codes = LANGUAGES.map((l) => l.code);
    for (const code of ["en", "ja", "zh", "es", "fr", "de", "ko", "hi", "ar", "pt"]) {
      expect(codes).toContain(code);
    }
  });
});

describe("resolveLanguage", () => {
  it("resolves by code", () => {
    const lang = resolveLanguage("en");
    expect(lang).toBeDefined();
    expect(lang!.code).toBe("en");
    expect(lang!.name).toBe("English");
  });

  it("resolves by name (case-insensitive)", () => {
    const lang = resolveLanguage("Japanese");
    expect(lang).toBeDefined();
    expect(lang!.code).toBe("ja");
  });

  it("resolves by lowercase name", () => {
    const lang = resolveLanguage("japanese");
    expect(lang).toBeDefined();
    expect(lang!.code).toBe("ja");
  });

  it("resolves codes case-insensitively", () => {
    expect(resolveLanguage("EN")).toBeDefined();
    expect(resolveLanguage("En")).toBeDefined();
    expect(resolveLanguage("eN")).toBeDefined();
  });

  it("resolves zh-Hant", () => {
    const lang = resolveLanguage("zh-Hant");
    expect(lang).toBeDefined();
    expect(lang!.name).toBe("Chinese (Traditional)");
  });

  it("normalizes underscores to hyphens", () => {
    const lang = resolveLanguage("zh_Hant");
    expect(lang).toBeDefined();
    expect(lang!.name).toBe("Chinese (Traditional)");
  });

  it("returns undefined for unknown code", () => {
    expect(resolveLanguage("xx")).toBeUndefined();
  });

  it("returns undefined for unknown name", () => {
    expect(resolveLanguage("Klingon")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(resolveLanguage("")).toBeUndefined();
  });
});

describe("isSupported", () => {
  it("returns true for supported codes", () => {
    expect(isSupported("en")).toBe(true);
    expect(isSupported("ja")).toBe(true);
    expect(isSupported("zh-Hant")).toBe(true);
  });

  it("returns true case-insensitively", () => {
    expect(isSupported("EN")).toBe(true);
  });

  it("returns false for unsupported codes", () => {
    expect(isSupported("xx")).toBe(false);
    expect(isSupported("")).toBe(false);
  });
});
