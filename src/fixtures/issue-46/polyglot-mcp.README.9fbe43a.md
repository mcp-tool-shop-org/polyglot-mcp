<!-- Extract of mcp-tool-shop-org/polyglot-mcp README.md at 9fbe43a: the ATX headings and the 4 in-page anchor lines. -->

## What it does

Translates text between 57 languages using [TranslateGemma](https://ollama.com/library/translategemma) running locally on your GPU via [Ollama](https://ollama.com). No API keys, no cloud, no rate limits — by default everything stays on your machine. You can opt in to a remote Ollama such as [Ollama Cloud](#ollama-cloud-optional).

## Quick Start

### 1. Install Ollama

### 2. Pull a model

> **Tip:** You can skip this step — Polyglot auto-pulls the default model (27B, 17 GB) on first use. On a smaller GPU, set `POLYGLOT_MODEL=translategemma:12b` first (see [Configurable Default Model](#configurable-default-model)).

### 3. Add to your MCP client

## Tools

### `translate`

### `translate_markdown`

Translate an entire markdown document while preserving structure. Code blocks, HTML elements, badges, URLs, and table formatting are kept intact — only prose content (headings, paragraphs, taglines, table cells) is translated. Inline code spans and [protected terms](#protected-terms-polyglot-termsjson) are swapped for placeholders before translation and restored after, so commands, flags, package names, and identifiers come back exactly as written, and every "N of M" count comes back as `N/M`.

| Parameter    | Required | Description |
|--------------|----------|-------------|
| `onLostSpan` | no       | `report` (default) lists protected spans missing from the translation; `fail` makes that an error. See [Survival Check](#survival-check---on-lost-span) |

### `list_languages`

### `check_status`

### `translate_all`

### `translate_readme`

## Features

### Auto-start & Auto-pull

### Retry with Exponential Backoff

### Smart Chunking

### Segment Cache

### Translation Memory (Fuzzy Cache)

### Protected Terms (`.polyglot-terms.json`)

### Survival Check (`--on-lost-span`)

### Pinned Translations (`.polyglot-pins.json`)

### Ollama Cloud (optional)

### Concurrency Semaphore

### MCP Progress Tokens

### Software Glossary

### Batch Translation

### Configurable Default Model

### Structured Errors

### Output Validation

### Streaming

## Supported Languages

## Performance

## Architecture

## Security & Data Scope

## Development

## License
