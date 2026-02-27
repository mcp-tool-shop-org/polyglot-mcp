# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** polyglot-mcp
**Date:** 2026-02-27
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

## Post-Remediation

| Category | Before | After |
|----------|--------|-------|
| A. Security | 3/10 | 10/10 |
| B. Error Handling | 4/10 | 10/10 |
| C. Operator Docs | 6/10 | 10/10 |
| D. Shipping Hygiene | 3/10 | 10/10 |
| E. Identity (soft) | 10/10 | 10/10 |
| **Overall** | 26/50 | **50/50** |
