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
