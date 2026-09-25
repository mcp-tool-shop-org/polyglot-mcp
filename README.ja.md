<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>ローカルGPU翻訳MCPサーバー — 57言語に対応、クラウドへの依存なし。</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="node 20+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## 機能

ローカルのGPU上で[Ollama](https://ollama.com)を使用して、[TranslateGemma](https://ollama.com/library/translategemma)を実行し、57言語間でテキストを翻訳します。APIキー、クラウド、レート制限は不要です。デフォルトでは、すべてがローカルマシンに保存されます。オプションで、[Ollama Cloud](#ollama-cloud-optional)などのリモートOllamaを使用することもできます。

## クイックスタート

### 1. Ollamaをインストールします

[ollama.com](https://ollama.com)からダウンロードして起動します。

```bash
ollama serve
```

### 2. モデルをダウンロードします

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **ヒント:** この手順はスキップできます。Polyglotは、初回使用時にデフォルトモデル（27B、17GB）を自動的にダウンロードします。GPUが小さい場合は、最初に`POLYGLOT_MODEL=translategemma:12b`を設定してください（[設定可能なデフォルトモデル](#configurable-default-model)を参照）。

### 3. MCPクライアントに追加します

**Claude Code / Claude Desktop** — `claude_desktop_config.json`または`.mcp.json`に追加します。

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

**ソースから:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

これだけです。Claudeに何かを翻訳するように依頼すると、自動的に`translate`ツールが使用されます。

## ツール

Polyglotは、6つのMCPツールを提供します。

### `translate`

サポートされている言語ペア間でテキストを翻訳します。

| パラメータ | 必須 | 説明 |
|-------------|----------|-------------|
| `text`      | はい | 翻訳するテキスト |
| `from`      | はい | ソース言語コードまたは名前（例：`en`、`English`） |
| `to`        | はい | ターゲット言語コードまたは名前（例：`ja`、`Japanese`） |
| `model`     | no       | Ollamaモデル（デフォルト：`translategemma:27b`） |
| `glossary`  | no       | カスタム用語のオーバーライド（例：`{"source": "translation"}`）—組み込みのソフトウェア用語集とマージされます。 |

長いテキストは、段落と文の境界で自動的に分割され、順番に翻訳され、再構成されます。すべての翻訳は、品質（空の出力、エコー検出、切り捨て、意味不明なテキスト）について検証されます。

### `translate_markdown`

構造を維持しながら、Markdownドキュメント全体を翻訳します。コードブロック、HTML要素、バッジ、URL、テーブルの書式はそのままに、本文（見出し、段落、キャッチフレーズ、テーブルセル）のみが翻訳されます。インラインコードは、翻訳前にプレースホルダーに置き換えられ、翻訳後に復元されるため、コマンド、フラグ、パッケージ名、識別子は、記述されたとおりにそのまま表示されます。

| パラメータ | 必須 | 説明 |
|-------------|----------|-------------|
| `markdown`  | はい | 翻訳するMarkdownコンテンツ全体 |
| `from`      | はい | ソース言語コードまたは名前 |
| `to`        | はい | ターゲット言語コードまたは名前 |
| `model`     | no       | Ollamaモデル（デフォルト：`translategemma:27b`） |

### `list_languages`

サポートされている57言語とそのコードをすべてリストします。

### `check_status`

Ollamaが実行されているかどうか、およびインストールされているTranslateGemmaモデルを確認します。Ollamaが実行されていない場合は、自動的に起動を試みます。

### `translate_all`

Markdownコンテンツを一度に複数の言語に翻訳します（デフォルト：7 — 日本語、中国語、スペイン語、フランス語、ヒンディー語、イタリア語、ポルトガル語）。GPUに安全なセマフォア制限を使用して、翻訳を並行して実行します。

| パラメータ | 必須 | 説明 |
|---------------|----------|-------------|
| `markdown`    | はい | 翻訳するMarkdownコンテンツ全体 |
| `from`        | no       | ソース言語コード（デフォルト：`en`） |
| `languages`   | no       | ターゲット言語コードの配列（デフォルト：すべて7言語） |
| `model`       | no       | Ollamaモデル（デフォルト：`translategemma:27b`） |
| `concurrency` | no       | 最大同時翻訳数（デフォルト：2、最大：3） |
| `navBar`      | no       | 言語ナビゲーションバーを挿入するかどうか（デフォルト：true） |

### `translate_readme`

Translate a README.md **file** into the same 7 languages and write the `README.<lang>.md` files next to it, refreshing the language nav bar in the source README and in each translation. Returns a per-language status summary (ok/fail, timings, files written) rather than the translated text; use `translate_markdown` when you want the content back.

| パラメータ | 必須 | 説明 |
|---------------|----------|-------------|
| `readmePath`  | はい | ソースREADME.mdファイルへの絶対パス |
| `tier`        | no       | `quality`（`translategemma:27b`、デフォルト）、`bulk`（`12b`）、または`draft`（`2b`）。`model`が設定されている場合は無視されます。 |
| `model`       | no       | 明示的なOllamaモデル。`tier`をオーバーライドします。 |
| `languages`   | no       | ターゲット言語コードのサブセット（デフォルト：すべて7言語） |
| `concurrency` | no       | 最大同時翻訳数（デフォルト：2、最大：3） |
| `navBar`      | no       | 言語ナビゲーションバーを挿入または更新するかどうか（デフォルト：true） |

## 機能

### 自動起動と自動ダウンロード
Ollamaが実行されていない場合は、自動的に起動します。TranslateGemmaモデルがインストールされていない場合は、自動的にダウンロードします。手動での設定は不要です。

### 指数バックオフによる再試行
一時的なOllamaのエラー（ネットワークの断続的な問題、一時的な過負荷）は、指数バックオフ（1秒、2秒）で最大2回自動的に再試行されます。再試行できないエラー（無効なモデル名、無効な入力）は、すぐに失敗します。

### スマートチャンキング
長いテキストは、自然な境界（段落、次に文）で分割されるため、翻訳のコンテキストが保持されます。チャンクサイズはモデルに適合します。2B/4Bモデルの場合は2K文字、12Bの場合は4K、27Bの場合は6Kです。

### セグメントキャッシュ
翻訳されたセグメントは、コンテンツハッシュ（ソーステキスト+ターゲット言語+モデルのSHA-256）によってキャッシュされます。変更されていないセグメントは、再翻訳を完全にスキップするため、編集後に翻訳を再実行しても、変更された部分のみが処理されます。キャッシュは、ソースファイルの横の`.polyglot-cache.json`に保存され、TTLは30日です。これは、`filePath`が与えられた場合に、`translateMarkdown`ライブラリAPIで使用されます（およびリポジトリの`scripts/translate-*.mjs`CLIで使用されます）。MCPツールは、これを使用せずに翻訳します。

複数の実行で1つのキャッシュファイルを共有できます。各保存操作は、ロック下でファイルに独自の変更をマージし、ファイルをアトミックに置き換えるため、並行して翻訳された言語は互いのエントリを保持し、1つの言語のキャッシュをクリアしても、他の言語には影響しません。

### 翻訳メモリ（ファジーキャッシュ）
正確なキャッシュヒットが見つからない場合、キャッシュされた翻訳は、ソースが新しいものと空白のレイアウトのみ異なる場合に再利用されます。具体的には、行内の間隔、両端の空白、またはCRLFとLFの違いです。その他の編集（変更された単語、数字、句読点、大文字と小文字、インラインコード）は再翻訳されます。キャッシュされた翻訳は、そのソースの翻訳であるため、編集されたテキストに再利用すると、古い表現が使用されることになります。

### Ollama Cloud（オプション）
別のOllamaサーバーにリクエストを送信するように、`OLLAMA_HOST`を設定します。デフォルトは`localhost:11434`です。［Ollama Cloud］（[https://ollama.com](https://ollama.com)）の場合、`OLLAMA_API_KEY`も設定します。キーはBearerトークンとして送信され、ループバック以外のホストにのみ送信されます。

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### 同時実行セマフォ
すべてのOllama呼び出しは、カウンティングセマフォ（デフォルト制限：1）によって保護され、VRAMが限られているシステムでのGPUのメモリ不足を防ぎます。`POLYGLOT_CONCURRENCY`でオーバーライドします。

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### MCPプログレストークン
クライアントが`progressToken`を提供した場合、すべてのツールはMCP `notifications/progress`を介して進捗状況を報告します。チャンクごとにレポートを翻訳し、translate_markdownはセグメントバッチごとに、translate_allは言語ごとに、check_statusはステップごとに翻訳します。

### ソフトウェア用語集
12個の技術用語（API、CLI、SDKなど）を内蔵した用語集により、ソフトウェア用語の一貫した翻訳が保証されます。カスタム用語集エントリは、リクエストごとに渡すことができ、デフォルトとマージされます。

### バッチ翻訳
`translateBatch`は、可能な限り複数のセグメントを1つのプロンプトにグループ化し、往復回数を減らします。バッチ区切り文字が破損している場合は、個別の翻訳にフォールバックします。

### 構成可能なデフォルトモデル
デフォルトモデルは`translategemma:27b`です。別のモデルを使用するには、`POLYGLOT_MODEL`環境変数を設定します。たとえば、VRAMが少ないGPUの場合：

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### 構造化されたエラー
すべてのエラーは、機械可読のコード（`MODEL_NOT_FOUND`、`OLLAMA_UNAVAILABLE`、`TRANSLATION_FAILED`など）、人間が読めるメッセージ、オプションのヒント、および`retryable`フラグを持つ`PolyglotError`を使用します。

### 出力検証
すべての翻訳は自動的に検証されます。空の出力はエラー（再試行可能）をスローし、ソーステキストのエコーはフラグが立てられ、深刻な切り捨てと幻覚は警告され、文字化けとモデルのメタコメントは検出されます。警告は、MCPツールの応答に表示されます。

### ストリーミング
`OllamaClient.generateStream()`は、Ollamaが生成するトークンをNDJSON形式で出力します。`translate()`関数は、リアルタイムの進捗状況表示のための`onToken`コールバックを受け入れます。ストリーミングと非ストリーミングの両方のパスで、再試行ロジックが共有されます。

## サポートされている言語

アフリカーンス語、アルバニア語、アラビア語、ベンガル語、ブルガリア語、カタロニア語、中国語（簡体字）、中国語（繁体字）、クロアチア語、チェコ語、デンマーク語、オランダ語、英語、エストニア語、フィンランド語、フランス語、ガリシア語、ドイツ語、ギリシャ語、グジャラート語、ヘブライ語、ヒンディー語、ハンガリー語、インドネシア語、アイルランド語、イタリア語、日本語、カンナダ語、韓国語、ラトビア語、リトアニア語、マケドニア語、マレー語、マラヤーラム語、マルタ語、マラティ語、ノルウェー語、ペルシャ語、ポーランド語、ポルトガル語、ルーマニア語、ロシア語、スコットランド・ゲール語、セルビア語、スロバキア語、スロベニア語、スペイン語、スワヒリ語、スウェーデン語、タミル語、テルグ語、タイ語、トルコ語、ウクライナ語、ウルドゥー語、ベトナム語、ウェールズ語。

## パフォーマンス

| 指標 | 27B（デフォルト）、RTX 5090 32 GB | 12B（Q4）、RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| 最初の翻訳（コールドモデルのロード） | 約30秒 | 約15秒 |
| 後続の翻訳 | READMEセグメントのバッチあたり約1〜2秒 | 約600ミリ秒 |
| モデルメモリ | 17 GB、GPU上に完全に配置（`ollama ps`で報告されるように） | 約8.1 GB |

## アーキテクチャ

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

## セキュリティとデータ範囲

| 側面 | 詳細 |
|--------|--------|
| **Data touched** | Ollama APIに送信されるテキスト — デフォルトではローカル（`localhost:11434`）、または`OLLAMA_HOST`を設定した場合は、そのホスト。翻訳されたファイルの隣に`.polyglot-cache.json`セグメントキャッシュ（ライブラリとCLIのみで使用）。 |
| **Files written** | `translate_readme`は、渡されたREADMEの隣に`README.<lang>.md`を書き込み、そのREADMEの言語ナビゲーションバーを更新します。 |
| **Data NOT touched** | ブラウザデータ、OSの認証情報、上記のディレクトリ外のものは一切使用しません。 |
| **Network** | デフォルトでは、HTTPは`localhost:11434`にのみ送信されます — 外部への送信はゼロです。リモートは、`OLLAMA_HOST`が他の場所を指す場合にのみ使用されます。 |
| **Secrets** | 設定されている場合、`OLLAMA_API_KEY`は環境から読み取られ、ループバック以外の`OLLAMA_HOST`にBearerトークンとしてのみ送信されます。ディスクに書き込んだり、ログに記録したりすることはありません。 |
| **Telemetry** | 収集または送信されるデータはありません。 |

脆弱性報告ポリシーについては、[SECURITY.md](SECURITY.md)を参照してください。

## 開発

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 362 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## ライセンス

MIT — [LICENSE](LICENSE)を参照してください。

> [MCP Tool Shop](https://mcp-tool-shop.github.io/)によって作成されました。
