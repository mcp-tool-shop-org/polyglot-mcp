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

57言語間でテキストを翻訳します。GPU上でローカルに実行される[TranslateGemma](https://ollama.com/library/translategemma)を使用し、[Ollama](https://ollama.com)を介して行います。APIキー、クラウド、レート制限は不要です。デフォルトでは、すべての処理がローカルマシン上で行われます。必要に応じて、[Ollama Cloud](#ollama-cloudオプション)などのリモートOllamaを使用することもできます。

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

> **ヒント:** この手順をスキップできます。Polyglot は、初回使用時にデフォルトのモデル (27B、17 GB) を自動的にダウンロードします。GPU が小さい場合は、最初に `POLYGLOT_MODEL=translategemma:12b` を設定してください ([構成可能なデフォルトモデル](#設定可能なデフォルトモデル) を参照)。

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

以上です。Claudeに何かを翻訳するように指示すると、自動的に`translate`ツールを使用します。

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

長いテキストは、段落と文の区切りで自動的に分割され、順番に翻訳され、再構成されます。すべての翻訳は、品質（空の出力、エコー検出、切り捨て、意味不明なテキスト）について検証されます。

### `translate_markdown`

構造を維持しながら、Markdownドキュメント全体を翻訳します。コードブロック、HTML要素、バッジ、URL、テーブルの書式はそのままに、本文（見出し、段落、キャッチフレーズ、テーブルセル）のみを翻訳します。インラインコードと[保護された用語](#保護された用語polyglot-termsjson)は、翻訳前にプレースホルダーに置き換えられ、翻訳後に復元されるため、コマンド、フラグ、パッケージ名、識別子は、記述されたとおりに正確に表示され、すべての「N of M」のカウントは`N/M`として表示されます。

| パラメータ | 必須 | 説明 |
|--------------|----------|-------------|
| `markdown`   | はい | 翻訳するMarkdownコンテンツ全体 |
| `from`       | はい | ソース言語コードまたは名前 |
| `to`         | はい | ターゲット言語コードまたは名前 |
| `model`      | no       | Ollamaモデル（デフォルト：`translategemma:27b`） |
| `onLostSpan` | no       | `report` (デフォルト) は、翻訳から欠落している保護されたスパンをリストします。`fail` は、それをエラーにします。[存続チェック](#存続チェック--on-lost-span) を参照してください。 |

### `list_languages`

サポートされている57言語とそのコードをすべてリストします。

### `check_status`

Ollamaが実行されているかどうか、およびどのTranslateGemmaモデルがインストールされているかを確認します。Ollamaが実行されていない場合は、自動的に起動を試みます。

### `translate_all`

Markdownコンテンツを一度に複数の言語に翻訳します（デフォルト：7 — 日本語、中国語、スペイン語、フランス語、ヒンディー語、イタリア語、ポルトガル語）。GPUセーフなセマフォア制限を使用して、翻訳を並行して実行します。

| パラメータ | 必須 | 説明 |
|---------------|----------|-------------|
| `markdown`    | はい | 翻訳するMarkdownコンテンツ全体 |
| `from`        | no       | ソース言語コード（デフォルト：`en`） |
| `languages`   | no       | ターゲット言語コードの配列（デフォルト：すべて7言語） |
| `model`       | no       | Ollamaモデル（デフォルト：`translategemma:27b`） |
| `concurrency` | no       | 最大同時翻訳数（デフォルト：2、最大：3） |
| `navBar`      | no       | 言語ナビゲーションバーを挿入するかどうか（デフォルト：true） |
| `onLostSpan`  | no       | `report`（デフォルト）は、言語ごとに失われた保護されたスパンをリストします。`fail`は、いずれかのスパンを含む言語をエラーにします。 |

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
| `onLostSpan`  | no       | `report`（デフォルト）は、すべてのファイルを書き込み、失われた保護されたスパンをリストします。`fail`は、書き込まれていないスパンを含む言語をエラーにします。 |

`translate_readme`は、READMEの`.polyglot-terms.json`と`.polyglot-pins.json`が存在する場合は読み込みます。

## 機能

### 自動起動と自動ダウンロード
Ollamaが実行されていない場合は、自動的に起動します。TranslateGemmaモデルがインストールされていない場合は、自動的にダウンロードします。手動での設定は不要です。

### 指数バックオフによる再試行
一時的なOllamaのエラー（ネットワークの断続的な問題、一時的な過負荷）は、指数バックオフ（1秒、2秒）で最大2回自動的に再試行されます。再試行できないエラー（無効なモデル名、無効な入力）は、すぐに失敗します。

### スマートチャンキング
長いテキストは、自然な区切り（段落、次に文）で分割されるため、翻訳のコンテキストが維持されます。チャンクサイズはモデルに合わせて調整されます。2B/4Bモデルの場合は2K文字、12Bの場合は4K、27Bの場合は6Kです。

### セグメントキャッシュ
Translated segments are cached by content hash (SHA-256 of the masked source text + target language + model, plus a hash of the protected-term rules that matched in the segment). Unchanged segments skip re-translation entirely, so re-running a translation after an edit touches only what changed. Adding a protected term changes the key of every segment containing it, so a cached translation that respelled the term is not replayed; other segments keep their keys. The cache lives in `.polyglot-cache.json` next to the source file, with a 30-day TTL. It is used by the `translateMarkdown` library API when given a `filePath` (and by the repo's `scripts/translate-*.mjs` CLI); the MCP tools translate without it.

複数の実行で1つのキャッシュファイルを共有できます。各保存操作は、ロック下でファイルに独自の変更をマージし、ファイルをアトミックに置き換えるため、並行して翻訳された言語は互いのエントリを保持し、1つの言語のキャッシュをクリアしても、他の言語には影響しません。

### 翻訳メモリ（ファジーキャッシュ）
完全一致するキャッシュヒットが見つからない場合、キャッシュされた翻訳は、そのソースが新しいものと空白のレイアウトのみ異なる場合に再利用されます。具体的には、行内のスペース、行の先頭または末尾の空白、または CRLF と LF の違いです。それ以外の編集（単語、数字、句読点、大文字と小文字、インラインコードの変更など）は再翻訳されます。キャッシュされた翻訳は、そのソースの翻訳であるため、編集されたテキストに再利用すると、古い表現がそのまま使用されてしまいます。

### 保護された用語（`.polyglot-terms.json`）
TranslateGemma は、別のスクリプトでベア識別子を再構成します。たとえば、ヒンディー語の README ファイルで `XLS-30` を `एक्सएलएस-30` と、`Kimi-K3` を `किमी-के3` と記述します。また、数値も変更します。中国語では "218/224" を "224/218" に変更します。したがって、本文中の識別子は、インラインコードの区切り記号のようにマスクされます。つまり、翻訳前に各識別子を文字を含まないプレースホルダーに置き換え、翻訳後に元の状態に戻します。デフォルトは次のとおりです。

| パターン | マスク | 変更なし |
|---------|-------|--------------|
| `url` | `https://…`（空白、引用符、角括弧、またはバッククォートまで。バランスの取れた括弧を一段階まで許可します。例：`https://en.wikipedia.org/wiki/Foo_(bar)`） | |
| `anchor` | Markdown リンク内のページ内 `#slug` ターゲット（`[text](#slug)`、`[text](#slug "title")`）、参照定義（`[label]: #slug`）、および HTML `href="#slug"` 属性。これにより、モデルはリンクテキストを翻訳し、フラグメントを改ざんすることなく処理します。 | `#123`（本文）、`#heading` 行、外部 `https://…#frag` URL（`url` でカバー） |
| `link-target` | Markdown のインラインリンク、画像、および参照定義における HTTP(S) 以外の、アンカー以外のターゲット：相対パス（`../facet`、`docs/Kimi-K3.md`）、ベアファイル名（`LICENSE`）、`mailto:`、`<path with spaces>`、およびバランスの取れた括弧を一段階含むパス（`docs/Foo_(bar).md`） | リンクのタイトル（`"MIT License"`）、HTML 属性（`href="…"`、`src="…"`） |
| `caps-id` | 数字または大文字を含む ALL-CAPS トークン。または、`-` または `_` で結合されたトークン：`XLS-30`、`HOST_REJECTED`、`SHA-256`、`ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase および mixedCase 単語：`DepositAuth`、`AMMCreate`、`mixedCase`、`SoulX-Singer` | `URLs`、`IDs`、`GPUs`、通常の大文字で始まる単語 |
| `model-id` | 文字と数字を含む部分を持つモデルおよび製品 ID：`Kimi-K3`、`gemma4:31b`、`Qwen2.5-32B` | `Node.js`, `top-10` |

すべてのセグメントが翻訳および再構成された後、各ソース ATX ヘッダーは、翻訳された ATX ヘッダーとペアリングされ、ドキュメントの順序で `github-slugger` を使用してスラッグ化されます（重複するヘッダーには GitHub のヘッダー ID と同様に、`-1`、`-2` のサフィックスが付けられます）。また、コード以外のページ内のすべてのアンカー（`[text](#slug)`、`[label]: #slug`、および HTML `href="#slug"`）は、翻訳されたヘッダーのスラッグに書き換えられます。

本文および表のセル内の "N of M"（`218 of 224`）は、1 つのスパンスパンとしてマスクされ、すべての言語で `218/224` として復元されます。これにより、どこでも正しく表示され、順序を逆にしたり、序数に変換したりすることはできません。カウントのみを含む表のセルは、モデルに送信されません。

リポジトリは、README の横に独自の用語を `.polyglot-terms.json` として追加します。すべてのフィールドはオプションです。

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` は、完全一致する大文字と小文字を区別する文字列であり、単語全体として一致します。`patterns` は、JavaScript の正規表現です。どちらもデフォルトに追加されます。`disable` は、名前でデフォルトをオフにします（たとえば、`"disable": ["anchor"]` は、ページ内アンカーのマスク、再構成後のスラッグの書き換え、およびアンカーの存続チェックをオフにします。`"disable": ["link-target"]` は、HTTP 以外のリンクターゲットのマスクをオフにし、リンクの存続チェックで相対/HTTP 以外のターゲットをスキップするため、ローカライズされたファイル（例：`./docs/guide.fr.md`）へのリンクが通過します）。`"nOfM": false` は、カウントルールをオフにします。解析できないファイルは、要求された用語なしで翻訳するのではなく、`CONFIG_ERROR` で実行を停止します。

### 存続チェック（`--on-lost-span`）
翻訳後、すべてのターゲットファイルは英語と比較してチェックされます。各保護されたスパンスパン（インラインコードの区切り記号、保護された用語、および各カウントとして `N/M`）は、そのセグメントの翻訳に文字単位で存在する必要があります。また、英語のソースで解決されたすべてのページ内の `#slug` アンカーは、翻訳で翻訳された ATX ヘッダーのスラッグまたは明示的な HTML `id=`/`name=` アンカーに解決される必要があります（英語のソースで解決されなかったアンカーは、警告として報告され、実行が失敗することはありません。ソースと翻訳のアンカーの数が異なり、ソースで有効なアンカーが含まれている場合、不一致も `LostSpan` の種類 `"anchor"` として報告されます。ただし、セグメントリンクチェックによってすでにフラグが立てられている場合は除きます）。各セグメントの Markdown リンク（`[text](target)`、`[text](target "title")`、画像 `![alt](src)`、参照リンク `[text][label]`、折りたたみ `[text][]`、およびショートカット `[label]`。これらは、それぞれのファイルの `[label]: target` 定義に対して解決されます）は、アンカー以外のリンクターゲットの正確な多重集合と、ページ内の `#slug` リンクの正確な数を保持する必要があります（リンクが壊れている、閉じられていない、または削除されている場合は、種類 `"link"` として報告されます）。翻訳されたセグメントで、ソースに存在した以上の、置き換えられていない `⟦` または `⟧` のプレースホルダー区切り記号がコードの外に残っている場合は、種類 `"placeholder"` として報告されます。各表のセルは、ソースのセルと同じ数値を保持する必要があります。比較は、順序に関係なく、多重集合として行われます。たとえば、"218/224" の正しい中国語は、最初に合計を記述します（`224 首中的 218 首`）。したがって、順序チェックでは、正しい答えがフラグ付けされます。他のスクリプトからの数字は、比較する前に正規化されます。ファイルは、フェンスで囲まれたコードブロックとインラインコードの区切り記号も保持する必要があります。

`--on-lost-span=fail|report` は、何かが失われた場合に何が起こるかを決定します。

- **`fail`**: 実行は、言語、セグメント、および欠落したスパンスパンのリストとともに、ゼロ以外の値で終了します。これは、リリース前に実行される `scripts/translate-all.mjs` のデフォルトです。ファイルはまだ書き込まれるため、手動で修正して固定できます。要約 JSON には、リストと通常の `PolyglotError` 形式（`code`、`message`、`hint`、`retryable`）の `LOST_SPAN` エラーが含まれます。
- **`report`**: リストが書き込まれ、実行は 0 で終了します。これは、MCP ツール（`onLostSpan` パラメーター）および `translateMarkdown` ライブラリ API（`onLostSpan` オプション、結果フィールド `lostSpans`）のデフォルトです。

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### 固定された翻訳（`.polyglot-pins.json`）
固定された翻訳は常に優先されます。`.polyglot-pins.json` はキャッシュの横に配置されます。各エントリは、英語のセグメントのハッシュとターゲット言語によってキーが設定され、手動で修正された翻訳が格納されます。固定された翻訳は、キャッシュとモデルよりも優先され、すべての再実行で、`--cache-clear` を含むすべての再実行で保持されます。英語が変更されると、ハッシュも変更されるため、固定された翻訳は、記述されたテキストよりも長く存続することはできません。

手動による修正を固定するには、翻訳されたファイルを修正してから、次を実行します。

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

英語の各セグメントと、修正されたファイル内の対応するテキストを照合し、キャッシュされた翻訳と異なるテキストを持つすべてのセグメントをマークします。`--dry-run`は、マークされたセグメントを書き出さずにリストします。`--model=NAME`は、キャッシュエントリを比較するモデルを設定します（デフォルト：`$POLYGLOT_MODEL`または`translategemma:27b`、スクリプトと同じ）。`--include-uncached`は、キャッシュに翻訳がないセグメントもマークします。READMEとともに、コミット`.polyglot-pins.json`と`.polyglot-terms.json`を実行します。

### Ollama Cloud（オプション）
`OLLAMA_HOST`を、`localhost:11434`ではなく、別のOllamaサーバーにリクエストを送信するように設定します。[Ollama Cloud](https://ollama.com)の場合、`OLLAMA_API_KEY`も設定します。キーはBearerトークンとして送信され、ループバック以外のホストにのみ送信されます。

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### 同時実行セマフォ
すべてのOllama呼び出しは、カウンティングセマフォ（デフォルト制限：1）によって保護され、VRAMが限られているシステムでのGPUのメモリ不足を防ぎます。`POLYGLOT_CONCURRENCY`でオーバーライドします。

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### MCPプログレストークン
すべてのツールは、クライアントが`progressToken`を提供した場合、MCP`notifications/progress`を介して進捗状況を報告します。translateはチャンクごと、translate_markdownはセグメントバッチごと、translate_allは言語ごと、check_statusはステップごとに報告します。

### ソフトウェア用語集
12の技術用語（API、CLI、SDKなど）を内蔵した用語集により、ソフトウェア用語の一貫した翻訳が保証されます。カスタム用語集エントリは、リクエストごとに渡すことができ、デフォルトとマージされます。

### バッチ翻訳
`translateBatch`は、可能な限り複数のセグメントを1つのプロンプトにグループ化し、往復回数を減らします。バッチ区切り文字が破損している場合は、個別の翻訳にフォールバックします。

### 設定可能なデフォルトモデル
デフォルトモデルは`translategemma:27b`です。別のモデルを使用するには、`POLYGLOT_MODEL`環境変数を設定します。たとえば、VRAMが少ないGPUの場合：

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### 構造化されたエラー
すべてのエラーは、機械可読のコード（`MODEL_NOT_FOUND`、`OLLAMA_UNAVAILABLE`、`TRANSLATION_FAILED`など）、人間が読めるメッセージ、オプションのヒント、および`retryable`フラグとともに、`PolyglotError`を使用します。

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
| 後続の翻訳 | 約1〜2秒/READMEセグメントのバッチ | 約600ミリ秒 |
| モデルメモリ | 17 GB、GPU上に完全に配置（`ollama ps`で報告） | 約8.1 GB |

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
| **Data touched** | Ollama APIに送信されるテキスト — デフォルトではローカル（`localhost:11434`）、または`OLLAMA_HOST`を設定した場合は、そのホスト。翻訳されたファイル（ライブラリとCLIのみ）の横に`.polyglot-cache.json`セグメントキャッシュが配置されます。存在する場合は、翻訳されたREADMEの横に`.polyglot-terms.json`と`.polyglot-pins.json`が読み込まれます。 |
| **Files written** | `translate_readme`は、渡されたREADMEの横に`README.<lang>.md`を書き込み、そのREADMEの言語ナビゲーションバーを更新します。`scripts/pin-translation.mjs`は、READMEの横に`.polyglot-pins.json`を書き込みます。 |
| **Data NOT touched** | ブラウザデータ、OS認証情報は一切なく、上記のディレクトリ外には何もありません。 |
| **Network** | デフォルトでは、HTTPは`localhost:11434`にのみ送信されます — 外部への送信はゼロです。リモートは、`OLLAMA_HOST`が別の場所を指す場合にのみ行われます。 |
| **Secrets** | 設定されている場合、`OLLAMA_API_KEY`は環境から読み取られ、ループバック以外の`OLLAMA_HOST`にBearerトークンとしてのみ送信されます。ディスクに書き込まれたり、ログに記録されたりすることはありません。 |
| **Telemetry** | 収集または送信されるデータはありません。 |

脆弱性報告ポリシーについては、[SECURITY.md](SECURITY.md)を参照してください。

## 開発

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 512 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## ライセンス

MIT — [LICENSE](LICENSE)を参照してください。

> [MCP Tool Shop](https://mcp-tool-shop.github.io/)によって構築されました。
