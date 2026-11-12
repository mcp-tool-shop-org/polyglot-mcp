/**
 * Progress signals the Colab lane's stall guard reads (PR #82 review, 2026-11-12).
 *
 * - onProgress moves while a long document is still in its first batch call (translateBatch's
 *   onItemsDone, forwarded by translateMarkdown), not only when the whole call returns.
 * - onHeartbeat fires on every model call made while retrying an unusable segment, where onProgress
 *   cannot move, so a language that is only retrying is not mistaken for a hung one.
 *
 * Drives the real translateBatch and translateMarkdown with a scripted Ollama client: a segment that
 * contains zzechobatch comes back as the English when it travels in a joined batch, so it is retried.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SEP = "---POLYGLOT_SEP---";

vi.mock("./ollama.js", () => {
  const generate = async (req: { prompt: string }) => {
    const text = req.prompt.split("\n\n\n").slice(1).join("\n\n\n");
    const isBatch = text.includes(SEP);
    const one = (part: string, batch: boolean): string =>
      part.includes("zzechobatch") && batch ? part : `[es] ${part}`;
    if (isBatch) {
      const parts = text.split(/\n?---POLYGLOT_SEP---\n?/);
      return { model: "mock", response: parts.map((p) => one(p, true)).join(`\n${SEP}\n`), done: true };
    }
    return { model: "mock", response: one(text, false), done: true };
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

const para = (n: number) => `Paragraph number ${n} explains one more thing the router does for a job.`;
const readme = (...paras: string[]) => ["# Title", "", ...paras.flatMap((p) => [p, ""])].join("\n");

describe("translateMarkdown — stall-guard progress signals", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-heartbeat-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("onProgress reports segments done while the first batch call is still running", async () => {
    const md = readme(para(1), para(2), para(3), para(4), para(5), para(6));
    const filePath = join(dir, "README.md");
    writeFileSync(filePath, md, "utf-8");
    const seen: Array<[number, number]> = [];
    // A small batch limit splits the segments into several groups, so translateBatch reports between them.
    await translateMarkdown(md, "en", "es", {
      filePath,
      cache: false,
      batchCharLimit: 120,
      onProgress: (c, t) => seen.push([c, t]),
    });
    const total = seen[seen.length - 1][1];
    const interim = seen.filter(([c]) => c > 0 && c < total);
    expect(interim.length).toBeGreaterThan(0);
    // Never claims the whole document before the end, and never goes backwards.
    for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0]);
    expect(seen[seen.length - 1][0]).toBe(total);
  });

  it("onHeartbeat fires for each retry of an unusable segment, where onProgress cannot move", async () => {
    const md = readme(para(1), para(2).replace(/\.$/, " zzechobatch."), para(3));
    const filePath = join(dir, "README.md");
    writeFileSync(filePath, md, "utf-8");
    let beats = 0;
    const r = await translateMarkdown(md, "en", "es", { filePath, cache: false, onHeartbeat: () => beats++ });
    expect(r.retries).toBeGreaterThan(0);
    expect(beats).toBeGreaterThanOrEqual(r.retries);
  });

  it("no retry, no heartbeat", async () => {
    const md = readme(para(1), para(2));
    const filePath = join(dir, "README.md");
    writeFileSync(filePath, md, "utf-8");
    let beats = 0;
    const r = await translateMarkdown(md, "en", "es", { filePath, cache: false, onHeartbeat: () => beats++ });
    expect(r.retries).toBe(0);
    expect(beats).toBe(0);
  });
});
