---
title: Getting Started
description: Install and configure Polyglot MCP.
sidebar:
  order: 1
---

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Ollama](https://ollama.com) installed and running

## 1. Install Ollama

Download from [ollama.com](https://ollama.com) and start it:

```bash
ollama serve
```

## 2. Pull a model

```bash
ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
# or
ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
# or
ollama pull translategemma:27b   # 17 GB  — highest quality
```

You can skip this step — Polyglot auto-pulls the model on first use.

## 3. Add to your MCP client

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

## Configuring the default model

Set `POLYGLOT_MODEL` to override the default:

```bash
POLYGLOT_MODEL=translategemma:27b npx @mcptoolshop/polyglot-mcp
```
