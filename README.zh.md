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

使用在您的 GPU 上本地运行的 [TranslateGemma](https://ollama.com/library/translategemma) 将文本翻译成 57 种语言，通过 [Ollama](https://ollama.com)。无需 API 密钥、云服务或速率限制——默认情况下，所有内容都保留在您的机器上。您可以选择使用远程 Ollama，例如 [Ollama Cloud](#ollama-cloud-optional)。

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

> **提示：**您可以跳过此步骤——Polyglot 在首次使用时会自动拉取默认模型（27B，17 GB）。如果您的 GPU 较小，请首先设置 `POLYGLOT_MODEL=translategemma:12b`（请参阅[可配置的默认模型](#configurable-default-model)）。

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
| `model`     | no       | Ollama 模型（默认：`translategemma:27b`） |
| `glossary`  | no       | 自定义术语覆盖，如 `{"source": "translation"}` — 与内置的软件词汇表合并 |

长文本会自动在段落和句子边界处分割成块，按顺序翻译，然后重新组合。所有翻译都会经过质量验证（空输出、回声检测、截断、乱码文本）。

### `translate_markdown`

翻译整个 Markdown 文档，同时保留结构。代码块、HTML 元素、徽章、URL 和表格格式将保持不变——只有散文内容（标题、段落、标语、表格单元格）会被翻译。行内代码片段和[受保护的术语](#protected-terms-polyglot-termsjson) 在翻译之前会被替换为占位符，并在翻译之后恢复，因此命令、标志、包名称和标识符将完全按照书写方式返回，并且每个“N of M”计数都将返回为 `N/M`。

| 参数 | 必需 | 描述 |
|--------------|----------|-------------|
| `markdown`   | 是 | 要翻译的完整 Markdown 内容 |
| `from`       | 是 | 源语言代码或名称 |
| `to`         | 是 | 目标语言代码或名称 |
| `model`      | no       | Ollama 模型（默认：`translategemma:27b`） |
| `onLostSpan` | no       | `report`（默认）列出翻译中缺少的受保护的片段；`fail` 将其视为错误。请参阅[生存检查](#survival-check---on-lost-span) |

### `list_languages`

列出所有 57 种受支持的语言及其代码。

### `check_status`

检查 Ollama 是否正在运行以及安装了哪些 TranslateGemma 模型。如果 Ollama 未运行，则尝试自动启动。

### `translate_all`

一次将 Markdown 内容翻译成多种语言（默认：7 种——日语、中文、西班牙语、法语、印地语、意大利语、葡萄牙语）。以 GPU 安全的信号量限制并发运行翻译。

| 参数 | 必需 | 描述 |
|---------------|----------|-------------|
| `markdown`    | 是 | 要翻译的完整 Markdown 内容 |
| `from`        | no       | 源语言代码（默认：`en`） |
| `languages`   | no       | 目标语言代码数组（默认：所有 7 种） |
| `model`       | no       | Ollama 模型（默认：`translategemma:27b`） |
| `concurrency` | no       | 最大并发翻译数（默认：2，最大：3） |
| `navBar`      | no       | 注入语言导航栏（默认：true） |
| `onLostSpan`  | no       | `report`（默认）列出每种语言中丢失的受保护的片段；`fail` 将任何包含未写入内容的语言视为错误 |

### `translate_readme`

翻译 README.md **文件** 为相同的 7 种语言，并将 `README.<lang>.md` 文件写入其旁边，同时刷新源 README 和每个翻译中的语言导航栏。返回每种语言的状态摘要（成功/失败、时间、写入的文件），而不是翻译后的文本；如果您需要返回内容，请使用 `translate_markdown`。

| 参数 | 必需 | 描述 |
|---------------|----------|-------------|
| `readmePath`  | 是 | 源 README.md 文件的绝对路径 |
| `tier`        | no       | `quality`（`translategemma:27b`，默认）、`bulk`（`12b`）或 `draft`（`2b`）；当设置 `model` 时，将被忽略 |
| `model`       | no       | 显式 Ollama 模型；覆盖 `tier` |
| `languages`   | no       | 目标语言代码的子集（默认：所有 7 种） |
| `concurrency` | no       | 最大并发翻译数（默认：2，最大：3） |
| `navBar`      | no       | 注入或刷新语言导航栏（默认：true） |
| `onLostSpan`  | no       | `report`（默认）写入每个文件并列出丢失的受保护的片段；`fail` 将任何包含未写入内容的语言视为错误 |

`translate_readme` 读取 README 的 `.polyglot-terms.json` 和 `.polyglot-pins.json`（如果存在）。

## 特性

### 自动启动和自动拉取
如果 Ollama 未运行，则会自动启动。如果未安装 TranslateGemma 模型，则会自动拉取。无需手动设置。

### 带有指数退避的重试
瞬态 Ollama 故障（网络中断、临时过载）会自动重试最多 2 次，并采用指数退避（1 秒、2 秒）。无法重试的错误（错误的模型名称、无效的输入）会立即失败。

### 智能分块
长文本在自然边界处分割——段落，然后是句子——因此保留了翻译上下文。块大小会适应模型：2K 字符用于 2B/4B 模型，4K 用于 12B，6K 用于 27B。

### 片段缓存
Translated segments are cached by content hash (SHA-256 of the masked source text + target language + model, plus a hash of the protected-term rules that matched in the segment). Unchanged segments skip re-translation entirely, so re-running a translation after an edit touches only what changed. Adding a protected term changes the key of every segment containing it, so a cached translation that respelled the term is not replayed; other segments keep their keys. The cache lives in `.polyglot-cache.json` next to the source file, with a 30-day TTL. It is used by the `translateMarkdown` library API when given a `filePath` (and by the repo's `scripts/translate-*.mjs` CLI); the MCP tools translate without it.

多个运行可以共享一个缓存文件。每次保存时，它只会将自己的更改合并到文件中，并在加锁的状态下原子性地替换该文件，因此并行翻译的语言会保留彼此的条目，并且清除一种语言的缓存不会影响其他语言。

### 翻译记忆（模糊缓存）
当找不到完全匹配的缓存时，只有在缓存的源文本与新文本的空格布局不同时（例如，行内的空格、行首或行尾的空格，或 CRLF 与 LF），才会重复使用缓存的翻译：任何其他编辑都会重新翻译，包括更改的单词、数字、标点符号、字母大小写或行内代码片段。缓存的翻译是其源文本的翻译，因此将其用于编辑后的文本会输出旧的措辞。

### 受保护的术语（`.polyglot-terms.json`）
TranslateGemma 将另一种脚本中的纯标识符重新拼写：一个印地语 README 将 `XLS-30` 拼写为 `एक्सएलएस-30`，将 `Kimi-K3` 拼写为 `किमी-के3`。它还会扭曲计数：中文将“218/224”转换为“224/218”。因此，散文中标识符会被屏蔽，就像行内代码片段一样：在翻译之前，每个标识符都会被替换为不包含字母的占位符，并在翻译之后恢复。默认设置如下：

| 模式 | 屏蔽 | 保持不变 |
|---------|-------|--------------|
| `url` | `https://…`，最多到空格、引号、方括号或反引号 | |
| `caps-id` | ALL-CAPS 个带有数字的令牌，或者由 `-` 或 `_` 连接的大写字母：`XLS-30`、`HOST_REJECTED`、`SHA-256`、`ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase 和 mixedCase 个单词：`DepositAuth`、`AMMCreate`、`mixedCase`、`SoulX-Singer` | `URLs`、`IDs`、`GPUs`，普通的带大写字母的单词 |
| `model-id` | 带有字母和数字部分的型号和产品 ID：`Kimi-K3`、`gemma4:31b`、`Qwen2.5-32B` | `Node.js`, `top-10` |

散文和表格单元格中的“N of M”（`218 of 224`）会被屏蔽为一个片段，并在每种语言中恢复为 `218/224`，这样在任何地方都能正确显示，并且不能反转或转换为序数。如果表格单元格仅为计数，则根本不会将其发送到模型。

仓库会在 `.polyglot-terms.json` 中添加自己的术语，位于 README 文件旁边。每个字段都是可选的：

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` 是精确的、区分大小写的字符串，作为完整的单词进行匹配；`patterns` 是 JavaScript 个正则表达式。两者都会添加到默认设置中。`disable` 通过名称关闭默认设置，`"nOfM": false` 关闭计数规则。无法解析的文件会停止运行，并使用 `CONFIG_ERROR`，而不是在没有请求的术语的情况下进行翻译。

### 生存检查（`--on-lost-span`）
翻译完成后，会检查每个目标文件与英文文件：每个受保护的片段（行内代码片段、受保护的术语以及每个计数，表示为 `N/M`）都必须存在于其片段的翻译中，并且字符必须完全匹配。每个表格单元格必须包含与源单元格相同的数字，并且进行比较时，不考虑顺序，而是将其视为一个多重集合：正确的中文翻译“218/224”会将总数放在第一位（`224 首中的 218 首`），因此顺序检查会标记正确的答案。在比较之前，来自其他脚本的数字会被标准化。该文件还必须保留其围栏代码块和行内代码片段。

`--on-lost-span=fail|report` 确定当某些内容丢失时会发生什么：

- **`fail`**：运行将以非零状态退出，并提供一个包含语言、片段和丢失片段的列表。这是 `scripts/translate-all.mjs` 的默认设置，该设置在发布之前运行。文件仍然会被写入，因此可以通过手动方式进行修复并固定。摘要 JSON 包含该列表和通常的 `PolyglotError` 格式的 `LOST_SPAN` 错误（`code`、`message`、`hint`、`retryable`）。
- **`report`**：该列表将被写入，并且运行将以 0 状态退出。这是 MCP 工具（`onLostSpan` 参数）和 `translateMarkdown` 库 API（`onLostSpan` 选项，结果字段 `lostSpans`）的默认设置。

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### 固定的翻译（`.polyglot-pins.json`）
固定的翻译始终优先。`.polyglot-pins.json` 位于缓存旁边；每个条目都以英文片段的哈希值加上目标语言作为键，并保存手动修复的翻译。固定翻译会覆盖缓存和模型，并且在每次重新运行（包括 `--cache-clear`）时都会保留。当英文内容发生更改时，哈希值也会发生更改，因此固定翻译无法超出其编写的文本的范围。

要固定手动修复，请更正翻译后的文件，然后运行：

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

它会将英文的每个片段与其在更正后的文件中的文本配对，并固定每个文本与缓存翻译不同的片段。`--dry-run` 列出固定翻译，但不写入它们。`--model=NAME` 设置要与其缓存条目进行比较的模型（默认：`$POLYGLOT_MODEL` 或 `translategemma:27b`，与脚本相同）。`--include-uncached` 还会固定缓存中没有翻译的片段。提交 `.polyglot-pins.json` 和 `.polyglot-terms.json` 与 README 文件一起。

### Ollama Cloud（可选）
将 `OLLAMA_HOST` 设置为发送请求到另一个 Ollama 服务器，而不是 `localhost:11434`。对于 [Ollama Cloud](https://ollama.com)，还应设置 `OLLAMA_API_KEY`：密钥将作为 Bearer 令牌发送，并且仅发送到非环回主机。

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### 并发信号量
所有 Ollama 调用都受到计数信号量的保护（默认限制：1），以防止在 VRAM 资源有限的系统上发生 GPU 内存不足。使用 `POLYGLOT_CONCURRENCY` 进行覆盖：

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### MCP 进度令牌
当客户端提供 `progressToken` 时，所有工具都会通过 MCP `notifications/progress` 报告进度。translate 报告每个片段，translate_markdown 报告每个片段批次，translate_all 报告每个语言，check_status 报告每个步骤。

### 软件术语表
内置的 12 个技术术语（API、CLI、SDK 等）的术语表可确保软件术语翻译的一致性。可以按请求传递自定义术语表条目，并将其与默认设置合并。

### 批量翻译
`translateBatch` 尽可能将多个片段组合到一个提示中，从而减少往返次数。如果批处理分隔符被破坏，则回退到单独的翻译。

### 可配置的默认模型
默认模型是 `translategemma:27b`。设置 `POLYGLOT_MODEL` 环境变量以使用另一个模型，例如在 VRAM 较少的 GPU 上：

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### 结构化错误
所有错误都使用 `PolyglotError`，其中包含机器可读的代码（`MODEL_NOT_FOUND`、`OLLAMA_UNAVAILABLE`、`TRANSLATION_FAILED` 等）、人类可读的消息、可选的提示以及 `retryable` 标志。

### 输出验证
每次翻译都会自动进行验证：如果输出为空，则会引发错误（可重试）；如果源文本被回显，则会发出警告；如果出现严重的截断或幻觉，则会发出警告；如果检测到乱码或模型元评论，也会发出警告。警告会显示在 MCP 工具的响应中。

### 流式传输
`OllamaClient.generateStream()` 通过 NDJSON 格式输出令牌，就像 Ollama 生成令牌一样。`translate()` 函数接受一个 `onToken` 回调函数，用于实时显示进度。流式传输和非流式传输路径都共享重试逻辑。

## 支持的语言

南非语、阿尔巴尼亚语、阿拉伯语、孟加拉语、保加利亚语、加泰罗尼亚语、简体中文、繁体中文、克罗地亚语、捷克语、丹麦语、荷兰语、英语、爱沙尼亚语、芬兰语、法语、加利西亚语、德语、希腊语、古吉拉特语、希伯来语、印地语、匈牙利语、印度尼西亚语、爱尔兰语、意大利语、日语、卡纳达语、韩语、拉脱维亚语、立陶宛语、马其顿语、马来语、马拉雅拉姆语、马耳他语、马拉地语、挪威语、波斯语、波兰语、葡萄牙语、罗马尼亚语、俄语、苏格兰盖尔语、塞尔维亚语、斯洛伐克语、斯洛文尼亚语、西班牙语、斯瓦希里语、瑞典语、泰米尔语、泰卢固语、泰语、土耳其语、乌克兰语、乌尔都语、越南语、威尔士语。

## 性能

| 指标 | 27B（默认），RTX 5090 32 GB | 12B（Q4），RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| 首次翻译（冷启动模型加载） | ~30 秒 | ~15 秒 |
| 后续翻译 | ~1–2 秒/批次 README 文档 | ~600 毫秒 |
| 模型内存 | 17 GB，完全在 GPU 上（由 `ollama ps` 报告） | ~8.1 GB |

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
│protectedTerms.ts │  Protected terms in prose, "N of M", .polyglot-terms.json
├──────────────────┤
│   survival.ts    │  Survival check: lost spans, cell numbers, --on-lost-span
├──────────────────┤
│     pins.ts      │  Pinned hand fixes, .polyglot-pins.json
├──────────────────┤
│pinCorrections.ts │  Corrected file → pins (scripts/pin-translation.mjs)
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

## 安全与数据范围

| 方面 | 详情 |
|--------|--------|
| **Data touched** | 发送到 Ollama API 的文本——默认情况下为本地（`localhost:11434`），或者如果设置了 `OLLAMA_HOST`，则为该主机。`.polyglot-cache.json` 将分段缓存存储在翻译后的文件旁边（仅库和 CLI 使用）。如果存在，则读取 `.polyglot-terms.json` 和 `.polyglot-pins.json`，它们存储在翻译后的 README 旁边。 |
| **Files written** | `translate_readme` 将 `README.<lang>.md` 写入您传递的 README 旁边，并刷新该 README 的语言导航栏。`scripts/pin-translation.mjs` 将 `.polyglot-pins.json` 写入 README 旁边。 |
| **Data NOT touched** | 不收集或发送任何浏览器数据、操作系统凭据或超出上述目录范围的数据。 |
| **Network** | 默认情况下，仅通过 HTTP 连接到 `localhost:11434`——零外部数据传输。只有当 `OLLAMA_HOST` 指向其他位置时，才会进行远程连接。 |
| **Secrets** | 如果设置了 `OLLAMA_API_KEY`，则会从环境变量中读取，并仅作为 Bearer 令牌发送到非环回 `OLLAMA_HOST`；绝不会写入磁盘或记录。 |
| **Telemetry** | 不收集或发送任何数据。 |

有关漏洞报告策略，请参阅 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 435 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## 许可证

MIT——请参阅 [LICENSE](LICENSE)。

> 由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建。
