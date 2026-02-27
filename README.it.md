<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## Cosa fa

Traduce testi tra 55 lingue utilizzando [TranslateGemma](https://ollama.com/library/translategemma), eseguito localmente sulla tua GPU tramite [Ollama](https://ollama.com). Non sono necessarie chiavi API, non si utilizza il cloud e non ci sono limiti di utilizzo: tutto viene eseguito sulla tua macchina.

## Prerequisiti

1. **[Ollama](https://ollama.com)** installato e in esecuzione (`ollama serve`)
2. Modello **TranslateGemma** scaricato:
```bash
ollama pull translategemma:12b   # 8.1 GB — miglior equilibrio tra qualità e velocità
# oppure
ollama pull translategemma:4b    # 3.3 GB — più veloce, qualità inferiore
```
3. **Node.js 18+**

## Installazione

### Claude Code / Claude Desktop

Aggiungi alla tua configurazione MCP (`claude_desktop_config.json` o `.mcp.json`):

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
| `text` | sì | Testo da tradurre |
| `from` | sì | Codice o nome della lingua di origine (es. `en`, `English`) |
| `to` | sì | Codice o nome della lingua di destinazione (es. `ja`, `Japanese`) |
| `model` | no | Modello Ollama (predefinito: `translategemma:12b`) |

### `list_languages`

Elenca tutte le 55 lingue supportate con i relativi codici.

### `check_status`

Verifica se Ollama è in esecuzione e quali modelli TranslateGemma sono installati.

## Lingue supportate

Afrikaans, albanese, arabo, bengalese, bulgaro, catalano, cinese (semplificato), cinese (tradizionale), croato, ceco, danese, olandese, inglese, estone, finlandese, francese, galiziano, tedesco, greco, gujarati, ebraico, hindi, ungherese, indonesiano, irlandese, italiano, giapponese, kannada, coreano, lettone, lituano, macedone, malese, malayalam, maltese, marathi, norvegese, persiano, polacco, portoghese, rumeno, russo, scozzese gaelico, serbo, slovacco, sloveno, spagnolo, swahili, svedese, tamil, telugu, tailandese, turco, ucraino, urdu, vietnamita, gallese.

## Prestazioni

Su una RTX 5080 (16 GB di VRAM) con TranslateGemma 12B (Q4):

| Metrica | Valore |
|--------|-------|
| Prima traduzione (caricamento iniziale) | ~15 secondi |
| Traduzioni successive | ~600 ms |
| Utilizzo della VRAM | ~8.1 GB |
| Testo lungo (diviso in blocchi) | ~600 ms per blocco |

## Sicurezza e ambito dei dati

**Dati utilizzati:** testo inviato all'API locale di Ollama (`localhost:11434`) per la traduzione, cache di segmenti `.polyglot-cache.json`. **Dati NON utilizzati:** nessun file al di fuori della directory di lavoro, nessun dato del browser, nessuna credenziale del sistema operativo. **Rete:** connessioni HTTP solo a `localhost:11434` — nessuna connessione esterna o internet. **Non vengono raccolti o inviati dati di telemetria**.

## Come funziona

1. Il client MCP (Claude Code, ecc.) chiama lo strumento `translate`.
2. Polyglot crea un prompt per TranslateGemma con la coppia di lingue di origine/destinazione.
3. Il prompt viene inviato all'API HTTP locale di Ollama.
4. Ollama esegue TranslateGemma sulla tua GPU e restituisce la traduzione.
5. Per testi lunghi, il contenuto viene suddiviso in blocchi ai confini di paragrafi/frasi.

## Licenza

Licenza MIT — consulta [LICENSE](LICENSE) per i dettagli.

> Creato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
