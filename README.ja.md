<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center"><img src="logo.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>ローカルGPU翻訳サーバー - 55言語に対応、クラウドへの依存なし。</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## その機能・役割

[TranslateGemma](https://ollama.com/library/translategemma)を使用して、55の言語間でテキストを翻訳できます。この機能は、[Ollama](https://ollama.com)を通じて、ローカル環境にあるGPU上で動作します。APIキーは不要で、クラウドサービスも利用せず、レート制限もありません。すべての処理は、お客様のコンピューター上で行われます。

## 前提条件

1. **[Ollama](https://ollama.com)** がインストールされ、実行中であること (`ollama serve` コマンドを実行)。
2. **TranslateGemma** モデルをダウンロードします。
   ```bash
   ollama pull translategemma:12b   # 8.1 GB — 最適な品質と速度のバランス
   # または
   ollama pull translategemma:4b    # 3.3 GB — より高速だが、品質は低い
   ```
3. **Node.js 18 以降** がインストールされていること。

## セットアップ

### Claude コード / Claude デスクトップ版

MCPの設定ファイル（`claude_desktop_config.json` または `.mcp.json`）に以下の項目を追加してください。

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

### 出典より

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## 道具

### `translate`

サポートされている言語ペア間でテキストを翻訳できます。

| パラメータ | 必須です。 | 説明 |
|-----------|----------|-------------|
| `text` | yes | 翻訳するテキスト. |
| `from` | yes | ソース言語のコードまたは名称（例：`en`、`英語`）。 |
| `to` | yes | 対象言語のコードまたは名称（例：`ja`、`日本語`）。 |
| `model` | no | Ollamaモデル（デフォルト：`translategemma:12b`） |

### `list_languages`

サポートされている55の言語と、それぞれの言語コードをすべてリストしてください。

### `check_status`

Ollamaが実行されているか、また、どのTranslateGemmaモデルがインストールされているかを確認してください。

## 対応言語

アフリカーンス語、アルバニア語、アラビア語、ベンガル語、ブルガリア語、カタルーニャ語、簡体字中国語、繁体字中国語、クロアチア語、チェコ語、デンマーク語、オランダ語、英語、エストニア語、フィンランド語、フランス語、ガリシア語、ドイツ語、ギリシャ語、グジャラート語、ヘブライ語、ヒンディー語、ハンガリー語、インドネシア語、アイルランド語、イタリア語、日本語、カンナダ語、韓国語、ラトビア語、リトアニア語、マケドニア語、マレー語、マラヤーラム語、マルタ語、マラーティー語、ノルウェー語、ペルシア語、ポーランド語、ポルトガル語、ルーマニア語、ロシア語、スコットランド・ゲール語、セルビア語、スロバキア語、スロベニア語、スペイン語、スワヒリ語、スウェーデン語、タミル語、テルグ語、タイ語、トルコ語、ウクライナ語、ウルドゥー語、ベトナム語、ウェールズ語。

## パフォーマンス

RTX 5080 (16GBのビデオメモリ搭載) で、TranslateGemma 12B (Q4) を使用した場合：

| メートル法。 | Value |
|--------|-------|
| 最初の翻訳（冷負荷）。 | ~15s |
| その後の翻訳。 | 約600ミリ秒。 |
| VRAMの使用量。 | 約8.1GB |
| 長いテキスト（分割して表示） | 1チャンクあたり約600ミリ秒。 |

## 動作原理

1. あなたのMCPクライアント（Claude Codeなど）が、`translate`ツールを呼び出します。
2. Polyglotが、ソース言語とターゲット言語の組み合わせに基づいて、TranslateGemma用のプロンプトを構築します。
3. そのプロンプトが、OllamaのローカルHTTP APIに送信されます。
4. Ollamaが、あなたのGPU上でTranslateGemmaを実行し、翻訳結果を返します。
5. 長いテキストの場合、内容は段落や文の区切りで分割されます。

## ライセンス

MITライセンス — 詳細については、[LICENSE](LICENSE) をご参照ください。

[MCP Tool Shop](https://mcptoolshop.com) の一部です。
