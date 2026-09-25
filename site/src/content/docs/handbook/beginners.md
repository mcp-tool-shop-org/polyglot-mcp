---
title: For Beginners
description: New to Polyglot MCP? Start here for a gentle introduction.
sidebar:
  order: 99
---

## What is this tool?

Polyglot MCP is a translation server that runs on your own computer. It connects to AI coding assistants like Claude Code or Claude Desktop and lets them translate text between 57 languages automatically. When you ask Claude to translate something, Polyglot handles it behind the scenes using a Google translation model called TranslateGemma running on your GPU through a program called Ollama.

The key difference from cloud translation services (Google Translate, DeepL, etc.) is that, by default, nothing leaves your machine. Your text stays local, there are no API keys to manage, no usage limits, and no subscription fees.

## Who is this for?

- **Developers** who need to translate README files, documentation, or UI strings as part of their workflow
- **Teams** who want translation integrated into their AI coding assistant without sending text to third-party services
- **Anyone** using Claude Code or Claude Desktop who wants local, private translation

You do not need to be a machine learning expert. If you can install a program and run a terminal command, you can use Polyglot MCP.

## Prerequisites

Before you start, you need:

1. **Node.js 20 or newer** -- Download from [nodejs.org](https://nodejs.org). Run `node --version` to check.
2. **Ollama** -- Download from [ollama.com](https://ollama.com). This is the program that runs the translation model on your GPU.
3. **A GPU with at least 4 GB of VRAM** -- The smallest model (4B) needs about 3.3 GB and the 12B model about 8.1 GB. The default model (27B) needs about 17 GB; on a GPU with less memory, pick a smaller model (see "Not enough VRAM" below). An NVIDIA GPU is recommended, but Ollama also supports AMD and Apple Silicon.
4. **An MCP client** -- Claude Code or Claude Desktop. This is the AI assistant that talks to Polyglot MCP.
5. **Basic terminal skills** -- You need to be able to open a terminal and run commands.

## Your first 5 minutes

**Step 1: Start Ollama.** Open a terminal and run:

```bash
ollama serve
```

If Ollama is already running (e.g., as a system service), you can skip this.

**Step 2: Add Polyglot to your MCP client.** For Claude Code, add this to your `.mcp.json` file:

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

**Step 3: Ask Claude to translate something.** In Claude Code or Claude Desktop, type a message like:

> Translate "Hello, how are you?" to Japanese

Claude will automatically use the `translate` tool. The first time, it downloads the default TranslateGemma 27B model (about 17 GB), which takes a while. After that, a translation takes a second or two.

**Step 4: Try markdown translation.** Give Claude a markdown document and ask it to translate the whole thing:

> Translate this README to Spanish

Polyglot preserves all code blocks, links, badges, and table formatting -- only the prose gets translated.

**Step 5: Check your setup.** If something is not working, ask Claude:

> Check the polyglot translation status

This runs the `check_status` tool, which tells you whether Ollama is running and which models are installed.

## Common mistakes

**Ollama is not running.** Polyglot tries to auto-start Ollama, but this can fail if Ollama is not installed or not on your PATH. Fix: run `ollama serve` in a separate terminal before using Polyglot.

**Not enough VRAM.** The default 27B model needs about 17 GB. If it causes out-of-memory errors, or your GPU has less memory than that, switch to the 12B model (about 8.1 GB) or the 4B model (about 3.3 GB). Set the environment variable before starting Polyglot:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

**Slow first translation.** The first translation after starting Ollama takes about 30 seconds with the default 27B model (about 15 with 12B) because the model needs to load into GPU memory. After that, translations take a second or two. This is normal behavior, not a bug.

**Wrong language code.** Polyglot accepts both language codes (`en`, `ja`, `zh`) and full names (`English`, `Japanese`, `Chinese (Simplified)`). If you get an "unsupported language" error, ask Claude to `list_languages` to see all 57 supported options.

**Cache file appears in your project.** When you translate files with the repo's `scripts/translate-*.mjs` or the library API with caching on, Polyglot keeps a `.polyglot-cache.json` file next to the translated file to speed up re-translations. The MCP tools do not create it. Add `.polyglot-cache.json*` to your `.gitignore` so neither the cache nor a leftover lock or temporary file from an interrupted run gets committed.

## Next steps

- **[Getting Started](/polyglot-mcp/handbook/getting-started/)** -- Detailed install instructions and model selection
- **[Tools](/polyglot-mcp/handbook/tools/)** -- Full parameter reference for all 6 MCP tools
- **[Features](/polyglot-mcp/handbook/features/)** -- Learn about caching, fuzzy matching, glossaries, and validation
- **[Reference](/polyglot-mcp/handbook/reference/)** -- Environment variables, architecture, supported languages

## Glossary

| Term | Definition |
|------|-----------|
| **MCP** | Model Context Protocol -- a standard for connecting AI assistants to external tools |
| **Ollama** | A program that runs large language models locally on your computer |
| **TranslateGemma** | A Google translation model designed for high-quality multilingual translation |
| **GPU** | Graphics Processing Unit -- the hardware that runs the translation model |
| **VRAM** | Video RAM -- memory on your GPU; determines which model sizes you can run |
| **Semaphore** | A concurrency limiter that prevents too many simultaneous GPU requests |
| **Segment cache** | A local file that stores previous translations to avoid re-translating unchanged text |
| **Translation memory** | Reuses a cached translation when the source changed only in whitespace; any other edit is translated again |
| **NDJSON** | Newline-Delimited JSON -- the streaming format Ollama uses to send tokens as they are generated |
| **stdio** | Standard input/output -- the communication channel between Polyglot MCP and the AI assistant |
