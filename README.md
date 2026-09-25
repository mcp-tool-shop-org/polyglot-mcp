<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Local GPU translation MCP server — 57 languages, zero cloud dependency.</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="node 20+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## What it does

Translates text between 57 languages using [TranslateGemma](https://ollama.com/library/translategemma) running locally on your GPU via [Ollama](https://ollama.com). No API keys, no cloud, no rate limits — by default everything stays on your machine. You can opt in to a remote Ollama such as [Ollama Cloud](#ollama-cloud-optional).

## Quick Start

### 1. Install Ollama

Download from [ollama.com](https://ollama.com) and start it:

```bash
ollama serve
```

### 2. Pull a model

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **Tip:** You can skip this step — Polyglot auto-pulls the default model (27B, 17 GB) on first use. On a smaller GPU, set `POLYGLOT_MODEL=translategemma:12b` first (see [Configurable Default Model](#configurable-default-model)).

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

Polyglot exposes six MCP tools:

### `translate`

Translate text between any supported language pair.

| Parameter   | Required | Description |
|-------------|----------|-------------|
| `text`      | yes      | Text to translate |
| `from`      | yes      | Source language code or name (e.g., `en`, `English`) |
| `to`        | yes      | Target language code or name (e.g., `ja`, `Japanese`) |
| `model`     | no       | Ollama model (default: `translategemma:27b`) |
| `glossary`  | no       | Custom term overrides as `{"source": "translation"}` — merged with the built-in software glossary |

Long text is automatically split into chunks at paragraph and sentence boundaries, translated in sequence, and reassembled. All translations are validated for quality (empty output, echo detection, truncation, garbled text).

### `translate_markdown`

Translate an entire markdown document while preserving structure. Code blocks, HTML elements, badges, URLs, and table formatting are kept intact — only prose content (headings, paragraphs, taglines, table cells) is translated. Inline code spans are swapped for placeholders before translation and restored after, so commands, flags, package names, and identifiers come back exactly as written.

| Parameter   | Required | Description |
|-------------|----------|-------------|
| `markdown`  | yes      | The full markdown content to translate |
| `from`      | yes      | Source language code or name |
| `to`        | yes      | Target language code or name |
| `model`     | no       | Ollama model (default: `translategemma:27b`) |

### `list_languages`

List all 57 supported languages with their codes.

### `check_status`

Check if Ollama is running and which TranslateGemma models are installed. Attempts auto-start if Ollama isn't running.

### `translate_all`

Translate markdown content into multiple languages at once (default: 7 — Japanese, Chinese, Spanish, French, Hindi, Italian, Portuguese). Runs translations concurrently with GPU-safe semaphore limiting.

| Parameter     | Required | Description |
|---------------|----------|-------------|
| `markdown`    | yes      | The full markdown content to translate |
| `from`        | no       | Source language code (default: `en`) |
| `languages`   | no       | Array of target language codes (default: all 7) |
| `model`       | no       | Ollama model (default: `translategemma:27b`) |
| `concurrency` | no       | Max concurrent translations (default: 2, max: 3) |
| `navBar`      | no       | Inject language nav bar (default: true) |

### `translate_readme`

Translate a README.md **file** into the same 7 languages and write the `README.<lang>.md` files next to it, refreshing the language nav bar in the source README and in each translation. Returns a per-language status summary (ok/fail, timings, files written) rather than the translated text; use `translate_markdown` when you want the content back.

| Parameter     | Required | Description |
|---------------|----------|-------------|
| `readmePath`  | yes      | Absolute path to the source README.md |
| `tier`        | no       | `quality` (`translategemma:27b`, default), `bulk` (`12b`), or `draft` (`2b`); ignored when `model` is set |
| `model`       | no       | Explicit Ollama model; overrides `tier` |
| `languages`   | no       | Subset of target language codes (default: all 7) |
| `concurrency` | no       | Max concurrent translations (default: 2, max: 3) |
| `navBar`      | no       | Inject or refresh the language nav bar (default: true) |

## Features

### Auto-start & Auto-pull
Ollama is automatically started if it isn't running. The TranslateGemma model is automatically pulled if it isn't installed. Zero manual setup required.

### Retry with Exponential Backoff
Transient Ollama failures (network blips, temporary overload) are automatically retried up to 2 times with exponential backoff (1 s, 2 s). Non-retryable errors (bad model name, invalid input) fail immediately.

### Smart Chunking
Long text is split at natural boundaries — paragraphs, then sentences — so translation context is preserved. Chunk sizes adapt to the model: 2K chars for 2B/4B models, 4K for 12B, 6K for 27B.

### Segment Cache
Translated segments are cached by content hash (SHA-256 of source text + target language + model). Unchanged segments skip re-translation entirely, so re-running a translation after an edit touches only what changed. The cache lives in `.polyglot-cache.json` next to the source file, with a 30-day TTL. It is used by the `translateMarkdown` library API when given a `filePath` (and by the repo's `scripts/translate-*.mjs` CLI); the MCP tools translate without it.

Several runs can share one cache file. Each save merges only its own changes into the file under a lock and replaces the file atomically, so languages translated in parallel keep each other's entries, and clearing the cache for one language leaves the others alone.

### Translation Memory (Fuzzy Cache)
When an exact cache hit isn't found, a cached translation is reused only if its source differs from the new one in whitespace layout alone: spacing within a line, whitespace at either end, or CRLF versus LF. Any other edit is retranslated, including a changed word, number, punctuation mark, letter case, or inline code span. A cached translation is the translation of its own source, so reusing it for edited text would ship the old wording.

### Ollama Cloud (optional)
Set `OLLAMA_HOST` to send requests to another Ollama server instead of `localhost:11434`. For [Ollama Cloud](https://ollama.com), also set `OLLAMA_API_KEY`: the key is sent as a Bearer token, and only to a non-loopback host.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Concurrency Semaphore
All Ollama calls are guarded by a counting semaphore (default limit: 1) to prevent GPU OOM on systems with limited VRAM. Override with `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### MCP Progress Tokens
All tools report progress via MCP `notifications/progress` when the client provides a `progressToken`. Translate reports per-chunk, translate_markdown per-segment-batch, translate_all per-language, and check_status per-step.

### Software Glossary
A built-in glossary of 12 technical terms (API, CLI, SDK, etc.) ensures consistent translation of software terminology. Custom glossary entries can be passed per-request and are merged with the defaults.

### Batch Translation
`translateBatch` groups multiple segments into a single prompt where possible, reducing round-trips. Falls back to individual translation if the batch separator is mangled.

### Configurable Default Model
The default model is `translategemma:27b`. Set the `POLYGLOT_MODEL` environment variable to use another one, for example on a GPU with less VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Structured Errors
All errors use `PolyglotError` with a machine-readable code (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), a human-readable message, an optional hint, and a `retryable` flag.

### Output Validation
Every translation is automatically validated: empty output throws (retryable), source-text echo is flagged, severe truncation and hallucination blowup are warned, garbled encoding and model meta-commentary are detected. Warnings appear in the MCP tool response.

### Streaming
`OllamaClient.generateStream()` yields tokens via NDJSON as Ollama produces them. The `translate()` function accepts an `onToken` callback for real-time progress display. Both streaming and non-streaming paths share retry logic.

## Supported Languages

Afrikaans, Albanian, Arabic, Bengali, Bulgarian, Catalan, Chinese (Simplified), Chinese (Traditional), Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Gujarati, Hebrew, Hindi, Hungarian, Indonesian, Irish, Italian, Japanese, Kannada, Korean, Latvian, Lithuanian, Macedonian, Malay, Malayalam, Maltese, Marathi, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Scottish Gaelic, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh.

## Performance

| Metric | 27B (default), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| First translation (cold model load) | ~30 s | ~15 s |
| Subsequent translations | ~1–2 s per batch of README segments | ~600 ms |
| Model memory | 17 GB, fully on GPU (as reported by `ollama ps`) | ~8.1 GB |

## Architecture

```
MCP Client (Claude Code, etc.)
      │
      │  MCP protocol (stdio)
      ▼
┌──────────────────┐
│    index.ts      │  MCP server — 6 tools: translate, translate_markdown,
│                  │  translate_all, translate_readme, list_languages,
│                  │  check_status
├──────────────────┤
│  translate.ts    │  Prompt building, chunking, batch mode, streaming
├──────────────────┤
│translateMarkdown │  Markdown-aware segmentation, table parsing, reassembly
├──────────────────┤
│  codeSpans.ts    │  Inline code-span masking and fail-closed restore
├──────────────────┤
│ translateAll.ts  │  Multi-language orchestrator with nav bar injection
├──────────────────┤
│translateReadme.ts│  README file translation — writes README.<lang>.md
├──────────────────┤
│  semaphore.ts    │  Counting semaphore for GPU-safe concurrency
├──────────────────┤
│   validate.ts    │  Output validation (empty, echo, truncation, garble)
├──────────────────┤
│   ollama.ts      │  HTTP client — auto-start, auto-pull, retry, streaming
├──────────────────┤
│   cache.ts       │  Segment cache, translation memory, locked merge on save
├──────────────────┤
│  glossary.ts     │  Software term dictionary
├──────────────────┤
│   polish.ts      │  Post-translation artifact cleanup
├──────────────────┤
│  languages.ts    │  57 language definitions
├──────────────────┤
│   errors.ts      │  PolyglotError structured error class
└──────────────────┘
      │
      │  HTTP (localhost:11434, or OLLAMA_HOST)
      ▼
   Ollama + TranslateGemma (GPU)
```

## Security & Data Scope

| Aspect | Detail |
|--------|--------|
| **Data touched** | Text sent to the Ollama API — local (`localhost:11434`) by default, or the host in `OLLAMA_HOST` if you set one. `.polyglot-cache.json` segment cache next to a translated file (library and CLI use only) |
| **Files written** | `translate_readme` writes `README.<lang>.md` next to the README you pass it and refreshes that README's language nav bar |
| **Data NOT touched** | No browser data, no OS credentials, nothing outside the directories above |
| **Network** | HTTP to `localhost:11434` only by default — zero external egress. Remote only when `OLLAMA_HOST` points elsewhere |
| **Secrets** | `OLLAMA_API_KEY`, if set, is read from the environment and sent only as a Bearer token to a non-loopback `OLLAMA_HOST`; never written to disk or logged |
| **Telemetry** | None collected or sent |

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## Development

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 362 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## License

MIT — see [LICENSE](LICENSE).

> Built by [MCP Tool Shop](https://mcp-tool-shop.github.io/)
