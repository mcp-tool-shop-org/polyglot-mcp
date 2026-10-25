/**
 * Prose that comes back in English must not pass as translated.
 *
 * cognate 9529cf4 and interlock, 2026-10-25: translate-all reported every
 * language "ok" while whole prose segments stayed English (38 sentences in one
 * language, the whole threat-model list). A model that echoes a part back while
 * the batch splitter still finds the right number of separators looks like
 * success to every other check.
 *
 * This drives the real translateBatch and translateMarkdown with a scripted
 * Ollama client. A segment containing zzechobatch is returned as the English when
 * it travels in a joined batch; one containing zzechoalways is returned as the
 * English however it is sent; one containing zzdropsep makes the client lose
 * a separator so the batch has to fall back to one call per item; one containing
 * zzemptypart is returned as an empty part. Every other segment is "translated"
 * by prefixing it with "[es] ".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SEP = "---POLYGLOT_SEP---";

const client = vi.hoisted(() => ({ calls: [] as Array<{ batch: boolean; text: string }> }));

vi.mock("./ollama.js", () => {
  const generate = async (req: { prompt: string }) => {
    const text = req.prompt.split("\n\n\n").slice(1).join("\n\n\n");
    const isBatch = text.includes("---POLYGLOT_SEP---");
    client.calls.push({ batch: isBatch, text });
    const translateOne = (part: string, batch: boolean): string => {
      if (part.includes("zzechoalways")) return part;
      if (part.includes("zzechobatch") && batch) return part;
      if (part.includes("zzemptypart") && batch) return "";
      return `[es] ${part}`;
    };
    if (isBatch) {
      const parts = text.split(/\n?---POLYGLOT_SEP---\n?/);
      const out = parts.map((p) => translateOne(p, true));
      if (parts.some((p) => p.includes("zzdropsep"))) {
        // The model merges two parts: one separator is lost.
        return { model: "mock", response: out.join(`\n${SEP}\n`).replace(`\n${SEP}\n`, "\n\n"), done: true };
      }
      return { model: "mock", response: out.join(`\n${SEP}\n`), done: true };
    }
    return { model: "mock", response: translateOne(text, false), done: true };
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

import { translateMarkdown } from "./translateMarkdown.js";
import {
  UntranslatedError,
  enforceUntranslatedPolicy,
  formatFallbacks,
  formatUntranslated,
  isProseLine,
  parseUntranslatedPolicy,
  proseWords,
  survivingProse,
} from "./survival.js";
import { createPins, savePins, setPin } from "./pins.js";

const P1 = "The first paragraph explains how the router picks a device for every job.";
const P2 = "The second paragraph says what a receipt records after a measured run.";
const P3 = "The third paragraph lists the limits the guard enforces before it starts.";

const readme = (...paras: string[]) => ["# Title", "", ...paras.flatMap((p) => [p, ""])].join("\n");

describe("translateMarkdown — prose that comes back in English", () => {
  let dir: string;
  beforeEach(() => {
    client.calls.length = 0;
    dir = mkdtempSync(join(tmpdir(), "polyglot-untranslated-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (md: string, extra: Record<string, unknown> = {}) => {
    const filePath = join(dir, "README.md");
    writeFileSync(filePath, md, "utf-8");
    return translateMarkdown(md, "en", "es", { filePath, ...extra });
  };

  it("a clean run reports nothing untranslated and nothing retried", async () => {
    const r = await run(readme(P1, P2, P3));
    expect(r.untranslated).toEqual([]);
    expect(r.fallbacks).toEqual([]);
    expect(r.retries).toBe(0);
    expect(r.markdown).toContain(`[es] ${P1}`);
  });

  it("batch path: a part echoed while the separators still match is retried alone and recovered", async () => {
    const echoed = `${P2} zzechobatch`;
    const r = await run(readme(P1, echoed, P3));
    expect(r.untranslated).toEqual([]);
    expect(r.markdown).toContain(`[es] ${echoed}`);
    expect(r.retries).toBe(1);
    expect(r.fallbacks).toHaveLength(1);
    expect(r.fallbacks[0]).toMatchObject({ lang: "es", retried: true, recovered: true });
    expect(r.fallbacks[0]!.reason).toContain("echoed");
    // the batch call, then the one individual retry
    expect(client.calls.filter((c) => c.batch)).toHaveLength(1);
    expect(client.calls.filter((c) => !c.batch)).toHaveLength(1);
  });

  it("individual path: a segment echoed even alone is reported untranslated after one retry", async () => {
    const echoed = `${P2} zzechoalways`;
    const r = await run(readme(P1, echoed, P3));
    expect(r.untranslated).toHaveLength(1);
    expect(r.untranslated[0]).toMatchObject({ lang: "es", retried: true });
    expect(r.untranslated[0]!.line).toContain("The second paragraph"); // the report shortens the line
    expect(r.untranslated[0]!.words).toBeGreaterThanOrEqual(6);
    expect(r.retries).toBe(1);
    expect(r.fallbacks[0]).toMatchObject({ retried: true, recovered: false });
  });

  it("separator-count mismatch: the fallback is reported with its reason, and an echo there is still caught", async () => {
    const dropped = `${P1} zzdropsep`;
    const echoed = `${P3} zzechoalways`;
    const r = await run(readme(dropped, P2, echoed));
    const reasons = r.fallbacks.map((f) => f.reason).join(" | ");
    expect(reasons).toContain("separator-count mismatch");
    expect(r.untranslated).toHaveLength(1);
    expect(r.untranslated[0]!.line).toContain("The third paragraph");
    expect(r.untranslated[0]!.reason).toContain("separator-count mismatch");
  });

  it("an empty part falls back to the source text and is caught as untranslated, with its reason", async () => {
    const empty = `${P2} zzemptypart`;
    const r = await run(readme(P1, empty, P3));
    // the retry on its own succeeds, so the empty part is recovered
    expect(r.untranslated).toEqual([]);
    expect(r.fallbacks.map((f) => f.reason).join(" | ")).toContain("empty");
    expect(r.markdown).toContain(`[es] ${empty}`);
  });

  it("--on-untranslated=fail throws an UntranslatedError that carries the result", async () => {
    const echoed = `${P2} zzechoalways`;
    const err = await run(readme(P1, echoed, P3), { onUntranslated: "fail" }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UntranslatedError);
    const e = err as UntranslatedError<{ markdown: string }>;
    expect(e.code).toBe("UNTRANSLATED");
    expect(e.untranslated).toHaveLength(1);
    expect(e.hint).toContain("--on-untranslated=report");
    expect(e.result?.markdown).toContain(echoed);
  });

  it("report mode (the library default) returns the list and does not throw", async () => {
    const echoed = `${P2} zzechoalways`;
    const r = await run(readme(P1, echoed, P3), { onUntranslated: "report" });
    expect(r.untranslated).toHaveLength(1);
  });

  it("never caches a segment that is still English", async () => {
    const echoed = `${P2} zzechoalways`;
    await run(readme(P1, echoed, P3));
    const cache = readFileSync(join(dir, ".polyglot-cache.json"), "utf-8");
    expect(cache).not.toContain("zzechoalways");
    expect(cache).toContain("[es] ");
  });

  it("a cached English entry is not reused", async () => {
    const md = readme(P1, P2, P3);
    await run(md);
    // Corrupt the cache the way an earlier echoing run did: P2 cached as the English.
    const cachePath = join(dir, ".polyglot-cache.json");
    const raw = readFileSync(cachePath, "utf-8");
    writeFileSync(cachePath, raw.replace(`[es] ${P2}`, P2), "utf-8");
    client.calls.length = 0;
    const r = await translateMarkdown(md, "en", "es", { filePath: join(dir, "README.md") });
    expect(r.markdown).toContain(`[es] ${P2}`);
    expect(r.untranslated).toEqual([]);
  });

  it("a legitimate English-only line is not flagged: a short product name, a list of names, code", async () => {
    const names = "Anthropic OpenAI Google Mistral Meta DeepSeek Alibaba";
    const md = ["# Title", "", "Polyglot MCP", "", names, "", "`npm install @mcptoolshop/polyglot-mcp`", "", P1, ""].join("\n");
    const r = await run(md, { onUntranslated: "fail" });
    expect(r.untranslated).toEqual([]);
    expect(r.retries).toBe(0);
  });

  it("a pinned segment kept in English on purpose is not flagged", async () => {
    const md = readme(P1, P2);
    const filePath = join(dir, "README.md");
    writeFileSync(filePath, md, "utf-8");
    const pins = createPins();
    setPin(pins, P2, "es", P2);
    savePins(filePath, pins);
    const r = await translateMarkdown(md, "en", "es", { filePath, onUntranslated: "fail" });
    expect(r.untranslated).toEqual([]);
  });
});

describe("prose rules", () => {
  it("counts words outside code spans, links, URLs and placeholders", () => {
    expect(proseWords("Run `npm install` from [the docs](https://example.com/a/b) at https://x.dev now")).toEqual([
      "Run",
      "from",
      "at",
      "now",
    ]);
  });

  it("needs 6 words and is not a list of names", () => {
    expect(isProseLine("Five words are not enough")).toBe(false);
    expect(isProseLine("Six words are enough for prose")).toBe(true);
    expect(isProseLine("Anthropic OpenAI Google Mistral Meta DeepSeek")).toBe(false);
    expect(isProseLine("- `code` `code` `code` `code` `code` `code` `code`")).toBe(false);
    expect(isProseLine("[A link with many words in its label](https://example.com)")).toBe(false);
  });

  it("finds source prose lines that appear verbatim in a translation, ignoring list markers", () => {
    const src = "- The router picks a device for every job.\n- Short line.";
    expect(survivingProse(src, "* The router picks a device for every job.\n* Línea corta.")).toEqual([
      "- The router picks a device for every job.",
    ]);
    expect(survivingProse(src, "- El enrutador elige un dispositivo para cada trabajo.")).toEqual([]);
  });
});

describe("untranslated policy and report lines", () => {
  const item = {
    lang: "es",
    segment: "The second paragraph says what a receipt records…",
    line: "The second paragraph says what a receipt records after a measured run.",
    words: 12,
    reason: "echoed in a batch",
    retried: true,
  };

  it("parses --on-untranslated values and rejects anything else", () => {
    expect(parseUntranslatedPolicy(undefined, "fail")).toBe("fail");
    expect(parseUntranslatedPolicy("report", "fail")).toBe("report");
    expect(parseUntranslatedPolicy("fail", "report")).toBe("fail");
    expect(() => parseUntranslatedPolicy("sometimes", "fail")).toThrow(/Invalid --on-untranslated value/);
  });

  it("enforces the policy only under fail and only when something is left", () => {
    expect(() => enforceUntranslatedPolicy([item], "report")).not.toThrow();
    expect(() => enforceUntranslatedPolicy([], "fail")).not.toThrow();
    expect(() => enforceUntranslatedPolicy([item], "fail")).toThrow(UntranslatedError);
  });

  it("formats one line per untranslated segment and per fallback", () => {
    expect(formatUntranslated([item])[0]).toContain("[es]");
    expect(formatUntranslated([item])[0]).toContain("retried once");
    const lines = formatFallbacks([
      { lang: "es", segment: "a", reason: "echoed in a batch", retried: true, recovered: true },
      { lang: "es", segment: "b", reason: "echoed as a single item", retried: true, recovered: false },
      { lang: "es", segment: "c", reason: "separator-count mismatch (re-sent on its own)", retried: false, recovered: true },
    ]);
    expect(lines[0]).toContain("retried, translated");
    expect(lines[1]).toContain("retried, still English");
    expect(lines[2]).not.toContain("retried");
  });
});
