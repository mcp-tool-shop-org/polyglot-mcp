# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.5.1] - 2026-03-05

### Added
- **MCP handler tests** — 13 tests covering all 4 tool handlers (translate, translate_markdown, list_languages, check_status), error propagation, and warning surfacing
- **Integration smoke test** — MCP handshake over stdio: spawns the server, completes initialize, calls list_languages, lists all tools. Runs in CI without Ollama.
- **translate/translateBatch tests** — 16 new tests for `translate()` (mocked Ollama: language validation, same-language rejection, streaming path, validation warnings, ensureRunning/ensureModel failures) and `translateBatch()` (empty input, single item, batch with separator, **fallback path when separators are mangled**)
- **generateStream tests** — 6 tests covering success, retry on 500, MODEL_NOT_FOUND, OLLAMA_UNAVAILABLE, missing response body, malformed NDJSON tolerance
- **Cache path traversal guard** — `getCachePath()` now validates the resolved path stays within the source file's directory; throws on traversal attempts
- **Dependabot configuration** — `.github/dependabot.yml` for weekly npm + GitHub Actions dependency updates

### Fixed
- **Language count discrepancy** — README, package.json, MCP tool descriptions, error hints, and source comments all said "55 languages" but the `LANGUAGES` array contains 57. Corrected to 57 everywhere.

## [1.5.0] - 2026-03-05

### Added
- `translateMarkdown()` core API — markdown-aware translation engine with segmentation, table parsing, caching, and validation
- `translate_markdown` MCP tool — translate entire markdown documents while preserving structure (code blocks, HTML, tables, URLs)
- `generateStream()` on `OllamaClient` — streaming token generation with async NDJSON parsing and retry logic
- `onToken` streaming callback on `translate()` — receive tokens as they arrive for progress/display
- `validate.ts` module — catches empty output, source echo, truncation, hallucination blowup, garbled text, model meta-commentary
- Automatic output validation in `translate()` and `translateMarkdown()` — warnings returned in results
- 50 new unit tests: `validate.test.ts` (15), `translateMarkdown.test.ts` (35)

### Fixed
- **Tagline translation bug** — `<p><strong>text</strong></p>` lines now translate correctly instead of staying in English
- Validation false-positive suppression for short technical strings (backtick terms, values like `~600 ms`)

### Changed
- `translate-readme.mjs` script rewritten as thin CLI wrapper over the core `translateMarkdown()` API (488 → 70 lines)
- `TranslateResult` now includes `warnings: string[]` field
- Package exports now include `./translateMarkdown` and `./validate`

## [1.4.0] - 2026-03-05

### Added
- Retry logic with exponential backoff for transient Ollama failures (`MAX_RETRIES=2`)
- Configurable default model via `POLYGLOT_MODEL` environment variable
- Unit tests for `translate` module (22 tests) and `ollama` module (14 tests)

### Fixed
- High-severity `hono` / `@hono/node-server` transitive dependency vulnerabilities

## [1.3.1] - 2026-03-05

### Added
- Unit tests for all pure modules: languages, polish, glossary, errors, cache (78 tests)
- `vitest.config.ts` configuration file
- `npm test` step in CI workflow (runs on both Node 18 and 22)

### Fixed
- CI `npm audit` no longer swallows failures (`|| true` removed, `--audit-level=high` enforced)
- `verify` script now includes `npm test` before build
- SCORECARD.md updated to honestly reflect the test gap in v1.3.0 remediation

## [1.3.0] - 2026-02-27

### Added
- `PolyglotError` structured error class (code, message, hint, cause, retryable)
- SECURITY.md with vulnerability reporting policy and data scope
- Threat model section in README (data touched, data NOT touched, network)
- CI badge in README
- CI workflow with Node 18 + 22 matrix, typecheck, build, dep audit
- `verify` script — typecheck + build + npm pack in one command
- SHIP_GATE.md and SCORECARD.md for product standards tracking

### Changed
- All error throws now use PolyglotError with structured codes
- `friendlyError` moved to src/errors.ts (consolidated error handling)
- MCP tool error responses use structured error formatting
- Bumped to v1.3.0 — all Shipcheck hard gates pass

## [1.2.1] - 2026-02-27

### Fixed
- Silent hangs during translation (improved timeout handling)
- Version string mismatch between package.json and MCP server

## [1.1.0] - 2026-02-26

### Added
- Batch translation mode (`translateBatch`) for multi-segment efficiency
- Segment-level translation cache with SHA-256 keys and 30-day TTL
- Multi-language parallel translation script (`translate-all.mjs`)
- Post-translation polish module for cleaning common artifacts

## [1.0.0] - 2026-02-25

### Added
- Initial release as MCP server
- 3 MCP tools: `translate`, `list_languages`, `check_status`
- 55 language support via TranslateGemma
- Ollama auto-start and auto-pull
- Built-in software glossary (12 technical terms)
- Text chunking at paragraph/sentence boundaries
- Landing page via @mcptoolshop/site-theme
- 8-language README translations
