---
title: Features
description: Auto-start, chunking, caching, validation, and more.
sidebar:
  order: 3
---

## Auto-start and auto-pull

Ollama is automatically started if it is not running. On Windows, Polyglot checks known install locations (`%LOCALAPPDATA%\Programs\Ollama`, `%LOCALAPPDATA%\Ollama`) before falling back to the system PATH. If Ollama starts successfully, Polyglot waits up to 10 seconds for it to become available.

The TranslateGemma model is automatically pulled if it is not installed. Pull progress is streamed to stderr so you can see download status. Zero manual setup required after the initial Ollama installation. When `OLLAMA_HOST` points to a remote host and `OLLAMA_API_KEY` is set (Ollama Cloud), the model check is skipped, since cloud models are served on demand.

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

Translated segments are cached by content hash (SHA-256 of source text + target language + model, truncated to 16 hex characters). Unchanged segments skip re-translation entirely, so re-running a translation after an edit only translates what changed. The cache lives in `.polyglot-cache.json` alongside the source file with a 30-day TTL. Expired entries are pruned automatically on load. It is used by the `translateMarkdown` library API when given a `filePath`, and by the repo's `scripts/translate-*.mjs` CLI; the MCP tools translate without it.

Several runs can share one cache file, as the CLI's parallel languages do. Each save re-reads the file under a lock (`.polyglot-cache.json.lock`) and merges in only its own changes, then replaces the file through a temporary file and a rename, so no run erases another's entries and no reader sees half a file. A lock left behind by a killed process is broken after 10 seconds. Clearing the cache (`--cache-clear`, or the `cacheClear` option) clears only the language being translated.

## Translation memory (fuzzy cache)

When an exact cache hit is not found, a cached translation is reused only if its source differs from the current segment in whitespace layout alone: runs of spaces or tabs within a line, whitespace at either end, or CRLF versus LF line endings. Line breaks, indentation, and two-space hard line breaks stay significant, because Markdown gives them meaning.

Any other edit is retranslated, including a changed word, number, punctuation mark, symbol, letter case, or inline code span. A cached translation is the translation of its own source; reusing it for edited text would publish the old wording, and punctuation can reverse what a line says just as a word can (`~~struck~~` text, a ✓ that became ✗). As a floor under that rule, a candidate is also rejected if its numbers, version strings, or code placeholders differ from the query's. Levenshtein similarity (Wagner-Fischer, single-row) still ranks candidates, and only entries with the same target language and model are considered.

## Inline code-span protection

Inline code spans are swapped for placeholders (`⟦0⟧`, `⟦1⟧`, ...) before translation and restored afterwards, so commands, flags, package names, and identifiers inside backticks come back byte-for-byte instead of being translated or transliterated into the target script. The placeholders contain no letters, so a transliterating model has nothing in them to convert. If the placeholders do not come back exactly once each, the segment falls back to the source text with a warning: untranslated prose is visible, while a sentence that silently lost its `npm install` target is not.

## Protected terms

Identifiers in prose are masked the same way, so the model can't respell them in another script (Hindi once wrote `XLS-30` and `Kimi-K3` in Devanagari). The defaults mask URLs, ALL-CAPS IDs with a digit or a `-`/`_` (`XLS-30`, `HOST_REJECTED`), CamelCase words (`DepositAuth`, `AMMCreate`), and model IDs with a letter-and-digit part (`Kimi-K3`, `gemma4:31b`). Ordinary capitalised words are left alone.

A count written "N of M" is masked as one span and restored as `N/M` in every language, so it can't be reversed or turned into an ordinal. A table cell that is only a count never reaches the model.

A repository adds its own terms in `.polyglot-terms.json` beside the README: `terms` (exact, case-sensitive, whole words), `patterns` (regular expressions), `disable` (switch defaults off by name) and `nOfM`. A file that can't be parsed stops the run with `CONFIG_ERROR`.

## Survival check

After translating, each file is checked against the English. Every protected span, code span and `N/M` count must be present, character for character, and each table cell must carry the same numbers as its source cell, compared as a set rather than in order (correct Chinese puts the total first). Digits from other scripts are normalised first.

`--on-lost-span=fail|report` chooses what happens when something is lost. `fail` exits non-zero with the language, segment and missing span; it's the default for `translate-all.mjs` and `translate-readme.mjs`, which run before releases. `report` lists the losses and exits 0; it's the default for the MCP tools and the library API. Files are written either way, so they can be fixed and pinned.

### Untranslated prose

The check above asks whether protected text survived; this one asks whether prose that should have been translated is still English. A model can return a paragraph unchanged while the batch still splits correctly, and every other check passes. Each prose sentence of the English (6 or more words, a link counted by its label, code spans, URLs and protected spans left out, and not a run of proper names) is looked for as a whole sentence of the translation of its segment. Matching ignores case and a closing stop, joins hard-wrapped lines, and works by sentence, so a reflow or a half-translated line is caught. Runs of names are exempt by that rule, and a pinned segment is never flagged.

An answer is unusable when it is empty, when a code-span placeholder did not come back, or when a prose sentence is still English. It is retried once on its own (a segment that already took the one-call-per-item fallback after a separator-count mismatch counts that call), and a segment that is still unusable is translated line by line (if it has several lines) and then sentence by sentence (if a line has several sentences), each piece with its own placeholders. What is still unusable keeps the English source, reported with every step tried, and fails the run under the default. An unusable answer is never cached, and an unusable cached entry is ignored and replaced.

`--on-untranslated=fail|report` chooses what happens with what is left: `fail` (the default for `translate-all.mjs` and `translate-readme.mjs`) writes the files, marks the language `untranslated` and exits non-zero (`translate-readme.mjs` exits 3); `report` (the default for the library and the MCP tools) lists the lines and exits 0. The per-language result and the console summary also list the segments that left the plain batch path, and how many were retried and recovered. Because a segment that stayed English is not cached, `pin-translation.mjs` pins a prose paragraph translated by hand even without `--include-uncached`.

**What the check does not see.** Four limits, so a clean result is read for what it is: English of fewer than 6 words (short headings, table cells, list items); a Title-Case heading or other run of names, which cannot be told from a product name; a sentence that is only partly translated, because a sentence counts as untranslated only when the whole of it is unchanged; and output in the wrong language (Spanish returned for Italian), which is not English and so is not flagged. Fenced code blocks are protected and never translated or checked.

## Pinned translations

A pinned translation always wins. `.polyglot-pins.json` holds hand-fixed translations keyed by a hash of the English segment plus the language. A pin beats the cache and the model and survives every rerun; when the English changes, its hash changes, so a pin can't outlive the text it was written for.

To pin hand fixes, correct the translated file, then run `node scripts/pin-translation.mjs README.md hi README.hi.md`. It pins every segment whose text differs from the cached translation (`--dry-run` lists them without writing). Commit `.polyglot-pins.json` and `.polyglot-terms.json` with the README.

## Concurrency semaphore

All Ollama calls are guarded by a counting semaphore (default limit: 1) to prevent GPU OOM on systems with limited VRAM. The semaphore queues excess requests and releases them in order. Override with `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

The `translate_all` and `translate_readme` tools add a second layer of concurrency control via their own semaphore (default: 2, max: 3 concurrent languages).

## MCP progress tokens

The tools report progress via MCP `notifications/progress` when the client provides a `progressToken`. The translate tool reports per-chunk, translate_markdown reports per-segment-batch, translate_all and translate_readme report per-language, and check_status reports per-step (Ollama check, model list, ready).

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
