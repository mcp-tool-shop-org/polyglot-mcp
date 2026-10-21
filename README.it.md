<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Server di traduzione MCP con GPU locale: 57 lingue, nessuna dipendenza dal cloud.</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="node 20+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## A cosa serve

Traduce il testo tra 57 lingue utilizzando [TranslateGemma](https://ollama.com/library/translategemma), che viene eseguito localmente sulla tua GPU tramite [Ollama](https://ollama.com). Non sono richieste chiavi API, non è necessario l’utilizzo del cloud e non ci sono limiti di utilizzo: per impostazione predefinita, tutto rimane sulla tua macchina. Puoi scegliere di utilizzare un’istanza Ollama remota, come [Ollama Cloud](#ollama-cloud-facoltativo).

## Guida rapida

### 1. Installa Ollama

Scarica il programma da [ollama.com](https://ollama.com) e avvialo:

```bash
ollama serve
```

### 2. Richiama un modello

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **Suggerimento:** è possibile saltare questo passaggio: Polyglot scarica automaticamente il modello predefinito (27B, 17 GB) al primo utilizzo. Se si utilizza una GPU meno potente, impostare prima `POLYGLOT_MODEL=translategemma:12b` (vedere [Modello predefinito configurabile](#modello-predefinito-configurabile)).

### 3. Aggiungi al tuo client MCP

**Claude Code / Claude Desktop:** aggiungilo a `claude_desktop_config.json` o `.mcp.json`:

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

**Fonte:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

Ecco fatto. Chiedi a Claude di tradurre qualcosa e utilizzerà automaticamente lo strumento `translate`.

## Strumenti

Polyglot presenta sei strumenti MCP:

### `translate`

Traduci il testo tra qualsiasi coppia di lingue supportate.

| Parametro | Obbligatorio | Descrizione |
|-------------|----------|-------------|
| `text`      | sì | Testo da tradurre |
| `from`      | sì | Codice o nome della lingua di origine (ad esempio, `en`, `English`) |
| `to`        | sì | Codice o nome della lingua di destinazione (ad esempio, `ja`, `Japanese`) |
| `model`     | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `glossary`  | no       | Possibilità di definire termini personalizzati che sovrascrivono quelli predefiniti, come in `{"source": "translation"}`, e che vengono integrati nel glossario software integrato. |

I testi lunghi vengono automaticamente suddivisi in segmenti in corrispondenza dei confini dei paragrafi e delle frasi, tradotti in sequenza e poi ricomposti. Tutte le traduzioni vengono sottoposte a una verifica di qualità per individuare eventuali problemi (output vuoto, ripetizioni, troncamenti, testo incoerente).

### `translate_markdown`

Traduce un intero documento in formato Markdown preservandone la struttura. I blocchi di codice, gli elementi HTML, i badge, gli URL e la formattazione delle tabelle vengono mantenuti intatti; solo il contenuto testuale (titoli, paragrafi, slogan, celle della tabella) viene tradotto. Le porzioni di codice inline e i [termini protetti](#termini-protetti-polyglot-termsjson) vengono sostituiti con dei segnaposto prima della traduzione e ripristinati successivamente, in modo che i comandi, i flag, i nomi dei pacchetti e gli identificatori vengano ripristinati esattamente come sono stati scritti, e ogni conteggio di tipo "N su M" viene ripristinato come `N/M`.

| Parametro | Obbligatorio | Descrizione |
|--------------|----------|-------------|
| `markdown`   | sì | Il testo completo in formato Markdown da tradurre. |
| `from`       | sì | Codice o nome della lingua di origine |
| `to`         | sì | Codice o nome della lingua di destinazione. |
| `model`      | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `onLostSpan` | no       | `report` (impostazione predefinita) elenca i segmenti protetti che mancano nella traduzione; `fail` trasforma questa mancanza in un errore. Consultare [Controllo di integrità](#controllo-di-sopravvivenza---on-lost-span). |

### `list_languages`

Elenca tutte le 57 lingue supportate, indicando i relativi codici.

### `check_status`

Verifica se Ollama è in esecuzione e quali modelli TranslateGemma sono installati. Se Ollama non è in esecuzione, il sistema tenterà di avviarlo automaticamente.

### `translate_all`

Traduce contenuti in formato Markdown in più lingue contemporaneamente (impostazione predefinita: 7 lingue: giapponese, cinese, spagnolo, francese, hindi, italiano, portoghese). Esegue le traduzioni in parallelo, utilizzando un sistema di semafori che ne limita l’utilizzo della GPU.

| Parametro | Obbligatorio | Descrizione |
|---------------|----------|-------------|
| `markdown`    | sì | Il testo completo in formato Markdown da tradurre. |
| `from`        | no       | Codice della lingua di origine (predefinito: `en`) |
| `languages`   | no       | Elenco dei codici delle lingue di destinazione (valore predefinito: tutte e 7). |
| `model`       | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `concurrency` | no       | Numero massimo di traduzioni simultanee (valore predefinito: 2, massimo: 3) |
| `navBar`      | no       | Inserire la barra di navigazione linguistica (impostazione predefinita: sì) |
| `onLostSpan`  | no       | `report` (impostazione predefinita) elenca gli intervalli protetti persi per ciascuna lingua; `fail` trasforma una lingua che contiene qualsiasi elemento in un errore. |

### `translate_readme`

Traduci il file README.md nelle stesse 7 lingue e crea i file `README.<lang>.md` corrispondenti, posizionandoli accanto al file originale. Aggiorna la barra di navigazione delle lingue nel file README originale e in ogni traduzione. Restituisce un riepilogo dello stato per ciascuna lingua (esito positivo/negativo, tempi di esecuzione, file creati) invece del testo tradotto; utilizza `translate_markdown` se desideri recuperare il contenuto.

| Parametro | Obbligatorio | Descrizione |
|---------------|----------|-------------|
| `readmePath`  | sì | Percorso assoluto del file README.md. |
| `tier`        | no       | `quality` (`translategemma:27b`, valore predefinito), `bulk` (`12b`) o `draft` (`2b`); viene ignorato quando `model` è impostato. |
| `model`       | no       | Modello Ollama specificato esplicitamente; sovrascrive `tier`. |
| `languages`   | no       | Sottoinsieme dei codici della lingua di destinazione (impostazione predefinita: tutti e 7) |
| `concurrency` | no       | Numero massimo di traduzioni simultanee (valore predefinito: 2, massimo: 3) |
| `navBar`      | no       | Abilitare o aggiornare la barra di navigazione della lingua (impostazione predefinita: sì). |
| `onLostSpan`  | no       | `report` (impostazione predefinita) scrive ogni file ed elenca gli intervalli protetti non salvati; `fail` lascia inalterata una lingua anche se contiene elementi non scritti, segnalandolo come errore. |

`translate_readme` legge i file `.polyglot-terms.json` e `.polyglot-pins.json` del README, se esistenti.

## Caratteristiche

### Avvio automatico e riavvolgimento automatico
Ollama viene avviato automaticamente se non è in esecuzione. Il modello TranslateGemma viene scaricato automaticamente se non è installato. Non è richiesta alcuna configurazione manuale.

### Riprova con un intervallo di attesa esponenziale
I problemi temporanei di Ollama (interruzioni della rete, sovraccarichi momentanei) vengono automaticamente ripetuti fino a un massimo di 2 volte, con un intervallo di tempo crescente tra i tentativi (1 secondo, 2 secondi). Gli errori non ripetibili (nome del modello non valido, input non corretto) causano l’interruzione immediata del processo.

### Suddivisione intelligente in blocchi
I testi lunghi vengono suddivisi in sezioni in base a criteri logici – prima in paragrafi, poi in frasi – in modo da preservare il contesto della traduzione. Le dimensioni delle sezioni si adattano al modello: 2.000 caratteri per i modelli da 2B/4B, 4.000 per il modello da 12B, 6.000 per il modello da 27B.

### Cache dei segmenti
I segmenti tradotti vengono memorizzati nella cache in base all’hash del contenuto (l’hash di SHA-256 del testo di origine mascherato, più la lingua di destinazione e il modello, oltre a un hash delle regole relative ai termini protetti che sono state applicate al segmento). I segmenti non modificati non vengono ritradotti, quindi rieseguire una traduzione dopo una modifica interessa solo le parti che sono state modificate. L’aggiunta di un termine protetto modifica la chiave di ogni segmento che lo contiene, quindi una traduzione memorizzata nella cache che ha riformulato il termine non viene riutilizzata; gli altri segmenti mantengono le loro chiavi. La cache si trova in `.polyglot-cache.json`, accanto al file di origine, e ha una durata di 30 giorni. Viene utilizzata dall’API della libreria `translateMarkdown` quando viene fornito un `filePath` (e dagli strumenti a riga di comando `scripts/translate-*.mjs` del repository); gli strumenti MCP eseguono la traduzione senza di essa.

Diverse esecuzioni possono condividere un singolo file di cache. Ogni salvataggio unisce solo le proprie modifiche al file, applicando un blocco, e sostituisce il file in modo atomico, in modo che le lingue tradotte in parallelo mantengano le voci reciproche e la cancellazione della cache per una lingua non influisca sulle altre.

### Memoria di traduzione (Cache fuzzy)
Quando non viene trovata una corrispondenza esatta nella cache, una traduzione memorizzata nella cache viene riutilizzata solo se la sua fonte differisce dalla nuova solo per quanto riguarda il layout degli spazi bianchi: spazi all'interno di una riga, spazi all'inizio o alla fine, o CRLF rispetto a LF. Qualsiasi altra modifica viene ritradotta, inclusa una parola, un numero, un segno di punteggiatura, una lettera o un intervallo di codice inline modificati. Una traduzione memorizzata nella cache è la traduzione della sua fonte originale, quindi riutilizzarla per un testo modificato comporterebbe l'utilizzo della formulazione precedente.

### Termini protetti (`.polyglot-terms.json`)
TranslateGemma riscrive gli identificatori semplici in un altro script: un file README in hindi scrive `XLS-30` come `एक्सएलएस-30` e `Kimi-K3` come `किमी-के3`. Modifica anche i conteggi: il cinese trasforma "218/224" in "224/218". Pertanto, gli identificatori nel testo sono mascherati come intervalli di codice inline: ciascuno viene sostituito con un segnaposto privo di lettere prima della traduzione e ripristinato dopo. I valori predefiniti sono:

| Modello | Maschere | Non modifica |
|---------|-------|--------------|
| `url` | `https://…` fino agli spazi bianchi, una virgoletta, una parentesi o un apice inverso | |
| `caps-id` | ALL-CAPS token con una cifra o lettere maiuscole unite da `-` o `_`: `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase e mixedCase parole: `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, parole comuni con iniziali maiuscole |
| `model-id` | ID di modello e prodotto con una parte alfanumerica: `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |
| `anchor` | Target `#slug` all'interno della pagina nei collegamenti Markdown (`[text](#slug)`, `[text](#slug "title")`) e nelle definizioni di riferimento (`[label]: #slug`), in modo che il modello traduca il testo del collegamento senza alterare il frammento. | `#123` nel testo, `#heading` righe, URL esterni `https://…#frag` (coperti da `url`) |

Dopo che tutti i segmenti sono stati tradotti e riassemblati, ogni intestazione ATX della fonte viene associata alla sua intestazione ATX tradotta e viene creata una stringa univoca in ordine di documento con `github-slugger` (corrispondente agli ID delle intestazioni di GitHub, inclusi i suffissi `-1`, `-2` per le intestazioni duplicate) e ogni ancoraggio non di codice all'interno della pagina (`[text](#slug)`, `[label]: #slug` e HTML `href="#slug"`) viene riscritto con la stringa univoca dell'intestazione tradotta.

"N di M" nel testo e nelle celle della tabella (`218 of 224`) viene mascherato come un singolo intervallo e ripristinato come `218/224` in ogni lingua, il che lo rende leggibile ovunque e non può essere invertito o trasformato in un ordinale. Una cella di tabella che contiene solo un conteggio non viene affatto inviata al modello.

Un repository aggiunge i propri termini in `.polyglot-terms.json` accanto al file README. Ogni campo è facoltativo:

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` sono stringhe esatte, che fanno distinzione tra maiuscole e minuscole, corrispondenti a parole intere; `patterns` sono JavaScript espressioni regolari. Entrambi si aggiungono ai valori predefiniti. `disable` disattiva i valori predefiniti per nome (ad esempio, `"disable": ["anchor"]` disattiva la mascheratura degli ancoraggi all'interno della pagina, la riscrittura delle stringhe univoche dopo l'assemblaggio e il controllo della sopravvivenza degli ancoraggi) e `"nOfM": false` disattiva la regola del conteggio. Un file che non può essere analizzato interrompe l'esecuzione con `CONFIG_ERROR` invece di tradurre senza i termini richiesti.

### Controllo di sopravvivenza (`--on-lost-span`)
Dopo la traduzione, ogni file di destinazione viene confrontato con la lingua inglese: ogni intervallo protetto (intervallo di codice inline, termine protetto e ogni conteggio come `N/M`) deve essere presente nella traduzione del suo segmento, carattere per carattere, e ogni ancoraggio `#slug` all'interno della pagina che si risolve nella fonte inglese deve risolversi nella traduzione in una stringa univoca dell'intestazione ATX tradotta o in un ancoraggio HTML esplicito `id=`/`name=` (un ancoraggio che non si risolveva già nella fonte inglese viene segnalato come avviso e non interrompe mai l'esecuzione). Ogni cella della tabella deve contenere gli stessi numeri della cella di origine, confrontati come un insieme, non in ordine: una traduzione cinese corretta per "218/224" mette il totale per primo (`224 首中的 218 首`), quindi un controllo dell'ordine contrassegnerebbe la risposta corretta. Le cifre di altri script vengono normalizzate prima del confronto. Il file deve anche mantenere i blocchi di codice delimitati e gli intervalli di codice inline.

`--on-lost-span=fail|report` determina cosa succede quando qualcosa viene perso:

- **`fail`**: l'esecuzione termina con un codice di errore diverso da zero, insieme a un elenco di lingua, segmento e intervallo mancante. Questo è il valore predefinito per `scripts/translate-all.mjs`, che viene eseguito prima del rilascio. I file vengono comunque scritti, quindi possono essere corretti manualmente e fissati. Il file JSON di riepilogo contiene l'elenco e un errore `LOST_SPAN` nella forma `PolyglotError` standard (`code`, `message`, `hint`, `retryable`).
- **`report`**: l'elenco viene scritto e l'esecuzione termina con il codice 0. Questo è il valore predefinito per gli strumenti MCP (parametro `onLostSpan`) e per l'API della libreria `translateMarkdown` (opzione `onLostSpan`, campo risultato `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Traduzioni fissate (`.polyglot-pins.json`)
Una traduzione fissata ha sempre la precedenza. `.polyglot-pins.json` si trova accanto alla cache; ogni voce è indicizzata con un hash del segmento inglese più la lingua di destinazione e contiene la traduzione corretta manualmente. Una traduzione fissata prevale sulla cache e sul modello e sopravvive a ogni nuova esecuzione, inclusa `--cache-clear`. Quando la lingua inglese cambia, anche l'hash cambia, quindi una traduzione fissata non può sopravvivere al testo per cui è stata creata.

Per fissare le correzioni manuali, correggere il file tradotto, quindi eseguire:

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

Associa ogni segmento della lingua inglese al suo testo nel file corretto e fissa ogni segmento il cui testo differisce dalla traduzione memorizzata nella cache. `--dry-run` elenca le traduzioni fissate senza scriverle. `--model=NAME` imposta il modello le cui voci della cache vengono confrontate (predefinito: `$POLYGLOT_MODEL` o `translategemma:27b`, lo stesso degli script). `--include-uncached` fissa anche i segmenti per i quali la cache non ha una traduzione. Eseguire il commit di `.polyglot-pins.json` e `.polyglot-terms.json` insieme al file README.

### Ollama Cloud (facoltativo)
Impostare `OLLAMA_HOST` per inviare le richieste a un altro server Ollama invece di `localhost:11434`. Per [Ollama Cloud](https://ollama.com), impostare anche `OLLAMA_API_KEY`: la chiave viene inviata come token Bearer e solo a un host non di loopback.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Semaforo di concorrenza
Tutte le chiamate a Ollama sono protette da un semaforo di conteggio (limite predefinito: 1) per evitare errori di esaurimento della memoria della GPU sui sistemi con VRAM limitata. Sovrascrivere con `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Token di avanzamento MCP
Tutti gli strumenti segnalano lo stato di avanzamento tramite MCP `notifications/progress` quando il client fornisce un `progressToken`. Le traduzioni vengono eseguite per blocco, `translate_markdown` per batch di segmenti, `translate_all` per lingua e `check_status` per fase.

### Glossario del software
Un glossario integrato di 12 termini tecnici (API, CLI, SDK, ecc.) garantisce una traduzione coerente della terminologia del software. È possibile passare voci di glossario personalizzate per ogni richiesta e queste vengono unite a quelle predefinite.

### Traduzione in batch
`translateBatch` raggruppa più segmenti in un'unica richiesta, quando possibile, riducendo il numero di richieste e risposte. In caso di problemi con il separatore di batch, si passa alla traduzione individuale.

### Modello predefinito configurabile
Il modello predefinito è `translategemma:27b`. Imposta la variabile d'ambiente `POLYGLOT_MODEL` per utilizzare un altro modello, ad esempio su una GPU con meno VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Errori strutturati
Tutti gli errori utilizzano `PolyglotError` con un codice leggibile dalla macchina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, ecc.), un messaggio leggibile dall'utente, un suggerimento facoltativo e un flag `retryable`.

### Validazione dell'output
Ogni traduzione viene automaticamente validata: l'output vuoto genera un errore (che può essere ritentato), l'eco del testo di origine viene segnalata, la troncatura eccessiva e le allucinazioni vengono avvisate, la codifica errata e i meta-commenti del modello vengono rilevati. Gli avvisi compaiono nella risposta dello strumento MCP.

### Streaming
`OllamaClient.generateStream()` produce token tramite NDJSON, man mano che Ollama li genera. La funzione `translate()` accetta una funzione di callback `onToken` per visualizzare lo stato di avanzamento in tempo reale. Sia il flusso continuo che quello non continuo condividono la logica di ripetizione.

## Lingue supportate

Afrikaans, Albanese, Arabo, Bengali, Bulgaro, Catalano, Cinese (semplificato), Cinese (tradizionale), Croato, Ceco, Danese, Olandese, Inglese, Estone, Finlandese, Francese, Galiziano, Tedesco, Greco, Gujarati, Ebraico, Hindi, Ungherese, Indonesiano, Irlandese, Italiano, Giapponese, Kannada, Coreano, Lettone, Lituano, Macedone, Malese, Malayalam, Maltese, Marathi, Norvegese, Persiano, Polacco, Portoghese, Rumeno, Russo, Gaelico scozzese, Serbo, Slovacco, Sloveno, Spagnolo, Swahili, Svedese, Tamil, Telugu, Tailandese, Turco, Ucraino, Urdu, Vietnamita, Gallese.

## Prestazioni

| Metrica | 27B (predefinito), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| Prima traduzione (caricamento del modello a freddo) | ~30 s | ~15 s |
| Traduzioni successive | ~1–2 s per batch di segmenti del file README | ~600 ms |
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
| **Data touched** | Testo inviato all'API di Ollama: locale (`localhost:11434`) per impostazione predefinita, oppure l'host in `OLLAMA_HOST` se ne viene specificato uno. Cache di `.polyglot-cache.json` segmenti accanto a un file tradotto (solo per libreria e CLI). `.polyglot-terms.json` e `.polyglot-pins.json` accanto a un file README tradotto vengono letti, se presenti. |
| **Files written** | `translate_readme` scrive `README.<lang>.md` accanto al file README che gli viene passato e aggiorna la barra di navigazione della lingua di quel file README. `scripts/pin-translation.mjs` scrive `.polyglot-pins.json` accanto al file README. |
| **Data NOT touched** | Nessun dato del browser, nessuna credenziale del sistema operativo, nulla al di fuori delle directory di cui sopra. |
| **Network** | HTTP verso `localhost:11434` solo per impostazione predefinita: zero traffico esterno. Solo remoto quando `OLLAMA_HOST` punta altrove. |
| **Secrets** | `OLLAMA_API_KEY`, se impostato, viene letto dall'ambiente e inviato solo come token Bearer a un `OLLAMA_HOST` non in loopback; non viene mai scritto su disco o registrato. |
| **Telemetry** | Nessun dato raccolto o inviato. |

Consultare [SECURITY.md](SECURITY.md) per la politica di segnalazione delle vulnerabilità.

## Sviluppo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 467 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licenza

MIT: vedere [LICENSE](LICENSE).

> Creato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
