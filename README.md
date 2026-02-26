<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Local GPU translation MCP server — 55 languages, zero cloud dependency.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## What it does

Translates text between 55 languages using [TranslateGemma](https://ollama.com/library/translategemma) running locally on your GPU via [Ollama](https://ollama.com). No API keys, no cloud, no rate limits — everything runs on your machine.

## Prerequisites

1. **[Ollama](https://ollama.com)** installed and running (`ollama serve`)
2. **TranslateGemma** model pulled:
   ```bash
   ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
   # or
   ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
   ```
3. **Node.js 18+**

## Setup

### Claude Code / Claude Desktop

Add to your MCP config (`claude_desktop_config.json` or `.mcp.json`):

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

### From source

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## Tools

### `translate`

Translate text between any supported language pair.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `text` | yes | Text to translate |
| `from` | yes | Source language code or name (e.g., `en`, `English`) |
| `to` | yes | Target language code or name (e.g., `ja`, `Japanese`) |
| `model` | no | Ollama model (default: `translategemma:12b`) |

### `list_languages`

List all 55 supported languages with their codes.

### `check_status`

Check if Ollama is running and which TranslateGemma models are installed.

## Supported Languages

Afrikaans, Albanian, Arabic, Bengali, Bulgarian, Catalan, Chinese (Simplified), Chinese (Traditional), Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Gujarati, Hebrew, Hindi, Hungarian, Indonesian, Irish, Italian, Japanese, Kannada, Korean, Latvian, Lithuanian, Macedonian, Malay, Malayalam, Maltese, Marathi, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Scottish Gaelic, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh.

## Performance

On an RTX 5080 (16 GB VRAM) with TranslateGemma 12B (Q4):

| Metric | Value |
|--------|-------|
| First translation (cold load) | ~15s |
| Subsequent translations | ~600ms |
| VRAM usage | ~8.1 GB |
| Long text (chunked) | ~600ms per chunk |

## How it works

1. Your MCP client (Claude Code, etc.) calls the `translate` tool
2. Polyglot builds a TranslateGemma prompt with the source/target language pair
3. The prompt is sent to Ollama's local HTTP API
4. Ollama runs TranslateGemma on your GPU and returns the translation
5. For long text, content is split into chunks at paragraph/sentence boundaries

## License

MIT License — see [LICENSE](LICENSE) for details.

> Built by [MCP Tool Shop](https://mcp-tool-shop.github.io/)
