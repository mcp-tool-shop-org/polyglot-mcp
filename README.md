<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Local GPU translation MCP server — 55 languages, zero cloud dependency.</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## What it does

Translates text between 55 languages using [TranslateGemma](https://ollama.com/library/translategemma) running locally on your GPU via [Ollama](https://ollama.com). No API keys, no cloud, no rate limits — everything stays on your machine.

## Quick Start

### 1. Install Ollama

Download from [ollama.com](https://ollama.com) and start it:

```bash
ollama serve
```

### 2. Pull a model

```bash
ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
# or
ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
# or
ollama pull translategemma:27b   # 17 GB  — highest quality
```

> **Tip:** You can skip this step — Polyglot auto-pulls the model on first use.

### 3. Add to your MCP client

**Claude Code / Claude Desktop** — add to `claude_desktop_config.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "polyglot": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/polyglot-mcp"]
    }
  }
}
```

**From source:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

That's it. Ask Claude to translate something and it will use the `translate` tool automatically.

## Tools

Polyglot exposes three MCP tools:

### `translate`

Translate text between any supported language pair.

| Parameter   | Required | Description |
|-------------|----------|-------------|
| `text`      | yes      | Text to translate |
| `from`      | yes      | Source language code or name (e.g., `en`, `English`) |
| `to`        | yes      | Target language code or name (e.g., `ja`, `Japanese`) |
| `model`     | no       | Ollama model (default: `translategemma:12b`) |
| `glossary`  | no       | Custom term overrides as `{"source": "translation"}` — merged with the built-in software glossary |

Long text is automatically split into chunks at paragraph and sentence boundaries, translated in sequence, and reassembled.

### `list_languages`

List all 55 supported languages with their codes.

### `check_status`

Check if Ollama is running and which TranslateGemma models are installed. Attempts auto-start if Ollama isn't running.

## Features

### Auto-start & Auto-pull
Ollama is automatically started if it isn't running. The TranslateGemma model is automatically pulled if it isn't installed. Zero manual setup required.

### Retry with Exponential Backoff
Transient Ollama failures (network blips, temporary overload) are automatically retried up to 2 times with exponential backoff (1 s, 2 s). Non-retryable errors (bad model name, invalid input) fail immediately.

### Smart Chunking
Long text is split at natural boundaries — paragraphs, then sentences — so translation context is preserved. Chunk sizes adapt to the model: 2K chars for 2B/4B models, 4K for 12B, 6K for 27B.

### Segment Cache
Translated segments are cached by content hash (SHA-256 of source text + target language + model). Unchanged segments skip re-translation entirely. Cache lives in `.polyglot-cache.json` with a 30-day TTL.

### Software Glossary
A built-in glossary of 12 technical terms (API, CLI, SDK, etc.) ensures consistent translation of software terminology. Custom glossary entries can be passed per-request and are merged with the defaults.

### Batch Translation
`translateBatch` groups multiple segments into a single prompt where possible, reducing round-trips. Falls back to individual translation if the batch separator is mangled.

### Configurable Default Model
Set the `POLYGLOT_MODEL` environment variable to override the default model:

```bash
POLYGLOT_MODEL=translategemma:27b npx @mcptoolshop/polyglot-mcp
```

### Structured Errors
All errors use `PolyglotError` with a machine-readable code (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), a human-readable message, an optional hint, and a `retryable` flag.

## Supported Languages

Afrikaans, Albanian, Arabic, Bengali, Bulgarian, Catalan, Chinese (Simplified), Chinese (Traditional), Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Gujarati, Hebrew, Hindi, Hungarian, Indonesian, Irish, Italian, Japanese, Kannada, Korean, Latvian, Lithuanian, Macedonian, Malay, Malayalam, Maltese, Marathi, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Scottish Gaelic, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh.

## Performance

On an RTX 5080 (16 GB VRAM) with TranslateGemma 12B (Q4):

| Metric | Value |
|--------|-------|
| First translation (cold model load) | ~15 s |
| Subsequent translations | ~600 ms |
| VRAM usage | ~8.1 GB |
| Long text (per chunk) | ~600 ms |

## Architecture

```
MCP Client (Claude Code, etc.)
      │
      │  MCP protocol (stdio)
      ▼
┌─────────────┐
│  index.ts   │  MCP server — registers tools, routes calls
├─────────────┤
│ translate.ts│  Prompt building, chunking, batch mode
├─────────────┤
│  ollama.ts  │  HTTP client — auto-start, auto-pull, retry
├─────────────┤
│  cache.ts   │  Segment cache (SHA-256 keys, 30-day TTL)
├─────────────┤
│ glossary.ts │  Software term dictionary
├─────────────┤
│  polish.ts  │  Post-translation artifact cleanup
├─────────────┤
│ languages.ts│  55 language definitions
├─────────────┤
│  errors.ts  │  PolyglotError structured error class
└─────────────┘
      │
      │  HTTP (localhost:11434)
      ▼
   Ollama + TranslateGemma (GPU)
```

## Security & Data Scope

| Aspect | Detail |
|--------|--------|
| **Data touched** | Text sent to local Ollama API (`localhost:11434`), `.polyglot-cache.json` segment cache |
| **Data NOT touched** | No files outside working directory, no browser data, no OS credentials |
| **Network** | HTTP to `localhost:11434` only — zero external/internet egress |
| **Telemetry** | None collected or sent |

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## Development

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 114 unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## License

MIT — see [LICENSE](LICENSE).

> Built by [MCP Tool Shop](https://mcp-tool-shop.github.io/)
