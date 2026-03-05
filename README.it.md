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

Traduce testi tra 55 lingue utilizzando [TranslateGemma](https://ollama.com/library/translategemma), eseguito localmente sulla tua GPU tramite [Ollama](https://ollama.com). Nessuna chiave API, nessun servizio cloud, nessun limite di utilizzo: tutto rimane sulla tua macchina.

## Guida rapida

### 1. Installa Ollama

Scarica da [ollama.com](https://ollama.com) e avvialo:

```bash
ollama serve
```

### 2. Scarica un modello

```bash
ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
# or
ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
# or
ollama pull translategemma:27b   # 17 GB  — highest quality
```

> **Suggerimento:** Puoi saltare questo passaggio: Polyglot scarica automaticamente il modello al primo utilizzo.

### 3. Aggiungi al tuo client MCP

**Claude Code / Claude Desktop** — aggiungi a `claude_desktop_config.json` o `.mcp.json`:

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

**Da sorgente:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

Fatto. Chiedi a Claude di tradurre qualcosa e utilizzerà automaticamente lo strumento `translate`.

## Strumenti

Polyglot espone tre strumenti MCP:

### `translate`

Traduce testi tra qualsiasi coppia di lingue supportate.

| Parametri | Obbligatorio | Descrizione |
|-------------|----------|-------------|
| `text`      | sì | Testo da tradurre |
| `from`      | sì | Codice o nome della lingua di origine (es. `en`, `English`) |
| `to`        | sì | Codice o nome della lingua di destinazione (es. `ja`, `Japanese`) |
| `model`     | no       | Modello Ollama (predefinito: `translategemma:12b`) |
| `glossary`  | no       | Sovrascritture di termini personalizzati nel formato `{"source": "translation"}` — unite al glossario software integrato |

Testi lunghi vengono automaticamente suddivisi in blocchi ai confini di paragrafi e frasi, tradotti in sequenza e riassemblati.

### `list_languages`

Elenca tutte le 55 lingue supportate con i relativi codici.

### `check_status`

Verifica se Ollama è in esecuzione e quali modelli TranslateGemma sono installati. Tenta l'avvio automatico se Ollama non è in esecuzione.

## Funzionalità

### Avvio e download automatici
Ollama viene avviato automaticamente se non è in esecuzione. Il modello TranslateGemma viene scaricato automaticamente se non è installato. Non è necessaria alcuna configurazione manuale.

### Riprova con backoff esponenziale
I fallimenti temporanei di Ollama (interruzioni di rete, sovraccarico temporaneo) vengono automaticamente riprovati fino a 2 volte con un backoff esponenziale (1 s, 2 s). Gli errori non riprovabili (nome del modello non valido, input non valido) falliscono immediatamente.

### Suddivisione intelligente
I testi lunghi vengono suddivisi in base a confini naturali: paragrafi, quindi frasi, in modo da preservare il contesto della traduzione. Le dimensioni dei blocchi si adattano al modello: 2K caratteri per i modelli 2B/4B, 4K per 12B, 6K per 27B.

### Cache dei segmenti
I segmenti tradotti vengono memorizzati nella cache in base all'hash del contenuto (SHA-256 del testo di origine + lingua di destinazione + modello). I segmenti invariati saltano completamente la ritraduzione. La cache si trova in `.polyglot-cache.json` con una durata di 30 giorni.

### Glossario software
Un glossario integrato di 12 termini tecnici (API, CLI, SDK, ecc.) garantisce una traduzione coerente della terminologia software. Le voci del glossario personalizzate possono essere fornite per ogni richiesta e vengono unite ai valori predefiniti.

### Traduzione in batch
`translateBatch` raggruppa più segmenti in un'unica richiesta, ove possibile, riducendo il numero di richieste. In caso di errori nella separazione del batch, si ricorre alla traduzione individuale.

### Modello predefinito configurabile
Imposta la variabile d'ambiente `POLYGLOT_MODEL` per sovrascrivere il modello predefinito:

```bash
POLYGLOT_MODEL=translategemma:27b npx @mcptoolshop/polyglot-mcp
```

### Errori strutturati
Tutti gli errori utilizzano `PolyglotError` con un codice leggibile dalla macchina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, ecc.), un messaggio leggibile dall'utente, un suggerimento opzionale e un flag `retryable`.

## Lingue supportate

Afrikaans, albanese, arabo, bengalese, bulgaro, catalano, cinese (semplificato), cinese (tradizionale), croato, ceco, danese, olandese, inglese, estone, finlandese, francese, galiziano, tedesco, greco, gujarati, ebraico, hindi, ungherese, indonesiano, irlandese, italiano, giapponese, kannada, coreano, lettone, lituano, macedone, malese, malayalam, maltese, marathi, norvegese, persiano, polacco, portoghese, rumeno, russo, scozzese (gaelico), serbo, slovacco, sloveno, spagnolo, swahili, svedese, tamil, telugu, tailandese, turco, ucraino, urdu, vietnamita, gallese.

## Prestazioni

Su un sistema RTX 5080 (16 GB di VRAM) con TranslateGemma 12B (Q4):

| Metrica | Valore |
|--------|-------|
| Prima traduzione (caricamento iniziale del modello) | ~15 secondi |
| Traduzioni successive | ~600 millisecondi |
| Utilizzo della VRAM | ~8.1 GB |
| Testo lungo (per blocco) | ~600 millisecondi |

## Architettura

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

## Sicurezza e ambito dei dati

| Aspetto | Dettaglio |
|--------|--------|
| **Data touched** | Testo inviato all'API locale di Ollama (`localhost:11434`), cache segmentata in `.polyglot-cache.json` |
| **Data NOT touched** | Nessun file al di fuori della directory di lavoro, nessun dato del browser, nessuna credenziale del sistema operativo |
| **Network** | Solo connessioni HTTP a `localhost:11434` — nessun traffico esterno/internet |
| **Telemetry** | Nessun dato raccolto o trasmesso |

Consultare [SECURITY.md](SECURITY.md) per la politica di segnalazione delle vulnerabilità.

## Sviluppo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 114 unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licenza

MIT — vedere [LICENSE](LICENSE).

> Creato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
