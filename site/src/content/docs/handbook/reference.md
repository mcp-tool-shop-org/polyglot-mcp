---
title: Reference
description: Languages, performance, architecture, and environment variables.
sidebar:
  order: 4
---

## Supported languages (57)

**Europe:** English, French, German, Spanish, Portuguese, Italian, Dutch, Danish, Swedish, Norwegian, Finnish, Polish, Czech, Slovak, Slovenian, Croatian, Serbian, Albanian, Bulgarian, Romanian, Hungarian, Estonian, Latvian, Lithuanian, Macedonian, Maltese, Greek, Irish, Scottish Gaelic, Galician, Catalan, Welsh.

**Asia:** Japanese, Chinese (Simplified), Chinese (Traditional), Korean, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Tamil, Telugu, Urdu, Thai, Vietnamese, Indonesian, Malay, Persian.

**Other:** Arabic, Hebrew, Turkish, Ukrainian, Russian, Swahili, Afrikaans.

Language resolution is case-insensitive and accepts both codes (`en`, `ja`, `zh-Hant`) and full names (`English`, `Japanese`, `Chinese (Traditional)`). Underscores are normalized to hyphens.

## Model options

| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| `translategemma:4b` | 3.3 GB | ~300ms | Good |
| `translategemma:12b` | 8.1 GB | ~600ms | Great (default) |
| `translategemma:27b` | 17 GB | ~1.5s | Best |

## Performance (RTX 5080, 16 GB VRAM)

| Metric | Value |
|--------|-------|
| First translation (cold model load) | ~15s |
| Subsequent translations | ~600ms |
| VRAM usage | ~8.1 GB |
| Long text (per chunk) | ~600ms |

## Architecture

```
MCP Client (Claude Code, etc.)
      |
      |  MCP protocol (stdio)
      v
+--------------------+
|    index.ts        |  MCP server -- 5 tools: translate, translate_markdown,
|                    |  translate_all, list_languages, check_status
+--------------------+
|  translate.ts      |  Prompt building, chunking, batch mode, streaming
+--------------------+
| translateMarkdown  |  Markdown-aware segmentation, table parsing, reassembly
+--------------------+
| translateAll.ts    |  Multi-language orchestrator with nav bar injection
+--------------------+
|  semaphore.ts      |  Counting semaphore for GPU-safe concurrency
+--------------------+
|   validate.ts      |  Output validation (empty, echo, truncation, garble)
+--------------------+
|   ollama.ts        |  HTTP client -- auto-start, auto-pull, retry, streaming
+--------------------+
|   cache.ts         |  Segment cache + fuzzy translation memory
+--------------------+
|  glossary.ts       |  Software term dictionary
+--------------------+
|   polish.ts        |  Post-translation artifact cleanup
+--------------------+
|  languages.ts      |  57 language definitions
+--------------------+
|   errors.ts        |  PolyglotError structured error class
+--------------------+
      |
      |  HTTP (localhost:11434)
      v
   Ollama + TranslateGemma (GPU)
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POLYGLOT_MODEL` | `translategemma:12b` | Default Ollama model for all translations |
| `POLYGLOT_CONCURRENCY` | `1` | Maximum concurrent Ollama requests (prevents GPU OOM) |

## CLI flags

| Flag | Description |
|------|-------------|
| `--version`, `-V` | Print version and exit |

## Security and data scope

| Aspect | Detail |
|--------|--------|
| **Data touched** | Text sent to local Ollama API (`localhost:11434`), `.polyglot-cache.json` segment cache |
| **Data NOT touched** | No files outside working directory, no browser data, no OS credentials |
| **Network** | HTTP to `localhost:11434` only -- zero external/internet egress |
| **Telemetry** | None collected or sent |
| **Cache safety** | Cache path traversal is blocked -- the cache file must stay within the same directory as the source file |

## Development

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 256 unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## npm package exports

The package exposes individual module exports for programmatic use:

| Export | Module |
|--------|--------|
| `@mcptoolshop/polyglot-mcp` | Main MCP server entry point |
| `@mcptoolshop/polyglot-mcp/translate` | Core translate + translateBatch |
| `@mcptoolshop/polyglot-mcp/translateMarkdown` | Markdown-aware translation |
| `@mcptoolshop/polyglot-mcp/translateAll` | Multi-language orchestrator |
| `@mcptoolshop/polyglot-mcp/validate` | Output validation |
| `@mcptoolshop/polyglot-mcp/ollama` | Ollama HTTP client |
| `@mcptoolshop/polyglot-mcp/languages` | Language definitions + resolver |
| `@mcptoolshop/polyglot-mcp/glossary` | Software glossary |
| `@mcptoolshop/polyglot-mcp/polish` | Post-translation cleanup |
| `@mcptoolshop/polyglot-mcp/cache` | Segment cache + fuzzy matching |
| `@mcptoolshop/polyglot-mcp/semaphore` | Counting semaphore |
