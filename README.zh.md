<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Local GPU translation MCP server — 55 languages, zero cloud dependency.</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## 它所做的事情

使用 [TranslateGemma](https://ollama.com/library/translategemma) 在您的 GPU 上本地运行，通过 [Ollama](https://ollama.com) 将文本翻译成 55 种语言。无需 API 密钥，无需云服务，无需速率限制——所有内容都保存在您的机器上。

## 快速开始

### 1. 安装 Ollama

从 [ollama.com](https://ollama.com) 下载并启动它：

```bash
ollama serve
```

### 2. 下载模型

```bash
ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
# or
ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
# or
ollama pull translategemma:27b   # 17 GB  — highest quality
```

> **提示：** 您可以跳过此步骤——Polyglot 会在首次使用时自动下载模型。

### 3. 添加到您的 MCP 客户端

**Claude Code / Claude Desktop** — 将其添加到 `claude_desktop_config.json` 或 `.mcp.json`：

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

**从源代码：**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

就这样。让 Claude 翻译一些内容，它将自动使用 `translate` 工具。

## 工具

Polyglot 暴露了三个 MCP 工具：

### `translate`

在任何支持的语言对之间进行文本翻译。

| 参数 | 必需 | 描述 |
|-------------|----------|-------------|
| `text`      | 是 | 要翻译的文本 |
| `from`      | 是 | 源语言代码或名称（例如：`en`，`English`） |
| `to`        | 是 | 目标语言代码或名称（例如：`ja`，`Japanese`） |
| `model`     | no       | Ollama 模型（默认：`translategemma:12b`） |
| `glossary`  | no       | 自定义术语覆盖，格式为 `{"source": "translation"}`，与内置的软件词汇表合并。 |

长文本会自动分割成块，在段落和句子边界处分割，然后按顺序翻译，并重新组合。

### `list_languages`

列出所有 55 种支持的语言及其代码。

### `check_status`

检查 Ollama 是否正在运行，以及安装了哪些 TranslateGemma 模型。如果 Ollama 未运行，则会尝试自动启动。

## 特性

### 自动启动和自动下载
如果 Ollama 未运行，则会自动启动。如果 TranslateGemma 模型未安装，则会自动下载。无需手动配置。

### 指数级退避重试
瞬态的 Ollama 故障（网络问题、临时过载）会自动重试最多 2 次，采用指数级退避（1 秒，2 秒）。无法重试的错误（例如：无效的模型名称、无效的输入）会立即失败。

### 智能分块
长文本会在自然边界处分割——段落，然后是句子——以保留翻译上下文。块的大小会根据模型进行调整：对于 2B/4B 模型，块大小为 2KB；对于 12B 模型，块大小为 4KB；对于 27B 模型，块大小为 6KB。

### 段缓存
已翻译的段落会根据内容哈希（源文本 + 目标语言 + 模型）进行缓存。未更改的段落将完全跳过重新翻译。缓存文件位于 `.polyglot-cache.json` 中，TTL 为 30 天。

### 软件词汇表
内置的 12 个技术术语词汇表（API、CLI、SDK 等）可确保软件术语的翻译一致性。可以按请求传递自定义词汇表条目，并与默认设置合并。

### 批量翻译
`translateBatch` 会将多个段落组合成单个提示，尽可能减少往返次数。如果批处理分隔符出现问题，则会回退到单个翻译。

### 可配置的默认模型
设置 `POLYGLOT_MODEL` 环境变量以覆盖默认模型：

```bash
POLYGLOT_MODEL=translategemma:27b npx @mcptoolshop/polyglot-mcp
```

### 结构化错误
所有错误都使用 `PolyglotError`，其中包含可供机器读取的代码（例如：`MODEL_NOT_FOUND`、`OLLAMA_UNAVAILABLE`、`TRANSLATION_FAILED` 等）、人类可读的消息、可选的提示以及一个 `retryable` 标志。

## 支持的语言

阿法卡语，阿尔巴尼亚语，阿拉伯语，孟加拉语，保加利亚语，加泰罗尼亚语，简体中文，繁体中文，克罗地亚语，捷克语，丹麦语，荷兰语，英语，爱沙尼亚语，芬兰语，法语，加利西亚语，德语，希腊语，古吉拉特语，希伯来语，印地语，匈牙利语，印尼语，爱尔兰语，意大利语，日语，卡纳达语，韩语，拉脱维亚语，立陶宛语，马其顿语，马来语，马拉雅拉姆语，马耳他语，马拉地语，挪威语，波斯语，波兰语，葡萄牙语，罗马尼亚语，俄语，苏格兰盖尔语，塞尔维亚语，斯洛伐克语，斯洛文尼亚语，西班牙语，斯瓦希里语，瑞典语，泰米尔语，泰卢固语，泰语，土耳其语，乌克兰语，乌尔都语，越南语，威尔士语。

## 性能

在搭载 RTX 5080 (16 GB 显存) 的设备上，使用 TranslateGemma 12B (Q4)：

| 指标 | 数值 |
|--------|-------|
| 首次翻译（模型加载） | 约 15 秒 |
| 后续翻译 | 约 600 毫秒 |
| 显存占用 | 约 8.1 GB |
| 长文本（每个片段） | 约 600 毫秒 |

## 架构

```
MCP Client (Claude Code, etc.)
      │
      │  MCP protocol (stdio)
      ▼
┌─────────────┐
│  index.ts   │  MCP server — registers tools, routes calls
├─────────────┤
│ translate.ts│  Prompt building, chunking, batch mode
├─────────────┤
│  ollama.ts  │  HTTP client — auto-start, auto-pull, retry
├─────────────┤
│  cache.ts   │  Segment cache (SHA-256 keys, 30-day TTL)
├─────────────┤
│ glossary.ts │  Software term dictionary
├─────────────┤
│  polish.ts  │  Post-translation artifact cleanup
├─────────────┤
│ languages.ts│  55 language definitions
├─────────────┤
│  errors.ts  │  PolyglotError structured error class
└─────────────┘
      │
      │  HTTP (localhost:11434)
      ▼
   Ollama + TranslateGemma (GPU)
```

## 安全性和数据范围

| 方面 | 详细信息 |
|--------|--------|
| **Data touched** | 发送到本地 Ollama API (`localhost:11434`) 的文本，以及 `.polyglot-cache.json` 片段缓存。 |
| **Data NOT touched** | 没有在工作目录之外的文件，没有浏览器数据，没有操作系统凭据。 |
| **Network** | 仅通过 HTTP 连接到 `localhost:11434`，没有外部/互联网数据传输。 |
| **Telemetry** | 未收集或发送任何数据。 |

请参阅 [SECURITY.md](SECURITY.md) 了解漏洞报告政策。

## 开发

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 114 unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## 许可证

MIT 协议 — 参见 [LICENSE](LICENSE)。

> 由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建。
