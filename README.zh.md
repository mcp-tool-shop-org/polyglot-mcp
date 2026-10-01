<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>本地 GPU 翻译 MCP 服务器 — 57 种语言，无需云服务。</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="node 20+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## 功能

使用在您的 GPU 上本地运行的 [TranslateGemma](https://ollama.com/library/translategemma) 通过 [Ollama](https://ollama.com) 在 57 种语言之间翻译文本。无需 API 密钥、云服务或速率限制——默认情况下，所有内容都保留在您的机器上。您可以选择使用远程 Ollama，例如 [Ollama Cloud](#ollama-cloud-optional)。

## 快速入门

### 1. 安装 Ollama

从 [ollama.com](https://ollama.com) 下载并启动：

```bash
ollama serve
```

### 2. 拉取模型

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **提示：** 您可以跳过此步骤——Polyglot 在首次使用时会自动拉取默认模型（27B，17 GB）。如果您的 GPU 较小，请首先设置 `POLYGLOT_MODEL=translategemma:12b`（请参阅[可配置的默认模型](#configurable-default-model)）。

### 3. 添加到您的 MCP 客户端

**Claude Code / Claude Desktop** — 添加到 `claude_desktop_config.json` 或 `.mcp.json`：

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

这样就完成了。让 Claude 翻译一些内容，它会自动使用 `translate` 工具。

## 工具

Polyglot 提供了六个 MCP 工具：

### `translate`

在任何受支持的语言对之间翻译文本。

| 参数 | 必需 | 描述 |
|-------------|----------|-------------|
| `text`      | 是 | 要翻译的文本 |
| `from`      | 是 | 源语言代码或名称（例如，`en`、`English`） |
| `to`        | 是 | 目标语言代码或名称（例如，`ja`、`Japanese`） |
| `model`     | no       | Ollama 模型（默认值：`translategemma:27b`） |
| `glossary`  | no       | 自定义术语覆盖，如 `{"source": "translation"}` — 与内置的软件词汇表合并 |

长文本会自动在段落和句子边界处分割成块，按顺序翻译，然后重新组合。所有翻译都会经过质量验证（空输出、回显检测、截断、乱码文本）。

### `translate_markdown`

翻译整个 Markdown 文档，同时保留结构。代码块、HTML 元素、徽章、URL 和表格格式将保持不变——只有散文内容（标题、段落、标语、表格单元格）会被翻译。行内代码段在翻译之前会被替换为占位符，并在翻译之后恢复，因此命令、标志、包名称和标识符将完全按照原始书写方式返回。

| 参数 | 必需 | 描述 |
|-------------|----------|-------------|
| `markdown`  | 是 | 要翻译的完整 Markdown 内容 |
| `from`      | 是 | 源语言代码或名称 |
| `to`        | 是 | 目标语言代码或名称 |
| `model`     | no       | Ollama 模型（默认值：`translategemma:27b`） |

### `list_languages`

列出所有 57 种受支持的语言及其代码。

### `check_status`

检查 Ollama 是否正在运行以及安装了哪些 TranslateGemma 模型。如果 Ollama 未运行，则尝试自动启动。

### `translate_all`

一次将 Markdown 内容翻译成多种语言（默认值：7 — 日语、中文、西班牙语、法语、印地语、意大利语、葡萄牙语）。使用 GPU 安全的信号量限制并发运行翻译。

| 参数 | 必需 | 描述 |
|---------------|----------|-------------|
| `markdown`    | 是 | 要翻译的完整 Markdown 内容 |
| `from`        | no       | 源语言代码（默认值：`en`） |
| `languages`   | no       | 目标语言代码数组（默认值：所有 7 种） |
| `model`       | no       | Ollama 模型（默认值：`translategemma:27b`） |
| `concurrency` | no       | 最大并发翻译数（默认值：2，最大值：3） |
| `navBar`      | no       | 注入语言导航栏（默认值：true） |

### `translate_readme`

将 README.md **文件** 翻译成相同的 7 种语言，并将 `README.<lang>.md` 文件写入其旁边，同时刷新源 README 和每个翻译中的语言导航栏。返回每种语言的状态摘要（成功/失败、时间、写入的文件），而不是翻译后的文本；如果您需要返回内容，请使用 `translate_markdown`。

| 参数 | 必需 | 描述 |
|---------------|----------|-------------|
| `readmePath`  | 是 | 源 README.md 文件的绝对路径 |
| `tier`        | no       | `quality`（`translategemma:27b`，默认值）、`bulk`（`12b`）或 `draft`（`2b`）；如果设置了 `model`，则忽略 |
| `model`       | no       | 显式 Ollama 模型；覆盖 `tier` |
| `languages`   | no       | 目标语言代码的子集（默认值：所有 7 种） |
| `concurrency` | no       | 最大并发翻译数（默认值：2，最大值：3） |
| `navBar`      | no       | 注入或刷新语言导航栏（默认值：true） |

## 功能

### 自动启动和自动拉取
如果 Ollama 未运行，则会自动启动。如果未安装 TranslateGemma 模型，则会自动拉取。无需手动设置。

### 带有指数退避的重试
瞬态 Ollama 故障（网络中断、临时过载）会自动重试最多 2 次，并采用指数退避（1 秒、2 秒）。无法重试的错误（错误的模型名称、无效的输入）会立即失败。

### 智能分块
长文本在自然边界处分割——段落，然后是句子——因此保留了翻译上下文。块大小会适应模型：2B/4B 模型的 2K 字符，12B 的 4K，27B 的 6K。

### 分段缓存
翻译后的分段会按内容哈希（源文本 + 目标语言 + 模型的 SHA-256）进行缓存。未更改的分段将完全跳过重新翻译，因此在编辑后重新运行翻译只会触及已更改的部分。缓存位于 `.polyglot-cache.json` 中，与源文件相邻，TTL 为 30 天。它由 `translateMarkdown` 库 API 在给定 `filePath` 时使用（以及由存储库的 `scripts/translate-*.mjs` CLI 使用）；MCP 工具在不使用它的情况下进行翻译。

多个运行可以共享一个缓存文件。每次保存都会在锁定的情况下仅将其自己的更改合并到文件中，并以原子方式替换该文件，因此并行翻译的语言会保留彼此的条目，并且清除一种语言的缓存不会影响其他语言。

### 翻译记忆（模糊缓存）
如果未找到完全匹配的缓存，则仅当其源与新源的唯一区别在于空格布局时，才会重用缓存的翻译：行内的空格、任一端的空格或 CRLF 与 LF。任何其他编辑都会被重新翻译，包括更改的单词、数字、标点符号、字母大小写或行内代码段。缓存的翻译是其自身源的翻译，因此将其用于编辑后的文本会输出旧的措辞。

### Ollama Cloud（可选）
将 `OLLAMA_HOST` 设置为向另一个 Ollama 服务器发送请求，而不是 `localhost:11434`。对于 [Ollama Cloud](https://ollama.com)，还需设置 `OLLAMA_API_KEY`：密钥以 Bearer 令牌的形式发送，并且仅发送到非环回主机。

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### 并发信号量
所有 Ollama 调用都受到计数信号量的保护（默认限制：1），以防止在 VRAM 资源有限的系统上出现 GPU 内存不足的情况。可以通过 `POLYGLOT_CONCURRENCY` 进行覆盖：

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### MCP 进度令牌
当客户端提供 `progressToken` 时，所有工具都通过 MCP `notifications/progress` 报告进度。按块翻译，translate_markdown 按分段批处理翻译，translate_all 按语言翻译，check_status 按步骤检查。

### 软件术语表
内置的 12 个技术术语术语表（API、CLI、SDK 等）可确保软件术语翻译的一致性。可以为每个请求传递自定义术语表条目，并将其与默认值合并。

### 批量翻译
`translateBatch` 尽可能将多个分段组合成单个提示，从而减少往返次数。如果批处理分隔符出现问题，则回退到单独翻译。

### 可配置的默认模型
默认模型为 `translategemma:27b`。设置 `POLYGLOT_MODEL` 环境变量以使用另一个模型，例如在 VRAM 较少的 GPU 上：

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### 结构化错误
所有错误都使用 `PolyglotError`，其中包含机器可读的代码（`MODEL_NOT_FOUND`、`OLLAMA_UNAVAILABLE`、`TRANSLATION_FAILED` 等）、人类可读的消息、可选的提示和 `retryable` 标志。

### 输出验证
每个翻译都会自动进行验证：空输出会引发错误（可重试），源文本回显会被标记，严重的截断和幻觉会导致警告，乱码和模型元注释会被检测到。警告会出现在 MCP 工具响应中。

### 流式传输
`OllamaClient.generateStream()` 通过 NDJSON 形式地输出令牌，Ollama 在生成令牌时会进行输出。`translate()` 函数接受 `onToken` 回调函数，用于实时显示进度。流式传输和非流式传输路径都共享重试逻辑。

## 支持的语言

南非语、阿尔巴尼亚语、阿拉伯语、孟加拉语、保加利亚语、加泰罗尼亚语、简体中文、繁体中文、克罗地亚语、捷克语、丹麦语、荷兰语、英语、爱沙尼亚语、芬兰语、法语、加利西亚语、德语、希腊语、古吉拉特语、希伯来语、印地语、匈牙利语、印度尼西亚语、爱尔兰语、意大利语、日语、卡纳达语、韩语、拉脱维亚语、立陶宛语、马其顿语、马来语、马拉雅拉姆语、马耳他语、马拉地语、挪威语、波斯语、波兰语、葡萄牙语、罗马尼亚语、俄语、苏格兰盖尔语、塞尔维亚语、斯洛伐克语、斯洛文尼亚语、西班牙语、斯瓦希里语、瑞典语、泰米尔语、泰卢固语、泰语、土耳其语、乌克兰语、乌尔都语、越南语、威尔士语。

## 性能

| 指标 | 27B（默认），RTX 5090 32 GB | 12B（Q4），RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| 首次翻译（冷模型加载） | ~30 秒 | ~15 秒 |
| 后续翻译 | ~1–2 秒/批次 README 分段 | ~600 毫秒 |
| 模型内存 | 17 GB，完全在 GPU 上（如 `ollama ps` 所示） | ~8.1 GB |

## 架构

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

## 安全性和数据范围

| 方面 | 详细信息 |
|--------|--------|
| **Data touched** | Text sent to the Ollama API — local (`localhost:11434`) by default, or the host in `OLLAMA_HOST` if you set one. `.polyglot-cache.json` segment cache next to a translated file (library and CLI use only) |
| **Files written** | `translate_readme` 会在您传递的 README 文件旁边写入 `README.<lang>.md`，并刷新该 README 的语言导航栏。 |
| **Data NOT touched** | 没有浏览器数据，没有操作系统凭据，也没有超出上述目录之外的内容。 |
| **Network** | 默认情况下，仅通过 HTTP 连接到 `localhost:11434`——零外部流量。只有当 `OLLAMA_HOST` 指向其他位置时，才进行远程连接。 |
| **Secrets** | 如果设置了 `OLLAMA_API_KEY`，则会从环境变量中读取，并且仅以 Bearer 令牌的形式发送到非环回 `OLLAMA_HOST`；绝不会写入磁盘或记录。 |
| **Telemetry** | 不收集或发送任何数据。 |

有关漏洞报告策略，请参阅 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 362 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## 许可证

MIT——请参阅 [LICENSE](LICENSE)。

> 由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建
