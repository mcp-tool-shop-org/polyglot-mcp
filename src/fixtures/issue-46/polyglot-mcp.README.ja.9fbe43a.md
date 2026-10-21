<!-- Extract of mcp-tool-shop-org/polyglot-mcp README.ja.md at 9fbe43a: the ATX headings and the 4 in-page anchor lines. -->

## 機能

ローカルのGPU上で[Ollama](https://ollama.com)を使用して、57言語間でテキストを翻訳します。[TranslateGemma](https://ollama.com/library/translategemma)を使用。APIキー、クラウド、レート制限は不要です。デフォルトでは、すべてがローカルマシンに保存されます。[Ollama Cloud](#ollama-cloud-optional)などのリモートOllamaを使用することもできます。

## クイックスタート

### 1. Ollamaをインストールします

### 2. モデルをダウンロードします

> **ヒント:** この手順をスキップできます。Polyglotは、初回使用時にデフォルトのモデル（27B、17GB）を自動的にダウンロードします。GPUが小さい場合は、最初に`POLYGLOT_MODEL=translategemma:12b`を設定してください（[設定可能なデフォルトモデル](#configurable-default-model)を参照）。

### 3. MCPクライアントに追加します

## ツール

### `translate`

### `translate_markdown`

構造を維持しながら、Markdownドキュメント全体を翻訳します。コードブロック、HTML要素、バッジ、URL、テーブルの書式はそのままに、本文（見出し、段落、キャッチフレーズ、テーブルセル）のみを翻訳します。インラインコードと[保護された用語](#protected-terms-polyglot-termsjson)は、翻訳前にプレースホルダーに置き換えられ、翻訳後に復元されるため、コマンド、フラグ、パッケージ名、識別子は、記述されたとおりに正確に表示され、すべての「N of M」のカウントは`N/M`として表示されます。

| パラメータ | 必須 | 説明 |
|--------------|----------|-------------|
| `onLostSpan` | no       | `report`（デフォルト）は、翻訳から欠落している保護されたスパンを一覧表示します。`fail`は、それをエラーにします。[生存チェック](#survival-check---on-lost-span)を参照してください。 |

### `list_languages`

### `check_status`

### `translate_all`

### `translate_readme`

## 機能

### 自動起動と自動ダウンロード

### 指数バックオフによる再試行

### スマートチャンキング

### セグメントキャッシュ

### 翻訳メモリ（ファジーキャッシュ）

### 保護された用語（`.polyglot-terms.json`）

### 生存チェック（`--on-lost-span`）

### 固定された翻訳（`.polyglot-pins.json`）

### Ollama Cloud（オプション）

### 同時実行セマフォ

### MCPプログレストークン

### ソフトウェア用語集

### バッチ翻訳

### 構成可能なデフォルトモデル

### 構造化されたエラー

### 出力検証

### ストリーミング

## サポートされている言語

## パフォーマンス

## アーキテクチャ

## セキュリティとデータ範囲

## 開発

## ライセンス
