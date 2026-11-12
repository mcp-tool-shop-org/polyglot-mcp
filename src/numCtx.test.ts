/**
 * The pinned context window: num_ctx on every request, an output cap per segment,
 * and a refusal (never a silent truncation) when the prompt cannot fit.
 *
 * 2026-11-12: an unpinned Ollama 0.40.15 served translategemma:27b at context 131072
 * (a 49,152 MiB KV cache, one slot) and a G4 window stalled on a 21.7 KB README.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { OllamaClient } from "./ollama.js";
import { DEFAULT_NUM_CTX, estimateTokens, numPredictFor, resolveNumCtx } from "./numCtx.js";

describe("numPredictFor", () => {
  it("caps a segment at max(256, 3 x its source tokens)", () => {
    const small = "a".repeat(30);
    expect(numPredictFor("p".repeat(300), small, 8192)).toBe(256);
    const src = "b".repeat(900); // 300 tokens
    expect(numPredictFor("p".repeat(1200), src, 8192)).toBe(900);
  });

  it("is cut to what the window leaves after the prompt", () => {
    const src = "c".repeat(6000); // 2000 tokens, wants 6000
    const prompt = "p".repeat(6600); // 2200 tokens
    expect(numPredictFor(prompt, src, 8192)).toBe(8192 - 2200);
  });

  it("refuses PROMPT_EXCEEDS_CONTEXT when the room cannot hold a one-for-one translation", () => {
    const src = "d".repeat(6000);
    expect(() => numPredictFor("p".repeat(6600), src, 4096)).toThrowError(
      expect.objectContaining({ code: "PROMPT_EXCEEDS_CONTEXT" }),
    );
  });

  it("the default window holds the largest batch the translator builds (about 2200 prompt tokens, 2000 source tokens)", () => {
    expect(DEFAULT_NUM_CTX).toBe(8192);
    expect(() => numPredictFor("p".repeat(6600), "s".repeat(6000), DEFAULT_NUM_CTX)).not.toThrow();
    expect(estimateTokens("abc")).toBe(1);
  });
});

describe("resolveNumCtx", () => {
  afterEach(() => {
    delete process.env.POLYGLOT_NUM_CTX;
  });
  it("defaults to the pin and takes POLYGLOT_NUM_CTX when sane", () => {
    expect(resolveNumCtx()).toBe(8192);
    process.env.POLYGLOT_NUM_CTX = "16384";
    expect(resolveNumCtx()).toBe(16384);
    process.env.POLYGLOT_NUM_CTX = "12";
    expect(resolveNumCtx()).toBe(8192);
  });
});

describe("OllamaClient window", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends num_ctx and num_predict on every generate request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ model: "m", response: "x", done: true }),
    });
    globalThis.fetch = fetchMock;
    await new OllamaClient("http://localhost:11434").generate({ model: "m", prompt: "hello", options: { temperature: 0.1 } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.options.num_ctx).toBe(8192);
    expect(body.options.num_predict).toBeGreaterThanOrEqual(256);
    expect(body.options.temperature).toBe(0.1);
  });

  it("refuses an oversize prompt before any request goes out", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const big = "x".repeat(3 * 8192);
    await expect(new OllamaClient("http://localhost:11434").generate({ model: "m", prompt: big })).rejects.toMatchObject({
      code: "PROMPT_EXCEEDS_CONTEXT",
    });
    await expect(
      new OllamaClient("http://localhost:11434").generate({
        model: "m",
        prompt: "x".repeat(3 * 5000),
        options: { num_predict: 4000 },
      }),
    ).rejects.toMatchObject({ code: "PROMPT_EXCEEDS_CONTEXT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the pin", () => {
  it("DEFAULT_NUM_CTX equals PINNED_TRANSLATOR_CONTEXT in the Colab launcher", async () => {
    const { readFileSync } = await import("node:fs");
    const sh = readFileSync(new URL("../scripts/colab/launch_translate.sh", import.meta.url), "utf-8");
    expect(/^PINNED_TRANSLATOR_CONTEXT="(\d+)"/m.exec(sh)?.[1]).toBe(String(DEFAULT_NUM_CTX));
  });
});
