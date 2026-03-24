# Workflow: Protect Translation Truth

## Use when

A proposed change touches any of these paths:
- `src/translate.ts` — chunking, prompts, dispatch, batch mode, fallback behavior
- `src/translateMarkdown.ts` — segmentation, table parsing, reassembly, protected blocks
- `src/translateAll.ts` — multi-language orchestrator, nav bar, concurrency
- `src/languages.ts` — language definitions, resolver
- `src/validate.ts` — output validation, echo detection, length ratio
- `src/ollama.ts` — HTTP client, retry logic, timeouts, auto-start
- `src/cache.ts` — segment cache, path traversal protection, fuzzy matching
- `src/index.ts` — MCP tool implementations, error formatting
- `src/errors.ts` — error codes, PolyglotError shape

## Required chain

1. **Backend Engineer** — implements the change
2. **Test Engineer** — verifies translation dispatch, language resolution, validation, and fallback behavior
3. **Critic Reviewer** — reviews against reject criteria below

## Required review checks

The Critic must verify ALL of the following against evidence (not impression):

- [ ] `resolveLanguage()` remains deterministic: same input → same language or undefined
- [ ] `languages.ts` still has exactly 57 entries matching README count
- [ ] All Ollama calls go to localhost:11434 (no external endpoints added)
- [ ] Empty translation output still falls back to source text WITH warning (never silent)
- [ ] Batch separator `---POLYGLOT_SEP---` handling still falls back to individual on mismatch
- [ ] Protected segment types (code blocks, HTML, rules, blanks) still pass through untranslated
- [ ] Cache path traversal protection still active in `getCachePath()`
- [ ] `PolyglotError` still provides `{code, message, hint, retryable}` on all error paths
- [ ] MCP tools return `isError: true` on failure (no silent success on error)
- [ ] `npm test` passes all 251+ tests
- [ ] `npm run build` succeeds

## Reject criteria — automatic reject

A change is **automatically rejected** if it:

1. **Silently produces wrong-language output.** Any change that removes, weakens, or bypasses the fallback-to-source warning. If source text appears in target-language output, the response MUST include a warning. No silent substitution. This includes changes that keep the warning technically present but make it less machine-detectable (e.g., burying it in prose instead of a structured warnings array) or less operator-legible (e.g., rewording "empty output — using source text" to "translation completed with minor adjustments").

2. **Adds external translation endpoints.** Any URL, API key, or network call that leaves localhost:11434. No cloud fallback, no remote model hosting, no "hybrid" dispatch.

3. **Makes language resolution non-deterministic.** Any change that adds fuzzy matching, probabilistic selection, or context-dependent language detection to `resolveLanguage()`. The function must remain a pure lookup.

4. **Destroys markdown structure.** Any change that causes code blocks, tables, headings, or HTML to be mangled, translated when they should be protected, or dropped from output.

5. **Removes or weakens output validation.** Any change that removes echo detection, length ratio checking, garbled text detection, or meta-commentary detection from `validateTranslation()`. Validation may be extended but not reduced.

6. **Removes cache path traversal protection.** Any change to `getCachePath()` that allows the cache file to be written outside the source file's directory.

7. **Changes the batch separator** without updating both the split regex and the prompt template. The separator is a contract surface between prompt construction and response parsing.

8. **Makes human-facing reassurance stronger while leaving translation semantics unchanged.** A change that preserves technical behavior but rewrites user-visible text to imply higher quality, accuracy, or reliability than the system actually provides.

## Doctrine references

- Language definitions: `src/languages.ts` (57 entries)
- Translation dispatch: `src/translate.ts:translate()`, `src/translate.ts:translateBatch()`
- Markdown segmentation: `src/translateMarkdown.ts:segmentMarkdown()`
- Output validation: `src/validate.ts:validateTranslation()`
- Cache protection: `src/cache.ts:getCachePath()`
- Error contract: `src/errors.ts:PolyglotError`
- Lockdown doctrine: `role-os-rollout/DOCTRINE.md`
