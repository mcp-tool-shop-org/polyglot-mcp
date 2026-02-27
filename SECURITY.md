# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

This MCP server operates **locally only** with the Ollama inference engine.

- **Data touched:** text sent to local Ollama HTTP API (`localhost:11434`) for translation, `.polyglot-cache.json` (segment-level translation cache with SHA-256 keys, 30-day TTL)
- **Data NOT touched:** no files outside the working directory, no browser data, no OS credentials, no other MCP servers' data
- **Network:** HTTP to `localhost:11434` only (Ollama API) — no external/internet egress
- **Permissions required:** stdio transport (MCP), local filesystem for cache file only
- **No secrets handling** — does not read, store, or transmit credentials or API keys
- **No telemetry** is collected or sent
