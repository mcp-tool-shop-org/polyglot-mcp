<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center"><img src="logo.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Server di traduzione GPU locale — 55 lingue, nessuna dipendenza dal cloud.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## Cosa fa

Traduce testi tra 55 lingue utilizzando [TranslateGemma](https://ollama.com/library/translategemma), eseguito localmente sulla tua GPU tramite [Ollama](https://ollama.com). Nessuna chiave API, nessun cloud, nessun limite di velocità: tutto viene eseguito sulla tua macchina.

## Prerequisiti

1. **[Ollama](https://ollama.com)** installato e in esecuzione (`ollama serve`)
2. Modello **TranslateGemma** scaricato:
```bash
ollama pull translategemma:12b   # 8.1 GB — miglior equilibrio tra qualità e velocità
# oppure
ollama pull translategemma:4b    # 3.3 GB — più veloce, qualità inferiore
```
3. **Node.js 18+**

## Configurazione

### Claude Code / Claude Desktop

Aggiungi alla configurazione di MCP (`claude_desktop_config.json` o `.mcp.json`):

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

### Da sorgente

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## Strumenti

### `translate`

Traduce testi tra qualsiasi coppia di lingue supportate.

| Parametro | Obbligatorio | Descrizione |
|-----------|----------|-------------|
| `text` | yes | Testo da tradurre |
| `from` | yes | Codice o nome della lingua di origine (es. `en`, `English`) |
| `to` | yes | Codice o nome della lingua di destinazione (es. `ja`, `Japanese`) |
| `model` | no | Modello Ollama (predefinito: `translategemma:12b`) |

### `list_languages`

Elenca tutte le 55 lingue supportate con i relativi codici.

### `check_status`

Verifica se Ollama è in esecuzione e quali modelli TranslateGemma sono installati.

## Lingue supportate

Afrikaans, albanese, arabo, bengalese, bulgaro, catalano, cinese (semplificato), cinese (tradizionale), croato, ceco, danese, olandese, inglese, estone, finlandese, francese, galiziano, tedesco, greco, gujarati, ebraico, hindi, ungherese, indonesiano, irlandese, italiano, giapponese, kannada, coreano, lettone, lituano, macedone, malese, malayalam, maltese, marathi, norvegese, persiano, polacco, portoghese, rumeno, russo, scozzese gaelico, serbo, slovacco, sloveno, spagnolo, swahili, svedese, tamil, telugu, tailandese, turco, ucraino, urdu, vietnamita, gallese.

## Prestazioni

Su una RTX 5080 (16 GB di VRAM) con TranslateGemma 12B (Q4):

| Metrica | Value |
|--------|-------|
| Prima traduzione (caricamento iniziale) | ~15s |
| Traduzioni successive | ~600ms |
| Utilizzo della VRAM | ~8.1 GB |
| Testo lungo (diviso in blocchi) | ~600ms per blocco |

## Come funziona

1. Il client MCP (Claude Code, ecc.) chiama lo strumento `translate`.
2. Polyglot crea un prompt per TranslateGemma con la coppia di lingue di origine/destinazione.
3. Il prompt viene inviato all'API HTTP locale di Ollama.
4. Ollama esegue TranslateGemma sulla tua GPU e restituisce la traduzione.
5. Per testi lunghi, il contenuto viene suddiviso in blocchi ai confini di paragrafi/frasi.

## Licenza

Licenza MIT — consulta [LICENSE](LICENSE) per i dettagli.

> Parte di [MCP Tool Shop](https://mcptoolshop.com)
