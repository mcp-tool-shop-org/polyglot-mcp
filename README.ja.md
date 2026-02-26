<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center"><img src="logo.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>ローカルGPU翻訳MCPサーバー — 55言語に対応、クラウド依存なし。</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## 機能

[TranslateGemma](https://ollama.com/library/translategemma) を[Ollama](https://ollama.com) を使用して、ローカルのGPU上で動作させ、55言語間のテキスト翻訳を行います。 APIキーも、クラウド接続も、レート制限も不要です。すべてがあなたのマシン上で実行されます。

## 前提条件

1. **[Ollama](https://ollama.com)** がインストールされ、実行中であること (`ollama serve` コマンドで起動)。
2. **TranslateGemma** モデルをダウンロードする:
```bash
ollama pull translategemma:12b   # 8.1 GB — 最高の品質/速度のバランス
# または
ollama pull translategemma:4b    # 3.3 GB — より高速だが、品質は低い
```
3. **Node.js 18+**

## セットアップ

### Claude Code / Claude Desktop

MCPの設定ファイル (`claude_desktop_config.json` または `.mcp.json`) に以下を追加します。

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

### ソースコードから

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## ツール

### `translate`

サポートされている言語ペア間でテキストを翻訳します。

| パラメータ | 必須 | 説明 |
|-----------|----------|-------------|
| `text` | yes | 翻訳するテキスト |
| `from` | yes | ソース言語のコードまたは名前 (例: `en`, `English`) |
| `to` | yes | ターゲット言語のコードまたは名前 (例: `ja`, `Japanese`) |
| `model` | no | Ollamaモデル (デフォルト: `translategemma:12b`) |

### `list_languages`

サポートされている55の言語を、それぞれのコードとともに一覧表示します。

### `check_status`

Ollamaが実行されているかどうか、およびインストールされているTranslateGemmaモデルを確認します。

## サポートされている言語

アフリカーンス語、アルバニア語、アラビア語、ベンガル語、ブルガリア語、カタルーニャ語、中国語（簡体字）、中国語（繁体字）、クロアチア語、チェコ語、デンマーク語、オランダ語、英語、エストニア語、フィンランド語、フランス語、ガリシア語、ドイツ語、ギリシャ語、グジャラート語、ヘブライ語、ヒンディー語、ハンガリー語、インドネシア語、アイルランド語、イタリア語、日本語、カナーダ語、韓国語、ラトビア語、リトアニア語、マケドニア語、マレー語、マラヤーラム語、マルタ語、マラーティー語、ノルウェー語、ペルシア語、ポーランド語、ポルトガル語、ルーマニア語、ロシア語、スコットランド・ゲール語、セルビア語、スロバキア語、スロベニア語、スペイン語、スワヒリ語、スウェーデン語、タミル語、テルグ語、タイ語、トルコ語、ウクライナ語、ウルドゥー語、ベトナム語、ウェールズ語。

## パフォーマンス

RTX 5080 (16 GB VRAM) で、TranslateGemma 12B (Q4) を使用した場合:

| 指標 | Value |
|--------|-------|
| 初回翻訳 (コールドロード) | ~15s |
| その後の翻訳 | 約600ms |
| VRAM使用量 | 約8.1 GB |
| 長いテキスト (チャンク分割) | チャンクあたり約600ms |

## 仕組み

1. MCPクライアント (Claude Codeなど) が `translate` ツールを呼び出します。
2. Polyglot が、ソース/ターゲット言語ペアを使用して TranslateGemma のプロンプトを構築します。
3. プロンプトが、OllamaのローカルHTTP APIに送信されます。
4. Ollama が、GPU上で TranslateGemma を実行し、翻訳結果を返します。
5. 長いテキストの場合、コンテンツは段落/文の境界でチャンクに分割されます。

## ライセンス

MITライセンス — 詳細については、[LICENSE](LICENSE) を参照してください。

> [MCP Tool Shop](https://mcptoolshop.com) の一部
