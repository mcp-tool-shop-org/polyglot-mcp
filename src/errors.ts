/**
 * Structured error handling for Polyglot MCP.
 *
 * Follows the Shipcheck Tier 1 error contract:
 *   code · message · hint · cause? · retryable?
 *
 * MCP tool handlers convert PolyglotError into structured isError results.
 */

export type ErrorCode =
  | "OLLAMA_UNAVAILABLE"
  | "OLLAMA_TIMEOUT"
  | "MODEL_NOT_FOUND"
  | "MODEL_PULL_FAILED"
  | "UNSUPPORTED_LANGUAGE"
  | "SAME_LANGUAGE"
  | "NETWORK_ERROR"
  | "OLLAMA_ERROR"
  | "TRANSLATE_ERROR";

export class PolyglotError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly retryable: boolean;
  override readonly cause?: Error;

  constructor(opts: {
    code: ErrorCode;
    message: string;
    hint?: string;
    cause?: Error;
    retryable?: boolean;
  }) {
    super(opts.message);
    this.name = "PolyglotError";
    this.code = opts.code;
    this.hint = opts.hint;
    this.retryable = opts.retryable ?? false;
    this.cause = opts.cause;
  }

  /** Format for user display (no stack traces). */
  toUserString(): string {
    const parts = [this.message];
    if (this.hint) parts.push(this.hint);
    return parts.join("\n");
  }

  /** Format for MCP tool error results. */
  toMcpResult(): {
    code: string;
    message: string;
    hint?: string;
    retryable: boolean;
  } {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      retryable: this.retryable,
    };
  }
}

/** Convert any thrown value to a user-friendly error string. */
export function friendlyError(err: unknown): string {
  if (err instanceof PolyglotError) {
    return err.toUserString();
  }

  const msg = err instanceof Error ? err.message : String(err);

  // Connection errors
  if (msg.includes("Cannot connect") || msg.includes("fetch failed")) {
    return [
      "Cannot reach Ollama.",
      "",
      "Polyglot tried to auto-start it but couldn't connect.",
      "Make sure Ollama is installed (https://ollama.com) and try again.",
    ].join("\n");
  }

  // Model not found
  if (msg.includes("not found")) {
    return [
      msg,
      "",
      "The translate tool normally auto-pulls models, but the pull may have",
      "failed. Check your internet connection and try: ollama pull translategemma:12b",
    ].join("\n");
  }

  // Unsupported language
  if (msg.includes("Unsupported")) {
    return [
      msg,
      "",
      'Use the list_languages tool to see all 55 supported languages.',
      'You can use either language codes ("en") or names ("English").',
    ].join("\n");
  }

  // Same language
  if (msg.includes("must be different")) {
    return "Source and target languages are the same — nothing to translate.";
  }

  // Generic fallback
  return `Translation failed: ${msg}`;
}
