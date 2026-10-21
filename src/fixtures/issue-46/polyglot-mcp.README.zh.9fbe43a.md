<!-- Extract of mcp-tool-shop-org/polyglot-mcp README.zh.md at 9fbe43a: the ATX headings and the 4 in-page anchor lines. -->

## 功能

使用在您的 GPU 上本地运行的 [TranslateGemma](https://ollama.com/library/translategemma) 将文本翻译成 57 种语言，通过 [Ollama](https://ollama.com)。无需 API 密钥、云服务或速率限制——默认情况下，所有内容都保留在您的机器上。您可以选择使用远程 Ollama，例如 [Ollama Cloud](#ollama-cloud-optional)。

## 快速入门

### 1. 安装 Ollama

### 2. 拉取模型

> **提示：**您可以跳过此步骤——Polyglot 在首次使用时会自动拉取默认模型（27B，17 GB）。如果您的 GPU 较小，请首先设置 `POLYGLOT_MODEL=translategemma:12b`（请参阅[可配置的默认模型](#configurable-default-model)）。

### 3. 添加到您的 MCP 客户端

## 工具

### `translate`

### `translate_markdown`

翻译整个 Markdown 文档，同时保留结构。代码块、HTML 元素、徽章、URL 和表格格式将保持不变——只有散文内容（标题、段落、标语、表格单元格）会被翻译。行内代码片段和[受保护的术语](#protected-terms-polyglot-termsjson) 在翻译之前会被替换为占位符，并在翻译之后恢复，因此命令、标志、包名称和标识符将完全按照书写方式返回，并且每个“N of M”计数都将返回为 `N/M`。

| 参数 | 必需 | 描述 |
|--------------|----------|-------------|
| `onLostSpan` | no       | `report`（默认）列出翻译中缺少的受保护的片段；`fail` 将其视为错误。请参阅[生存检查](#survival-check---on-lost-span) |

### `list_languages`

### `check_status`

### `translate_all`

### `translate_readme`

## 特性

### 自动启动和自动拉取

### 带有指数退避的重试

### 智能分块

### 片段缓存

### 翻译记忆（模糊缓存）

### 受保护的术语（`.polyglot-terms.json`）

### 生存检查（`--on-lost-span`）

### 固定的翻译（`.polyglot-pins.json`）

### Ollama Cloud（可选）

### 并发信号量

### MCP 进度令牌

### 软件术语表

### 批量翻译

### 可配置的默认模型

### 结构化错误

### 输出验证

### 流式传输

## 支持的语言

## 性能

## 架构

## 安全与数据范围

## 开发

## 许可证
