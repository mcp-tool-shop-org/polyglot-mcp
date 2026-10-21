<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>本地 GPU 翻译 MCP 服务器——57 种语言，无需云服务。</strong></p>

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

使用在您的 GPU 上本地运行的 [TranslateGemma](https://ollama.com/library/translategemma) 将文本翻译成 57 种语言，通过 [Ollama](https://ollama.com)。无需 API 密钥、云服务或速率限制——默认情况下，所有内容都保留在您的机器上。您可以选择使用远程 Ollama，例如 [Ollama Cloud](#ollama-cloud可选)。

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

> **提示：**您可以跳过此步骤——Polyglot 在首次使用时会自动拉取默认模型（27B，17 GB）。如果您的 GPU 较小，请首先设置 `POLYGLOT_MODEL=translategemma:12b`（请参阅[可配置的默认模型](#可配置的默认模型)）。

### 3. 添加到您的 MCP 客户端

**Claude Code / Claude Desktop**——添加到 `claude_desktop_config.json` 或 `.mcp.json`：

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
| `glossary`  | no       | 自定义术语覆盖，如 `{"source": "translation"}`——与内置的软件词汇表合并 |

长文本会自动在段落和句子边界处分割成块，按顺序翻译，然后重新组合。所有翻译都会经过质量验证（空输出、回显检测、截断、乱码文本）。

### `translate_markdown`

在保留结构的同时，翻译整个 Markdown 文档。代码块、HTML 元素、徽章、URL 和表格格式将保持不变——只有散文内容（标题、段落、标语、表格单元格）会被翻译。行内代码片段和[受保护的术语](#受保护的术语polyglot-termsjson) 在翻译之前会被替换为占位符，并在翻译之后恢复，因此命令、标志、包名称和标识符将完全按照书写方式返回，并且每个“N of M”计数都将返回为 `N/M`。

| 参数 | 必需 | 描述 |
|--------------|----------|-------------|
| `markdown`   | 是 | 要翻译的完整 Markdown 内容 |
| `from`       | 是 | 源语言代码或名称 |
| `to`         | 是 | 目标语言代码或名称 |
| `model`      | no       | Ollama 模型（默认：`translategemma:27b`） |
| `onLostSpan` | no       | `report`（默认）列出翻译中缺少的受保护的片段；`fail` 将其视为错误。请参阅[生存检查](#生存性检查--on-lost-span)。 |

### `list_languages`

列出所有 57 种受支持的语言及其代码。

### `check_status`

检查 Ollama 是否正在运行以及安装了哪些 TranslateGemma 模型。如果 Ollama 未运行，则尝试自动启动。

### `translate_all`

将 Markdown 内容一次翻译成多种语言（默认：7 种——日语、中文、西班牙语、法语、印地语、意大利语、葡萄牙语）。使用 GPU 安全的信号量限制并发运行翻译。

| 参数 | 必需 | 描述 |
|---------------|----------|-------------|
| `markdown`    | 是 | 要翻译的完整 Markdown 内容 |
| `from`        | no       | 源语言代码（默认：`en`） |
| `languages`   | no       | 目标语言代码数组（默认：所有 7 种） |
| `model`       | no       | Ollama 模型（默认：`translategemma:27b`） |
| `concurrency` | no       | 最大并发翻译数（默认：2，最大：3） |
| `navBar`      | no       | 注入语言导航栏（默认：true） |
| `onLostSpan`  | no       | `report`（默认）列出每种语言中丢失的受保护的片段；`fail` 将任何包含未写入内容的语言视为错误。 |

### `translate_readme`

翻译 README.md **文件**，将其翻译成相同的 7 种语言，并将 `README.<lang>.md` 文件写入其旁边，同时刷新源 README 和每个翻译中的语言导航栏。返回每种语言的状态摘要（成功/失败、时间、写入的文件），而不是翻译后的文本；如果您需要返回内容，请使用 `translate_markdown`。

| 参数 | 必需 | 描述 |
|---------------|----------|-------------|
| `readmePath`  | 是 | 源 README.md 文件的绝对路径 |
| `tier`        | no       | `quality`（`translategemma:27b`、默认）、`bulk`（`12b`）或 `draft`（`2b`）；当设置 `model` 时，将被忽略。 |
| `model`       | no       | 显式 Ollama 模型；覆盖 `tier`。 |
| `languages`   | no       | 目标语言代码的子集（默认：所有 7 种） |
| `concurrency` | no       | 最大并发翻译数（默认：2，最大：3） |
| `navBar`      | no       | 注入或刷新语言导航栏（默认：true） |
| `onLostSpan`  | no       | `report`（默认）写入每个文件并列出丢失的受保护的片段；`fail` 将任何包含未写入内容的语言视为错误。 |

`translate_readme` 读取 README 的 `.polyglot-terms.json` 和 `.polyglot-pins.json`（如果存在）。

## 特性

### 自动启动和自动拉取
如果 Ollama 未运行，则会自动启动。如果未安装 TranslateGemma 模型，则会自动拉取。无需手动设置。

### 带有指数退避的重试
瞬态的 Ollama 故障（网络中断、临时过载）会自动重试最多 2 次，并采用指数退避（1 秒、2 秒）。无法重试的错误（错误的模型名称、无效的输入）会立即失败。

### 智能分块
长文本在自然边界处分割——段落，然后是句子——以便保留翻译上下文。块大小会适应模型：2K 字符用于 2B/4B 模型，4K 用于 12B，6K 用于 27B。

### 片段缓存
Translated segments are cached by content hash (SHA-256 of the masked source text + target language + model, plus a hash of the protected-term rules that matched in the segment). Unchanged segments skip re-translation entirely, so re-running a translation after an edit touches only what changed. Adding a protected term changes the key of every segment containing it, so a cached translation that respelled the term is not replayed; other segments keep their keys. The cache lives in `.polyglot-cache.json` next to the source file, with a 30-day TTL. It is used by the `translateMarkdown` library API when given a `filePath` (and by the repo's `scripts/translate-*.mjs` CLI); the MCP tools translate without it.

多个运行可以共享一个缓存文件。每次保存时，它只会将自己的更改合并到文件中，并在加锁状态下原子地替换该文件，因此并行翻译的语言会保留彼此的条目，并且清除一种语言的缓存不会影响其他语言。

### 翻译记忆（模糊缓存）
当找不到完全匹配的缓存时，只有在缓存的源文本与新文本在空格布局方面（例如，行内的空格、行首或行尾的空格，或 CRLF 与 LF）不同时，才会重用缓存的翻译。任何其他编辑都会被重新翻译，包括更改的单词、数字、标点符号、字母大小写或行内代码片段。缓存的翻译是其源文本的翻译，因此将其用于编辑后的文本会输出旧的措辞。

### 受保护的术语（`.polyglot-terms.json`）
TranslateGemma 将另一种脚本中的纯标识符重新拼写：一个印地语 README 将 `XLS-30` 拼写为 `एक्सएलएस-30`，将 `Kimi-K3` 拼写为 `किमी-के3`。它还会扭曲计数：中文将“218/224”转换为“224/218”。因此，散文中标识符会被屏蔽，就像行内代码片段一样：在翻译之前，每个标识符都会被替换为不包含字母的占位符，并在翻译之后恢复。默认设置如下：

| 模式 | 屏蔽 | 保持不变 |
|---------|-------|--------------|
| `url` | `https://…`，最多到空格、引号、方括号或反引号 | |
| `caps-id` | ALL-CAPS 包含数字或大写字母的令牌，或者由 `-` 或 `_` 连接：`XLS-30`、`HOST_REJECTED`、`SHA-256`、`ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase 和 mixedCase 个单词：`DepositAuth`、`AMMCreate`、`mixedCase`、`SoulX-Singer` | `URLs`、`IDs`、`GPUs`，普通的带大写字母的单词 |
| `model-id` | 带有字母和数字部分的型号和产品 ID：`Kimi-K3`、`gemma4:31b`、`Qwen2.5-32B` | `Node.js`, `top-10` |
| `anchor` | Markdown 链接（`[text](#slug)`、`[text](#slug "title")`）和引用定义（`[label]: #slug`）中的页面内 `#slug` 目标，以便模型翻译链接文本，而不会扭曲片段。 | `#123` 在散文中，`#heading` 行，外部 `https://…#frag` URL（由 `url` 覆盖） |

在翻译并重新组合所有片段之后，每个源 ATX 标题都会与其翻译后的 ATX 标题配对，并按照文档顺序使用 `github-slugger` 进行标记（与 GitHub 自己的标题 ID 匹配，包括 `-1`、`-2` 后缀用于重复的标题），并且每个非代码页面内锚点（`[text](#slug)`、`[label]: #slug` 和 HTML `href="#slug"`）都会被重写为翻译后的标题的 slug。

“N of M”在散文和表格单元格中（`218 of 224`）会被屏蔽为一个 span，并在每种语言中恢复为 `218/224`，这样在所有地方都能正确显示，并且不能被反转或转换为序数。如果表格单元格仅包含一个计数，则根本不会将其发送到模型。

仓库会在 `.polyglot-terms.json` 中添加自己的术语，位于 README 旁边。每个字段都是可选的：

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` 是精确的、区分大小写的字符串，作为完整的单词进行匹配；`patterns` 是 JavaScript 正则表达式。两者都会添加到默认设置中。`disable` 通过名称关闭默认设置（例如，`"disable": ["anchor"]` 关闭页面内锚点屏蔽、重新组合后的 slug 重写以及锚点生存性检查），并且 `"nOfM": false` 关闭计数规则。如果无法解析文件，则会使用 `CONFIG_ERROR` 停止运行，而不是在没有请求的术语的情况下进行翻译。

### 生存性检查（`--on-lost-span`）
翻译后，会检查每个目标文件与英文文件：每个受保护的 span（行内代码 span、受保护的术语以及每个计数，如 `N/M`）必须存在于其片段的翻译中，并且字符必须完全匹配，并且每个页面内 `#slug` 锚点（在英文源中解析）必须在翻译中解析为翻译后的 ATX 标题 slug 或显式的 HTML `id=`/`name=` 锚点（如果在英文源中未解析的锚点，则会报告为警告，并且不会导致运行失败）。每个表格单元格必须包含与其源单元格相同的数字，作为多重集合进行比较，不考虑顺序：正确的中文“218/224”会将总数放在第一位（`224 首中的 218 首`），因此顺序检查会标记正确的答案。来自其他脚本的数字在比较之前会被标准化。该文件还必须保留其围栏代码块和行内代码 span。

`--on-lost-span=fail|report` 确定当某些内容丢失时会发生什么：

- **`fail`**：运行将以非零状态退出，并提供语言、片段和丢失的 span 列表。这是 `scripts/translate-all.mjs` 的默认设置，它在发布之前运行。文件仍然会被写入，因此可以通过手动方式进行修复并固定。摘要 JSON 包含列表和 `LOST_SPAN` 错误，格式为通常的 `PolyglotError` 格式（`code`、`message`、`hint`、`retryable`）。
- **`report`**：列表将被写入，并且运行将以 0 状态退出。这是 MCP 工具（`onLostSpan` 参数）和 `translateMarkdown` 库 API（`onLostSpan` 选项，结果字段 `lostSpans`）的默认设置。

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### 固定的翻译（`.polyglot-pins.json`）
固定的翻译始终优先。`.polyglot-pins.json` 位于缓存旁边；每个条目都由英文片段的哈希值加上目标语言进行索引，并保存手动修复的翻译。固定条目会覆盖缓存和模型，并且在每次重新运行时都会保留，包括 `--cache-clear`。当英文内容更改时，哈希值也会更改，因此固定条目无法超出其编写的文本的范围。

要固定手动修复，请更正翻译后的文件，然后运行：

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

它会将英文的每个片段与其在更正后的文件中的文本进行配对，并固定每个文本与缓存翻译不同的片段。`--dry-run` 列出固定条目，但不写入它们。`--model=NAME` 设置模型，其缓存条目与之进行比较（默认：`$POLYGLOT_MODEL` 或 `translategemma:27b`，与脚本相同）。`--include-uncached` 还会固定缓存中没有翻译的片段。提交 `.polyglot-pins.json` 和 `.polyglot-terms.json` 与 README 一起。

### Ollama Cloud（可选）
将 `OLLAMA_HOST` 设置为发送请求到另一个 Ollama 服务器，而不是 `localhost:11434`。对于 [Ollama Cloud](https://ollama.com)，还设置 `OLLAMA_API_KEY`：密钥将作为 Bearer 令牌发送，并且仅发送到非环回主机。

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### 并发信号量
所有 Ollama 调用都受到计数信号量的保护（默认限制：1），以防止在 VRAM 资源有限的系统上发生 GPU 内存不足。使用 `POLYGLOT_CONCURRENCY` 进行覆盖：

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### MCP 进度令牌
所有工具都通过 MCP `notifications/progress` 报告进度，当客户端提供 `progressToken` 时。按块翻译报告，按分段批处理翻译 markdown，按语言翻译所有内容，并按步骤检查状态。

### 软件术语表
内置的 12 个技术术语词汇表（API、CLI、SDK 等）可确保软件术语翻译的一致性。可以按请求传递自定义词汇表条目，并将其与默认词汇表合并。

### 批量翻译
`translateBatch` 尽可能将多个分段组合成单个提示，从而减少往返次数。如果批处理分隔符出现问题，则回退到单独翻译。

### 可配置的默认模型
默认模型为 `translategemma:27b`。设置 `POLYGLOT_MODEL` 环境变量以使用另一个模型，例如在 VRAM 较少的 GPU 上：

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### 结构化错误
所有错误都使用 `PolyglotError`，其中包含机器可读的代码（`MODEL_NOT_FOUND`、`OLLAMA_UNAVAILABLE`、`TRANSLATION_FAILED` 等）、人类可读的消息、可选的提示以及 `retryable` 标志。

### 输出验证
每个翻译都会自动进行验证：空输出会引发错误（可重试），源文本回显会被标记，严重的截断和幻觉会导致警告，乱码和模型元注释会被检测。警告会出现在 MCP 工具的响应中。

### 流式传输
`OllamaClient.generateStream()` 通过 NDJSON 形式地输出令牌，就像 Ollama 产生令牌一样。`translate()` 函数接受 `onToken` 回调函数，用于实时显示进度。流式传输和非流式传输路径都共享重试逻辑。

## 支持的语言

南非语、阿尔巴尼亚语、阿拉伯语、孟加拉语、保加利亚语、加泰罗尼亚语、简体中文、繁体中文、克罗地亚语、捷克语、丹麦语、荷兰语、英语、爱沙尼亚语、芬兰语、法语、加利西亚语、德语、希腊语、古吉拉特语、希伯来语、印地语、匈牙利语、印度尼西亚语、爱尔兰语、意大利语、日语、卡纳达语、韩语、拉脱维亚语、立陶宛语、马其顿语、马来语、马拉雅拉姆语、马耳他语、马拉地语、挪威语、波斯语、波兰语、葡萄牙语、罗马尼亚语、俄语、苏格兰盖尔语、塞尔维亚语、斯洛伐克语、斯洛文尼亚语、西班牙语、斯瓦希里语、瑞典语、泰米尔语、泰卢固语、泰语、土耳其语、乌克兰语、乌尔都语、越南语、威尔士语。

## 性能

| 指标 | 27B（默认），RTX 5090 32 GB | 12B（Q4），RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| 首次翻译（冷启动模型加载） | ~30 秒 | ~15 秒 |
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

| 方面 | 详细信息 |
|--------|--------|
| **Data touched** | Text sent to the Ollama API — local (`localhost:11434`) by default, or the host in `OLLAMA_HOST` if you set one. `.polyglot-cache.json` segment cache next to a translated file (library and CLI use only). `.polyglot-terms.json` and `.polyglot-pins.json` next to a translated README are read if present |
| **Files written** | `translate_readme` 会在您传递的 README 旁边写入 `README.<lang>.md`，并刷新该 README 的语言导航栏。`scripts/pin-translation.mjs` 会在 README 旁边写入 `.polyglot-pins.json`。 |
| **Data NOT touched** | 没有浏览器数据，没有操作系统凭据，也没有超出上述目录之外的任何内容。 |
| **Network** | 默认情况下，仅通过 HTTP 连接到 `localhost:11434`——零外部流量。只有当 `OLLAMA_HOST` 指向其他位置时，才允许远程连接。 |
| **Secrets** | 如果设置了 `OLLAMA_API_KEY`，则会从环境变量中读取，并仅作为 Bearer 令牌发送到非环回 `OLLAMA_HOST`；绝不会写入磁盘或记录。 |
| **Telemetry** | 不收集或发送任何数据。 |

有关漏洞报告策略，请参阅 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 467 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## 许可证

MIT——请参阅 [LICENSE](LICENSE)。

> 由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建
