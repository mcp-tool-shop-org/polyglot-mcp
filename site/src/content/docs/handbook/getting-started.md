---
title: Getting Started
description: Install and configure Polyglot MCP.
sidebar:
  order: 1
---

## Prerequisites

- [Node.js](https://nodejs.org) 20 or newer
- [Ollama](https://ollama.com) installed and running
- A GPU with sufficient VRAM for your chosen model (about 17 GB for the default 27B model, minimum 3.3 GB for the 4B model)

## 1. Install Ollama

Download from [ollama.com](https://ollama.com) and start it:

```bash
ollama serve
```

On Windows, Ollama typically installs to `%LOCALAPPDATA%\Programs\Ollama`. Polyglot checks this location automatically when attempting to auto-start Ollama.

## 2. Pull a model

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

You can skip this step -- Polyglot auto-pulls the default model (27B, about 17 GB) on first use. Pull progress is streamed to stderr so you can monitor the download. On a smaller GPU, set `POLYGLOT_MODEL` first (see below).

## 3. Add to your MCP client

**Claude Code / Claude Desktop** -- add to `claude_desktop_config.json` or `.mcp.json`:

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

## Configuring the default model

The default model is `translategemma:27b`. Set `POLYGLOT_MODEL` to use another one, for example on a GPU with less VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

## Configuring concurrency

By default, Polyglot sends one Ollama request at a time to avoid GPU OOM. If you have plenty of VRAM, increase the limit:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

## Using a remote Ollama (optional)

By default Polyglot talks to Ollama on `localhost:11434`. Set `OLLAMA_HOST` to use another Ollama server. For [Ollama Cloud](https://ollama.com), also set `OLLAMA_API_KEY`: the key is sent as a Bearer token, and only to a non-loopback host.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

## Verifying the setup

Ask Claude to run `check_status` or use the tool directly. It reports whether Ollama is running and which TranslateGemma models are installed, with their sizes.
