<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center"><img src="logo.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>本地GPU翻译多核服务器，支持55种语言，无需依赖云端服务。</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## 它的作用

该程序可以在您的GPU上本地运行[TranslateGemma](https://ollama.com/library/translategemma)，从而在55种语言之间进行文本翻译。它不需要API密钥，也不依赖云服务，并且没有速率限制——所有操作都在您的设备上完成。

## 先决条件

1. **[Ollama](https://ollama.com)** 已安装并正在运行 (`ollama serve`)。
2. 下载 **TranslateGemma** 模型：
   ```bash
   ollama pull translategemma:12b   # 8.1 GB — 质量/速度的最佳平衡
   # 或者
   ollama pull translategemma:4b    # 3.3 GB — 速度更快，质量稍低
   ```
3. **Node.js 18 或更高版本**。

## 设置

### Claude 代码 / Claude 桌面版

请将以下内容添加到您的 MCP 配置文件（`claude_desktop_config.json` 或 `.mcp.json`）：

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

### 来自原始数据

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## 工具

### `translate`

可以在任何支持的语言对之间进行文本翻译。

| 参数。 | 必需的。 | 描述。 |
|-----------|----------|-------------|
| `text` | yes | 请提供需要翻译的英文文本。 |
| `from` | yes | 源语言代码或名称（例如：`en`，`英语`）。 |
| `to` | yes | 目标语言的代码或名称（例如：`ja`，日语）。 |
| `model` | no | Ollama 模型 (默认：`translategemma:12b`) |

### `list_languages`

列出所有55种支持的语言及其对应的代码。

### `check_status`

请检查 Ollama 是否正在运行，以及已安装哪些 TranslateGemma 模型。

## 支持的语言

阿法坎语、阿尔巴尼亚语、阿拉伯语、孟加拉语、保加利亚语、加泰罗尼亚语、简体中文、繁体中文、克罗地亚语、捷克语、丹麦语、荷兰语、英语、爱沙尼亚语、芬兰语、法语、加利西亚语、德语、希腊语、古吉拉特语、希伯来语、印地语、匈牙利语、印尼语、爱尔兰语、意大利语、日语、卡纳达语、韩语、拉脱维亚语、立陶宛语、马其顿语、马来语、马拉雅拉姆语、马耳他语、马拉地语、挪威语、波斯语、波兰语、葡萄牙语、罗马尼亚语、俄语、苏格兰盖尔语、塞尔维亚语、斯洛伐克语、斯洛文尼亚语、西班牙语、斯瓦希里语、瑞典语、泰米尔语、泰卢固语、泰语、土耳其语、乌克兰语、乌尔都语、越南语、威尔士语。

## 性能

在搭载 RTX 5080 (16GB 显存) 的系统上，使用 TranslateGemma 12B (Q4) 模型：

| 公制。 | Value |
|--------|-------|
| 首次翻译（冷负荷）。 | ~15s |
| 后续翻译。 | 约600毫秒。 |
| 显存使用情况。 | 约 8.1 GB。 |
| 长文本（分段）。 | 每个数据块的处理时间约为600毫秒。 |

## 工作原理

1. 您的 MCP 客户端（例如 Claude Code 等）会调用 `translate` 工具。
2. Polyglot 会构建一个 TranslateGemma 的提示语，其中包含源语言和目标语言的配对信息。
3. 该提示语会被发送到 Ollama 的本地 HTTP API。
4. Ollama 会在您的 GPU 上运行 TranslateGemma，并将翻译结果返回。
5. 对于较长的文本，内容会被分割成段落或句子级别的片段。

## 许可

MIT 许可协议 — 详情请参见 [LICENSE](LICENSE) 文件。

> 隶属于 [MCP Tool Shop](https://mcptoolshop.com) 。
