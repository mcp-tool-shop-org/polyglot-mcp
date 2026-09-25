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
| `translategemma:12b` | 8.1 GB | ~600ms | Great |
| `translategemma:27b` | 17 GB | ~1.5s | Best (default) |

## Performance

| Metric | 27B (default), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| First translation (cold model load) | ~30s | ~15s |
| Subsequent translations | ~1-2s per batch of README segments | ~600ms |
| Model memory | 17 GB, fully on GPU (as reported by `ollama ps`) | ~8.1 GB |

## Architecture

```
MCP Client (Claude Code, etc.)
      |
      |  MCP protocol (stdio)
      v
+--------------------+
|    index.ts        |  MCP server -- 6 tools: translate, translate_markdown,
|                    |  translate_all, translate_readme, list_languages,
|                    |  check_status
+--------------------+
|  translate.ts      |  Prompt building, chunking, batch mode, streaming
+--------------------+
| translateMarkdown  |  Markdown-aware segmentation, table parsing, reassembly
+--------------------+
|  codeSpans.ts      |  Inline code-span masking and fail-closed restore
+--------------------+
| translateAll.ts    |  Multi-language orchestrator with nav bar injection
+--------------------+
| translateReadme.ts |  README file translation -- writes README.<lang>.md
+--------------------+
|  semaphore.ts      |  Counting semaphore for GPU-safe concurrency
+--------------------+
|   validate.ts      |  Output validation (empty, echo, truncation, garble)
+--------------------+
|   ollama.ts        |  HTTP client -- auto-start, auto-pull, retry, streaming
+--------------------+
|   cache.ts         |  Segment cache, translation memory, locked merge on save
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
      |  HTTP (localhost:11434, or OLLAMA_HOST)
      v
   Ollama + TranslateGemma (GPU)
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POLYGLOT_MODEL` | `translategemma:27b` | Default Ollama model for all translations |
| `POLYGLOT_CONCURRENCY` | `1` | Maximum concurrent Ollama requests (prevents GPU OOM) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server to use, e.g. `https://ollama.com` for Ollama Cloud |
| `OLLAMA_API_KEY` | unset | API key for a remote Ollama; sent as a Bearer token, only to a non-loopback `OLLAMA_HOST` |

## CLI flags

| Flag | Description |
|------|-------------|
| `--version`, `-V` | Print version and exit |

## Security and data scope

| Aspect | Detail |
|--------|--------|
| **Data touched** | Text sent to the Ollama API -- local (`localhost:11434`) by default, or the host in `OLLAMA_HOST` if you set one. `.polyglot-cache.json` segment cache next to a translated file (library and CLI use only) |
| **Files written** | `translate_readme` writes `README.<lang>.md` next to the README you pass it and refreshes that README's language nav bar |
| **Data NOT touched** | No browser data, no OS credentials, nothing outside the directories above |
| **Network** | HTTP to `localhost:11434` only by default -- zero external egress. Remote only when `OLLAMA_HOST` points elsewhere |
| **Secrets** | `OLLAMA_API_KEY`, if set, is read from the environment and sent only as a Bearer token to a non-loopback `OLLAMA_HOST`; never written to disk or logged |
| **Telemetry** | None collected or sent |
| **Cache safety** | Cache path traversal is blocked -- the cache file must stay within the same directory as the source file |

## Development

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 362 tests (vitest)
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
| `@mcptoolshop/polyglot-mcp/codeSpans` | Inline code-span masking and restore |
| `@mcptoolshop/polyglot-mcp/translateAll` | Multi-language orchestrator |
| `@mcptoolshop/polyglot-mcp/validate` | Output validation |
| `@mcptoolshop/polyglot-mcp/ollama` | Ollama HTTP client |
| `@mcptoolshop/polyglot-mcp/languages` | Language definitions + resolver |
| `@mcptoolshop/polyglot-mcp/glossary` | Software glossary |
| `@mcptoolshop/polyglot-mcp/polish` | Post-translation cleanup |
| `@mcptoolshop/polyglot-mcp/cache` | Segment cache and translation memory |
| `@mcptoolshop/polyglot-mcp/semaphore` | Counting semaphore |
