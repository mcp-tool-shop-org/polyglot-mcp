<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Local GPU translation MCP server — 57 languages, zero cloud dependency.</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="node 20+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## What it does

Translates text between 57 languages using [TranslateGemma](https://ollama.com/library/translategemma) running locally on your GPU via [Ollama](https://ollama.com). No API keys, no cloud, no rate limits — by default everything stays on your machine. You can opt in to a remote Ollama such as [Ollama Cloud](#ollama-cloud-optional).

## Quick Start

### 1. Install Ollama

Download from [ollama.com](https://ollama.com) and start it:

```bash
ollama serve
```

### 2. Pull a model

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **Tip:** You can skip this step — Polyglot auto-pulls the default model (27B, 17 GB) on first use. On a smaller GPU, set `POLYGLOT_MODEL=translategemma:12b` first (see [Configurable Default Model](#configurable-default-model)).

### 3. Add to your MCP client

**Claude Code / Claude Desktop** — add to `claude_desktop_config.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "polyglot": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/polyglot-mcp"]
    }
  }
}
```

**From source:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

That's it. Ask Claude to translate something and it will use the `translate` tool automatically.

## Tools

Polyglot exposes six MCP tools:

### `translate`

Translate text between any supported language pair.

| Parameter   | Required | Description |
|-------------|----------|-------------|
| `text`      | yes      | Text to translate |
| `from`      | yes      | Source language code or name (e.g., `en`, `English`) |
| `to`        | yes      | Target language code or name (e.g., `ja`, `Japanese`) |
| `model`     | no       | Ollama model (default: `translategemma:27b`) |
| `glossary`  | no       | Custom term overrides as `{"source": "translation"}` — merged with the built-in software glossary |

Long text is automatically split into chunks at paragraph and sentence boundaries, translated in sequence, and reassembled. All translations are validated for quality (empty output, echo detection, truncation, garbled text).

### `translate_markdown`

Translate an entire markdown document while preserving structure. Code blocks, HTML elements, badges, URLs, and table formatting are kept intact — only prose content (headings, paragraphs, taglines, table cells) is translated. Inline code spans and [protected terms](#protected-terms-polyglot-termsjson) are swapped for placeholders before translation and restored after, so commands, flags, package names, and identifiers come back exactly as written, and every "N of M" count comes back as `N/M`.

| Parameter    | Required | Description |
|--------------|----------|-------------|
| `markdown`   | yes      | The full markdown content to translate |
| `from`       | yes      | Source language code or name |
| `to`         | yes      | Target language code or name |
| `model`      | no       | Ollama model (default: `translategemma:27b`) |
| `onLostSpan` | no       | `report` (default) lists protected spans missing from the translation; `fail` makes that an error. See [Survival Check](#survival-check---on-lost-span) |

### `list_languages`

List all 57 supported languages with their codes.

### `check_status`

Check if Ollama is running and which TranslateGemma models are installed. Attempts auto-start if Ollama isn't running.

### `translate_all`

Translate markdown content into multiple languages at once (default: 7 — Japanese, Chinese, Spanish, French, Hindi, Italian, Portuguese). Runs translations concurrently with GPU-safe semaphore limiting.

| Parameter     | Required | Description |
|---------------|----------|-------------|
| `markdown`    | yes      | The full markdown content to translate |
| `from`        | no       | Source language code (default: `en`) |
| `languages`   | no       | Array of target language codes (default: all 7) |
| `model`       | no       | Ollama model (default: `translategemma:27b`) |
| `concurrency` | no       | Max concurrent translations (default: 2, max: 3) |
| `navBar`      | no       | Inject language nav bar (default: true) |
| `onLostSpan`  | no       | `report` (default) lists lost protected spans per language; `fail` turns a language with any into an error |

### `translate_readme`

Translate a README.md **file** into the same 7 languages and write the `README.<lang>.md` files next to it, refreshing the language nav bar in the source README and in each translation. Returns a per-language status summary (ok/fail, timings, files written) rather than the translated text; use `translate_markdown` when you want the content back.

| Parameter     | Required | Description |
|---------------|----------|-------------|
| `readmePath`  | yes      | Absolute path to the source README.md |
| `tier`        | no       | `quality` (`translategemma:27b`, default), `bulk` (`12b`), or `draft` (`2b`); ignored when `model` is set |
| `model`       | no       | Explicit Ollama model; overrides `tier` |
| `languages`   | no       | Subset of target language codes (default: all 7) |
| `concurrency` | no       | Max concurrent translations (default: 2, max: 3) |
| `navBar`      | no       | Inject or refresh the language nav bar (default: true) |
| `onLostSpan`  | no       | `report` (default) writes every file and lists lost protected spans; `fail` leaves a language with any unwritten, as an error |

`translate_readme` reads the README's `.polyglot-terms.json` and `.polyglot-pins.json` if they exist.

## Features

### Auto-start & Auto-pull
Ollama is automatically started if it isn't running. The TranslateGemma model is automatically pulled if it isn't installed. Zero manual setup required.

### Retry with Exponential Backoff
Transient Ollama failures (network blips, temporary overload) are automatically retried up to 2 times with exponential backoff (1 s, 2 s). Non-retryable errors (bad model name, invalid input) fail immediately.

### Smart Chunking
Long text is split at natural boundaries — paragraphs, then sentences — so translation context is preserved. Chunk sizes adapt to the model: 2K chars for 2B/4B models, 4K for 12B, 6K for 27B.

### Segment Cache
Translated segments are cached by content hash (SHA-256 of the masked source text + target language + model, plus a hash of the protected-term rules that matched in the segment). Unchanged segments skip re-translation entirely, so re-running a translation after an edit touches only what changed. Adding a protected term changes the key of every segment containing it, so a cached translation that respelled the term is not replayed; other segments keep their keys. The cache lives in `.polyglot-cache.json` next to the source file, with a 30-day TTL. It is used by the `translateMarkdown` library API when given a `filePath` (and by the repo's `scripts/translate-*.mjs` CLI); the MCP tools translate without it.

Several runs can share one cache file. Each save merges only its own changes into the file under a lock and replaces the file atomically, so languages translated in parallel keep each other's entries, and clearing the cache for one language leaves the others alone.

### Translation Memory (Fuzzy Cache)
When an exact cache hit isn't found, a cached translation is reused only if its source differs from the new one in whitespace layout alone: spacing within a line, whitespace at either end, or CRLF versus LF. Any other edit is retranslated, including a changed word, number, punctuation mark, letter case, or inline code span. A cached translation is the translation of its own source, so reusing it for edited text would ship the old wording.

### Protected Terms (`.polyglot-terms.json`)
TranslateGemma respells bare identifiers in another script: a Hindi README wrote `XLS-30` as `एक्सएलएस-30` and `Kimi-K3` as `किमी-के3`. It also garbles counts: Chinese turned "218 of 224" into "224 of 218". So identifiers in prose are masked like inline code spans: each is swapped for a letter-free placeholder before translation and restored after. The defaults:

| Pattern | Masks | Leaves alone |
|---------|-------|--------------|
| `url` | `https://…` up to whitespace, a quote, a bracket or a backtick (allowing one level of balanced parentheses such as `https://en.wikipedia.org/wiki/Foo_(bar)`) | |
| `anchor` | In-page `#slug` targets in Markdown links (`[text](#slug)`, `[text](#slug "title")`), reference definitions (`[label]: #slug`), and HTML `href="#slug"` attributes, so the model translates the link text without mangling the fragment | `#123` in prose, `#heading` lines, external `https://…#frag` URLs (covered by `url`) |
| `link-target` | Non-HTTP(S), non-anchor targets in Markdown inline links, images, and reference definitions: relative paths (`../facet`, `docs/Kimi-K3.md`), bare filenames (`LICENSE`), `mailto:`, `<path with spaces>`, and paths with one level of balanced parentheses (`docs/Foo_(bar).md`) | Link titles (`"MIT License"`), HTML attributes (`href="…"`, `src="…"`) |
| `caps-id` | ALL-CAPS tokens with a digit, or capitals joined by `-` or `_`: `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase and mixedCase words: `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, ordinary capitalised words |
| `model-id` | Model and product IDs with a letter-and-digit part: `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |

After all segments are translated and reassembled, each source ATX heading is paired with its translated ATX heading and slugged in document order with `github-slugger` (matching GitHub's own heading IDs, including `-1`, `-2` suffixes for duplicate headings), and every non-code in-page anchor (`[text](#slug)`, `[label]: #slug`, and HTML `href="#slug"`) is rewritten to the translated heading's slug.

"N of M" in prose and table cells (`218 of 224`) is masked as one span and restored as `218/224` in every language, which reads correctly everywhere and cannot be reversed or turned into an ordinal. A table cell that is only a count is not sent to the model at all.

A repository adds its own terms in `.polyglot-terms.json` beside the README. Every field is optional:

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` are exact, case-sensitive strings matched as whole words; `patterns` are JavaScript regular expressions. Both add to the defaults. `disable` switches defaults off by name (for example, `"disable": ["anchor"]` switches off in-page anchor masking, post-assembly slug rewriting, and the anchor survival check; `"disable": ["link-target"]` switches off non-HTTP link-target masking and skips relative/non-HTTP targets in the link survival check so links to localized files like `./docs/guide.fr.md` pass), and `"nOfM": false` switches the count rule off. A file that cannot be parsed stops the run with `CONFIG_ERROR` instead of translating without the terms it asked for.

### Survival Check (`--on-lost-span`)
After translating, every target file is checked against the English: each protected span (inline code span, protected term, and each count as `N/M`) must be present in the translation of its segment, character for character, and every in-page `#slug` anchor that resolved in the English source must resolve in the translation to a translated ATX heading slug or an explicit HTML `id=`/`name=` anchor (an anchor that was already unresolved in the English source is reported as a warning and never fails the run; if source and translation anchor counts differ and a source-valid anchor was involved, the mismatch is also reported as a `LostSpan` of kind `"anchor"` unless already flagged by the segment link check). Each segment's Markdown links (`[text](target)`, `[text](target "title")`, images `![alt](src)`, reference links `[text][label]`, collapsed `[text][]`, and shortcut `[label]` resolved against their file's `[label]: target` definitions) must preserve the exact multiset of non-anchor link targets and the exact count of in-page `#slug` links (reported as kind `"link"` when a link is broken, unclosed, or dropped). Any unreplaced `⟦` or `⟧` placeholder delimiter left outside code in a translated segment beyond what the source carried is reported as kind `"placeholder"`. Each table cell must carry the same numbers as its source cell, compared as a multiset, not in order: correct Chinese for "218 of 224" puts the total first (`224 首中的 218 首`), so an order check would flag the right answer. Digits from other scripts are normalised before comparing. The file must also keep its fenced code blocks and inline code spans.

`--on-lost-span=fail|report` picks what happens when something is lost:

- **`fail`**: the run exits non-zero with a list of language, segment and missing span. This is the default for `scripts/translate-all.mjs`, which runs before releases. The files are still written, so they can be fixed by hand and pinned. The summary JSON carries the list and a `LOST_SPAN` error in the usual `PolyglotError` shape (`code`, `message`, `hint`, `retryable`).
- **`report`**: the list is written and the run exits 0. This is the default for the MCP tools (`onLostSpan` parameter) and the `translateMarkdown` library API (`onLostSpan` option, result field `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Untranslated Prose Check (`--on-untranslated`)
A model can hand a paragraph back in English while the batch still splits correctly, so every other check passes. After translating, each prose sentence of the English (6 or more words, counting a link by its label and leaving out code spans, URLs and protected spans, and not a run of proper names) is looked for as a whole sentence of the translation of its segment. Matching ignores case and a closing stop or colon, joins hard-wrapped lines first, and works sentence by sentence, so a reflowed paragraph or a line where only one sentence was translated is still caught. A run of names (at most one function word and one other lowercase word, such as a Title-Case heading or `Format: JSON, YAML via stdio`) is exempt by that rule, not by a list, and a pinned segment is never flagged.

A model answer is **unusable** when it is empty, when a code-span placeholder did not come back (the segment would otherwise fall back to the English source so the identifier stays right), or when a prose sentence is still the English. Before a language is failed, an unusable answer is retried once on its own; a segment that already took the one-call-per-item fallback after a separator-count mismatch counts that call as its retry. A multi-line segment (a long, code-dense list item is where a model drops a placeholder) that is still unusable is then translated one line at a time, each line with its own placeholders. What is still English is reported as untranslated with its reason. The same test gates the cache: an unusable answer is never written to it, and an unusable cached entry is ignored, deleted and translated again.

`--on-untranslated=fail|report` picks what happens with what is left:

- **`fail`** (default for `translate-all.mjs` and `translate-readme.mjs`): the files are written, the language is marked `untranslated` instead of `ok` (and counted outside `succeeded`), the lines are listed, and the run exits non-zero (`translate-readme.mjs` exits 3). The summary JSON carries `untranslated`, `untranslatedLanguages`, `fallbacks` and an `UNTRANSLATED` error.
- **`report`**: the list is written and the run exits 0. This is the default for the library API (`onUntranslated` option; result fields `untranslated`, `fallbacks`, `retries`) and for the MCP tools `translate_markdown`, `translate_all` and `translate_readme` (`onUntranslated` parameter), which append the list to their output.

A segment that stays English is never cached, so `scripts/pin-translation.mjs` pins a prose paragraph you translated by hand even without `--include-uncached`.

```bash
node scripts/translate-all.mjs README.md                          # --on-untranslated=fail
node scripts/translate-all.mjs README.md --on-untranslated=report
```

### Pinned Translations (`.polyglot-pins.json`)
A pinned translation always wins. `.polyglot-pins.json` sits beside the cache; each entry is keyed by a hash of the English segment plus the target language, and holds the hand-fixed translation. A pin beats the cache and the model and survives every rerun, `--cache-clear` included. When the English changes, the hash changes, so a pin cannot outlive the text it was written for.

To pin hand fixes, correct the translated file, then run:

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

It pairs each segment of the English with its text in the corrected file and pins every segment whose text differs from the cached translation. `--dry-run` lists the pins without writing them. `--model=NAME` sets the model whose cache entries it compares with (default: `$POLYGLOT_MODEL` or `translategemma:27b`, the same as the scripts). `--include-uncached` also pins segments the cache has no translation for. Commit `.polyglot-pins.json` and `.polyglot-terms.json` with the README.

### Ollama Cloud (optional)
Set `OLLAMA_HOST` to send requests to another Ollama server instead of `localhost:11434`. For [Ollama Cloud](https://ollama.com), also set `OLLAMA_API_KEY`: the key is sent as a Bearer token, and only to a non-loopback host.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Concurrency Semaphore
All Ollama calls are guarded by a counting semaphore (default limit: 1) to prevent GPU OOM on systems with limited VRAM. Override with `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### MCP Progress Tokens
All tools report progress via MCP `notifications/progress` when the client provides a `progressToken`. Translate reports per-chunk, translate_markdown per-segment-batch, translate_all per-language, and check_status per-step.

### Software Glossary
A built-in glossary of 12 technical terms (API, CLI, SDK, etc.) ensures consistent translation of software terminology. Custom glossary entries can be passed per-request and are merged with the defaults.

### Batch Translation
`translateBatch` groups multiple segments into a single prompt where possible, reducing round-trips. Falls back to individual translation if the batch separator is mangled.

### Configurable Default Model
The default model is `translategemma:27b`. Set the `POLYGLOT_MODEL` environment variable to use another one, for example on a GPU with less VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Structured Errors
All errors use `PolyglotError` with a machine-readable code (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), a human-readable message, an optional hint, and a `retryable` flag.

### Output Validation
Every translation is automatically validated: empty output throws (retryable), source-text echo is flagged, severe truncation and hallucination blowup are warned, garbled encoding and model meta-commentary are detected. Warnings appear in the MCP tool response.

### Streaming
`OllamaClient.generateStream()` yields tokens via NDJSON as Ollama produces them. The `translate()` function accepts an `onToken` callback for real-time progress display. Both streaming and non-streaming paths share retry logic.

## Supported Languages

Afrikaans, Albanian, Arabic, Bengali, Bulgarian, Catalan, Chinese (Simplified), Chinese (Traditional), Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Gujarati, Hebrew, Hindi, Hungarian, Indonesian, Irish, Italian, Japanese, Kannada, Korean, Latvian, Lithuanian, Macedonian, Malay, Malayalam, Maltese, Marathi, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Scottish Gaelic, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh.

## Performance

| Metric | 27B (default), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| First translation (cold model load) | ~30 s | ~15 s |
| Subsequent translations | ~1–2 s per batch of README segments | ~600 ms |
| Model memory | 17 GB, fully on GPU (as reported by `ollama ps`) | ~8.1 GB |

## Architecture

```
MCP Client (Claude Code, etc.)
      │
      │  MCP protocol (stdio)
      ▼
┌──────────────────┐
│    index.ts      │  MCP server — 6 tools: translate, translate_markdown,
│                  │  translate_all, translate_readme, list_languages,
│                  │  check_status
├──────────────────┤
│  translate.ts    │  Prompt building, chunking, batch mode, streaming
├──────────────────┤
│translateMarkdown │  Markdown-aware segmentation, table parsing, reassembly
├──────────────────┤
│  codeSpans.ts    │  Inline code-span masking and fail-closed restore
├──────────────────┤
│protectedTerms.ts │  Protected terms in prose, "N of M", .polyglot-terms.json
├──────────────────┤
│   survival.ts    │  Survival check: lost spans, cell numbers, --on-lost-span
├──────────────────┤
│     pins.ts      │  Pinned hand fixes, .polyglot-pins.json
├──────────────────┤
│pinCorrections.ts │  Corrected file → pins (scripts/pin-translation.mjs)
├──────────────────┤
│ translateAll.ts  │  Multi-language orchestrator with nav bar injection
├──────────────────┤
│translateReadme.ts│  README file translation — writes README.<lang>.md
├──────────────────┤
│  semaphore.ts    │  Counting semaphore for GPU-safe concurrency
├──────────────────┤
│   validate.ts    │  Output validation (empty, echo, truncation, garble)
├──────────────────┤
│   ollama.ts      │  HTTP client — auto-start, auto-pull, retry, streaming
├──────────────────┤
│   cache.ts       │  Segment cache, translation memory, locked merge on save
├──────────────────┤
│  glossary.ts     │  Software term dictionary
├──────────────────┤
│   polish.ts      │  Post-translation artifact cleanup
├──────────────────┤
│  languages.ts    │  57 language definitions
├──────────────────┤
│   errors.ts      │  PolyglotError structured error class
└──────────────────┘
      │
      │  HTTP (localhost:11434, or OLLAMA_HOST)
      ▼
   Ollama + TranslateGemma (GPU)
```

## Security & Data Scope

| Aspect | Detail |
|--------|--------|
| **Data touched** | Text sent to the Ollama API — local (`localhost:11434`) by default, or the host in `OLLAMA_HOST` if you set one. `.polyglot-cache.json` segment cache next to a translated file (library and CLI use only). `.polyglot-terms.json` and `.polyglot-pins.json` next to a translated README are read if present |
| **Files written** | `translate_readme` writes `README.<lang>.md` next to the README you pass it and refreshes that README's language nav bar. `scripts/pin-translation.mjs` writes `.polyglot-pins.json` next to the README |
| **Data NOT touched** | No browser data, no OS credentials, nothing outside the directories above |
| **Network** | HTTP to `localhost:11434` only by default — zero external egress. Remote only when `OLLAMA_HOST` points elsewhere |
| **Secrets** | `OLLAMA_API_KEY`, if set, is read from the environment and sent only as a Bearer token to a non-loopback `OLLAMA_HOST`; never written to disk or logged |
| **Telemetry** | None collected or sent |

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## Development

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 512 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## License

MIT — see [LICENSE](LICENSE).

> Built by [MCP Tool Shop](https://mcp-tool-shop.github.io/)
