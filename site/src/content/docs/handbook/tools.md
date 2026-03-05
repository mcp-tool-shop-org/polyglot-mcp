---
title: Tools
description: All 4 MCP tools exposed by Polyglot MCP.
sidebar:
  order: 2
---

## translate

Translate text between any supported language pair.

| Parameter  | Required | Description |
|------------|----------|-------------|
| `text`     | yes      | Text to translate |
| `from`     | yes      | Source language code or name (e.g., `en`, `English`) |
| `to`       | yes      | Target language code or name (e.g., `ja`, `Japanese`) |
| `model`    | no       | Ollama model (default: `translategemma:12b`) |
| `glossary` | no       | Custom term overrides as `{"source": "translation"}` — merged with the built-in software glossary |

Long text is automatically split into chunks at paragraph and sentence boundaries, translated in sequence, and reassembled. All translations are validated for quality.

## translate_markdown

Translate an entire markdown document while preserving structure. Code blocks, HTML elements, badges, URLs, and table formatting are kept intact — only prose content is translated.

| Parameter  | Required | Description |
|------------|----------|-------------|
| `markdown` | yes      | The full markdown content to translate |
| `from`     | yes      | Source language code or name |
| `to`       | yes      | Target language code or name |
| `model`    | no       | Ollama model (default: `translategemma:12b`) |

## list_languages

List all 57 supported languages with their codes. Takes no arguments.

## check_status

Check if Ollama is running and which TranslateGemma models are installed. Attempts auto-start if Ollama isn't running. Takes no arguments.
