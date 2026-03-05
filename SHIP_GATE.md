# Ship Gate

> No repo is "done" until every applicable line is checked.
> Copy this into your repo root. Check items off per-release.

**Tags:** `[all]` every repo · `[npm]` `[pypi]` `[vsix]` `[desktop]` `[container]` published artifacts · `[mcp]` MCP servers · `[cli]` CLI tools

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report email, supported versions, response timeline) (2026-02-27)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-02-27)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-02-27)
- [x] `[all]` No telemetry by default — state it explicitly even if obvious (2026-02-27)

### Default safety posture

- [ ] `[cli|mcp|desktop]` SKIP: MCP server has no destructive actions — translate/list/status are all read-only
- [x] `[cli|mcp|desktop]` File operations constrained to known directories (2026-02-27) — writes only .polyglot-cache.json in working directory
- [x] `[mcp]` Network egress off by default (2026-02-27) — HTTP to localhost:11434 only (Ollama API), no external egress
- [x] `[mcp]` Stack traces never exposed — structured error results only (2026-02-27) — PolyglotError + friendlyError

## B. Error Handling

- [x] `[all]` Errors follow the Structured Error Shape: `code`, `message`, `hint`, `cause?`, `retryable?` (2026-02-27) — PolyglotError class
- [ ] `[cli]` SKIP: not a standalone CLI tool
- [ ] `[cli]` SKIP: not a standalone CLI tool
- [x] `[mcp]` Tool errors return structured results — server never crashes on bad input (2026-02-27) — all tools wrapped in try/catch with isError
- [x] `[mcp]` State/config corruption degrades gracefully (stale data over crash) (2026-02-27) — cache corruption returns empty, no crash
- [ ] `[desktop]` SKIP: not a desktop app
- [ ] `[vscode]` SKIP: not a VS Code extension

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (2026-02-27)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-02-27)
- [x] `[all]` LICENSE file present and repo states support status (2026-02-27)
- [ ] `[cli]` SKIP: not a standalone CLI tool
- [ ] `[cli|mcp|desktop]` SKIP: MCP server — logging is stderr-only by design
- [x] `[mcp]` All tools documented with description + parameters (2026-02-27) — translate, list_languages, check_status in README
- [ ] `[complex]` SKIP: simple 3-tool server, not complex enough for ops handbook

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists (test + build + smoke in one command) (2026-02-27, updated 2026-03-05) — now includes `npm test`
- [x] `[all]` Version in manifest matches git tag (2026-02-27) — package.json version = "1.3.0"
- [x] `[all]` Dependency scanning runs in CI (ecosystem-appropriate) (2026-02-27)
- [x] `[all]` Automated dependency update mechanism exists (2026-02-27)
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, LICENSE (2026-02-27)
- [x] `[npm]` `engines.node` set (2026-02-27) — >=18.0.0
- [x] `[npm]` Lockfile committed (2026-02-27)
- [ ] `[vsix]` SKIP: not a VS Code extension
- [ ] `[desktop]` SKIP: not a desktop app

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header (2026-02-27)
- [x] `[all]` Translations (polyglot-mcp, 8 languages) (2026-02-27)
- [x] `[org]` Landing page (@mcptoolshop/site-theme) (2026-02-27)
- [x] `[all]` GitHub repo metadata: description, homepage, topics (2026-02-27)
