/**
 * A translation cut off at the output cap (done_reason "length") is never kept:
 * a truncated batch is re-sent item by item, a truncated single item comes back
 * empty so the caller retries it and, failing that, reports it untranslated.
 */
import { describe, it, expect, vi } from "vitest";

const seen = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>> }));

vi.mock("./ollama.js", () => {
  const generate = async (req: { prompt: string; options?: Record<string, unknown> }) => {
    seen.options.push(req.options ?? {});
    const text = req.prompt.split("\n\n\n").slice(1).join("\n\n\n");
    if (text.includes("zztruncate")) return { model: "mock", response: "[es] half a transl", done: true, done_reason: "length" };
    if (text.includes("---POLYGLOT_SEP---")) {
      const parts = text.split(/\n?---POLYGLOT_SEP---\n?/);
      return { model: "mock", response: parts.map((p) => `[es] ${p}`).join("\n---POLYGLOT_SEP---\n"), done: true };
    }
    return { model: "mock", response: `[es] ${text}`, done: true };
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

import { translateBatch } from "./translate.js";

describe("translateBatch and the output cap", () => {
  it("gives every request an output cap sized to its source", async () => {
    seen.options.length = 0;
    await translateBatch([{ text: "Hello world" }], "en", "es");
    expect(seen.options[0].num_predict).toBe(256);
  });

  it("returns a truncated single item empty and marks it truncated", async () => {
    const r = await translateBatch([{ text: "zztruncate this" }], "en", "es");
    expect(r.translations[0]).toBe("");
    expect(r.details?.[0]).toEqual({ via: "single", truncated: true });
  });

  it("re-sends a truncated batch item by item and never keeps the cut-off text", async () => {
    const r = await translateBatch([{ text: "fine one" }, { text: "zztruncate two" }], "en", "es");
    expect(r.translations[0]).toBe("[es] fine one");
    expect(r.translations[1]).toBe("");
    expect(r.details?.[1]?.truncated).toBe(true);
  });

  it("reports progress after each group of items", async () => {
    const done: number[] = [];
    await translateBatch([{ text: "a".repeat(40) }, { text: "b".repeat(40) }, { text: "c".repeat(40) }], "en", "es", {
      batchCharLimit: 60,
      onItemsDone: (d) => done.push(d),
    });
    expect(done).toEqual([1, 2, 3]);
  });
});
