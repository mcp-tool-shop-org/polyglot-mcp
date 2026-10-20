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

ローカルのGPU上で[Ollama](https://ollama.com)を使用して、57言語間でテキストを翻訳します。[TranslateGemma](https://ollama.com/library/translategemma)を使用。APIキー、クラウド、レート制限は不要です。デフォルトでは、すべてがローカルマシンに保存されます。[Ollama Cloud](#ollama-cloud-optional)などのリモートOllamaを使用することもできます。

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

> **ヒント:** この手順をスキップできます。Polyglotは、初回使用時にデフォルトのモデル（27B、17GB）を自動的にダウンロードします。GPUが小さい場合は、最初に`POLYGLOT_MODEL=translategemma:12b`を設定してください（[設定可能なデフォルトモデル](#configurable-default-model)を参照）。

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

以上です。Claudeに翻訳を依頼すると、自動的に`translate`ツールが使用されます。

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
| `glossary`  | no       | カスタム用語のオーバーライド（`{"source": "translation"}`など）—組み込みのソフトウェア用語集とマージされます。 |

長いテキストは、段落と文の区切りで自動的に分割され、順番に翻訳され、再構成されます。すべての翻訳は、品質（空の出力、エコー検出、切り捨て、意味不明なテキスト）について検証されます。

### `translate_markdown`

構造を維持しながら、Markdownドキュメント全体を翻訳します。コードブロック、HTML要素、バッジ、URL、テーブルの書式はそのままに、本文（見出し、段落、キャッチフレーズ、テーブルセル）のみを翻訳します。インラインコードと[保護された用語](#protected-terms-polyglot-termsjson)は、翻訳前にプレースホルダーに置き換えられ、翻訳後に復元されるため、コマンド、フラグ、パッケージ名、識別子は、記述されたとおりに正確に表示され、すべての「N of M」のカウントは`N/M`として表示されます。

| パラメータ | 必須 | 説明 |
|--------------|----------|-------------|
| `markdown`   | はい | 翻訳するMarkdownコンテンツ全体 |
| `from`       | はい | ソース言語コードまたは名前 |
| `to`         | はい | ターゲット言語コードまたは名前 |
| `model`      | no       | Ollamaモデル（デフォルト：`translategemma:27b`） |
| `onLostSpan` | no       | `report`（デフォルト）は、翻訳から欠落している保護されたスパンを一覧表示します。`fail`は、それをエラーにします。[生存チェック](#survival-check---on-lost-span)を参照してください。 |

### `list_languages`

サポートされているすべての57言語とそのコードを一覧表示します。

### `check_status`

Ollamaが実行されているかどうか、およびどのTranslateGemmaモデルがインストールされているかを確認します。Ollamaが実行されていない場合は、自動的に起動を試みます。

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
| `onLostSpan`  | no       | `report`（デフォルト）は、言語ごとに失われた保護されたスパンを一覧表示します。`fail`は、いずれかの言語に失われたスパンがある場合、エラーにします。 |

### `translate_readme`

Translate a README.md **file** into the same 7 languages and write the `README.<lang>.md` files next to it, refreshing the language nav bar in the source README and in each translation. Returns a per-language status summary (ok/fail, timings, files written) rather than the translated text; use `translate_markdown` when you want the content back.

| パラメータ | 必須 | 説明 |
|---------------|----------|-------------|
| `readmePath`  | はい | ソースREADME.mdファイルへの絶対パス |
| `tier`        | no       | `quality`（`translategemma:27b`、デフォルト）、`bulk`（`12b`）、または`draft`（`2b`）。`model`が設定されている場合は無視されます。 |
| `model`       | no       | 明示的なOllamaモデル。`tier`をオーバーライドします。 |
| `languages`   | no       | ターゲット言語コードのサブセット（デフォルト：すべて7言語） |
| `concurrency` | no       | 最大同時翻訳数（デフォルト：2、最大：3） |
| `navBar`      | no       | 言語ナビゲーションバーを挿入または更新します（デフォルト：true） |
| `onLostSpan`  | no       | `report`（デフォルト）は、すべてのファイルを書き込み、失われた保護されたスパンを一覧表示します。`fail`は、いずれかの言語に書き込まれていないスパンがある場合、エラーにします。 |

`translate_readme`は、READMEの`.polyglot-terms.json`と`.polyglot-pins.json`が存在する場合は読み込みます。

## 機能

### 自動起動と自動ダウンロード
Ollamaが実行されていない場合は、自動的に起動します。TranslateGemmaモデルがインストールされていない場合は、自動的にダウンロードします。手動での設定は不要です。

### 指数バックオフによる再試行
一時的なOllamaのエラー（ネットワークの断続的な問題、一時的な過負荷）は、指数バックオフ（1秒、2秒）で最大2回自動的に再試行されます。再試行できないエラー（無効なモデル名、無効な入力）は、すぐに失敗します。

### スマートチャンキング
長いテキストは、自然な区切り（段落、次に文）で分割されるため、翻訳のコンテキストが維持されます。チャンクサイズはモデルに適合します。2B/4Bモデルの場合は2K文字、12Bの場合は4K、27Bの場合は6Kです。

### セグメントキャッシュ
Translated segments are cached by content hash (SHA-256 of the masked source text + target language + model, plus a hash of the protected-term rules that matched in the segment). Unchanged segments skip re-translation entirely, so re-running a translation after an edit touches only what changed. Adding a protected term changes the key of every segment containing it, so a cached translation that respelled the term is not replayed; other segments keep their keys. The cache lives in `.polyglot-cache.json` next to the source file, with a 30-day TTL. It is used by the `translateMarkdown` library API when given a `filePath` (and by the repo's `scripts/translate-*.mjs` CLI); the MCP tools translate without it.

複数の実行で、1つのキャッシュファイルを共有できます。各保存操作では、ロック下で自身の変更のみをファイルにマージし、アトミックにファイルを置き換えるため、並行して翻訳された言語は互いのエントリを保持し、ある言語のキャッシュをクリアしても、他の言語には影響しません。

### 翻訳メモリ（ファジーキャッシュ）
正確なキャッシュヒットが見つからない場合、キャッシュされた翻訳は、そのソースが新しいものと空白のレイアウトのみ異なる場合に再利用されます。具体的には、行内のスペース、両端の空白、またはCRLFとLFの違いです。その他の編集（変更された単語、数字、句読点、大文字と小文字、インラインコードの範囲など）は再翻訳されます。キャッシュされた翻訳は、そのソースの翻訳であるため、編集されたテキストに対して再利用すると、古い表現が使用されてしまいます。

### 保護された用語（`.polyglot-terms.json`）
TranslateGemmaは、別のスクリプトでベア識別子を再構成します。例えば、ヒンディー語のREADMEファイルでは、`XLS-30`が`एक्सएलएस-30`、`Kimi-K3`が`किमी-के3`として記述されます。また、数値も変更します。中国語では、「218/224」が「224/218」に変換されます。したがって、文章中の識別子は、インラインコードの範囲のようにマスクされます。各識別子は、翻訳前には文字を含まないプレースホルダーに置き換えられ、翻訳後は元の状態に戻されます。デフォルトは次のとおりです。

| パターン | マスク | 変更しない |
|---------|-------|--------------|
| `url` | `https://…`（空白、引用符、括弧、またはバッククォートまで） | |
| `caps-id` | ALL-CAPS（数字を含むトークン、または`-`または`_`で結合された大文字）：`XLS-30`、`HOST_REJECTED`、`SHA-256`、`ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCaseおよびmixedCaseの単語：`DepositAuth`、`AMMCreate`、`mixedCase`、`SoulX-Singer` | `URLs`、`IDs`、`GPUs`、通常の先頭が大文字の単語 |
| `model-id` | 文字と数字を含むモデルおよび製品ID：`Kimi-K3`、`gemma4:31b`、`Qwen2.5-32B` | `Node.js`, `top-10` |

"N of M" in prose and table cells (`218 of 224`) is masked as one span and restored as `218/224` in every language, which reads correctly everywhere and cannot be reversed or turned into an ordinal. A table cell that is only a count is not sent to the model at all.

リポジトリは、READMEの横に独自の用語を`.polyglot-terms.json`として追加します。すべてのフィールドはオプションです。

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms`は、正確な大文字と小文字を区別する文字列であり、完全な単語として一致します。`patterns`は、JavaScriptの正規表現です。どちらもデフォルトに追加されます。`disable`は、名前でデフォルトをオフにし、`"nOfM": false`は、カウントルールをオフにします。解析できないファイルは、要求された用語なしで翻訳するのではなく、`CONFIG_ERROR`で実行を停止します。

### 生存チェック（`--on-lost-span`）
翻訳後、すべてのターゲットファイルは英語と比較してチェックされます。各保護された範囲（インラインコード範囲、保護された用語、および各カウントを`N/M`として）は、そのセグメントの翻訳に文字ごとに存在する必要があります。各表のセルは、ソースセルと同じ数値を保持する必要があります。これは、順序に関係なく、マルチセットとして比較されます。例えば、中国語で「218/224」を正しく翻訳するには、合計を最初に配置します（`224 首中的 218 首`）。したがって、順序チェックでは正しい答えが誤ってフラグが立てられます。他のスクリプトからの数字は、比較する前に正規化されます。ファイルは、フェンスで囲まれたコードブロックとインラインコード範囲も保持する必要があります。

`--on-lost-span=fail|report`は、何かが失われた場合に何が起こるかを決定します。

- **`fail`**: the run exits non-zero with a list of language, segment and missing span. This is the default for `scripts/translate-all.mjs`, which runs before releases. The files are still written, so they can be fixed by hand and pinned. The summary JSON carries the list and a `LOST_SPAN` error in the usual `PolyglotError` shape (`code`, `message`, `hint`, `retryable`).
- **`report`**: the list is written and the run exits 0. This is the default for the MCP tools (`onLostSpan` parameter) and the `translateMarkdown` library API (`onLostSpan` option, result field `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### 固定された翻訳（`.polyglot-pins.json`）
固定された翻訳は常に優先されます。`.polyglot-pins.json`はキャッシュの横に配置されます。各エントリは、英語のセグメントのハッシュとターゲット言語によってキーが設定され、手動で修正された翻訳が格納されます。固定された翻訳は、キャッシュとモデルよりも優先され、すべての再実行（`--cache-clear`を含む）で保持されます。英語が変更されると、ハッシュも変更されるため、固定された翻訳は、記述されたテキストよりも長く存在することはできません。

手動での修正を固定するには、翻訳されたファイルを修正してから、次を実行します。

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

英語の各セグメントと、修正されたファイル内の対応するテキストをペアにし、キャッシュされた翻訳と異なるテキストを持つすべてのセグメントを固定します。`--dry-run`は、書き込まずに固定された翻訳のリストを表示します。`--model=NAME`は、キャッシュエントリを比較するモデルを設定します（デフォルト：`$POLYGLOT_MODEL`または`translategemma:27b`、スクリプトと同じ）。`--include-uncached`は、キャッシュに翻訳がないセグメントも固定します。READMEとともに、`.polyglot-pins.json`と`.polyglot-terms.json`をコミットします。

### Ollama Cloud（オプション）
`OLLAMA_HOST`を設定して、`localhost:11434`の代わりに別のOllamaサーバーにリクエストを送信します。［Ollama Cloud］（https://ollama.com）の場合は、`OLLAMA_API_KEY`も設定します。キーは、Bearerトークンとして送信され、ループバック以外のホストにのみ送信されます。

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### 同時実行セマフォ
すべてのOllama呼び出しは、カウンティングセマフォ（デフォルト制限：1）によって保護され、VRAMが限られているシステムでのGPUのOOM（メモリ不足）を防ぎます。`POLYGLOT_CONCURRENCY`でオーバーライドします。

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### MCPプログレストークン
All tools report progress via MCP `notifications/progress` when the client provides a `progressToken`. Translate reports per-chunk, translate_markdown per-segment-batch, translate_all per-language, and check_status per-step.

### ソフトウェア用語集
12の技術用語（API、CLI、SDKなど）を組み込んだ用語集により、ソフトウェア用語の一貫した翻訳が保証されます。カスタム用語集エントリは、リクエストごとに渡すことができ、デフォルトに追加されます。

### バッチ翻訳
`translateBatch`は、可能な限り複数のセグメントを1つのプロンプトにグループ化し、ラウンドトリップを削減します。バッチ区切り文字が破損している場合は、個別の翻訳にフォールバックします。

### 構成可能なデフォルトモデル
デフォルトモデルは`translategemma:27b`です。別のモデルを使用するには、環境変数`POLYGLOT_MODEL`を設定します。たとえば、VRAMが少ないGPUの場合：

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### 構造化されたエラー
すべてのエラーは、機械可読のコード（`MODEL_NOT_FOUND`、`OLLAMA_UNAVAILABLE`、`TRANSLATION_FAILED`など）、人間が読めるメッセージ、オプションのヒント、および`retryable`フラグを持つ`PolyglotError`を使用します。

### 出力検証
すべての翻訳は自動的に検証されます。空の出力はエラー（再試行可能）、ソーステキストのエコーは警告、重大な切り捨てや誤った内容の生成は注意喚起、文字化けやモデルのメタコメントは検出されます。警告は、MCPツールの応答に表示されます。

### ストリーミング
`OllamaClient.generateStream()`は、Ollamaが生成したトークンをNDJSON形式で出力します。`translate()`関数は、リアルタイムの進捗状況を表示するための`onToken`コールバックを受け入れます。ストリーミングと非ストリーミングの両方のパスで、再試行ロジックが共有されます。

## サポートされている言語

アフリカーンス語、アルバニア語、アラビア語、ベンガル語、ブルガリア語、カタロニア語、中国語（簡体字）、中国語（繁体字）、クロアチア語、チェコ語、デンマーク語、オランダ語、英語、エストニア語、フィンランド語、フランス語、ガリシア語、ドイツ語、ギリシャ語、グジャラート語、ヘブライ語、ヒンディー語、ハンガリー語、インドネシア語、アイルランド語、イタリア語、日本語、カンナダ語、韓国語、ラトビア語、リトアニア語、マケドニア語、マレー語、マラヤーラム語、マルタ語、マラーティー語、ノルウェー語、ペルシャ語、ポーランド語、ポルトガル語、ルーマニア語、ロシア語、スコットランド・ゲール語、セルビア語、スロバキア語、スロベニア語、スペイン語、スワヒリ語、スウェーデン語、タミル語、テルグ語、タイ語、トルコ語、ウクライナ語、ウルドゥー語、ベトナム語、ウェールズ語。

## パフォーマンス

| 指標 | 27B（デフォルト）、RTX 5090 32 GB | 12B（Q4）、RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| 最初の翻訳（コールドモデルの読み込み） | 約30秒 | 約15秒 |
| その後の翻訳 | READMEセグメントのバッチあたり約1〜2秒 | 約600ミリ秒 |
| モデルメモリ | 17 GB、GPU上に完全に配置（`ollama ps`による報告） | 約8.1 GB |

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

## セキュリティとデータ範囲

| 側面 | 詳細 |
|--------|--------|
| **Data touched** | Ollama APIに送信されるテキスト — デフォルトではローカル（`localhost:11434`）、または`OLLAMA_HOST`を設定した場合はホスト。翻訳されたファイルの隣に`.polyglot-cache.json`セグメントキャッシュ（ライブラリとCLIのみで使用）。翻訳されたREADMEの隣に`.polyglot-terms.json`と`.polyglot-pins.json`がある場合は、それらが読み込まれます。 |
| **Files written** | `translate_readme`は、渡されたREADMEの隣に`README.<lang>.md`を書き込み、そのREADMEの言語ナビゲーションバーを更新します。`scripts/pin-translation.mjs`は、READMEの隣に`.polyglot-pins.json`を書き込みます。 |
| **Data NOT touched** | ブラウザデータ、OSの認証情報、上記のディレクトリ外のものは一切使用しません。 |
| **Network** | デフォルトでは、HTTPは`localhost:11434`にのみ送信されます — 外部への送信はゼロ。リモートへの送信は、`OLLAMA_HOST`が別の場所を指す場合にのみ行われます。 |
| **Secrets** | 設定されている場合、`OLLAMA_API_KEY`は環境から読み取られ、ループバック以外の`OLLAMA_HOST`にベアラートークンとしてのみ送信されます。ディスクに書き込んだり、ログに記録したりすることはありません。 |
| **Telemetry** | 収集または送信されるデータはありません。 |

脆弱性報告ポリシーについては、[SECURITY.md](SECURITY.md)を参照してください。

## 開発

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 435 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## ライセンス

MIT — [LICENSE](LICENSE)を参照してください。

> [MCP Tool Shop](https://mcp-tool-shop.github.io/)によって構築されました。
