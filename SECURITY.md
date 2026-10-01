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

This MCP server works **locally by default**, with the Ollama inference engine on your machine. It talks to a remote Ollama only when you set `OLLAMA_HOST` to one.

- **Data touched:** text sent to the Ollama HTTP API for translation, local (`localhost:11434`) unless `OLLAMA_HOST` names another host. `.polyglot-cache.json` (segment-level translation cache with SHA-256 keys, 30-day TTL), written next to a translated file when the library or CLI runs with the cache on; the MCP tools do not use it
- **Files written:** the `translate_readme` tool writes `README.<lang>.md` next to the README path it is given and refreshes that README's language nav bar
- **Data NOT touched:** no browser data, no OS credentials, no other MCP servers' data, nothing outside the directories above
- **Network:** HTTP to `localhost:11434` only by default — no external/internet egress. Requests go to a remote host only when `OLLAMA_HOST` points to one (for example Ollama Cloud, `https://ollama.com`)
- **Permissions required:** stdio transport (MCP); local filesystem for the cache file and for the files `translate_readme` writes
- **Secrets:** one, optional. `OLLAMA_API_KEY` is read from the environment when set and sent only as a Bearer `Authorization` header, and only to a non-loopback `OLLAMA_HOST`. It is never written to disk or logged
- **No telemetry** is collected or sent
