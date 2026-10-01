<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Server di traduzione MCP GPU locale: 57 lingue, nessuna dipendenza dal cloud.</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="node 20+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## Funzionalità

Traduce il testo tra 57 lingue utilizzando [TranslateGemma](https://ollama.com/library/translategemma) in esecuzione localmente sulla tua GPU tramite [Ollama](https://ollama.com). Nessuna chiave API, nessun cloud, nessun limite di frequenza: per impostazione predefinita, tutto rimane sulla tua macchina. Puoi scegliere di utilizzare un Ollama remoto, come [Ollama Cloud](#ollama-cloud-optional).

## Guida rapida

### 1. Installa Ollama

Scarica da [ollama.com](https://ollama.com) e avvialo:

```bash
ollama serve
```

### 2. Scarica un modello

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **Suggerimento:** puoi saltare questo passaggio: Polyglot scarica automaticamente il modello predefinito (27B, 17 GB) al primo utilizzo. Su una GPU più piccola, imposta prima `POLYGLOT_MODEL=translategemma:12b` (vedi [Modello predefinito configurabile](#modello-predefinito-configurabile)).

### 3. Aggiungi al tuo client MCP

**Claude Code / Claude Desktop:** aggiungi a `claude_desktop_config.json` o `.mcp.json`:

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

Polyglot espone sei strumenti MCP:

### `translate`

Traduce il testo tra qualsiasi coppia di lingue supportate.

| Parametro | Obbligatorio | Descrizione |
|-------------|----------|-------------|
| `text`      | Sì | Testo da tradurre |
| `from`      | Sì | Codice o nome della lingua di origine (ad esempio, `en`, `English`) |
| `to`        | Sì | Codice o nome della lingua di destinazione (ad esempio, `ja`, `Japanese`) |
| `model`     | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `glossary`  | no       | Override dei termini personalizzati come `{"source": "translation"}`: uniti al glossario software integrato |

Il testo lungo viene automaticamente suddiviso in blocchi ai confini di paragrafi e frasi, tradotto in sequenza e riassemblato. Tutte le traduzioni vengono convalidate per la qualità (output vuoto, rilevamento di eco, troncamento, testo distorto).

### `translate_markdown`

Traduce un intero documento Markdown preservando la struttura. I blocchi di codice, gli elementi HTML, i badge, gli URL e la formattazione della tabella vengono mantenuti intatti: solo il contenuto in prosa (titoli, paragrafi, slogan, celle della tabella) viene tradotto. Gli intervalli di codice inline vengono sostituiti con segnaposto prima della traduzione e ripristinati dopo, in modo che i comandi, i flag, i nomi dei pacchetti e gli identificatori vengano restituiti esattamente come sono stati scritti.

| Parametro | Obbligatorio | Descrizione |
|-------------|----------|-------------|
| `markdown`  | Sì | Il contenuto Markdown completo da tradurre |
| `from`      | Sì | Codice o nome della lingua di origine |
| `to`        | Sì | Codice o nome della lingua di destinazione |
| `model`     | no       | Modello Ollama (predefinito: `translategemma:27b`) |

### `list_languages`

Elenca tutte le 57 lingue supportate con i rispettivi codici.

### `check_status`

Verifica se Ollama è in esecuzione e quali modelli TranslateGemma sono installati. Tenta l'avvio automatico se Ollama non è in esecuzione.

### `translate_all`

Traduce il contenuto Markdown in più lingue contemporaneamente (predefinito: 7: giapponese, cinese, spagnolo, francese, hindi, italiano, portoghese). Esegue le traduzioni in parallelo con un limite di semaforo sicuro per la GPU.

| Parametro | Obbligatorio | Descrizione |
|---------------|----------|-------------|
| `markdown`    | Sì | Il contenuto Markdown completo da tradurre |
| `from`        | no       | Codice della lingua di origine (predefinito: `en`) |
| `languages`   | no       | Array di codici delle lingue di destinazione (predefinito: tutte e 7) |
| `model`       | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `concurrency` | no       | Numero massimo di traduzioni simultanee (predefinito: 2, massimo: 3) |
| `navBar`      | no       | Inserisci la barra di navigazione della lingua (predefinito: true) |

### `translate_readme`

Traduce un file README.md nelle stesse 7 lingue e scrive i file `README.<lang>.md` accanto ad esso, aggiornando la barra di navigazione della lingua nel README di origine e in ogni traduzione. Restituisce un riepilogo dello stato per lingua (ok/fallimento, tempi, file scritti) anziché il testo tradotto; utilizza `translate_markdown` quando desideri recuperare il contenuto.

| Parametro | Obbligatorio | Descrizione |
|---------------|----------|-------------|
| `readmePath`  | Sì | Percorso assoluto del file README.md di origine |
| `tier`        | no       | `quality` (`translategemma:27b`, predefinito), `bulk` (`12b`) o `draft` (`2b`); ignorato quando `model` è impostato |
| `model`       | no       | Modello Ollama esplicito; sovrascrive `tier` |
| `languages`   | no       | Sottoinsieme di codici delle lingue di destinazione (predefinito: tutte e 7) |
| `concurrency` | no       | Numero massimo di traduzioni simultanee (predefinito: 2, massimo: 3) |
| `navBar`      | no       | Inserisci o aggiorna la barra di navigazione della lingua (predefinito: true) |

## Funzionalità

### Avvio e download automatici
Ollama viene avviato automaticamente se non è in esecuzione. Il modello TranslateGemma viene scaricato automaticamente se non è installato. Non è richiesta alcuna configurazione manuale.

### Riprova con backoff esponenziale
I fallimenti transitori di Ollama (interruzioni di rete, sovraccarico temporaneo) vengono automaticamente riprovati fino a 2 volte con backoff esponenziale (1 s, 2 s). Gli errori non riprovabili (nome del modello errato, input non valido) falliscono immediatamente.

### Suddivisione intelligente
Il testo lungo viene suddiviso in confini naturali: paragrafi, quindi frasi, in modo che il contesto della traduzione venga preservato. Le dimensioni dei blocchi si adattano al modello: 2K caratteri per i modelli da 2B/4B, 4K per 12B, 6K per 27B.

### Cache dei segmenti
I segmenti tradotti vengono memorizzati nella cache in base all'hash del contenuto (SHA-256 del testo di origine + lingua di destinazione + modello). I segmenti non modificati saltano completamente la ritraduzione, quindi l'esecuzione di una traduzione dopo una modifica influisce solo su ciò che è stato modificato. La cache si trova in `.polyglot-cache.json` accanto al file di origine, con un TTL di 30 giorni. Viene utilizzata dall'API della libreria `translateMarkdown` quando viene fornito un `filePath` (e dalla CLI `scripts/translate-*.mjs` del repository); gli strumenti MCP traducono senza di essa.

Diverse esecuzioni possono condividere un singolo file di cache. Ogni salvataggio unisce solo le proprie modifiche nel file sotto un blocco e sostituisce il file in modo atomico, in modo che le lingue tradotte in parallelo mantengano le voci reciproche e la cancellazione della cache per una lingua lasci intatte le altre.

### Memoria di traduzione (cache fuzzy)
Quando non viene trovata una corrispondenza esatta nella cache, una traduzione memorizzata nella cache viene riutilizzata solo se la sua origine differisce dalla nuova solo nel layout degli spazi bianchi: spazi all'interno di una riga, spazi all'inizio o alla fine o CRLF rispetto a LF. Qualsiasi altra modifica viene ritradotta, inclusa una parola, un numero, un segno di punteggiatura, una lettera o un intervallo di codice inline modificati. Una traduzione memorizzata nella cache è la traduzione della sua stessa origine, quindi il riutilizzo per il testo modificato restituirebbe la formulazione precedente.

### Ollama Cloud (opzionale)
Imposta `OLLAMA_HOST` per inviare richieste a un altro server Ollama invece di `localhost:11434`. Per [Ollama Cloud](https://ollama.com), imposta anche `OLLAMA_API_KEY`: la chiave viene inviata come token Bearer e solo a un host non di loopback.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Semàforo di concorrenza
Tutte le chiamate a Ollama sono protette da un semàforo di conteggio (limite predefinito: 1) per evitare errori di esaurimento della memoria della GPU su sistemi con VRAM limitata. Sovrascrivi con `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Token di avanzamento MCP
Tutti gli strumenti segnalano l'avanzamento tramite MCP `notifications/progress` quando il client fornisce un `progressToken`. Traduci i report per ogni blocco, translate_markdown per ogni batch di segmenti, translate_all per lingua e check_status per ogni passaggio.

### Glossario del software
Un glossario integrato di 12 termini tecnici (API, CLI, SDK, ecc.) garantisce una traduzione coerente della terminologia del software. È possibile passare voci di glossario personalizzate per ogni richiesta e queste vengono unite a quelle predefinite.

### Traduzione in batch
`translateBatch` raggruppa più segmenti in un'unica richiesta, quando possibile, riducendo il numero di scambi. In caso di problemi con il separatore di batch, si torna alla traduzione individuale.

### Modello predefinito configurabile
Il modello predefinito è `translategemma:27b`. Imposta la variabile d'ambiente `POLYGLOT_MODEL` per utilizzare un altro modello, ad esempio su una GPU con meno VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Errori strutturati
Tutti gli errori utilizzano `PolyglotError` con un codice leggibile dalla macchina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, ecc.), un messaggio leggibile dall'utente, un suggerimento facoltativo e un flag `retryable`.

### Validazione dell'output
Ogni traduzione viene automaticamente convalidata: l'output vuoto genera un errore (riprovabile), l'eco del testo di origine viene segnalata, la troncatura eccessiva e le allucinazioni vengono avvisate, la codifica errata e i meta-commenti del modello vengono rilevati. Gli avvisi compaiono nella risposta dello strumento MCP.

### Streaming
`OllamaClient.generateStream()` fornisce i token tramite NDJSON man mano che Ollama li produce. La funzione `translate()` accetta una funzione di callback `onToken` per la visualizzazione dell'avanzamento in tempo reale. Sia il percorso di streaming che quello non di streaming condividono la logica di ripetizione.

## Lingue supportate

Afrikaans, Albanese, Arabo, Bengali, Bulgaro, Catalano, Cinese (semplificato), Cinese (tradizionale), Croato, Ceco, Danese, Olandese, Inglese, Estone, Finlandese, Francese, Galiziano, Tedesco, Greco, Gujarati, Ebraico, Hindi, Ungherese, Indonesiano, Irlandese, Italiano, Giapponese, Kannada, Coreano, Lettone, Lituano, Macedone, Malese, Malayalam, Maltese, Marathi, Norvegese, Persiano, Polacco, Portoghese, Rumeno, Russo, Gaelico scozzese, Serbo, Slovacco, Sloveno, Spagnolo, Swahili, Svedese, Tamil, Telugu, Tailandese, Turco, Ucraino, Urdu, Vietnamita, Gallese.

## Prestazioni

| Metrica | 27B (predefinito), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| Prima traduzione (caricamento del modello a freddo) | ~30 s | ~15 s |
| Traduzioni successive | ~1–2 s per batch di segmenti README | ~600 ms |
| Memoria del modello | 17 GB, completamente sulla GPU (come riportato da `ollama ps`) | ~8,1 GB |

## Architettura

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

## Sicurezza e ambito dei dati

| Aspetto | Dettaglio |
|--------|--------|
| **Data touched** | Testo inviato all'API di Ollama: locale (`localhost:11434`) per impostazione predefinita, o l'host in `OLLAMA_HOST` se ne imposti uno. `.polyglot-cache.json` cache dei segmenti accanto a un file tradotto (solo per libreria e CLI) |
| **Files written** | `translate_readme` scrive `README.<lang>.md` accanto al file README che gli passi e aggiorna la barra di navigazione della lingua di quel file README |
| **Data NOT touched** | Nessun dato del browser, nessuna credenziale del sistema operativo, nulla al di fuori delle directory di cui sopra |
| **Network** | HTTP verso `localhost:11434` solo per impostazione predefinita: zero traffico esterno. Remoto solo quando `OLLAMA_HOST` punta altrove |
| **Secrets** | `OLLAMA_API_KEY`, se impostato, viene letto dall'ambiente e inviato solo come token Bearer a un host non di loopback `OLLAMA_HOST`; non viene mai scritto su disco o registrato |
| **Telemetry** | Nessun dato raccolto o inviato |

Consulta [SECURITY.md](SECURITY.md) per la politica di segnalazione delle vulnerabilità.

## Sviluppo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 362 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licenza

MIT: consulta [LICENSE](LICENSE).

> Creato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
