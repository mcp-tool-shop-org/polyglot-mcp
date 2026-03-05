import { describe, it, expect } from "vitest";
import {
  SOFTWARE_GLOSSARY,
  buildGlossaryHint,
  type GlossaryEntry,
} from "./glossary.js";

describe("SOFTWARE_GLOSSARY", () => {
  it("is a non-empty array", () => {
    expect(SOFTWARE_GLOSSARY.length).toBeGreaterThan(0);
  });

  it("each entry has term and translations", () => {
    for (const entry of SOFTWARE_GLOSSARY) {
      expect(entry.term).toBeTruthy();
      expect(typeof entry.term).toBe("string");
      expect(Object.keys(entry.translations).length).toBeGreaterThan(0);
    }
  });

  it("includes Architecture, Deploy, Library", () => {
    const terms = SOFTWARE_GLOSSARY.map((e) => e.term);
    expect(terms).toContain("Architecture");
    expect(terms).toContain("Deploy");
    expect(terms).toContain("Library");
  });
});

describe("buildGlossaryHint", () => {
  const glossary: GlossaryEntry[] = [
    {
      term: "Deploy",
      translations: { ja: "デプロイ", zh: "部署" },
    },
    {
      term: "Library",
      translations: { ja: "ライブラリ", fr: "bibliothèque" },
    },
  ];

  it("returns empty string when no terms match", () => {
    expect(buildGlossaryHint("Hello world", "ja", glossary)).toBe("");
  });

  it("includes matching term hints for target language", () => {
    const hint = buildGlossaryHint("Deploy the library", "ja", glossary);
    expect(hint).toContain('"Deploy" → "デプロイ"');
    expect(hint).toContain('"Library" → "ライブラリ"');
  });

  it("only includes entries with translations for the target language", () => {
    const hint = buildGlossaryHint("Deploy the library", "fr", glossary);
    // French only has Library, not Deploy
    expect(hint).toContain('"Library" → "bibliothèque"');
    expect(hint).not.toContain("Deploy");
  });

  it("is case-insensitive for term matching", () => {
    const hint = buildGlossaryHint("deploy the LIBRARY", "ja", glossary);
    expect(hint).toContain("Deploy");
    expect(hint).toContain("Library");
  });

  it("strips region from target language code", () => {
    // zh-Hant → zh base code should still match
    const hint = buildGlossaryHint("Deploy the app", "zh-Hant", glossary);
    expect(hint).toContain('"Deploy" → "部署"');
  });

  it("returns hint with IMPORTANT prefix", () => {
    const hint = buildGlossaryHint("Deploy now", "ja", glossary);
    expect(hint).toContain("IMPORTANT:");
  });

  it("handles empty glossary", () => {
    expect(buildGlossaryHint("Deploy now", "ja", [])).toBe("");
  });

  it("handles empty text", () => {
    expect(buildGlossaryHint("", "ja", glossary)).toBe("");
  });
});
