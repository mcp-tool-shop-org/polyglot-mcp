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
      │
      │  MCP protocol (stdio)
      ▼
┌──────────────────┐
│    index.ts      │  MCP server — 4 tools
├──────────────────┤
│  translate.ts    │  Prompt building, chunking, batch mode, streaming
├──────────────────┤
│translateMarkdown │  Markdown-aware segmentation, table parsing
├──────────────────┤
│   validate.ts    │  Output validation (empty, echo, truncation, garble)
├──────────────────┤
│   ollama.ts      │  HTTP client — auto-start, auto-pull, retry
├──────────────────┤
│   cache.ts       │  Segment cache (SHA-256 keys, 30-day TTL)
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
      │  HTTP (localhost:11434)
      ▼
   Ollama + TranslateGemma (GPU)
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POLYGLOT_MODEL` | `translategemma:12b` | Default Ollama model |

## Security and data scope

| Aspect | Detail |
|--------|--------|
| **Data touched** | Text sent to local Ollama API, `.polyglot-cache.json` segment cache |
| **Data NOT touched** | No files outside working directory, no browser data, no OS credentials |
| **Network** | HTTP to `localhost:11434` only — zero external egress |
| **Telemetry** | None collected or sent |

## Development

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```
