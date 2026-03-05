---
title: Features
description: Auto-start, chunking, caching, validation, and more.
sidebar:
  order: 3
---

## Auto-start and auto-pull

Ollama is automatically started if it isn't running. The TranslateGemma model is automatically pulled if it isn't installed. Zero manual setup required after initial Ollama installation.

## Retry with exponential backoff

Transient Ollama failures (network blips, temporary overload) are automatically retried up to 2 times with exponential backoff (1s, 2s). Non-retryable errors (bad model name, invalid input) fail immediately.

## Smart chunking

Long text is split at natural boundaries — paragraphs, then sentences — so translation context is preserved. Chunk sizes adapt to the model:

| Model | Chunk size |
|-------|-----------|
| 2B / 4B | 2K chars |
| 12B | 4K chars |
| 27B | 6K chars |

## Segment cache

Translated segments are cached by content hash (SHA-256 of source text + target language + model). Unchanged segments skip re-translation entirely. Cache lives in `.polyglot-cache.json` with a 30-day TTL.

## Software glossary

A built-in glossary of 12 technical terms (API, CLI, SDK, etc.) ensures consistent translation of software terminology. Custom glossary entries can be passed per-request and are merged with the defaults.

## Batch translation

`translateBatch` groups multiple segments into a single prompt where possible, reducing round-trips. Falls back to individual translation if the batch separator is mangled.

## Output validation

Every translation is automatically validated:

- Empty output throws (retryable)
- Source-text echo is flagged
- Severe truncation and hallucination blowup are warned
- Garbled encoding and model meta-commentary are detected
- Warnings appear in the MCP tool response

## Streaming

`OllamaClient.generateStream()` yields tokens via NDJSON as Ollama produces them. The `translate()` function accepts an `onToken` callback for real-time progress display.

## Structured errors

All errors use `PolyglotError` with a machine-readable code (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), a human-readable message, an optional hint, and a `retryable` flag.
