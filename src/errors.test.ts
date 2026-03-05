import { describe, it, expect } from "vitest";
import { PolyglotError, friendlyError, type ErrorCode } from "./errors.js";

describe("PolyglotError", () => {
  it("sets code, message, hint, retryable", () => {
    const err = new PolyglotError({
      code: "OLLAMA_UNAVAILABLE",
      message: "Cannot connect to Ollama.",
      hint: "Start with: ollama serve",
      retryable: true,
    });
    expect(err.code).toBe("OLLAMA_UNAVAILABLE");
    expect(err.message).toBe("Cannot connect to Ollama.");
    expect(err.hint).toBe("Start with: ollama serve");
    expect(err.retryable).toBe(true);
    expect(err.name).toBe("PolyglotError");
  });

  it("defaults retryable to false", () => {
    const err = new PolyglotError({
      code: "UNSUPPORTED_LANGUAGE",
      message: "Bad language",
    });
    expect(err.retryable).toBe(false);
  });

  it("extends Error", () => {
    const err = new PolyglotError({
      code: "NETWORK_ERROR",
      message: "oops",
    });
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves cause", () => {
    const cause = new Error("underlying");
    const err = new PolyglotError({
      code: "NETWORK_ERROR",
      message: "wrap",
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  describe("toUserString", () => {
    it("includes message and hint", () => {
      const err = new PolyglotError({
        code: "OLLAMA_TIMEOUT",
        message: "Timed out",
        hint: "Try a smaller model",
      });
      const str = err.toUserString();
      expect(str).toContain("Timed out");
      expect(str).toContain("Try a smaller model");
    });

    it("omits hint when not set", () => {
      const err = new PolyglotError({
        code: "SAME_LANGUAGE",
        message: "Same language",
      });
      expect(err.toUserString()).toBe("Same language");
    });
  });

  describe("toMcpResult", () => {
    it("returns structured object", () => {
      const err = new PolyglotError({
        code: "MODEL_NOT_FOUND",
        message: "Model not found",
        hint: "Pull it",
        retryable: false,
      });
      const result = err.toMcpResult();
      expect(result).toEqual({
        code: "MODEL_NOT_FOUND",
        message: "Model not found",
        hint: "Pull it",
        retryable: false,
      });
    });
  });
});

describe("friendlyError", () => {
  it("returns toUserString for PolyglotError", () => {
    const err = new PolyglotError({
      code: "OLLAMA_UNAVAILABLE",
      message: "Cannot connect to Ollama.",
      hint: "Start with: ollama serve",
    });
    expect(friendlyError(err)).toBe("Cannot connect to Ollama.\nStart with: ollama serve");
  });

  it("handles connection errors", () => {
    const err = new Error("Cannot connect to server");
    const msg = friendlyError(err);
    expect(msg).toContain("Cannot reach Ollama");
  });

  it("handles fetch failed errors", () => {
    const err = new Error("fetch failed");
    const msg = friendlyError(err);
    expect(msg).toContain("Cannot reach Ollama");
  });

  it("handles model not found errors", () => {
    const err = new Error("Model xyz not found");
    const msg = friendlyError(err);
    expect(msg).toContain("not found");
    expect(msg).toContain("auto-pulls");
  });

  it("handles unsupported language errors", () => {
    const err = new Error('Unsupported language: "xx"');
    const msg = friendlyError(err);
    expect(msg).toContain("Unsupported");
    expect(msg).toContain("list_languages");
  });

  it("handles same language errors", () => {
    const err = new Error("Source and target languages must be different");
    const msg = friendlyError(err);
    expect(msg).toContain("nothing to translate");
  });

  it("handles generic errors with fallback", () => {
    const err = new Error("something unexpected");
    const msg = friendlyError(err);
    expect(msg).toBe("Translation failed: something unexpected");
  });

  it("handles non-Error values", () => {
    const msg = friendlyError("raw string error");
    expect(msg).toBe("Translation failed: raw string error");
  });
});
