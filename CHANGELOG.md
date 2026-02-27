# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
