# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.10.1] - 2026-10-21

Survival check catches broken Markdown links, leaked `⟦n⟧` placeholders, and anchor-count mismatches (#50).

### Added

- **Segment and whole-file Markdown link structure survival check (`kind: "link"`)** (`extractRefDefinitions`, `extractLinks`, `checkLinks` in `src/survival.ts`, `checkSurvival` in `src/translateMarkdown.ts`) — during the 1.10.0 README translation run, TranslateGemma mangled the `[text](url)` Markdown link wrapper in 6 segments across `README.es.md`, `README.fr.md`, and `README.ja.md` while keeping the protected URL or code span intact inside the mangled syntax (`([Ollama](https://ollama.com)` missing its closing `)`; `[TranslateGemma](https://ollama.com/library/translategemma` missing its closing `)`; `([Ollama)` dropping `(https://ollama.com)` when the URL occurred twice in the segment; and `(#存続チェック--on-lost-span)` dropping `[存続チェック]` after a leaked `⟦0⟧` placeholder). `checkSurvival` now parses inline links (`[text](target)` and `[text](target "title")`), images (`![alt](src)`), and reference links (`[text][label]`, collapsed `[text][]`, and shortcut `[label]`, resolved case-insensitively with whitespace collapsed against each file's own `[label]: target` definitions) outside fenced code blocks, HTML comments, and inline code spans in strictly linear time $O(n)$ (handling nested badge links `[![alt](img)](url)` and balanced parentheses in URLs like `https://en.wikipedia.org/wiki/Foo_(bar)` without regex backtracking). For each aligned segment (and in the whole-file fallback when segment alignment fails), the multiset of non-anchor link targets and the count of in-page `#slug` anchor links in the translation must match the source; any mismatch is reported as a `LostSpan` of `kind: "link"` with `span` set to the missing target (or `"N anchor links"`) and `found` listing the translated segment's links.
- **Placeholder delimiter leakage check (`kind: "placeholder"`)** (`PLACEHOLDER_LEAK_PATTERN`, `checkPlaceholders` in `src/survival.ts`) — any `⟦` or `⟧` delimiter remaining outside fenced and inline code in a finished translation segment (or whole file) beyond the count present outside code in the source is reported as a `LostSpan` of `kind: "placeholder"`, catching corruptions where a pin or model output leaves a raw `⟦0⟧` or bare bracket in the prose.
- **Anchor-count mismatch fails when a source-valid anchor was involved (`kind: "anchor"`)** (`checkAnchors` in `src/survival.ts`) — when source and translation in-page anchor counts differ and `checkAnchors` falls back to plain resolution checking, it keeps the diagnostic warning and now also records a `LostSpan` (`kind: "anchor"`, `span: "anchor count <src> → <tgt>"`) whenever at least one source anchor resolved in the source and the count difference was not caused solely by links already broken in the source. To preserve "one slip, one report", this count-mismatch `LostSpan` is suppressed when the segment link check (`kind: "link"`) or the plain resolution check has already reported the dropped or broken anchor.
- **Coverage gate** (`vitest.config.ts`, `codecov.yml`) — measured 90.70% line coverage across the test suite (98.43% on `src/survival.ts`, 94.69% on `src/translateMarkdown.ts`, up from 90.04% in 1.10.0); set `coverage.thresholds.lines: 90` in `vitest.config.ts` and enforced a 90% `project` (1% threshold) and 90% `patch` target in `codecov.yml`.

## [1.10.0] - 2026-10-20

In-page anchor links that survive translation (#46).

### Added

- **Protected in-page anchor targets (`anchor`)** — in 1.9.0, 22 of 28 in-page `#slug` links across the 7 translated READMEs (`README.<lang>.md` at 9fbe43a) did not resolve to any heading in the file they lived in. Two failure modes caused it: (1) the anchor target stayed in English while the heading was translated (`#ollama-cloud-optional` against `### Ollama Cloud（可选）` in Chinese or `### ओलामा क्लाउड (वैकल्पिक)` in Hindi), and (2) TranslateGemma partially translated or corrupted the slug itself (in French, `[Survival Check](#survival-check---on-lost-span)` became `[Vérification de survie](#vérification-de-survie---en-cas-de-portion-manquante)` while the heading became `### Vérification de survie (\`--on-lost-span\`)`, whose GitHub slug is `#vérification-de-survie---on-lost-span`; in Hindi, `#configurable-default-model` dropped the matra in `कॉन्फ़िगर` and came back as `#कनफ़िगर-करने-योग्य-डिफ़ॉल्ट-मॉडल`). Every `#slug` in a Markdown inline link (`[text](#slug)` and `[text](#slug "title")`) and reference link definition (`[label]: #slug`) is now masked as a protected span of kind `"anchor"` (`src/protectedTerms.ts`, on by default) so the model translates the link text and never sees or rewrites the slug. Because segment cache keys fold in the protected-term rules that matched, segments carrying an in-page anchor get a fresh cache key while segments without an anchor keep their 1.9.0 keys.
- **Post-assembly anchor rewrite to translated heading slugs** (`buildHeadingSlugMap`, `rewriteAnchors` in `src/translateMarkdown.ts`, `stripHeadingMarkup`, `slugifyHeadings` in `src/survival.ts`) — after all segments are translated and reassembled, each ATX heading in the source document is paired with its translated ATX heading by segment index (`segIndex`) and slugged in document order with `github-slugger@2.0.0` (the library GitHub's own Markdown pipeline uses, preserving duplicate-heading `-1`, `-2` counters and Unicode letters/combining marks). Inline code spans in headings are masked before stripping links, images, HTML tags, and word-boundary emphasis delimiters so headings like ``## Type `<T>` `` and ``## `__init__` `` keep their literal code text. Every non-code in-page anchor in inline links, reference definitions, and HTML `href="#…"` attributes is rewritten in a single pass per line (so swapped slugs never double-rewrite), with percent-encoded source fragments decoded via a `URIError`-safe wrapper. `scripts/pin-translation.mjs` (`src/pinCorrections.ts`) applies the same rewrite when comparing cached translations against a hand-corrected file.
- **Whole-document anchor survival check** (`checkAnchors` in `src/survival.ts`) — `anchor` spans are exempt from the segment-level exact-text survival check (since they are meant to be rewritten when the target heading changes language) and are instead checked against the finished document. After skipping fenced code blocks and inline code, `checkSurvival` indexes source anchors against source ATX headings and explicit `<a id="…">` / `<a name="…">` / `id="…"` attributes first: an anchor that was already unresolved in the English source (including links to setext headings) emits a warning and never fails `--on-lost-span=fail`. Every source-valid anchor whose corresponding translated anchor does not resolve in the translated file is reported as a `LostSpan` with `kind: "anchor"`, `span` set to the unresolved `#slug`, and `found` set to the `#slug` of the translated heading at the paired heading index. Switching `"anchor"` off via `"disable": ["anchor"]` in `.polyglot-terms.json` disables all three stages (masking, post-assembly rewrite, and anchor survival check). Verified against 228 ground-truth `id="user-content-…"` slugs fetched from GitHub's Markdown renderer across 6 1.9.0 README extracts and 12 synthetic headings (`src/fixtures/issue-46/github-slugs.json`).

### Fixed

- Cleaned up `bin.polyglot-mcp` path in `package.json` (`"./dist/index.js"` → `"dist/index.js"`).

## [1.9.0] - 2026-10-20

Protected terms, a survival check, and hand fixes that stick (#44).

### Added

- **Protected terms in prose** — TranslateGemma respelled bare identifiers in another script, and nothing covered them because they are not in backticks. xrpl-lab's Hindi README wrote its `XLS-nn` spec IDs and `DepositAuth` / `DepositPreauth` in Devanagari (`एक्सएलएस-85`, `डिपॉजिटऑथ`), and ai-jam-sessions' Hindi README wrote `Kimi-K3` as `किमी-के3`. Protected terms now go through the same letter-free `⟦n⟧` placeholders as inline code spans (`maskCodeSpans(text, terms)` in `src/codeSpans.ts`), numbered after the code spans and restored the same way. The default set (`src/protectedTerms.ts`) is URLs; ALL-CAPS identifiers with a digit, hyphen or underscore (`XLS-30`, `HOST_REJECTED`); CamelCase and mixedCase identifiers (`DepositAuth`, `AMMCreate`); and model and product IDs with a letter-and-digit part (`Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B`). Each pattern requires a shape ordinary capitalised English lacks, and tests pin that `README`, `API`, `URLs`, `IDs`, `Node.js`, `Top-10` and plain capitalised words stay prose.
- **"N of M" counts restored as `N/M`** — in Chinese, "218 of 224" came back as `218 首中的 224 首` ("224 of 218") and "285 of 414" as the ordinal `414个中的第285个`. Both were fixed by hand to `218/224` and `285/414` (ai-jam-sessions 5f8d1e2). A count in prose or a table cell is now masked as one span and restored as `N/M` in every language. A cell that is only a count is not sent to the model. On by default.
- **`.polyglot-terms.json`** beside the README: `terms` (exact, case-sensitive, whole-word), `patterns` (regexes), `disable` (default patterns by name) and `nOfM` (`false` switches counts off). Read by the scripts, by `translate_readme`, and by `translateMarkdown` when given a `filePath`. A file that cannot be parsed fails with the new `CONFIG_ERROR` code; the run does not continue without the terms.
- **Survival check** (`src/survival.ts`, `checkSurvival` in `src/translateMarkdown.ts`) — after translation, every protected span in the English must be present, character for character, in the translation of its segment, with inline code spans and fenced blocks counted per file. As a backstop, the multiset of numbers in each table cell must match the source cell, with digits from other scripts normalised. The order of the numbers is not checked: correct Chinese puts the total first, and the reversed slip keeps the English order, so an order check would flag the right answer and pass the wrong one. The check reads the finished file, so it covers the model, the cache, pins and fallbacks alike. Results are in `TranslateMarkdownResult.lostSpans`.
- **`--on-lost-span=fail|report`** — under `fail`, a run with a lost span exits non-zero with a list of language, segment and missing span. The library throws `LostSpanError`, a `PolyglotError` with code `LOST_SPAN` that carries the list and the result. Under `report`, the run writes the list and exits 0. `scripts/translate-all.mjs` (and `translate-readme.mjs`) default to `fail`; they still write the files so they can be fixed by hand and pinned, and the `POLYGLOT_COMPLETE` summary carries `lostSpans` and the structured `error`. The MCP tools (`translate_markdown`, `translate_all`, `translate_readme`, new `onLostSpan` parameter) and `translateMarkdown` default to `report`.
- **Pinned translations, `.polyglot-pins.json`** (`src/pins.ts`) — a pinned translation always wins. An entry is keyed by the hash of the English segment plus the target language, with whitespace laid out canonically so that CRLF and LF checkouts share pins. It beats the cache and the model, survives every rerun including `--cache-clear`, and stops matching once the English changes. In ai-jam-sessions, `Kimi-K3` was fixed by hand in e4cd2fb, came back from the cache on the next run, and was fixed again in 5f8d1e2. A test now replays that sequence end to end.
- **`scripts/pin-translation.mjs <readme> <lang> <corrected-file>`** (`src/pinCorrections.ts`) — pairs each segment of the English with its text in a hand-corrected translation and pins every segment whose text differs from what the cache would produce. `--dry-run`, `--model=`, `--include-uncached`.
- New package exports: `./protectedTerms`, `./survival`, `./pins`, `./pinCorrections`.

### Changed

- **The cache key folds in the protected-term rules** — `cacheKey(text, targetLang, model, termsHash?)` (`src/cache.ts`) now includes a hash of the protected-term rules that fired in the segment. Adding a term changes the key of every segment containing it, so a cached slip that respelled the term is not replayed; segments it does not touch keep their keys. A segment where no rule fires keeps its 1.8 key (`targetLang:model:text`), so caches carry over except for segments that contain protected terms. Those are retranslated once. The `किमी-के3` entry in ai-jam-sessions' cache at 5f8d1e2 is keyed exactly as 1.8 keyed it, and a test asserts it is no longer replayed.
- When a segment's placeholders do not survive translation, it falls back to the source with its counts written as `N/M`. Before, it fell back to the raw source.

### Fixed

- **Placeholder patterns ran in polynomial time on hostile input** — the restore patterns in `src/codeSpans.ts` (`⟦[^⟦⟧]*?(\d+)[^⟦⟧]*?⟧`) backtracked polynomially on an unclosed `⟦` followed by a long digit run (CodeQL js/polynomial-redos, newly reachable through the pin helper). They are rewritten so that no two parts can match the same characters. They match the same placeholders, and a 50,000-digit hostile string is now rejected in linear time (2 new tests).

## [1.8.0] - 2026-09-25

### Added

- **`translate_readme` MCP tool** — translates a README.md *file* into all 7 languages and writes the `README.<lang>.md` files to disk, refreshing the language nav bar in the source and each translation. Returns a per-language status summary (ok/fail, timings, files written) rather than translated text; use `translate_markdown` when you want content returned. Carries a `tier` knob — `quality` (translategemma:27b), `bulk` (12b), `draft` (2b) — with an explicit `model` override. Partial success is not a tool error: only a total failure sets `isError`, since a partial run still wrote files. New `src/translateReadme.ts` + 5 tests; tool count 5 → 6.
- **Ollama Cloud support** — `OllamaClient` reads `OLLAMA_HOST` for its base URL and attaches an `OLLAMA_API_KEY` Bearer header, so translation can run against https://ollama.com with no change to local use. The header is attached only to a **non-loopback** host: a local Ollama 403s when it receives one, and an API key must not leave for a host the operator did not point us at. `ensureModel()` short-circuits on a cloud host — cloud models are served on demand, so the has-model/pull probe is a wasted round trip. 10 tests pin the routing decision, including the loopback forms (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, port-less, uppercase), trailing-slash stripping, blank-key handling, and that a hostname merely *starting* with `localhost` is correctly treated as remote.

### Fixed

- **Edited segments came back with their previous translation** — the fuzzy translation memory reused a cached translation verbatim for any segment more than 85% similar to a cached source, and its only guard compared SemVer tokens. Caught translating si-rpg-engine's README on 2026-09-25: "174 tests, …" became "197 tests, …" (0.987 similar) and a table cell went from "NaN refused" to "NaN and infinities refused" (0.894), and 4 of 7 languages kept the old count and the old cell. A cached translation is now reused only when its source differs from the new one in whitespace layout alone: runs of spaces or tabs within a line, whitespace at either end, CRLF versus LF. Line breaks, indentation and hard line breaks stay significant, because Markdown gives them meaning. Every other edit goes back to the model, including a changed word, number, punctuation mark, symbol, letter case or inline code span. Punctuation is not exempt, because it can reverse what a line says: text struck through with `~~`, a ✓ that became ✗, or +12% that became -12%. The rule lives in `getFuzzyCached`, so library callers of `./cache` get it too. Exact-key cache hits are unchanged. The cost: an edited segment costs one model call per language, where it used to cost none.
- The invariant-token guard is kept as a floor under that rule. It now covers every run of digits with its separators (`174`, `1,000`, `0.2105`) and inline-code placeholders as well as version tokens, and compares them in source order. Tokens are compared source against source, never against a translation, whose locale may write 1,000 as 1.000. 27 new tests in `src/cache.test.ts`, and 2 in the new `src/translateMarkdown.cache.test.ts`, which runs the real engine twice against an on-disk cache with only the Ollama batch layer mocked (345 tests across 19 files).
- `scripts/translate-readme.mjs` now counts fuzzy reuses in its summary line. Before this, a segment reused through the fuzzy cache appeared in neither the cached nor the to-translate count. A reproduction of the si-rpg-engine edit printed `5 translatable segments (3 cached, 0 to translate)`, and the two stale segments were the two missing from that count.
- **Inline code spans were transliterated into the target script** — `segmentMarkdown` protected fenced code blocks but not inline spans, so a span embedded in a prose sentence reached the model unguarded. Caught in ai-rpg-engine's shipped `README.hi.md`: 105 of 182 spans came back in Devanagari, plus 17 more across two package READMEs — `run <path>` as `रन <पथ>`, `--checkpoint` as `--चेकपॉइंट`, `@ai-rpg-engine/core` as `@ai-rpg-इंजन/कोर`, `buildCombatStack` as `बिल्डकॉम्बैटस्टैक`. A CLI command, a flag, an npm package name, and a function, none of which work when copied out of the docs; it had shipped for at least one release. Every inline span is now masked to a `⟦0⟧` placeholder before translation and restored after (new `src/codeSpans.ts`). The placeholder is a bracket pair around a digit run and nothing else — it carries no letters, so a transliterating model has nothing in it to convert; a word-shaped token like `POLYGLOT_SEP` would itself be transliterable. Restore **fails closed**: if the placeholders do not come back exactly once each, the segment reverts to source text with a warning, because untranslated prose is visible and reportable whereas a sentence that quietly lost its `npm install` target reads as correct.
- Keying the segment cache on the *masked* text invalidates entries written before this protection existed, so a stale cache cannot replay a transliterated identifier — and it widens dedup, collapsing sentences that differ only in which identifier they name.
- **Languages translated at the same time erased each other's cache entries** — `translate-all.mjs` translates two or three languages at once, each in its own child process. Every child loaded `.polyglot-cache.json` when it started and overwrote it when it finished, so the last to finish in each pair kept its entries and the others lost theirs. Half the languages then retranslated every segment on every run, and because TranslateGemma's output varies between runs, unchanged paragraphs churned in the diffs. On the 5090 rig, facet's cache held ja, fr, it and pt, and nothing for zh, es or hi. The same race is why only 4 of 7 languages got the stale fuzzy hits in si-rpg-engine on 2026-09-25. `saveCache` now does a three-way merge under a lock file. It re-reads the file and applies only what this process changed since it loaded: entries added or replaced, and entries removed by clearing, pruning or expiry. Everything else is kept as the file has it, and the result is written to a temporary file that is renamed over the cache. The merge alone is not enough: without the lock, 4 processes each saving 40 entries kept as few as 36 of 160 on Windows. A lock left by a killed process is broken after 10 s. Measured on translategemma:27b, a 7-language `translate-all` run now leaves all 7 languages cached, where it used to leave ja, fr, it and pt. A rerun makes no model calls and rewrites no translated file.
- **`--cache-clear` cleared every language, in every child**, so a full `translate-all --cache-clear` run ended with only Portuguese cached. `cacheClear` in `translateMarkdown`, and so `--cache-clear` in both scripts, now clears only the target language's entries. It also clears entries that carry no language tag (written before v1.7.0), because a lookup for this language could still return them. `clearCache(cache)` with no language still clears everything; `clearCache(cache, lang)` is new.
- `src/cache.concurrency.test.ts` (15 tests) covers interleaved load/save cycles, clears and prunes against a shared file, and four processes saving at once, each checking on every load that none of its earlier entries is gone. `src/translateMarkdown.concurrency.test.ts` (2 tests) translates two languages at once through the real engine and on-disk cache.

### Changed

- **`translategemma:27b` is the default model** across the CLI scripts and the MCP tool descriptions (was 12b), matching the blessed studio default. `scripts/translate-readme.mjs` honours `POLYGLOT_MODEL`; `--fast` still selects 2b.
- Per-language timeout in `scripts/translate-all.mjs` raised 300 s → 900 s. 27b on a long README legitimately exceeds five minutes; the old ceiling killed real work and reported it as a timeout.
- A code-placeholder preservation instruction is appended to the translation prompts **only when the text actually carries placeholders**, so protecting code spans does not churn the translation of every placeholder-free paragraph in the corpus.
- **npm releases publish through Trusted Publishing (OIDC)**, with provenance and no token. The previous workflow read an `NPM_TOKEN` secret that no longer exists and ran with `continue-on-error`, so a release went green without publishing; 1.7.2 was published from a local machine. The publish job now installs a current npm (≥ 11.5.1, which OIDC needs) into a sandbox rather than upgrading Node 22's bundled npm in place, and publishes only from the `v<version>` tag that matches `package.json`.
- **Docs brought up to date with this release.** The README, handbook, landing page, and `SECURITY.md` now cover the sixth tool (`translate_readme`), the 27B default with guidance for smaller GPUs, Ollama Cloud, inline code-span protection, the Node 20 minimum, and the cache behaviour above. The security scope now names the one optional secret (`OLLAMA_API_KEY`), the remote host it may be sent to, and the files `translate_readme` writes. The earlier text said the server handled no secrets and made no network calls beyond localhost, which this release made untrue.

### Security

- Closed 7 transitive advisories that landed after 2026-07-12 by extending the `overrides` block: `fast-uri` → ^4.1.1 (high — host confusion via backslash authority delimiter and failed IDN canonicalization), plus `@hono/node-server` ^2.0.12, `body-parser` ^2.3.0, `ip-address` ^10.3.1, and `qs` ^6.15.3. All arrive under `@modelcontextprotocol/sdk`. `npm audit --omit=dev --audit-level=high` (the CI gate) reports 0. The `fast-uri` bump crosses a major version, so it was smoke-tested beyond the suite: the built server completes a real MCP stdio `initialize` handshake and lists all 6 tools, exercising the ajv schema path `fast-uri` actually serves. The remaining `postcss`/`vite` advisories are dev-only, reached through `vitest`, and excluded by the gate's `--omit=dev` by design.

## [1.7.2] - 2026-05-14

### Fixed

- **Stale version tokens preserved through the fuzzy cache** — `getFuzzyCached()` in `src/cache.ts` now compares SemVer-style version tokens between the query and the candidate cache entry, and rejects the fuzzy match when the tokens disagree. Failure mode caught on the testing-os v1.2.2 release 2026-05-14: every translation pass produced README.{ja,zh,es,fr,hi,it,pt-BR}.md with the `<!-- version:start -->` marker block stamped at the *previous* release's version, because the marker-block segment had ~0.99 Levenshtein similarity to the previous release's cached segment (only the version number changed). The fuzzy cache returned the prior translation verbatim — old version token and all. The new check forces a fresh translation when version tokens differ, restoring correctness at the cost of ~7 extra Ollama calls per release (one per language). Added 4 new tests in the `getFuzzyCached` describe block + 5 in `extractInvariantTokens` + 4 in `hasSameInvariantTokens` (269 total tests across 14 files, up from 256).

### Changed

- **Ollama `generate()` timeout raised from 60 s to 300 s** in `src/ollama.ts`. The 60 s ceiling caught large README segments that legitimately need more time on the cold-load path of `translategemma:12b`. 5 minutes is the new ceiling — generous enough for long prose with cold-cache inference, still bounded so a real hang surfaces.

## [1.7.1] - 2026-03-25

### Added

- `--version` / `-V` flag on CLI entry point
- 5 version consistency tests (semver, >= 1.0.0, package.json match, CHANGELOG, --version flag)

## [1.7.0] - 2026-03-05

### Fixed

- **Cross-language contamination in fuzzy cache** — `getFuzzyCached()` now filters by `targetLang`, preventing translations in one language (e.g. Japanese) from being returned for queries targeting a different language (e.g. Spanish). Added `targetLang` field to `CacheEntry`; backward compatible with pre-v1.6.1 entries.

### Added

- 5 new cache tests for the cross-language fix (251 total tests across 13 files)

## [1.6.0] - 2026-03-05

### Added
- **Concurrency semaphore** — `Semaphore` class in `src/semaphore.ts` guards all Ollama `generate()` and `generateStream()` calls to prevent GPU OOM on systems with limited VRAM. Default limit: 1 (override via `POLYGLOT_CONCURRENCY` env var).
- **Fuzzy cache / translation memory** — `similarity()` (normalised Levenshtein), `getFuzzyCached()` in `src/cache.ts`. Near-miss segments (≥85% similar) reuse existing translations instead of re-translating. Cache entries now store source text for fuzzy comparison.
- **MCP progress tokens** — all 5 tool handlers now accept `extra` and send `notifications/progress` when the client provides a `progressToken`. Reports per-chunk (translate), per-segment-batch (translate_markdown), per-language (translate_all), and per-step (check_status).
- **`translate_all` MCP tool** — translates markdown into multiple languages at once (default: 7 — ja, zh, es, fr, hi, it, pt). Runs concurrently with semaphore-safe limiting. Includes nav bar injection and per-language progress reporting.
- **`src/translateAll.ts`** — core multi-language orchestrator extracted from `scripts/translate-all.mjs`, now a proper TypeScript module with `translateAll()`, `buildNavBar()`, `injectNavBar()` exports.
- **41 new tests** — `semaphore.test.ts` (8), expanded `cache.test.ts` (+16 for similarity & fuzzy), `translateAll.test.ts` (17). Total: 246 tests across 13 files.

### Changed
- `OllamaClient.generate()` and `generateStream()` now acquire a semaphore permit before calling Ollama and release it when done.
- `TranslateMarkdownResult` now includes `fuzzyMatched` field reporting fuzzy cache hits.
- `setCached()` accepts an optional `source` parameter for translation memory.
- `translateMarkdown` reports progress incrementally (cache hits reported immediately, translations after batch completes) instead of a single final callback.
- Server now registers 5 tools (was 4): translate, list_languages, translate_markdown, translate_all, check_status.

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
