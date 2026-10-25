/**
 * Argon's review of #56 (card gm): the paths through which English, or a broken
 * translation, still reached the output or the cache after the first version of
 * the untranslated-prose check.
 *
 * The real translateBatch and translateMarkdown run against a scripted Ollama.
 * Markers inside a segment steer it (plain lowercase words, so protected-term
 * masking leaves them alone):
 *   zzechoalways  the part is returned as the English, however it is sent
 *   zzdropalways  every code-span placeholder is dropped, however it is sent
 *   zzdropml      placeholders are dropped when the text has several lines
 *   zzdropsep     the client loses one separator, so the batch must fall back
 * Anything else is "translated" by prefixing "[es] ".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SEP = "---POLYGLOT_SEP---";

const client = vi.hoisted(() => ({
  calls: [] as Array<{ batch: boolean; text: string }>,
  /** When false, the placeholder-dropping markers are ignored (the model "recovers"). */
  breakPlaceholders: true,
}));

vi.mock("./ollama.js", () => {
  const strip = (p: string) => p.replace(/⟦\d+⟧/g, "");
  const generate = async (req: { prompt: string }) => {
    const text = req.prompt.split("\n\n\n").slice(1).join("\n\n\n");
    const isBatch = text.includes("---POLYGLOT_SEP---");
    client.calls.push({ batch: isBatch, text });
    const one = (part: string): string => {
      if (part.includes("zzechoalways")) return part;
      if (client.breakPlaceholders && part.includes("zzdropalways")) return `[es] ${strip(part)}`;
      if (client.breakPlaceholders && part.includes("zzdropml") && part.includes("\n")) return `[es] ${strip(part)}`;
      return `[es] ${part.split("\n").join("\n[es] ")}`.replace(/\[es\] \[es\]/g, "[es]");
    };
    if (isBatch) {
      const parts = text.split(/\n?---POLYGLOT_SEP---\n?/);
      const out = parts.map(one);
      if (parts.some((p) => p.includes("zzdropsep"))) {
        return { model: "mock", response: out.join(`\n${SEP}\n`).replace(`\n${SEP}\n`, "\n\n"), done: true };
      }
      return { model: "mock", response: out.join(`\n${SEP}\n`), done: true };
    }
    return { model: "mock", response: one(text), done: true };
  };
  const MockOllamaClient = vi.fn().mockImplementation(function () {
    return {
      ensureRunning: vi.fn().mockResolvedValue(true),
      ensureModel: vi.fn().mockResolvedValue(true),
      generate: vi.fn(generate),
      generateStream: vi.fn(),
    };
  });
  return { OllamaClient: MockOllamaClient };
});

import { translateMarkdown, unusableReason } from "./translateMarkdown.js";
import { translateAll } from "./translateAll.js";
import { translateReadme } from "./translateReadme.js";
import { pinCorrections } from "./pinCorrections.js";
import { getPin, loadPins } from "./pins.js";
import { UntranslatedError, isProseLine, proseWords, survivingProse, untranslatedBlockText } from "./survival.js";

const P1 = "The first paragraph explains how the router picks a device for every job.";
const P3 = "The third paragraph lists the limits the guard enforces before it starts.";
const readme = (...paras: string[]) => ["# Title", "", ...paras.flatMap((p) => [p, ""])].join("\n");

describe("untranslated check — the remaining paths (gm 1)", () => {
  let dir: string;
  let filePath: string;
  beforeEach(() => {
    client.calls.length = 0;
    client.breakPlaceholders = true;
    dir = mkdtempSync(join(tmpdir(), "polyglot-gm-"));
    filePath = join(dir, "README.md");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (md: string, extra: Record<string, unknown> = {}) => {
    writeFileSync(filePath, md, "utf-8");
    return translateMarkdown(md, "en", "es", { filePath, ...extra });
  };
  const cacheText = () => readFileSync(join(dir, ".polyglot-cache.json"), "utf-8");

  it("an echoed segment whose words include a protected term is retried, reported and not cached", async () => {
    // Masked, "The model ⟦0⟧ uses ⟦1⟧ today" has 4 words; the page has 6.
    const echoed = "The model Kimi-K3 uses DepositAuth today zzechoalways";
    const r = await run(readme(P1, echoed, P3));
    expect(r.retries).toBe(1);
    expect(r.untranslated).toHaveLength(1);
    expect(r.untranslated[0]).toMatchObject({ retried: true });
    expect(cacheText()).not.toContain("zzechoalways");
  });

  it("an echoed segment with an N of M count is reported (it is restored as N/M on both sides)", async () => {
    const echoed = "The local router picks a device for 218 of 224 translation jobs zzechoalways";
    const r = await run(readme(P1, echoed, P3));
    expect(r.untranslated).toHaveLength(1);
    expect(r.untranslated[0]!.line).toContain("218/224");
    expect(r.retries).toBe(1);
  });

  it("a segment whose placeholders do not come back is retried once and reported, with the reason", async () => {
    const broken = "Install `@scope/pkg` first and then run the build zzdropalways";
    const r = await run(readme(P1, broken, P3));
    expect(r.retries).toBe(1);
    expect(r.fallbacks).toHaveLength(1);
    expect(r.fallbacks[0]).toMatchObject({ retried: true, recovered: false });
    expect(r.fallbacks[0]!.reason).toContain("placeholders");
    expect(r.untranslated).toHaveLength(1);
    expect(r.untranslated[0]).toMatchObject({ retried: true });
    expect(r.markdown).toContain("`@scope/pkg`"); // the English kept so the identifier stays right
  });

  it("a broken-placeholder answer is not cached, so the next run calls the model and uses its answer", async () => {
    const broken = "Install `@scope/pkg` first and then run the build zzdropalways";
    const md = readme(P1, broken, P3);
    await run(md);
    const cached = JSON.parse(cacheText()) as { entries: Record<string, { source?: string }> };
    expect(Object.values(cached.entries).some((e) => e.source?.includes("Install"))).toBe(false);
    client.breakPlaceholders = false;
    client.calls.length = 0;
    const second = await translateMarkdown(md, "en", "es", { filePath });
    expect(second.untranslated).toEqual([]);
    expect(second.markdown).toContain("[es] Install `@scope/pkg` first");
    expect(client.calls.length).toBeGreaterThan(0);
  });

  it("a cached entry whose placeholders cannot be restored is ignored and replaced", async () => {
    const seg = "Install `@scope/pkg` first and then run the build today";
    const md = readme(P1, seg, P3);
    await run(md);
    // Poison the entry the way an older run did: the translation lost its placeholder.
    const cachePath = join(dir, ".polyglot-cache.json");
    const cache = JSON.parse(readFileSync(cachePath, "utf-8")) as { entries: Record<string, { translation: string; source?: string }> };
    const key = Object.keys(cache.entries).find((k) => cache.entries[k]!.source?.includes("Install"))!;
    cache.entries[key]!.translation = "[es] Install first and then run the build today";
    writeFileSync(cachePath, JSON.stringify(cache), "utf-8");
    client.calls.length = 0;
    const r = await translateMarkdown(md, "en", "es", { filePath });
    expect(r.markdown).toContain("`@scope/pkg`");
    expect(r.markdown).not.toContain("[es] Install first");
    expect(client.calls.length).toBeGreaterThan(0);
  });

  it("a long multi-line segment that loses its placeholders is recovered line by line", async () => {
    const list = [
      "- Run `npm install` zzdropml now to fetch every dependency.",
      "- Run `npm test` after that to check the whole build.",
      "- Run `npm run build` last to produce the final output.",
    ].join("\n");
    const r = await run(readme(P1, list, P3));
    expect(r.untranslated).toEqual([]);
    expect(r.markdown).toContain("`npm install`");
    expect(r.markdown).toContain("`npm test`");
    expect(r.markdown).toContain("`npm run build`");
    expect(r.markdown).toContain("[es] - Run `npm test`");
    expect(r.fallbacks).toHaveLength(1);
    expect(r.fallbacks[0]).toMatchObject({ retried: true, recovered: true });
    expect(r.fallbacks[0]!.reason).toContain("line by line");
    // one batch, one whole-segment retry, three single-line calls
    expect(client.calls.filter((c) => c.batch)).toHaveLength(1);
    expect(client.calls.filter((c) => !c.batch && c.text.includes("\n"))).toHaveLength(1);
    expect(client.calls.filter((c) => !c.batch && !c.text.includes("\n") && c.text.includes("Run"))).toHaveLength(3);
  });

  it("an item that already took the one-call-per-item fallback is not sent a second time", async () => {
    const dropped = `${P1} zzdropsep`;
    const echoed = `${P3} zzechoalways`;
    const r = await run(readme(dropped, "The second paragraph says what a receipt records after a run.", echoed));
    const toEchoed = client.calls.filter((c) => !c.batch && c.text.includes("zzechoalways"));
    expect(toEchoed).toHaveLength(1); // its fallback call was its retry
    expect(r.untranslated).toHaveLength(1);
    expect(r.untranslated[0]).toMatchObject({ retried: true });
    expect(r.untranslated[0]!.reason).toContain("one-call-per-item");
  });

  it("unusableReason names why an answer cannot be used", () => {
    expect(unusableReason("A short line", [], "", false)).toBe("empty");
    expect(unusableReason("Install ⟦0⟧ first and then run the whole build", ["`x`"], "Instala primero", false)).toBe("placeholders");
    expect(unusableReason("The router picks a device for every single job today.", [], "The router picks a device for every single job today.", false)).toBe("english");
    expect(unusableReason("The router picks a device for every single job today.", [], "El enrutador elige un dispositivo para cada trabajo.", false)).toBeUndefined();
  });
});

describe("the survival rule (gm 2)", () => {
  it("flags an all-caps English sentence and ignores case when matching", () => {
    const caps = "WARNING THIS ACTION WILL DELETE ALL LOCAL DATA PERMANENTLY";
    expect(isProseLine(caps)).toBe(true);
    expect(survivingProse(caps, caps)).toEqual([caps]);
    expect(survivingProse("The router picks a device for every job.", "the router picks a device for every job.")).toHaveLength(1);
  });

  it("ignores a different closing mark when matching", () => {
    expect(survivingProse("The router picks a device for every job:", "The router picks a device for every job.")).toHaveLength(1);
  });

  it("counts the parts of a hyphenated compound as words", () => {
    expect(proseWords("Use state-of-the-art end-to-end local models.")).toHaveLength(10);
    expect(isProseLine("Use state-of-the-art end-to-end local models.")).toBe(true);
  });

  it("counts the words of a link label, and matches a line by its labels", () => {
    const s = "Read [the complete local installation and setup guide](https://example.com) first.";
    expect(isProseLine(s)).toBe(true);
    expect(survivingProse(s, "Read [the complete local installation and setup guide](https://other.example) first.")).toHaveLength(1);
    expect(survivingProse(s, "Lee [la guía completa de instalación local y configuración](https://example.com) primero.")).toHaveLength(0);
  });

  it("joins a hard-wrapped paragraph, so short wrapped lines and a reflow are still caught", () => {
    const wrapped = "The router picks a device\nfor every single local job.";
    expect(survivingProse(wrapped, wrapped)).toHaveLength(1);
    const reflowed = "The router picks a device for every single local job.";
    expect(survivingProse(wrapped, reflowed)).toHaveLength(1);
  });

  it("finds an English sentence left on a line where another sentence was translated", () => {
    const src = "Hello world. The router picks a device for every single job.";
    expect(survivingProse(src, "Hola mundo. The router picks a device for every single job.")).toEqual([
      "The router picks a device for every single job.",
    ]);
  });

  it("counts Devanagari words whole, vowel signs included", () => {
    expect(proseWords("प्रत्येक कार्य stdio")).toHaveLength(3);
    expect(isProseLine("प्रत्येक कार्य stdio")).toBe(false);
  });

  it("does not flag runs of names or technical tokens, with or without one connecting word", () => {
    expect(isProseLine("Format: JSON, YAML, TOML, CSV, XML, Markdown via stdio.")).toBe(false);
    expect(isProseLine("Anthropic, OpenAI, Google, Mistral, Meta and DeepSeek")).toBe(false);
    expect(isProseLine("## Model Context Protocol for Visual Studio Code")).toBe(false);
  });

  it("keeps flagging a sentence that has several function words", () => {
    expect(isProseLine("The router picks a device for every job.")).toBe(true);
  });
});

describe("the MCP and library surfaces (gm 3)", () => {
  let dir: string;
  beforeEach(() => {
    client.calls.length = 0;
    client.breakPlaceholders = true;
    dir = mkdtempSync(join(tmpdir(), "polyglot-gm-mcp-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const echoed = `${P1} zzechoalways`;
  const md = readme(echoed, P3);

  it("translateAll reports the untranslated lines per language under the default", async () => {
    const r = await translateAll(md, { targetLangs: ["es", "fr"], concurrency: 1 });
    expect(r.results.every((x) => x.status === "ok")).toBe(true);
    for (const x of r.results) {
      expect(x.untranslated).toHaveLength(1);
      expect(x.fallbacks!.length).toBeGreaterThan(0);
    }
  });

  it("translateAll turns a language with untranslated prose into an error under fail, keeping the list", async () => {
    const r = await translateAll(md, { targetLangs: ["es"], onUntranslated: "fail" });
    expect(r.results[0]!.status).toBe("error");
    expect(r.results[0]!.untranslated).toHaveLength(1);
    expect(r.failed).toBe(1);
  });

  it("translateReadme lists every language's untranslated prose and writes the files under report", async () => {
    const path = join(dir, "README.md");
    writeFileSync(path, md, "utf-8");
    const r = await translateReadme(path, { targetLangs: ["es", "fr"], concurrency: 1, navBar: false });
    expect(r.untranslated).toHaveLength(2);
    expect(r.results.every((x) => (x.untranslated ?? []).length === 1)).toBe(true);
    expect(r.outputFiles.sort()).toEqual(["README.es.md", "README.fr.md"]);
  });

  it("the tool block names the line, the language and the reason", () => {
    const text = untranslatedBlockText([
      { lang: "es", segment: "The first paragraph…", line: "The first paragraph explains how…", words: 12, reason: "echoed in a batch", retried: true },
    ]);
    expect(text).toContain("1 prose line(s) came back in English");
    expect(text).toContain("[es]");
    expect(text).toContain("echoed in a batch");
  });

  it("translateMarkdown under fail throws an UntranslatedError", async () => {
    writeFileSync(join(dir, "README.md"), md, "utf-8");
    await expect(
      translateMarkdown(md, "en", "es", { filePath: join(dir, "README.md"), onUntranslated: "fail" }),
    ).rejects.toBeInstanceOf(UntranslatedError);
  });
});

describe("a hand fix for a segment that stayed English can be pinned (gm 4)", () => {
  let dir: string;
  beforeEach(() => {
    client.calls.length = 0;
    dir = mkdtempSync(join(tmpdir(), "polyglot-gm-pin-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("pins the hand translation of an echoed paragraph without --include-uncached, and the next run keeps it", async () => {
    const echoed = `${P1} zzechoalways`;
    const md = readme(echoed, P3);
    const path = join(dir, "README.md");
    writeFileSync(path, md, "utf-8");
    const first = await translateMarkdown(md, "en", "es", { filePath: path });
    expect(first.untranslated).toHaveLength(1);

    const fixed = "El primer párrafo explica cómo el enrutador elige un dispositivo para cada trabajo.";
    const corrected = first.markdown.replace(echoed, fixed);
    const model = "translategemma:12b";
    const pinned = pinCorrections(path, "es", corrected, { model });
    expect(pinned.pinned.map((p) => p.translation)).toContain(fixed);
    expect(getPin(loadPins(path), echoed, "es")).toBe(fixed);

    const second = await translateMarkdown(md, "en", "es", { filePath: path, onUntranslated: "fail" });
    expect(second.markdown).toContain(fixed);
    expect(second.untranslated).toEqual([]);
  });
});
