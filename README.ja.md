<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## このツールでできること

[TranslateGemma](https://ollama.com/library/translategemma) を使用して、55の言語間でテキストを翻訳します。TranslateGemmaは、[Ollama](https://ollama.com) を介して、ローカルのGPUで実行されます。APIキーは不要で、クラウドも使用せず、レート制限もありません。すべてがあなたのマシン上で動作します。

## クイックスタート

### 1. Ollamaをインストールする

[ollama.com](https://ollama.com) からダウンロードし、起動します。

```bash
ollama serve
```

### 2. モデルをダウンロードする

```bash
ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
# or
ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
# or
ollama pull translategemma:27b   # 17 GB  — highest quality
```

**ヒント:** このステップはスキップできます。Polyglotは、初回使用時に自動的にモデルをダウンロードします。

### 3. MCPクライアントに追加する

**Claude Code / Claude Desktop:** `claude_desktop_config.json` または `.mcp.json` に追加します。

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

**ソースコードから:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

これで完了です。Claudeに翻訳させると、`translate` ツールが自動的に使用されます。

## ツール

Polyglotは、以下の3つのMCPツールを提供します。

### `translate`

任意のサポートされている言語ペア間でテキストを翻訳します。

| パラメータ | 必須 | 説明 |
|-------------|----------|-------------|
| `text`      | はい | 翻訳するテキスト |
| `from`      | はい | ソース言語コードまたは名前 (例: `en`, `English`) |
| `to`        | はい | ターゲット言語コードまたは名前 (例: `ja`, `Japanese`) |
| `model`     | no       | Ollamaモデル (デフォルト: `translategemma:12b`) |
| `glossary`  | no       | カスタム用語のオーバーライドを `{"source": "translation"}` の形式で指定します。これは、組み込みのソフトウェア用語集とマージされます。 |

長いテキストは、自動的に段落と文の境界でチャンクに分割され、順番に翻訳され、再構成されます。

### `list_languages`

サポートされている55の言語とそのコードをすべてリストします。

### `check_status`

Ollamaが実行されているかどうか、およびどのTranslateGemmaモデルがインストールされているかを確認します。Ollamaが実行されていない場合は、自動的に起動を試みます。

## 機能

### 自動起動と自動ダウンロード
Ollamaが実行されていない場合は、自動的に起動します。TranslateGemmaモデルがインストールされていない場合は、自動的にダウンロードします。手動での設定は不要です。

### 指数関数的なバックオフを使用した再試行
一時的なOllamaのエラー (ネットワークの問題、一時的な過負荷) は、最大2回、指数関数的なバックオフ (1秒、2秒) を使用して自動的に再試行されます。回復不能なエラー (モデル名の誤り、無効な入力) は、すぐにエラーとなります。

### スマートなチャンキング
長いテキストは、翻訳の文脈を維持するために、自然な境界 (段落、文) で分割されます。チャンクのサイズは、モデルに応じて調整されます。2B/4Bモデルの場合は2KB、12Bの場合は4KB、27Bの場合は6KBです。

### セグメントキャッシュ
翻訳されたセグメントは、コンテンツハッシュ (ソーステキスト + ターゲット言語 + モデルのSHA-256) でキャッシュされます。変更されていないセグメントは、再翻訳を完全にスキップします。キャッシュは、30日間のTTLを持つ `.polyglot-cache.json` に保存されます。

### ソフトウェア用語集
12の技術用語 (API、CLI、SDKなど) を含む組み込み用語集により、ソフトウェア用語の一貫した翻訳が保証されます。カスタム用語集のエントリは、リクエストごとに指定でき、デフォルト値とマージされます。

### バッチ翻訳
`translateBatch` は、可能な限り複数のセグメントを1つのプロンプトにまとめ、ラウンドトリップの回数を減らします。バッチ区切り文字が破損している場合は、個別の翻訳にフォールバックします。

### 設定可能なデフォルトモデル
`POLYGLOT_MODEL` 環境変数を設定して、デフォルトモデルをオーバーライドできます。

```bash
POLYGLOT_MODEL=translategemma:27b npx @mcptoolshop/polyglot-mcp
```

### 構造化されたエラー
すべてのエラーは `PolyglotError` を使用し、機械可読なコード (`MODEL_NOT_FOUND`、`OLLAMA_UNAVAILABLE`、`TRANSLATION_FAILED` など)、人間が読めるメッセージ、オプションのヒント、および `retryable` フラグが含まれます。

## サポートされている言語

アフリカーンス語、アルバニア語、アラビア語、ベンガル語、ブルガリア語、カタルーニャ語、簡体字中国語、繁体字中国語、クロアチア語、チェコ語、デンマーク語、オランダ語、英語、エストニア語、フィンランド語、フランス語、ガリシア語、ドイツ語、ギリシャ語、グジャラート語、ヘブライ語、ヒンディー語、ハンガリー語、インドネシア語、アイルランド語、イタリア語、日本語、カンナダ語、韓国語、ラトビア語、リトアニア語、マケドニア語、マレー語、マラヤーラム語、マルタ語、マラーティー語、ノルウェー語、ペルシア語、ポーランド語、ポルトガル語、ルーマニア語、ロシア語、スコットランド・ゲール語、セルビア語、スロバキア語、スロベニア語、スペイン語、スワヒリ語、スウェーデン語、タミル語、テルグ語、タイ語、トルコ語、ウクライナ語、ウルドゥー語、ベトナム語、ウェールズ語。

## パフォーマンス

RTX 5080 (16 GB VRAM) で、TranslateGemma 12B (Q4) を使用した場合：

| 指標 | 値 |
|--------|-------|
| 初回翻訳（モデルの初回読み込み時） | 約15秒 |
| その後の翻訳 | 約600ミリ秒 |
| VRAM 使用量 | 約8.1 GB |
| 長いテキスト（1つのチャンクあたり） | 約600ミリ秒 |

## アーキテクチャ

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

## セキュリティとデータ範囲

| 側面 | 詳細 |
|--------|--------|
| **Data touched** | ローカルの Ollama API (`localhost:11434`) に送信されるテキスト、`.polyglot-cache.json` のセグメントキャッシュ |
| **Data NOT touched** | 作業ディレクトリ外のファイルはなし、ブラウザのデータはなし、OS の認証情報はなし |
| **Network** | `localhost:11434` への HTTP 通信のみ — 外部/インターネットへのデータ送信はゼロ |
| **Telemetry** | 収集または送信されるものなし |

脆弱性報告ポリシーについては、[SECURITY.md](SECURITY.md) を参照してください。

## 開発

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 114 unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## ライセンス

MIT — [LICENSE](LICENSE) を参照してください。

> [MCP Tool Shop](https://mcp-tool-shop.github.io/) が作成しました。
