---
title: Tools
description: All 5 MCP tools exposed by Polyglot MCP.
sidebar:
  order: 2
---

Polyglot MCP exposes five tools to any MCP-compatible client (Claude Code, Claude Desktop, etc.).

## translate

Translate text between any supported language pair.

| Parameter  | Required | Description |
|------------|----------|-------------|
| `text`     | yes      | Text to translate |
| `from`     | yes      | Source language code or name (e.g., `en`, `English`) |
| `to`       | yes      | Target language code or name (e.g., `ja`, `Japanese`) |
| `model`    | no       | Ollama model (default: `translategemma:12b`) |
| `glossary` | no       | Custom term overrides as `{"source": "translation"}` -- merged with the built-in software glossary |

Long text is automatically split into chunks at paragraph and sentence boundaries, translated in sequence, and reassembled. All translations are validated for quality (empty output, echo detection, truncation, garbled text).

The response includes the translated text, language pair info, model used, chunk count, duration, and any validation warnings.

## translate_markdown

Translate an entire markdown document while preserving structure. Code blocks, HTML elements, badges, URLs, and table formatting are kept intact -- only prose content (headings, paragraphs, taglines, table cells) is translated.

| Parameter  | Required | Description |
|------------|----------|-------------|
| `markdown` | yes      | The full markdown content to translate |
| `from`     | yes      | Source language code or name |
| `to`       | yes      | Target language code or name |
| `model`    | no       | Ollama model (default: `translategemma:12b`) |

The markdown segmenter identifies six segment types: protected (code blocks, HTML, rules), HTML taglines, headings, plain text, block quotes, and tables. Only translatable segments are sent through the pipeline. Table cells are individually classified -- backtick terms, version numbers, links, and short bold labels are left untranslated.

The response includes the translated markdown, segment counts (total, cached, translated, fuzzy-matched, deduplicated), Ollama call count, duration, and any validation warnings.

## translate_all

Translate markdown content into multiple languages at once. By default it targets 7 languages: Japanese, Chinese, Spanish, French, Hindi, Italian, and Portuguese. Runs translations concurrently with a GPU-safe semaphore.

| Parameter     | Required | Description |
|---------------|----------|-------------|
| `markdown`    | yes      | The full markdown content to translate |
| `from`        | no       | Source language code (default: `en`) |
| `languages`   | no       | Array of target language codes (default: all 7) |
| `model`       | no       | Ollama model (default: `translategemma:12b`) |
| `concurrency` | no       | Max concurrent translations (default: 2, max: 3) |
| `navBar`      | no       | Inject language nav bar at the top of each output (default: true) |

Each language result is returned as a separate text block with its filename suffix (e.g., `README.ja.md`). The nav bar links each translation to the others and back to the English README.

## list_languages

List all 57 supported languages with their codes. Takes no arguments. Returns a formatted list of language code/name pairs.

## check_status

Check if Ollama is running and which TranslateGemma models are installed. Takes no arguments. Attempts to auto-start Ollama if it is not running. Reports which TranslateGemma model sizes are installed and their disk usage.
