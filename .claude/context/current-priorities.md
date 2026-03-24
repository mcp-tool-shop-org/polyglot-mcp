# Current Priorities — @mcptoolshop/polyglot-mcp

## Active work

- Role OS lockdown (this audit). Fourth repo in org rollout.

## Next up

- None scheduled beyond lockdown.

## Blocked

- Nothing currently blocked.

## Completed recently

- v1.7.0 published (current)
- 5 MCP tools operational
- 57 languages supported
- Batch translation with separator-based splitting
- Segment cache with fuzzy matching
- 251 tests passing

## Banned detours

1. **No cloud translation backends.** All inference is localhost:11434 via Ollama. No Google Translate, no DeepL, no Azure, no fallback.
2. **No multi-provider dispatch.** One backend: Ollama. No provider abstraction, no routing between models from different providers.
3. **No file I/O in MCP tools.** MCP tools return translated content. The caller writes files. Polyglot-mcp does not own file output.
4. **No quality scoring.** Validation catches obvious failures (empty, echo, garbled). No BLEU scores, no human evaluation, no quality metrics.
5. **No dynamic language discovery.** 57 languages are hardcoded. No model probing, no runtime capability detection.

## Must-preserve invariants

These cannot be traded away without explicit human approval:

1. **57 hardcoded languages.** `languages.ts` defines exactly 57 entries. Any change requires README update.
2. **localhost:11434 only.** All Ollama calls go to localhost. No external endpoints. No configurable remote URLs in MCP mode.
3. **Deterministic language resolution.** `resolveLanguage()` is case-insensitive, name or code. Same input → same language or undefined. No fuzzy matching, no guessing.
4. **Structured errors.** PolyglotError with `{code, message, hint, retryable}`. MCP returns `isError: true` with friendly message. No unstructured errors.
5. **Fallback-to-source with warning.** Empty translation output falls back to source text. Warning is always included in response. Never silent.
6. **Cache path traversal protection.** Cache file path must resolve within source directory. Traversal attempts throw.
7. **Batch separator is reserved.** `---POLYGLOT_SEP---` is the batch delimiter. Misaligned split falls back to individual translation.
8. **Protected segments pass through.** Code blocks, HTML blocks, horizontal rules, and blank lines are never translated. They survive unchanged.
9. **Starter-pack, CLI, and docs must remain synchronized.** Changes to MCP tool behavior, language list, or validation rules require updates to all surfaces.

## Validation law

- `npm test` runs 251 tests covering all translation paths
- `npm run verify` runs typecheck + test + build + pack
- CI matrix: Node 18 + 22
- All tests use mocked Ollama (no real GPU required)
- No browser-based validation
