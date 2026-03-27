---
title: Features
description: Auto-start, chunking, caching, validation, and more.
sidebar:
  order: 3
---

## Auto-start and auto-pull

Ollama is automatically started if it is not running. On Windows, Polyglot checks known install locations (`%LOCALAPPDATA%\Programs\Ollama`, `%LOCALAPPDATA%\Ollama`) before falling back to the system PATH. If Ollama starts successfully, Polyglot waits up to 10 seconds for it to become available.

The TranslateGemma model is automatically pulled if it is not installed. Pull progress is streamed to stderr so you can see download status. Zero manual setup required after the initial Ollama installation.

## Retry with exponential backoff

Transient Ollama failures (network blips, temporary overload, timeouts) are automatically retried up to 2 times with exponential backoff (1s, 2s). Non-retryable errors (bad model name, unsupported language, same source/target language) fail immediately without wasting retry attempts.

## Smart chunking

Long text is split at natural boundaries -- paragraphs first, then sentences, then any newline -- so translation context is preserved. Chunk sizes adapt to the model capacity:

| Model | Chunk size |
|-------|-----------|
| 2B / 4B | 2,000 chars |
| 12B | 4,000 chars |
| 27B | 6,000 chars |

If no good split point is found within the first 30% of the chunk limit, the text is hard-split at the maximum size.

## Segment cache

Translated segments are cached by content hash (SHA-256 of source text + target language + model, truncated to 16 hex characters). Unchanged segments skip re-translation entirely. The cache lives in `.polyglot-cache.json` alongside the source file with a 30-day TTL. Expired entries are pruned automatically on load.

## Translation memory (fuzzy cache)

When an exact cache hit is not found, Polyglot checks for near-miss segments using Levenshtein similarity (Wagner-Fischer algorithm with single-row optimization). If a cached source is 85% or more similar to the current segment, the existing translation is reused. This dramatically speeds up retranslation after minor README edits. Fuzzy matching only considers entries that share the same target language and model to prevent cross-language contamination.

## Concurrency semaphore

All Ollama calls are guarded by a counting semaphore (default limit: 1) to prevent GPU OOM on systems with limited VRAM. The semaphore queues excess requests and releases them in order. Override with `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

The `translate_all` tool adds a second layer of concurrency control via its own semaphore (default: 2, max: 3 concurrent languages).

## MCP progress tokens

All five tools report progress via MCP `notifications/progress` when the client provides a `progressToken`. The translate tool reports per-chunk, translate_markdown reports per-segment-batch, translate_all reports per-language, and check_status reports per-step (Ollama check, model list, ready).

## Software glossary

A built-in glossary of 12 technical terms (Architecture, Adoption, Pipeline, Deploy, Library, Framework, Build, Release, Branch, Repository, Merge, Token) ensures consistent translation of software terminology. Each term has target-language translations for languages where TranslateGemma commonly picks the wrong domain sense (e.g., "Architecture" as building design instead of software architecture). Custom glossary entries can be passed per-request via the `glossary` parameter and are merged with the defaults.

Glossary hints are injected into the prompt only when the source text actually contains the term and a translation exists for the target language.

## Batch translation

The `translateBatch` function groups multiple segments into a single prompt separated by `---POLYGLOT_SEP---` markers, reducing Ollama round-trips. If the model mangles the separators (output segment count does not match input), Polyglot falls back to translating each item individually. Single-item batches skip the separator overhead entirely.

## Output validation

Every translation is automatically validated:

- **Empty output** throws a retryable `TRANSLATE_ERROR`
- **Source-text echo** is flagged (skipped for short/technical strings under 15 characters)
- **Severe truncation** warns when output is below 15% of source length
- **Hallucination blowup** warns when output exceeds 800% of source length
- **Garbled encoding** is detected when replacement/control characters exceed 5% of the output
- **Model meta-commentary** is detected (e.g., "Here is the translation:", "Note:", "Disclaimer:")

Warnings appear in the MCP tool response alongside the translated text.

## Streaming

`OllamaClient.generateStream()` reads NDJSON chunks from Ollama as they arrive and fires an `onToken` callback for each one. The full response is accumulated and returned when the stream ends. Both streaming and non-streaming paths share the same retry and semaphore logic.

## Structured errors

All errors use `PolyglotError` with a machine-readable code, a human-readable message, an optional hint, and a `retryable` flag. Error codes include: `OLLAMA_UNAVAILABLE`, `OLLAMA_TIMEOUT`, `MODEL_NOT_FOUND`, `MODEL_PULL_FAILED`, `UNSUPPORTED_LANGUAGE`, `SAME_LANGUAGE`, `NETWORK_ERROR`, `OLLAMA_ERROR`, `TRANSLATE_ERROR`. The `friendlyError()` helper converts any thrown value into a user-friendly string for MCP tool responses.

## Post-translation polish

The polish layer cleans up common TranslateGemma output quirks: alternative translations separated by "or" in 12 languages are stripped (keeping only the first translation), trailing sentence-end punctuation is removed from headings, and excessive whitespace is normalized. Table cells get additional polish to collapse embedded newlines into spaces.
