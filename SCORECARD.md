# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** polyglot-mcp
**Date:** 2026-02-27 (updated 2026-03-05)
**Type tags:** `[all]` `[npm]` `[mcp]` `[cli]`

## Pre-Remediation Assessment

| Category | Score | Notes |
|----------|-------|-------|
| A. Security | 3/10 | SECURITY.md template only, no threat model in README |
| B. Error Handling | 4/10 | Ad-hoc try/catch with plain Error, no structured error shape |
| C. Operator Docs | 6/10 | README good, CHANGELOG empty, LICENSE present |
| D. Shipping Hygiene | 3/10 | No CI workflow, no verify script, no dep audit |
| E. Identity (soft) | 10/10 | Logo, translations, landing page, GitHub metadata all present |
| **Overall** | **26/50** | |

## Key Gaps

1. No structured error shape — plain Error throws (Section B)
2. SECURITY.md template only, no threat model in README (Section A)
3. No CI workflow for pushes (Section D)
4. Empty CHANGELOG (Section C)
5. No verify script (Section D)

## v1.3.0 Remediation (2026-02-27)

Addressed gaps 1–5: PolyglotError, SECURITY.md, CI workflow, CHANGELOG, verify script.

| Category | Before | After | Notes |
|----------|--------|-------|-------|
| A. Security | 3/10 | 10/10 | SECURITY.md, threat model in README |
| B. Error Handling | 4/10 | 10/10 | PolyglotError structured class |
| C. Operator Docs | 6/10 | 10/10 | CHANGELOG populated, all tools documented |
| D. Shipping Hygiene | 3/10 | 7/10 | CI added but **no tests ran**, `npm audit` swallowed failures |
| E. Identity (soft) | 10/10 | 10/10 | Already complete |
| **Overall** | 26/50 | **47/50** | |

### Remaining gaps after v1.3.0

- No unit tests existed; CI ran typecheck + build only
- `npm audit --omit=dev || true` swallowed all audit failures
- `verify` script did not include tests

## v1.3.1 Remediation (2026-03-05)

Added 78 unit tests (5 test files), fixed CI to run tests, audit now fails on high-severity, verify includes tests.

| Category | Before | After | Notes |
|----------|--------|-------|-------|
| A. Security | 10/10 | 10/10 | No change |
| B. Error Handling | 10/10 | 10/10 | No change |
| C. Operator Docs | 10/10 | 10/10 | No change |
| D. Shipping Hygiene | 7/10 | 10/10 | Tests in CI, audit enforced, verify includes tests |
| E. Identity (soft) | 10/10 | 10/10 | No change |
| **Overall** | 47/50 | **50/50** | |

## v1.4.0 Feature Release (2026-03-05)

Added retry logic for transient failures, configurable default model, 36 more unit tests (translate + ollama modules), fixed hono audit vulnerabilities.

| Category | Before | After | Notes |
|----------|--------|-------|-------|
| A. Security | 10/10 | 10/10 | hono audit vulns resolved |
| B. Error Handling | 10/10 | 10/10 | Retry w/ exponential backoff hardens transient failures |
| C. Operator Docs | 10/10 | 10/10 | CHANGELOG updated |
| D. Shipping Hygiene | 10/10 | 10/10 | 114 tests across 7 files |
| E. Identity (soft) | 10/10 | 10/10 | No change |
| **Overall** | 50/50 | **50/50** | |

## v1.5.0 Feature Release (2026-03-05)

Core translateMarkdown API, translate_markdown MCP tool, streaming, output validation, tagline bug fix, 50 new tests.

| Category | Before | After | Notes |
|----------|--------|-------|-------|
| A. Security | 10/10 | 10/10 | No change |
| B. Error Handling | 10/10 | 10/10 | Output validation catches empty/echo/truncation/garble |
| C. Operator Docs | 10/10 | 10/10 | README + CHANGELOG updated, 4 tools documented |
| D. Shipping Hygiene | 10/10 | 10/10 | 164 tests across 9 files |
| E. Identity (soft) | 10/10 | 10/10 | No change |
| **Overall** | 50/50 | **50/50** | |

## v1.5.1 Quality Release (2026-03-05)

Comprehensive test coverage expansion, security hardening, accuracy fixes.

- **Testing**: 39 new tests — translate() with mocked Ollama (11), translateBatch() with fallback path (5), generateStream (6), MCP handler tests (13), MCP stdio integration smoke test (3), getCachePath test (1)
- **Security**: Cache path traversal guard — getCachePath now validates resolved path stays within source directory
- **Accuracy**: Fixed README language count discrepancy (55→57 — matches actual LANGUAGES array)
- **DevEx**: Dependabot config for npm deps + GitHub Actions auto-updates

| Category | Before | After | Notes |
|----------|--------|-------|-------|
| A. Security | 10/10 | 10/10 | Cache path traversal hardened |
| B. Error Handling | 10/10 | 10/10 | No change |
| C. Operator Docs | 10/10 | 10/10 | Language count corrected across all files |
| D. Shipping Hygiene | 10/10 | 10/10 | 205 tests across 12 files, Dependabot added |
| E. Identity (soft) | 10/10 | 10/10 | No change |
| **Overall** | 50/50 | **50/50** | |

## v1.6.0 Feature Release (2026-03-05)

Four medium-impact improvements: concurrency safety, translation memory, progress reporting, multi-language tool.

- **Concurrency semaphore**: `Semaphore` class guards Ollama calls to prevent GPU OOM (default 1, configurable via `POLYGLOT_CONCURRENCY`)
- **Fuzzy cache / translation memory**: Levenshtein-based similarity matching (≥85% threshold) reuses cached translations for near-miss segments
- **MCP progress tokens**: All 5 tool handlers report `notifications/progress` when client provides progressToken
- **`translate_all` MCP tool**: Translates markdown into 7 languages concurrently with nav bar injection
- **Testing**: 41 new tests — semaphore (8), fuzzy cache/similarity (16), translateAll (17). Total: 246 tests across 13 files.

| Category | Before | After | Notes |
|----------|--------|-------|-------|
| A. Security | 10/10 | 10/10 | Concurrency semaphore prevents GPU OOM |
| B. Error Handling | 10/10 | 10/10 | No change |
| C. Operator Docs | 10/10 | 10/10 | CHANGELOG updated, 5 tools documented |
| D. Shipping Hygiene | 10/10 | 10/10 | 246 tests across 13 files |
| E. Identity (soft) | 10/10 | 10/10 | No change |
| **Overall** | 50/50 | **50/50** | |
