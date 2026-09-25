import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaClient } from "./ollama.js";
import { PolyglotError } from "./errors.js";

/**
 * Tests for OllamaClient.
 * These test error handling and retry logic by mocking global fetch.
 * No actual Ollama server is required.
 */

describe("OllamaClient", () => {
  let client: OllamaClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new OllamaClient("http://localhost:11434");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("generate", () => {
    it("returns response on success", async () => {
      const mockResponse = {
        model: "translategemma:12b",
        response: "こんにちは",
        done: true,
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.generate({
        model: "translategemma:12b",
        prompt: "translate hello",
      });
      expect(result.response).toBe("こんにちは");
      expect(result.done).toBe(true);
    });

    it("throws MODEL_NOT_FOUND for 404 with 'not found'", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("model 'xyz' not found"),
      });

      await expect(
        client.generate({ model: "xyz", prompt: "test" })
      ).rejects.toThrow(PolyglotError);

      try {
        await client.generate({ model: "xyz", prompt: "test" });
      } catch (err) {
        expect(err).toBeInstanceOf(PolyglotError);
        expect((err as PolyglotError).code).toBe("MODEL_NOT_FOUND");
        expect((err as PolyglotError).retryable).toBe(false);
      }
    });

    it("throws OLLAMA_ERROR for 500 server errors (retryable)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("internal server error"),
      });

      // Suppress stderr during retry
      const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      try {
        await client.generate({ model: "translategemma:12b", prompt: "test" });
      } catch (err) {
        expect(err).toBeInstanceOf(PolyglotError);
        expect((err as PolyglotError).code).toBe("OLLAMA_ERROR");
        expect((err as PolyglotError).retryable).toBe(true);
      }

      stderrWrite.mockRestore();
    });

    it("throws OLLAMA_UNAVAILABLE when fetch fails with TypeError", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(
        new TypeError("fetch failed")
      );

      // Suppress stderr during retry
      const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      try {
        await client.generate({ model: "translategemma:12b", prompt: "test" });
      } catch (err) {
        expect(err).toBeInstanceOf(PolyglotError);
        expect((err as PolyglotError).code).toBe("OLLAMA_UNAVAILABLE");
      }

      stderrWrite.mockRestore();
    });

    it("retries on retryable errors", async () => {
      let callCount = 0;
      const mockResponse = {
        model: "translategemma:12b",
        response: "success",
        done: true,
      };

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          // First two calls return 500
          return {
            ok: false,
            status: 500,
            text: () => Promise.resolve("temporary error"),
          };
        }
        // Third call succeeds
        return {
          ok: true,
          json: () => Promise.resolve(mockResponse),
        };
      });

      // Suppress stderr during retry
      const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const result = await client.generate({
        model: "translategemma:12b",
        prompt: "test",
      });

      expect(result.response).toBe("success");
      expect(callCount).toBe(3); // 2 failures + 1 success

      stderrWrite.mockRestore();
    });

    it("gives up after MAX_RETRIES", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("persistent error"),
      });

      // Suppress stderr during retry
      const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      try {
        await client.generate({ model: "translategemma:12b", prompt: "test" });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PolyglotError);
        expect((err as PolyglotError).code).toBe("OLLAMA_ERROR");
      }

      // 1 initial + 2 retries = 3 total attempts
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);

      stderrWrite.mockRestore();
    });

    it("does not retry non-retryable errors", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("model 'bad' not found"),
      });

      try {
        await client.generate({ model: "bad", prompt: "test" });
      } catch (err) {
        expect(err).toBeInstanceOf(PolyglotError);
        expect((err as PolyglotError).code).toBe("MODEL_NOT_FOUND");
      }

      // Only 1 attempt — no retries
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("isAvailable", () => {
    it("returns true when server responds ok", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      const available = await client.isAvailable();
      expect(available).toBe(true);
    });

    it("returns false when fetch throws", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));
      const available = await client.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe("listModels", () => {
    it("returns model list from Ollama", async () => {
      const models = [
        { name: "translategemma:12b", size: 8.1e9, digest: "abc123" },
      ];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models }),
      });

      const result = await client.listModels();
      expect(result).toEqual(models);
    });

    it("throws on non-ok response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(client.listModels()).rejects.toThrow("Ollama list failed");
    });
  });

  describe("hasModel", () => {
    it("returns true for exact match", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: "translategemma:12b", size: 8e9, digest: "x" }],
          }),
      });
      expect(await client.hasModel("translategemma:12b")).toBe(true);
    });

    it("returns true for prefix match (name + colon)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: "translategemma:12b", size: 8e9, digest: "x" }],
          }),
      });
      expect(await client.hasModel("translategemma")).toBe(true);
    });

    it("returns false when model not present", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      });
      expect(await client.hasModel("translategemma:12b")).toBe(false);
    });
  });

  describe("generateStream", () => {
    /** Helper to create a ReadableStream from NDJSON lines. */
    function makeNdjsonStream(lines: object[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      const chunks = lines.map((l) => encoder.encode(JSON.stringify(l) + "\n"));
      let idx = 0;
      return new ReadableStream({
        pull(controller) {
          if (idx < chunks.length) {
            controller.enqueue(chunks[idx++]);
          } else {
            controller.close();
          }
        },
      });
    }

    it("streams tokens and returns full response", async () => {
      const ndjson = [
        { model: "translategemma:12b", response: "Bon", done: false },
        { model: "translategemma:12b", response: "jour", done: false },
        { model: "translategemma:12b", response: "", done: true },
      ];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: makeNdjsonStream(ndjson),
      });

      const tokens: string[] = [];
      const result = await client.generateStream(
        { model: "translategemma:12b", prompt: "translate hello" },
        (token) => tokens.push(token)
      );
      expect(tokens).toEqual(["Bon", "jour"]);
      expect(result.response).toBe("Bonjour");
      expect(result.done).toBe(true);
    });

    it("throws MODEL_NOT_FOUND for 404 responses", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("model 'xyz' not found"),
      });

      const tokens: string[] = [];
      try {
        await client.generateStream(
          { model: "xyz", prompt: "test" },
          (t) => tokens.push(t)
        );
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PolyglotError);
        expect((err as PolyglotError).code).toBe("MODEL_NOT_FOUND");
      }
    });

    it("retries on retryable 500 errors", async () => {
      let callCount = 0;
      const ndjson = [
        { model: "translategemma:12b", response: "OK", done: true },
      ];

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 1) {
          return { ok: false, status: 500, text: () => Promise.resolve("server error") };
        }
        return { ok: true, body: makeNdjsonStream(ndjson) };
      });

      const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const tokens: string[] = [];
      const result = await client.generateStream(
        { model: "translategemma:12b", prompt: "test" },
        (t) => tokens.push(t)
      );
      expect(result.response).toBe("OK");
      expect(callCount).toBe(2);
      stderrWrite.mockRestore();
    });

    it("throws OLLAMA_UNAVAILABLE on fetch failure", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(
        new TypeError("fetch failed")
      );

      const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        await client.generateStream(
          { model: "translategemma:12b", prompt: "test" },
          () => {}
        );
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PolyglotError);
        expect((err as PolyglotError).code).toBe("OLLAMA_UNAVAILABLE");
      }
      stderrWrite.mockRestore();
    });

    it("throws OLLAMA_ERROR when no response body", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      });

      try {
        await client.generateStream(
          { model: "translategemma:12b", prompt: "test" },
          () => {}
        );
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PolyglotError);
        expect((err as PolyglotError).code).toBe("OLLAMA_ERROR");
        expect((err as PolyglotError).message).toContain("no response body");
      }
    });

    it("handles malformed NDJSON lines gracefully", async () => {
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode('{"model":"m","response":"A","done":false}\n'),
        encoder.encode('NOT JSON\n'),
        encoder.encode('{"model":"m","response":"B","done":true}\n'),
      ];
      let idx = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (idx < chunks.length) controller.enqueue(chunks[idx++]);
          else controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      });

      const tokens: string[] = [];
      const result = await client.generateStream(
        { model: "m", prompt: "test" },
        (t) => tokens.push(t)
      );
      expect(tokens).toEqual(["A", "B"]);
      expect(result.response).toBe("AB");
    });
  });
});

// ─── Cloud auth ────────────────────────────────────────────────────
//
// The client attaches an OLLAMA_API_KEY Bearer header only when the host is
// NOT loopback. Both halves matter and neither is cosmetic: a local Ollama
// 403s when it receives an auth header, and an API key is a credential that
// must never leave for a host the operator did not point us at. These pin the
// routing decision rather than trusting the regex by eye.

describe("OllamaClient — cloud auth", () => {
  const originalFetch = globalThis.fetch;
  const originalHost = process.env.OLLAMA_HOST;
  const originalKey = process.env.OLLAMA_API_KEY;

  /** Capture the headers of the next fetch, answering with an empty model list. */
  const captureHeaders = () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });
    globalThis.fetch = spy;
    return spy;
  };

  const setEnv = (host?: string, key?: string) => {
    if (host === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = host;
    if (key === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = key;
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setEnv(originalHost, originalKey);
    vi.restoreAllMocks();
  });

  it("does NOT authenticate to a loopback host even when a key is set", () => {
    setEnv(undefined, "sk-secret");
    for (const host of [
      "http://localhost:11434",
      "http://127.0.0.1:11434",
      "http://0.0.0.0:11434",
      "http://[::1]:11434",
      "http://localhost",
      "HTTP://LOCALHOST:11434",
    ]) {
      expect(new OllamaClient(host).cloud, `${host} must stay local`).toBe(false);
    }
  });

  it("authenticates to a remote host when a key is set", () => {
    setEnv(undefined, "sk-secret");
    expect(new OllamaClient("https://ollama.com").cloud).toBe(true);
  });

  it("does NOT authenticate to a remote host when no key is set", () => {
    setEnv(undefined, undefined);
    expect(new OllamaClient("https://ollama.com").cloud).toBe(false);
  });

  it("treats a blank or whitespace-only key as no key", () => {
    setEnv(undefined, "   ");
    expect(new OllamaClient("https://ollama.com").cloud).toBe(false);
  });

  it("sends the Bearer header on a cloud request and none on a local one", async () => {
    setEnv(undefined, "sk-secret");

    const cloudFetch = captureHeaders();
    await new OllamaClient("https://ollama.com").listModels();
    const cloudHeaders = cloudFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(cloudHeaders.Authorization).toBe("Bearer sk-secret");

    const localFetch = captureHeaders();
    await new OllamaClient("http://localhost:11434").listModels();
    const localHeaders = (localFetch.mock.calls[0][1].headers ?? {}) as Record<string, string>;
    expect(localHeaders.Authorization).toBeUndefined();
  });

  it("does not treat a hostname that merely starts with 'localhost' as loopback", () => {
    // http://localhost.example.com is a remote host. Matching it as loopback
    // would silently drop auth; the operator set OLLAMA_HOST to it on purpose.
    setEnv(undefined, "sk-secret");
    expect(new OllamaClient("http://localhost.example.com").cloud).toBe(true);
  });

  it("strips trailing slashes before deciding, so a slashed loopback URL stays local", () => {
    setEnv(undefined, "sk-secret");
    expect(new OllamaClient("http://127.0.0.1:11434/").cloud).toBe(false);
  });

  it("defaults its base URL to OLLAMA_HOST", async () => {
    setEnv("https://ollama.example", "sk-secret");
    const spy = captureHeaders();
    const client = new OllamaClient();
    expect(client.cloud).toBe(true);
    await client.listModels();
    expect(spy.mock.calls[0][0]).toBe("https://ollama.example/api/tags");
  });

  it("skips the has-model/pull dance on a cloud host", async () => {
    // Cloud models are served on demand — there is nothing to pull, and probing
    // /api/tags would just cost a round trip before every translation.
    setEnv(undefined, "sk-secret");
    const spy = captureHeaders();
    await expect(new OllamaClient("https://ollama.com").ensureModel("translategemma:27b")).resolves.toBe(
      true,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("still probes locally before pulling on a loopback host", async () => {
    setEnv(undefined, "sk-secret");
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: "translategemma:27b" }] }),
    });
    globalThis.fetch = spy;
    await expect(
      new OllamaClient("http://localhost:11434").ensureModel("translategemma:27b"),
    ).resolves.toBe(true);
    expect(spy).toHaveBeenCalled();
  });
});
