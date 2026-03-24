# Repo Map — @mcptoolshop/polyglot-mcp

## Stack

- Runtime: Node.js >= 18.0.0 (TypeScript, ESM)
- Build: tsc
- Test framework: Vitest (251 tests)
- Dependencies: @modelcontextprotocol/sdk, zod
- Translation backend: Ollama (localhost:11434), TranslateGemma models
- MCP transport: stdio

## Structure

```
src/
  index.ts              # MCP server — 5 tools (375 lines)
  translate.ts          # Core translation — chunking, prompts, dispatch (379 lines)
  translateMarkdown.ts  # Markdown-aware segmentation + reassembly (616 lines)
  translateAll.ts       # Multi-language orchestrator + nav bar (228 lines)
  ollama.ts             # Ollama HTTP client — auto-start, retry, streaming (473 lines)
  languages.ts          # 57 language definitions + resolver (84 lines)
  validate.ts           # Output validation — echo, length, garbled (120 lines)
  glossary.ts           # Domain-specific term overrides (150 lines)
  polish.ts             # Post-translation cleanup — OR patterns (65 lines)
  cache.ts              # Segment cache with fuzzy matching (213 lines)
  semaphore.ts          # Counting semaphore for GPU concurrency (67 lines)
  errors.ts             # PolyglotError class (111 lines)
test/
  *.test.ts             # 251 test cases (Vitest)
```

## Build commands

| Command | What it does |
|---------|-------------|
| `npm test` | Vitest (251 tests) |
| `npm run build` | `tsc` |
| `npm run verify` | typecheck + test + build + pack dry-run |

## Primary seam: Translation dispatch + language negotiation

This is the highest-risk seam. If translation dispatch silently fails, produces wrong-language output, or loses markdown structure, the entire org's README translations are compromised.

**Translation truth chain:**

```
Input (text, from, to)
  → resolveLanguage() — deterministic, case-insensitive
  → chunkText() — paragraph/sentence boundary splitting
  → buildPrompt() — fixed template with glossary hints
  → OllamaClient.generate() — localhost:11434, retry with backoff
  → polish() — cleanup OR-alternatives, normalize whitespace
  → validateTranslation() — echo, length ratio, garbled, meta-commentary
  → Output (translation, warnings)
```

Every step in this chain must be truthful. A silent failure at any point can produce wrong-language output that looks correct.

**Known risk: Fallback-to-source on empty output.**
If translation returns empty, the source text (in source language) is substituted into the target-language output. A warning is logged, but if the caller doesn't check warnings, they get mixed-language output. This is the single highest-risk behavior in the repo.

**Language negotiation contract:**
- 57 languages, hardcoded in `languages.ts`
- Resolution: case-insensitive, name or code, underscore→dash normalization
- `resolveLanguage()` returns undefined for unsupported input → throws UNSUPPORTED_LANGUAGE
- No aliases: "pt-BR" resolves to "pt" (Portuguese), not a separate language

## Key invariants

| File | Invariant |
|------|-----------|
| `src/languages.ts:resolveLanguage()` | Deterministic: same input always resolves to same language or undefined. Case-insensitive. |
| `src/translate.ts:translate()` | Chunks → prompts → generates → polishes → validates. Each chunk either produces a translation or falls back to source (with warning). |
| `src/translate.ts:BATCH_SEPARATOR` | `---POLYGLOT_SEP---` is the batch delimiter. If output doesn't split to expected count, falls back to individual translation. |
| `src/validate.ts:validateTranslation()` | Throws on empty output (retryable). Warns on echo, length ratio, garbled, meta-commentary. Never silently accepts bad output without warning. |
| `src/cache.ts:getCachePath()` | Path traversal protection: resolved cache path must stay within source directory. |
| `src/ollama.ts` | All requests go to localhost:11434. No external endpoints. Retry: 2 retries with 1s/2s backoff. Timeouts: 60s generate, 10s API, 10min pull. |
| `src/errors.ts:PolyglotError` | All errors have `{code, message, hint, retryable}`. MCP returns `isError: true` with friendly message. |

## Secondary seams

### 1. Batch separator splitting (translate.ts)
Batch mode joins chunks with `---POLYGLOT_SEP---`. If the model outputs this literal string in a translation, the split misaligns. Fallback to individual translation catches this, but it's a known fragility.

### 2. Cache without atomic writes (cache.ts)
`saveCache()` uses `writeFileSync()` directly — no tmp+rename. Process crash mid-write can corrupt the cache file. Cache load handles invalid JSON gracefully (returns empty cache), so the impact is cache loss, not data loss.

### 3. Ollama auto-start fire-and-forget (ollama.ts)
`ensureRunning()` spawns `ollama serve` as a detached process and polls for 10s. If spawn fails silently, user waits 10s before getting OLLAMA_UNAVAILABLE.

## Validation law

- `npm test` runs 251 tests covering all translation paths, validation, caching, error handling
- `npm run verify` runs typecheck + test + build + pack
- CI matrix: Node 18 + 22
- All tests use mocked Ollama (no real GPU required)
- No browser-based validation
