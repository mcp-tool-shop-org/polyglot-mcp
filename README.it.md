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

Traduce il testo tra 57 lingue utilizzando [TranslateGemma](https://ollama.com/library/translategemma) in esecuzione localmente sulla GPU tramite [Ollama](https://ollama.com). Nessuna chiave API, nessun cloud, nessun limite di frequenza: per impostazione predefinita, tutto rimane sulla tua macchina. Puoi scegliere di utilizzare un Ollama remoto, come [Ollama Cloud](#ollama-cloud-optional).

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

**Claude Code / Claude Desktop**: aggiungi a `claude_desktop_config.json` o `.mcp.json`:

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
| `text`      | sì | Testo da tradurre |
| `from`      | sì | Codice o nome della lingua di origine (ad esempio, `en`, `English`) |
| `to`        | sì | Codice o nome della lingua di destinazione (ad esempio, `ja`, `Japanese`) |
| `model`     | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `glossary`  | no       | Override personalizzati dei termini come `{"source": "translation"}`: uniti al glossario software integrato |

Il testo lungo viene automaticamente suddiviso in blocchi ai confini di paragrafi e frasi, tradotto in sequenza e riassemblato. Tutte le traduzioni vengono convalidate per la qualità (output vuoto, rilevamento di eco, troncamento, testo distorto).

### `translate_markdown`

Traduce un intero documento Markdown preservando la struttura. I blocchi di codice, gli elementi HTML, i badge, gli URL e la formattazione della tabella vengono mantenuti intatti: solo il contenuto in prosa (intestazioni, paragrafi, slogan, celle della tabella) viene tradotto. Le sequenze di codice inline e i [termini protetti](#protected-terms-polyglot-termsjson) vengono sostituiti con segnaposto prima della traduzione e ripristinati dopo, in modo che i comandi, i flag, i nomi dei pacchetti e gli identificatori vengano restituiti esattamente come sono stati scritti e ogni conteggio "N di M" viene restituito come `N/M`.

| Parametro | Obbligatorio | Descrizione |
|--------------|----------|-------------|
| `markdown`   | sì | L'intero contenuto Markdown da tradurre |
| `from`       | sì | Codice o nome della lingua di origine |
| `to`         | sì | Codice o nome della lingua di destinazione |
| `model`      | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `onLostSpan` | no       | `report` (predefinito) elenca le sequenze protette mancanti nella traduzione; `fail` trasforma questo in un errore. Vedi [Controllo di sopravvivenza](#controllo-di-sopravvivenza---su-sequenza-persa) |

### `list_languages`

Elenca tutte le 57 lingue supportate con i rispettivi codici.

### `check_status`

Verifica se Ollama è in esecuzione e quali modelli TranslateGemma sono installati. Tenta di avviarlo automaticamente se Ollama non è in esecuzione.

### `translate_all`

Traduce il contenuto Markdown in più lingue contemporaneamente (predefinito: 7: giapponese, cinese, spagnolo, francese, hindi, italiano, portoghese). Esegue le traduzioni in parallelo con un limite di semaforo sicuro per la GPU.

| Parametro | Obbligatorio | Descrizione |
|---------------|----------|-------------|
| `markdown`    | sì | L'intero contenuto Markdown da tradurre |
| `from`        | no       | Codice della lingua di origine (predefinito: `en`) |
| `languages`   | no       | Array di codici delle lingue di destinazione (predefinito: tutte e 7) |
| `model`       | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `concurrency` | no       | Numero massimo di traduzioni simultanee (predefinito: 2, massimo: 3) |
| `navBar`      | no       | Inserisci la barra di navigazione della lingua (predefinito: true) |
| `onLostSpan`  | no       | `report` (predefinito) elenca le sequenze protette perse per lingua; `fail` trasforma una lingua che ne contiene in un errore |

### `translate_readme`

Traduce un file README.md in tutte e 7 le lingue e scrive i file `README.<lang>.md` accanto ad esso, aggiornando la barra di navigazione della lingua nel README di origine e in ogni traduzione. Restituisce un riepilogo dello stato per lingua (ok/fallimento, tempi, file scritti) anziché il testo tradotto; utilizza `translate_markdown` quando desideri il contenuto.

| Parametro | Obbligatorio | Descrizione |
|---------------|----------|-------------|
| `readmePath`  | sì | Percorso assoluto del file README.md di origine |
| `tier`        | no       | `quality` (`translategemma:27b`, predefinito), `bulk` (`12b`) o `draft` (`2b`); ignorato quando `model` è impostato |
| `model`       | no       | Modello Ollama esplicito; sovrascrive `tier` |
| `languages`   | no       | Sottoinsieme di codici delle lingue di destinazione (predefinito: tutte e 7) |
| `concurrency` | no       | Numero massimo di traduzioni simultanee (predefinito: 2, massimo: 3) |
| `navBar`      | no       | Inserisci o aggiorna la barra di navigazione della lingua (predefinito: true) |
| `onLostSpan`  | no       | `report` (predefinito) scrive ogni file ed elenca le sequenze protette perse; `fail` lascia una lingua che ne contiene come errore |

`translate_readme` legge le `.polyglot-terms.json` e le `.polyglot-pins.json` del README se esistono.

## Funzionalità

### Avvio e download automatici
Ollama viene avviato automaticamente se non è in esecuzione. Il modello TranslateGemma viene scaricato automaticamente se non è installato. Non è richiesta alcuna configurazione manuale.

### Riprova con backoff esponenziale
I fallimenti transitori di Ollama (interruzioni di rete, sovraccarico temporaneo) vengono automaticamente riprovati fino a 2 volte con backoff esponenziale (1 s, 2 s). Gli errori non riprovabili (nome del modello errato, input non valido) falliscono immediatamente.

### Suddivisione intelligente
Il testo lungo viene suddiviso in blocchi ai confini naturali: paragrafi, quindi frasi, in modo che il contesto della traduzione venga preservato. Le dimensioni dei blocchi si adattano al modello: 2K caratteri per i modelli da 2B/4B, 4K per 12B, 6K per 27B.

### Cache dei segmenti
I segmenti tradotti vengono memorizzati nella cache in base all'hash del contenuto (SHA-256 del testo di origine mascherato + lingua di destinazione + modello, più un hash delle regole dei termini protetti che corrispondono nel segmento). I segmenti non modificati saltano completamente la ritraduzione, quindi l'esecuzione di una traduzione dopo una modifica interessa solo ciò che è stato modificato. L'aggiunta di un termine protetto modifica la chiave di ogni segmento che lo contiene, quindi una traduzione memorizzata nella cache che ha corretto l'ortografia del termine non viene riprodotta; gli altri segmenti mantengono le loro chiavi. La cache si trova in `.polyglot-cache.json` accanto al file di origine, con un TTL di 30 giorni. Viene utilizzata dalla libreria API `translateMarkdown` quando viene fornito un `filePath` (e dalla CLI `scripts/translate-*.mjs` del repository); gli strumenti MCP traducono senza di essa.

Diverse esecuzioni possono condividere un singolo file di cache. Ogni salvataggio unisce solo le proprie modifiche al file, applicando un blocco, e sostituisce il file in modo atomico, in modo che le lingue tradotte in parallelo mantengano le voci reciproche e la cancellazione della cache per una lingua non influisca sulle altre.

### Memoria di traduzione (Cache fuzzy)
Quando non viene trovata una corrispondenza esatta nella cache, una traduzione memorizzata nella cache viene riutilizzata solo se la sua fonte differisce dalla nuova solo per quanto riguarda il layout degli spazi bianchi: spazi all'interno di una riga, spazi all'inizio o alla fine, o CRLF rispetto a LF. Qualsiasi altra modifica viene ritradotta, inclusa una parola, un numero, un segno di punteggiatura, una lettera o una sequenza di codice inline modificati. Una traduzione memorizzata nella cache è la traduzione della sua fonte originale, quindi riutilizzarla per un testo modificato comporterebbe l'utilizzo della formulazione precedente.

### Termini protetti (`.polyglot-terms.json`)
TranslateGemma riscrive gli identificatori semplici in un altro script: un file README in hindi scrive `XLS-30` come `एक्सएलएस-30` e `Kimi-K3` come `किमी-के3`. Modifica anche i conteggi: il cinese trasforma "218/224" in "224/218". Pertanto, gli identificatori nel testo sono mascherati come sequenze di codice inline: ciascuno viene sostituito con un segnaposto privo di lettere prima della traduzione e ripristinato successivamente. I valori predefiniti sono:

| Modello | Maschere | Non modifica |
|---------|-------|--------------|
| `url` | `https://…` fino agli spazi bianchi, una virgoletta, una parentesi o un apice inverso | |
| `caps-id` | ALL-CAPS token con una cifra o lettere maiuscole unite da `-` o `_`: `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase e mixedCase parole: `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, parole comuni con la prima lettera maiuscola |
| `model-id` | ID di modello e prodotto con una parte alfanumerica: `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |

"N di M" nel testo e nelle celle della tabella (`218 of 224`) viene mascherato come un'unica sequenza e ripristinato come `218/224` in ogni lingua, in modo che sia leggibile ovunque e non possa essere invertito o trasformato in un ordinale. Una cella della tabella che contiene solo un conteggio non viene affatto inviata al modello.

Un repository aggiunge i propri termini in `.polyglot-terms.json` accanto al file README. Ogni campo è facoltativo:

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` sono stringhe esatte, che fanno distinzione tra maiuscole e minuscole, corrispondenti a parole intere; `patterns` sono JavaScript espressioni regolari. Entrambi si aggiungono ai valori predefiniti. `disable` disattiva i valori predefiniti per nome e `"nOfM": false` disattiva la regola del conteggio. Un file che non può essere analizzato interrompe l'esecuzione con `CONFIG_ERROR` invece di tradurre senza i termini richiesti.

### Controllo di sopravvivenza (`--on-lost-span`)
Dopo la traduzione, ogni file di destinazione viene confrontato con la lingua inglese: ogni sequenza protetta (sequenza di codice inline, termine protetto e ogni conteggio come `N/M`) deve essere presente nella traduzione del suo segmento, carattere per carattere. Ogni cella della tabella deve contenere gli stessi numeri della cella di origine, confrontati come un insieme, non in ordine: una traduzione cinese corretta per "218/224" mette il totale per primo (`224 首中的 218 首`), quindi un controllo dell'ordine contrassegnerebbe la risposta corretta. Le cifre di altri script vengono normalizzate prima del confronto. Il file deve anche mantenere i suoi blocchi di codice delimitati e le sequenze di codice inline.

`--on-lost-span=fail|report` determina cosa succede quando qualcosa viene perso:

- **`fail`**: l'esecuzione termina con un codice di errore diverso da zero, insieme a un elenco di lingua, segmento e sequenza mancante. Questo è il valore predefinito per `scripts/translate-all.mjs`, che viene eseguito prima del rilascio. I file vengono comunque scritti, quindi possono essere corretti manualmente e salvati. Il file JSON di riepilogo contiene l'elenco e un errore `LOST_SPAN` nel formato `PolyglotError` standard (`code`, `message`, `hint`, `retryable`).
- **`report`**: l'elenco viene scritto e l'esecuzione termina con il codice 0. Questo è il valore predefinito per gli strumenti MCP (parametro `onLostSpan`) e l'API della libreria `translateMarkdown` (opzione `onLostSpan`, campo risultato `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Traduzioni salvate (`.polyglot-pins.json`)
Una traduzione salvata ha sempre la precedenza. `.polyglot-pins.json` si trova accanto alla cache; ogni voce è indicizzata con un hash del segmento in inglese più la lingua di destinazione e contiene la traduzione corretta manualmente. Una traduzione salvata prevale sulla cache e sul modello e sopravvive a ogni nuova esecuzione, incluso `--cache-clear`. Quando l'inglese cambia, l'hash cambia, quindi una traduzione salvata non può sopravvivere al testo per cui è stata creata.

Per salvare le correzioni manuali, correggere il file tradotto, quindi eseguire:

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

Questo associa ogni segmento dell'inglese al suo testo nel file corretto e salva ogni segmento il cui testo differisce dalla traduzione memorizzata nella cache. `--dry-run` elenca le traduzioni salvate senza salvarle. `--model=NAME` imposta il modello di cui confronta le voci della cache (predefinito: `$POLYGLOT_MODEL` o `translategemma:27b`, lo stesso degli script). `--include-uncached` salva anche i segmenti per i quali la cache non ha una traduzione. Eseguire il commit di `.polyglot-pins.json` e `.polyglot-terms.json` insieme al file README.

### Ollama Cloud (facoltativo)
Impostare `OLLAMA_HOST` per inviare le richieste a un altro server Ollama invece di `localhost:11434`. Per [Ollama Cloud](https://ollama.com), impostare anche `OLLAMA_API_KEY`: la chiave viene inviata come token Bearer e solo a un host non loopback.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Semaforo di concorrenza
Tutte le chiamate a Ollama sono protette da un semaforo di conteggio (limite predefinito: 1) per evitare errori di esaurimento della memoria della GPU su sistemi con VRAM limitata. Sovrascrivere con `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Token di avanzamento MCP
Tutti gli strumenti segnalano l'avanzamento tramite i token MCP `notifications/progress` quando il client fornisce un `progressToken`. Translate segnala per chunk, translate_markdown per batch di segmenti, translate_all per lingua e check_status per passaggio.

### Glossario del software
Un glossario integrato di 12 termini tecnici (API, CLI, SDK, ecc.) garantisce una traduzione coerente della terminologia del software. È possibile passare voci di glossario personalizzate per ogni richiesta e queste vengono unite ai valori predefiniti.

### Traduzione in batch
`translateBatch` raggruppa più segmenti in un'unica richiesta, ove possibile, riducendo il numero di scambi. In caso di problemi con il separatore di batch, torna alla traduzione individuale.

### Modello predefinito configurabile
Il modello predefinito è `translategemma:27b`. Impostare la variabile d'ambiente `POLYGLOT_MODEL` per utilizzare un altro modello, ad esempio su una GPU con meno VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Errori strutturati
Tutti gli errori utilizzano `PolyglotError` con un codice leggibile dalla macchina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, ecc.), un messaggio leggibile dall'uomo, un suggerimento facoltativo e un flag `retryable`.

### Validazione dell'output
Ogni traduzione viene automaticamente convalidata: un output vuoto genera un errore (che può essere ritentato), l’eco del testo di origine viene segnalata, troncamenti eccessivi e allucinazioni vengono avvisate, codifiche errate e commenti meta del modello vengono rilevati. Gli avvisi compaiono nella risposta dello strumento MCP.

### Streaming
`OllamaClient.generateStream()` produce token tramite NDJSON, come fa Ollama. La funzione `translate()` accetta una funzione di callback `onToken` per visualizzare l’avanzamento in tempo reale. Sia il flusso continuo che quello non continuo condividono la logica di ripetizione.

## Lingue supportate

Afrikaans, albanese, arabo, bengalese, bulgaro, catalano, cinese (semplificato), cinese (tradizionale), croato, ceco, danese, olandese, inglese, estone, finlandese, francese, galiziano, tedesco, greco, gujarati, ebraico, hindi, ungherese, indonesiano, irlandese, italiano, giapponese, kannada, coreano, lettone, lituano, macedone, malese, malayalam, maltese, marathi, norvegese, persiano, polacco, portoghese, rumeno, russo, gaelico scozzese, serbo, slovacco, sloveno, spagnolo, swahili, svedese, tamil, telugu, tailandese, turco, ucraino, urdu, vietnamita, gallese.

## Prestazioni

| Metrica | 27B (predefinito), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| Prima traduzione (caricamento del modello a freddo) | ~30 s | ~15 s |
| Traduzioni successive | ~1–2 s per batch di segmenti README | ~600 ms |
| Memoria del modello | 17 GB, interamente sulla GPU (come riportato da `ollama ps`) | ~8,1 GB |

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

## Sicurezza e ambito dei dati

| Aspetto | Dettaglio |
|--------|--------|
| **Data touched** | Testo inviato all’API di Ollama: locale (`localhost:11434`) per impostazione predefinita, oppure l’host in `OLLAMA_HOST` se ne viene specificato uno. Cache dei segmenti `.polyglot-cache.json` accanto a un file tradotto (solo per libreria e CLI). `.polyglot-terms.json` e `.polyglot-pins.json` accanto a un README tradotto vengono letti, se presenti. |
| **Files written** | `translate_readme` scrive `README.<lang>.md` accanto al README che gli viene passato e aggiorna la barra di navigazione della lingua di quel README. `scripts/pin-translation.mjs` scrive `.polyglot-pins.json` accanto al README. |
| **Data NOT touched** | Nessun dato del browser, nessuna credenziale del sistema operativo, nulla al di fuori delle directory di cui sopra. |
| **Network** | HTTP solo verso `localhost:11434` per impostazione predefinita: zero traffico esterno. Solo remoto quando `OLLAMA_HOST` punta altrove. |
| **Secrets** | `OLLAMA_API_KEY`, se impostato, viene letto dall’ambiente e inviato solo come token Bearer a un `OLLAMA_HOST` non in loopback; non viene mai scritto su disco o registrato. |
| **Telemetry** | Nessun dato raccolto o inviato. |

Consultare [SECURITY.md](SECURITY.md) per la politica di segnalazione delle vulnerabilità.

## Sviluppo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 435 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licenza

MIT: vedere [LICENSE](LICENSE).

> Creato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
