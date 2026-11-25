import { PolyglotError } from "./errors.js";

/**
 * The context window every request asks Ollama for, in tokens. Per slot: with
 * OLLAMA_NUM_PARALLEL=n the server holds n of them. It must equal
 * PINNED_TRANSLATOR_CONTEXT in scripts/colab/launch_translate.sh (a test checks
 * that). Sized from the repo's own largest batch: a 6,000-character batch plus its
 * prompt is about 2,200 tokens and its translation up to 3x the source, so 4096
 * cannot hold them and 8192 can. Override with POLYGLOT_NUM_CTX.
 */
export const DEFAULT_NUM_CTX = 8192;

/** Tokenizer-free estimate: one token per three characters. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** Parse a `-<N>k` or `:<N>k` context suffix from a model tag (e.g. `translategemma:27b-16k` -> 16384). */
export function parseModelContextTag(model?: string): number | undefined {
  if (!model) return undefined;
  const m = /[-:_](\d{1,4})[kK]$/.exec(model.trim());
  if (!m) return undefined;
  const k = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(k) || k < 1 || k > 256) return undefined;
  const tokens = k * 1024;
  return tokens >= 512 ? tokens : undefined;
}

/**
 * The num_ctx a request carries: POLYGLOT_NUM_CTX when set and sane, else a
 * `-<N>k` tag on `model` (or `POLYGLOT_MODEL`), else the pinned default.
 */
export function resolveNumCtx(model?: string): number {
  const raw = Number.parseInt(process.env.POLYGLOT_NUM_CTX ?? "", 10);
  if (Number.isFinite(raw) && raw >= 512) return raw;
  return parseModelContextTag(model ?? process.env.POLYGLOT_MODEL) ?? DEFAULT_NUM_CTX;
}

/** Smallest output budget a request may have. */
export const MIN_NUM_PREDICT = 256;

/**
 * The output cap for one segment: max(256, 3 x the source's estimated tokens), cut to
 * what the window leaves after the prompt. Refuses (PROMPT_EXCEEDS_CONTEXT) when the
 * room left cannot hold even a one-for-one translation: it never truncates the
 * prompt, and never sends a request the window cannot answer.
 */
export function numPredictFor(
  prompt: string,
  sourceText: string,
  numCtx: number = resolveNumCtx()
): number {
  const srcTokens = estimateTokens(sourceText);
  const wanted = Math.max(MIN_NUM_PREDICT, 3 * srcTokens);
  const room = numCtx - estimateTokens(prompt);
  if (room < Math.max(MIN_NUM_PREDICT, srcTokens)) {
    throw new PolyglotError({
      code: "PROMPT_EXCEEDS_CONTEXT",
      message: `Prompt of about ${estimateTokens(prompt)} tokens leaves ${Math.max(0, room)} of num_ctx ${numCtx} for the answer; the source alone needs about ${srcTokens}.`,
      hint: "Use a smaller batch (batchCharLimit) or raise POLYGLOT_NUM_CTX together with the server's OLLAMA_CONTEXT_LENGTH.",
      retryable: false,
    });
  }
  return Math.min(wanted, room);
}
