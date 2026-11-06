<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

该工具可在您的 GPU 上本地运行 [Ollama](https://ollama.com)，从而在 57 种语言之间进行文本翻译，具体代码为 [TranslateGemma](https://ollama.com/library/translategemma)。无需 API 密钥、无需云服务、无需流量限制——默认情况下，所有操作都在您的设备上进行。您也可以选择使用远程 Ollama 服务，例如 [Ollama Cloud](#ollama-cloud可选)。

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
| `model`     | no       | Ollama 模型（默认值：`translategemma:27b`） |
| `glossary`  | no       | 自定义术语覆盖，如 `{"source": "translation"}`——与内置的软件词汇表合并 |

长文本会自动在段落和句子边界处分割成块，按顺序翻译，然后重新组合。所有翻译都会经过质量验证（空输出、回显检测、截断、乱码文本）。

### `translate_markdown`

在保留结构的同时，翻译整个 Markdown 文档。代码块、HTML 元素、徽章、URL 和表格格式将保持不变——仅翻译散文内容（标题、段落、标语、表格单元格）。行内代码片段和[受保护的术语](#受保护的术语polyglot-termsjson) 在翻译之前会被替换为占位符，并在翻译之后恢复，因此命令、标志、包名称和标识符将完全按照书写方式返回，并且每个“N of M”计数都将返回为 `N/M`。

| 参数 | 必需 | 描述 |
|--------------|----------|-------------|
| `markdown`   | 是 | 要翻译的完整 Markdown 内容 |
| `from`       | 是 | 源语言代码或名称 |
| `to`         | 是 | 目标语言代码或名称 |
| `model`      | no       | Ollama 模型（默认值：`translategemma:27b`） |
| `onLostSpan` | no       | `report`（默认值）列出翻译中缺少的受保护的片段；`fail` 会将此视为错误。请参阅[生存检查](#生存性检查--on-lost-span)。 |

### `list_languages`

列出所有 57 种受支持的语言及其代码。

### `check_status`

检查 Ollama 是否正在运行以及安装了哪些 TranslateGemma 模型。如果 Ollama 未运行，则尝试自动启动。

### `translate_all`

一次将 Markdown 内容翻译成多种语言（默认值：7 种——日语、中文、西班牙语、法语、印地语、意大利语、葡萄牙语）。以 GPU 安全的信号量限制并发运行翻译。

| 参数 | 必需 | 描述 |
|---------------|----------|-------------|
| `markdown`    | 是 | 要翻译的完整 Markdown 内容 |
| `from`        | no       | 源语言代码（默认值：`en`） |
| `languages`   | no       | 目标语言代码数组（默认值：所有 7 种） |
| `model`       | no       | Ollama 模型（默认值：`translategemma:27b`） |
| `concurrency` | no       | 最大并发翻译数（默认值：2，最大值：3） |
| `navBar`      | no       | 注入语言导航栏（默认值：true） |
| `onLostSpan`  | no       | `report`（默认值）列出每种语言中丢失的受保护的片段；`fail` 会将任何包含未写入内容的语言视为错误。 |

### `translate_readme`

翻译 README.md **文件** 为相同的 7 种语言，并将 `README.<lang>.md` 文件写入其旁边，同时刷新源 README 和每个翻译中的语言导航栏。返回每种语言的状态摘要（成功/失败、时间、写入的文件），而不是翻译后的文本；如果您需要返回内容，请使用 `translate_markdown`。

| 参数 | 必需 | 描述 |
|---------------|----------|-------------|
| `readmePath`  | 是 | 源 README.md 文件的绝对路径 |
| `tier`        | no       | `quality`（`translategemma:27b`、默认值）、`bulk`（`12b`）或 `draft`（`2b`）；如果设置了 `model`，则忽略 |
| `model`       | no       | 显式 Ollama 模型；覆盖 `tier` |
| `languages`   | no       | 目标语言代码的子集（默认值：所有 7 种） |
| `concurrency` | no       | 最大并发翻译数（默认值：2，最大值：3） |
| `navBar`      | no       | 注入或刷新语言导航栏（默认值：true） |
| `onLostSpan`  | no       | `report`（默认值）写入每个文件并列出丢失的受保护的片段；`fail` 会将任何包含未写入内容的语言视为错误。 |

`translate_readme` 读取 README 的 `.polyglot-terms.json` 和 `.polyglot-pins.json`（如果存在）。

## 特性

### 自动启动和自动拉取
如果 Ollama 未运行，则会自动启动。如果未安装 TranslateGemma 模型，则会自动拉取。无需手动设置。

### 带有指数退避的重试
瞬态 Ollama 故障（网络中断、临时过载）会自动重试最多 2 次，并采用指数退避（1 秒、2 秒）。无法重试的错误（错误的模型名称、无效的输入）会立即失败。

### 智能分块
长文本在自然边界处分割——段落，然后是句子——以保留翻译上下文。块大小会适应模型：2B/4B 模型的 2K 字符，12B 的 4K，27B 的 6K。

### 片段缓存
翻译后的文本片段会根据内容哈希值进行缓存（SHA-256，即屏蔽后的源文本 + 目标语言 + 模型，再加上与该片段匹配的受保护术语规则的哈希值）。未更改的片段会完全跳过重新翻译，因此在编辑后重新运行翻译只会影响已更改的部分。添加受保护术语会更改包含该术语的每个片段的键，因此缓存的翻译（如果重新拼写了该术语）不会被重新应用；其他片段会保留其键。缓存存储在`.polyglot-cache.json`中，与源文件相邻，TTL（生存时间）为 30 天。当提供`filePath`时，它由`translateMarkdown`库 API 使用（以及由仓库的`scripts/translate-*.mjs`命令行界面使用）；MCP 工具在没有它的情况下进行翻译。

多个运行可以共享一个缓存文件。每次保存都会仅将其自己的更改合并到文件中，并在锁中替换文件，因此并行翻译的语言会保留彼此的条目，并且清除一种语言的缓存不会影响其他语言。

### 翻译记忆（模糊缓存）
当未找到完全匹配的缓存时，只有在缓存的源文本与新文本仅在空格布局上有所不同时，才会重复使用缓存的翻译：行内的空格、行首或行尾的空格，或者 CRLF 与 LF。任何其他修改都会重新翻译，包括更改的单词、数字、标点符号、字母大小写或行内代码片段。缓存的翻译是其源文本的翻译，因此将其用于已编辑的文本会输出旧的措辞。

### 受保护的术语（`.polyglot-terms.json`）
TranslateGemma 将其他脚本中的纯标识符重新拼写：一个 Hindi 语言的 README 文件将 `XLS-30` 拼写为 `एक्सएलएस-30`，将 `Kimi-K3` 拼写为 `किमी-के3`。它还会扭曲计数：中文将“218/224”转换为“224/218”。因此，散文中标识符会被屏蔽，就像行内代码片段一样：在翻译之前，每个标识符都会被替换为不包含字母的占位符，并在翻译之后恢复。默认设置如下：

| 模式 | 屏蔽 | 保持不变 |
|---------|-------|--------------|
| `url` | `https://…`，最多到空格、引号、方括号或反引号（允许一级平衡的括号，例如 `https://en.wikipedia.org/wiki/Foo_(bar)`） | |
| `anchor` | Markdown 链接中的页面内 `#slug` 目标（`[text](#slug)`、`[text](#slug "title")`）、引用定义（`[label]: #slug`）和 HTML `href="#slug"` 属性，因此模型会翻译链接文本，而不会扭曲片段。 | `#123` 在散文中，`#heading` 行，外部 `https://…#frag` URL（由 `url` 涵盖） |
| `link-target` | Markdown 行内链接、图像和引用定义中，非 HTTP(S) 和非锚目标：相对路径（`../facet`、`docs/Kimi-K3.md`）、纯文件名（`LICENSE`）、`mailto:`、`<path with spaces>`，以及具有一级平衡括号的路径（`docs/Foo_(bar).md`） | 链接标题（`"MIT License"`）、HTML 属性（`href="…"`、`src="…"`） |
| `caps-id` | ALL-CAPS 令牌，包含数字，或者由 `-` 或 `_` 连接的大写字母：`XLS-30`、`HOST_REJECTED`、`SHA-256`、`ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase 和 mixedCase 个单词：`DepositAuth`、`AMMCreate`、`mixedCase`、`SoulX-Singer` | `URLs`、`IDs`、`GPUs`，普通的、首字母大写的单词 |
| `model-id` | 包含字母和数字部分的型号和产品 ID：`Kimi-K3`、`gemma4:31b`、`Qwen2.5-32B` | `Node.js`, `top-10` |

在所有段落翻译和重新组合之后，每个源 ATX 标题都与其翻译后的 ATX 标题配对，并按照文档顺序使用 `github-slugger` 进行 slug 化（与 GitHub 自身的标题 ID 匹配，包括 `-1`、`-2` 后缀，用于重复的标题），并且每个非代码页面内锚点（`[text](#slug)`、`[label]: #slug` 和 HTML `href="#slug"`）都会被重写为翻译后的标题的 slug。

“N 比 M”在散文和表格单元格中（`218 of 224`）被屏蔽为一个 span，并在每种语言中恢复为 `218/224`，这样在任何地方都能正确显示，并且不能被反转或转换为序数。仅为计数的表格单元格根本不会发送到模型。

一个仓库会在 `.polyglot-terms.json` 中添加它自己的术语，位于 README 旁边。每个字段都是可选的：

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` 是精确的、区分大小写的字符串，作为完整的单词进行匹配；`patterns` 是 JavaScript 正则表达式。两者都添加到默认设置中。`disable` 通过名称关闭默认设置（例如，`"disable": ["anchor"]` 关闭页面内锚点屏蔽、重新组合后的 slug 重写以及锚点生存性检查；`"disable": ["link-target"]` 关闭非 HTTP 链接目标屏蔽，并跳过相对/非 HTTP 目标，以便指向本地化文件（如 `./docs/guide.fr.md`）的链接可以正常工作），并且 `"nOfM": false` 关闭计数规则。无法解析的文件会使用 `CONFIG_ERROR` 停止运行，而不是在没有使用请求的术语的情况下进行翻译。

### 生存性检查（`--on-lost-span`）
翻译后，每个目标文件都会与英文进行比较：每个受保护的 span（行内代码 span、受保护的术语以及每个计数，如 `N/M`）必须存在于其段落的翻译中，并且字符必须完全匹配，并且每个在英文源中解析的页面内 `#slug` 锚点必须在翻译中解析为翻译后的 ATX 标题 slug 或显式的 HTML `id=`/`name=` 锚点（如果在英文源中已经无法解析的锚点，则会报告为警告，并且不会导致运行失败；如果源和翻译的锚点计数不同，并且涉及了有效的源锚点，则不匹配也会报告为 `LostSpan` 类型的 `"anchor"`，除非已经通过段落链接检查标记）。每个段落的 Markdown 链接（`[text](target)`、`[text](target "title")`、图像 `![alt](src)`、引用链接 `[text][label]`、折叠 `[text][]` 和快捷方式 `[label]`，这些链接都相对于其文件的 `[label]: target` 定义进行解析）必须保留确切的非锚链接目标的集合，并且确切的页面内 `#slug` 链接计数（如果链接已损坏、未关闭或已删除，则报告为 `"link"` 类型）。任何未替换的 `⟦` 或 `⟧` 占位符分隔符，如果在翻译后的段落中超出源文本中包含的内容，则会报告为 `"placeholder"` 类型。每个表格单元格必须包含与源单元格相同的数字，以集合的形式进行比较，而不是按顺序：正确的中文“218/224”会将总数放在第一位（`224 首中的 218 首`），因此顺序检查会标记正确的答案。来自其他脚本的数字在比较之前会被标准化。该文件还必须保留其围栏代码块和行内代码 span。

`--on-lost-span=fail|report` 确定在丢失某些内容时会发生什么：

- **`fail`**：运行以非零状态退出，并提供语言、段落和缺失 span 的列表。这是 `scripts/translate-all.mjs` 的默认设置，该设置在发布之前运行。文件仍然会被写入，因此可以手动修复并固定。摘要 JSON 包含列表和通常的 `PolyglotError` 形状（`code`、`message`、`hint`、`retryable`）中的 `LOST_SPAN` 错误。
- **`report`**：列表会被写入，并且运行以 0 状态退出。这是 MCP 工具（`onLostSpan` 参数）和 `translateMarkdown` 库 API（`onLostSpan` 选项，结果字段 `lostSpans`）的默认设置。

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### 未翻译的散文检查（`--on-untranslated`）
一个模型可以返回一段英文，同时批处理仍然可以正确地进行分割，因此所有其他检查都会通过。翻译后，将检查英文中的每个散文句子（6个或更多单词，将链接按其标签计数，并排除代码片段、URL 和受保护的片段，并且不包含连续的专有名词），以确定其是否为翻译段落的完整句子。匹配时忽略大小写和结尾的标点符号或冒号，首先合并硬换行，然后逐句进行处理，因此即使是重新排版的段落或仅翻译了一个句子的行，也会被检测到。一系列专有名词（最多一个功能词和一个其他小写单词，例如标题或 `Format: JSON, YAML via stdio`）不受该规则的约束，而是通过列表进行排除，并且固定的段落永远不会被标记。

当模型答案为空、代码片段占位符未返回（该段落否则将回退到英文源，以确保标识符保持正确），或者散文句子仍然是英文时，该模型答案将被视为**不可用**。在某个语言被判定为失败之前，不可用的答案会单独重试一次；如果某个段落已经在分隔符计数不匹配后使用了每项一次的回退机制，则该重试将被计入其中。如果某个段落仍然不可用（例如，一个很长、代码密集的列表项，模型会删除其中的占位符），那么如果该段落有多个行，则会逐行进行翻译，如果某一行有多个句子，则会逐句进行翻译，每个部分都带有自己的占位符。只有在经过这些步骤后仍然不可用的部分才会保留英文源，并且不会保持沉默：它会报告未翻译的内容，并记录每个尝试过的步骤、警告以及导致运行失败的原因。相同的测试机制也用于缓存：不可用的答案永远不会被写入缓存，并且不可用的缓存条目将被忽略、删除并再次翻译。

`--on-untranslated=fail|report` 决定如何处理剩余的内容：

- **`fail`**（`translate-all.mjs` 和 `translate-readme.mjs` 的默认设置）：文件将被写入，语言将被标记为 `untranslated` 而不是 `ok`（并且在 `succeeded` 之外进行计数），行将被列出，并且运行将以非零状态退出（`translate-readme.mjs` 退出值为 3）。摘要 JSON 包含 `untranslated`、`untranslatedLanguages`、`fallbacks` 和一个 `UNTRANSLATED` 错误。
- **`report`**：列表将被写入，并且运行将以 0 状态退出。这是库 API（`onUntranslated` 选项；结果字段 `untranslated`、`fallbacks`、`retries`）以及 MCP 工具 `translate_markdown`、`translate_all` 和 `translate_readme`（`onUntranslated` 参数）的默认设置，这些工具会将列表附加到其输出中。

如果某个段落仍然是英文，则它将永远不会被缓存，因此 `scripts/pin-translation.mjs` 会固定你手动翻译的散文段落，即使没有 `--include-uncached` 也可以。

**检查无法检测到的内容。** 有四个限制，因此可以准确地读取干净的结果：（1）少于 6 个单词的英文，例如短标题、表格单元格和列表项；（2）标题或一系列专有名词，无法与产品名称区分；（3）仅部分翻译的句子，其中一些单词是目标语言，其余仍然是英文，因为只有当整个句子未更改时，该句子才会被视为未翻译；（4）以错误的语言输出，例如返回西班牙语而不是意大利语，这既不是英文，因此也不会被标记。受保护的代码块永远不会被翻译或检查。

```bash
node scripts/translate-all.mjs README.md                          # --on-untranslated=fail
node scripts/translate-all.mjs README.md --on-untranslated=report
```

### 固定翻译（`.polyglot-pins.json`）
固定的翻译始终有效。`.polyglot-pins.json` 位于缓存旁边；每个条目都以英文段落的哈希值加上目标语言作为键，并保存手动修复的翻译。固定翻译优先于缓存和模型，并且在每次重新运行（包括 `--cache-clear`）时都有效。当英文内容发生更改时，哈希值也会发生更改，因此固定翻译无法超出其所针对的文本的范围。

要固定手动修复的内容，请更正翻译后的文件，然后运行：

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

它会将英文的每个段落与其在更正后的文件中的文本进行配对，并固定所有文本与缓存翻译不同的段落。`--dry-run` 会列出固定翻译，而不会将其写入。`--model=NAME` 设置要与其缓存条目进行比较的模型（默认值：`$POLYGLOT_MODEL` 或 `translategemma:27b`，与脚本相同）。`--include-uncached` 还会固定缓存中没有翻译的段落。提交 `.polyglot-pins.json` 和 `.polyglot-terms.json` 以及 README 文件。

### Ollama Cloud（可选）
将 `OLLAMA_HOST` 设置为发送请求到另一个 Ollama 服务器，而不是 `localhost:11434`。对于 [Ollama Cloud](https://ollama.com)，还应设置 `OLLAMA_API_KEY`：密钥将作为 Bearer 令牌发送，并且仅发送到非环回主机。

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### 并发信号量
所有 Ollama 调用都受到计数信号量的保护（默认限制：1），以防止在 VRAM 资源有限的系统上发生 GPU 内存不足的情况。使用 `POLYGLOT_CONCURRENCY` 进行覆盖：

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### MCP 进度令牌
当客户端提供 `progressToken` 时，所有工具都通过 MCP `notifications/progress` 报告进度。translate 报告每个块的进度，translate_markdown 报告每个段落批次的进度，translate_all 报告每个语言的进度，check_status 报告每个步骤的进度。

### 软件术语表
内置的 12 个技术术语（API、CLI、SDK 等）的术语表可确保软件术语翻译的一致性。可以为每个请求传递自定义术语表条目，并将其与默认值合并。

### 批量翻译
`translateBatch` 尽可能将多个段落组合到一个提示中，从而减少往返次数。如果批处理分隔符出现问题，则回退到单独翻译。

### 可配置的默认模型
默认模型是 `translategemma:27b`。设置 `POLYGLOT_MODEL` 环境变量以使用另一个模型，例如在 VRAM 较少的 GPU 上：

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### 结构化错误
所有错误都使用 `PolyglotError`，并带有机器可读的代码（`MODEL_NOT_FOUND`、`OLLAMA_UNAVAILABLE`、`TRANSLATION_FAILED` 等）、人类可读的消息、可选的提示以及一个 `retryable` 标志。

### 输出验证
每个翻译都会自动进行验证：空输出会引发错误（可重试），源文本回显会被标记，严重的截断和幻觉会导致警告，乱码和模型元注释会被检测到。警告会出现在 MCP 工具的响应中。

### 流式传输
`OllamaClient.generateStream()` 通过 NDJSON 格式输出令牌，就像 Ollama 生成令牌一样。`translate()` 函数接受一个 `onToken` 回调函数，用于实时显示进度。无论是流式处理还是非流式处理，都共享重试逻辑。

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
| **Data touched** | 发送到 Ollama API 的文本——默认情况下为本地（`localhost:11434`），或者如果您设置了主机，则为 `OLLAMA_HOST`。`.polyglot-cache.json` 将分段缓存写入翻译后的文件旁边（仅库和 CLI 使用）。如果存在，则读取 `.polyglot-terms.json` 和 `.polyglot-pins.json`，它们位于翻译后的 README 旁边。 |
| **Files written** | `translate_readme` 将 `README.<lang>.md` 写入您传递的 README 旁边，并刷新该 README 的语言导航栏。`scripts/pin-translation.mjs` 将 `.polyglot-pins.json` 写入 README 旁边。 |
| **Data NOT touched** | 不收集任何浏览器数据、操作系统凭据或超出上述目录范围的数据。 |
| **Network** | 默认情况下，仅通过 HTTP 连接到 `localhost:11434`——零外部数据传输。只有当 `OLLAMA_HOST` 指向其他位置时，才进行远程连接。 |
| **Secrets** | 如果设置了 `OLLAMA_API_KEY`，则从环境变量中读取，并仅作为 Bearer 令牌发送到非环回 `OLLAMA_HOST`；绝不会写入磁盘或记录。 |
| **Telemetry** | 不收集或发送任何数据。 |

有关漏洞报告策略，请参阅 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 570 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## 许可证

MIT——请参阅 [LICENSE](LICENSE)。

> 由 [MCP Tool Shop](https://mcp-tool-shop.github.io/) 构建
