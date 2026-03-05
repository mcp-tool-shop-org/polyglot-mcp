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
});
