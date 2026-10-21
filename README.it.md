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

## Funzionalità

Traduce il testo tra 57 lingue utilizzando [TranslateGemma](https://ollama.com/library/translategemma) in esecuzione localmente sulla GPU tramite [Ollama](https://ollama.com). Nessuna chiave API, nessun cloud, nessun limite di frequenza: per impostazione predefinita, tutto rimane sulla tua macchina. Puoi scegliere di utilizzare un Ollama remoto, come [Ollama Cloud](#ollama-cloud-opzionale).

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
| `text`      | sì | Testo da tradurre |
| `from`      | sì | Codice o nome della lingua di origine (ad esempio, `en`, `English`) |
| `to`        | sì | Codice o nome della lingua di destinazione (ad esempio, `ja`, `Japanese`) |
| `model`     | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `glossary`  | no       | Override personalizzati dei termini, come `{"source": "translation"}`: vengono uniti al glossario software integrato |

Il testo lungo viene automaticamente suddiviso in blocchi ai confini di paragrafi e frasi, tradotto in sequenza e riassemblato. Tutte le traduzioni vengono convalidate per la qualità (output vuoto, rilevamento di eco, troncamento, testo distorto).

### `translate_markdown`

Traduce un intero documento Markdown preservando la struttura. I blocchi di codice, gli elementi HTML, i badge, gli URL e la formattazione della tabella vengono mantenuti intatti: solo il contenuto in prosa (intestazioni, paragrafi, slogan, celle della tabella) viene tradotto. Le sequenze di codice inline e i [termini protetti](#termini-protetti-polyglot-termsjson) vengono sostituiti con segnaposto prima della traduzione e ripristinati dopo, in modo che i comandi, i flag, i nomi dei pacchetti e gli identificatori vengano restituiti esattamente come sono stati scritti e ogni conteggio "N di M" viene restituito come `N/M`.

| Parametro | Obbligatorio | Descrizione |
|--------------|----------|-------------|
| `markdown`   | sì | Il contenuto Markdown completo da tradurre |
| `from`       | sì | Codice o nome della lingua di origine |
| `to`         | sì | Codice o nome della lingua di destinazione |
| `model`      | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `onLostSpan` | no       | `report` (predefinito) elenca le sequenze protette mancanti nella traduzione; `fail` trasforma questo in un errore. Vedi [Controllo di sopravvivenza](#controllo-di-sopravvivenza---on-lost-span). |

### `list_languages`

Elenca tutte le 57 lingue supportate con i rispettivi codici.

### `check_status`

Verifica se Ollama è in esecuzione e quali modelli TranslateGemma sono installati. Tenta di avviarlo automaticamente se Ollama non è in esecuzione.

### `translate_all`

Traduce il contenuto Markdown in più lingue contemporaneamente (predefinito: 7: giapponese, cinese, spagnolo, francese, hindi, italiano, portoghese). Esegue le traduzioni in parallelo con un limite di semaforo sicuro per la GPU.

| Parametro | Obbligatorio | Descrizione |
|---------------|----------|-------------|
| `markdown`    | sì | Il contenuto Markdown completo da tradurre |
| `from`        | no       | Codice della lingua di origine (predefinito: `en`) |
| `languages`   | no       | Array di codici delle lingue di destinazione (predefinito: tutte e 7) |
| `model`       | no       | Modello Ollama (predefinito: `translategemma:27b`) |
| `concurrency` | no       | Numero massimo di traduzioni simultanee (predefinito: 2, massimo: 3) |
| `navBar`      | no       | Inserisci la barra di navigazione della lingua (predefinito: true) |
| `onLostSpan`  | no       | `report` (predefinito) elenca le sequenze protette perse per lingua; `fail` trasforma una lingua che ne contiene in un errore |

### `translate_readme`

Traduce un file README.md nelle stesse 7 lingue e scrive i file `README.<lang>.md` accanto ad esso, aggiornando la barra di navigazione della lingua nel README di origine e in ogni traduzione. Restituisce un riepilogo dello stato per lingua (ok/fallimento, tempi, file scritti) anziché il testo tradotto; utilizza `translate_markdown` quando desideri ottenere il contenuto.

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
I fallimenti temporanei di Ollama (interruzioni di rete, sovraccarico temporaneo) vengono automaticamente riprovati fino a 2 volte con backoff esponenziale (1 s, 2 s). Gli errori non riprovabili (nome del modello errato, input non valido) falliscono immediatamente.

### Suddivisione intelligente
Il testo lungo viene suddiviso in blocchi in corrispondenza dei confini naturali: paragrafi, quindi frasi, in modo che il contesto della traduzione venga preservato. Le dimensioni dei blocchi si adattano al modello: 2K caratteri per i modelli da 2B/4B, 4K per 12B, 6K per 27B.

### Cache dei segmenti
I segmenti tradotti vengono memorizzati nella cache in base all'hash del contenuto (SHA-256 del testo di origine mascherato + lingua di destinazione + modello, più un hash delle regole dei termini protetti che corrispondono nel segmento). I segmenti non modificati saltano completamente la ritraduzione, quindi l'esecuzione di una traduzione dopo una modifica influisce solo su ciò che è stato modificato. L'aggiunta di un termine protetto modifica la chiave di ogni segmento che lo contiene, quindi una traduzione memorizzata nella cache che ha corretto l'ortografia del termine non viene riprodotta; gli altri segmenti mantengono le loro chiavi. La cache si trova in `.polyglot-cache.json` accanto al file di origine, con un TTL di 30 giorni. Viene utilizzata dalla libreria API `translateMarkdown` quando viene fornito un `filePath` (e dalla CLI `scripts/translate-*.mjs` del repository); gli strumenti MCP traducono senza di essa.

Diverse esecuzioni possono condividere un singolo file di cache. Ogni salvataggio unisce solo le proprie modifiche nel file sotto un blocco e sostituisce il file in modo atomico, in modo che le lingue tradotte in parallelo mantengano le voci reciproche e la cancellazione della cache per una lingua lascia intatte le altre.

### Memoria di traduzione (cache fuzzy)
Quando non viene trovata una corrispondenza esatta nella cache, una traduzione memorizzata nella cache viene riutilizzata solo se la sua fonte differisce dalla nuova solo per quanto riguarda il layout degli spazi bianchi: spazi all'interno di una riga, spazi all'inizio o alla fine, o CRLF rispetto a LF. Qualsiasi altra modifica comporta una nuova traduzione, inclusa una parola, un numero, un segno di punteggiatura, una lettera o un frammento di codice inline modificati. Una traduzione memorizzata nella cache è la traduzione della sua fonte originale, quindi riutilizzarla per un testo modificato comporterebbe l'utilizzo della formulazione precedente.

### Termini protetti (`.polyglot-terms.json`)
TranslateGemma riscrive gli identificatori semplici in un altro script: un file README in hindi scrive `XLS-30` come `एक्सएलएस-30` e `Kimi-K3` come `किमी-के3`. Modifica anche i conteggi: il cinese trasforma "218/224" in "224/218". Pertanto, gli identificatori nel testo vengono mascherati come frammenti di codice inline: ciascuno viene sostituito con un segnaposto privo di lettere prima della traduzione e ripristinato dopo. I valori predefiniti sono:

| Modello | Maschere | Lascia invariato |
|---------|-------|--------------|
| `url` | `https://…` fino agli spazi bianchi, una virgoletta, una parentesi quadra o un apice inverso (consentendo un livello di parentesi bilanciate, come `https://en.wikipedia.org/wiki/Foo_(bar)`) | |
| `anchor` | Target `#slug` all'interno della pagina nei collegamenti Markdown (`[text](#slug)`, `[text](#slug "title")`), nelle definizioni di riferimento (`[label]: #slug`) e negli attributi HTML `href="#slug"`, in modo che il modello traduca il testo del collegamento senza alterare il frammento. | `#123` nel testo, `#heading` righe, URL esterni `https://…#frag` (coperti da `url`) |
| `link-target` | Target non HTTP(S) e non di ancoraggio nei collegamenti inline, nelle immagini e nelle definizioni di riferimento Markdown: percorsi relativi (`../facet`, `docs/Kimi-K3.md`), nomi di file semplici (`LICENSE`), `mailto:`, `<path with spaces>` e percorsi con un livello di parentesi bilanciate (`docs/Foo_(bar).md`) | Titoli dei collegamenti (`"MIT License"`), attributi HTML (`href="…"`, `src="…"`) |
| `caps-id` | ALL-CAPS token con una cifra o lettere maiuscole unite da `-` o `_`: `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase e mixedCase parole: `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, parole comuni con iniziale maiuscola |
| `model-id` | ID di modello e prodotto con una parte alfanumerica: `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |

Dopo che tutti i segmenti sono stati tradotti e riassemblati, ogni intestazione ATX della fonte viene associata alla sua intestazione ATX tradotta e viene creata una stringa univoca in ordine di documento con `github-slugger` (corrispondente agli ID delle intestazioni di GitHub, inclusi i suffissi `-1`, `-2` per le intestazioni duplicate) e ogni elemento non di codice all'interno della pagina (`[text](#slug)`, `[label]: #slug` e attributi HTML `href="#slug"`) viene riscritto con la stringa univoca dell'intestazione tradotta.

"N di M" nel testo e nelle celle della tabella (`218 of 224`) viene mascherato come un singolo elemento e ripristinato come `218/224` in ogni lingua, in modo che venga letto correttamente ovunque e non possa essere invertito o trasformato in un ordinale. Una cella della tabella che contiene solo un conteggio non viene affatto inviata al modello.

Un repository aggiunge i propri termini in `.polyglot-terms.json` accanto al file README. Ogni campo è facoltativo:

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` sono stringhe esatte, che fanno distinzione tra maiuscole e minuscole, corrispondenti a parole intere; `patterns` sono JavaScript espressioni regolari. Entrambi si aggiungono ai valori predefiniti. `disable` disattiva i valori predefiniti per nome (ad esempio, `"disable": ["anchor"]` disattiva la mascheratura degli ancoraggi all'interno della pagina, la riscrittura delle stringhe univoche dopo l'assemblaggio e il controllo della sopravvivenza degli ancoraggi; `"disable": ["link-target"]` disattiva la mascheratura dei target dei collegamenti non HTTP e salta i target relativi/non HTTP nel controllo della sopravvivenza dei collegamenti in modo che i collegamenti ai file localizzati come `./docs/guide.fr.md` vengano gestiti correttamente) e `"nOfM": false` disattiva la regola del conteggio. Un file che non può essere analizzato interrompe l'esecuzione con `CONFIG_ERROR` invece di tradurre senza i termini richiesti.

### Controllo di sopravvivenza (`--on-lost-span`)
Dopo la traduzione, ogni file di destinazione viene controllato rispetto alla lingua inglese: ogni elemento protetto (frammento di codice inline, termine protetto e ogni conteggio come `N/M`) deve essere presente nella traduzione del suo segmento, carattere per carattere, e ogni ancoraggio `#slug` all'interno della pagina che si risolveva nella fonte inglese deve risolversi nella traduzione in una stringa univoca dell'intestazione ATX tradotta o in un ancoraggio HTML esplicito `id=`/`name=` (un ancoraggio che non si risolveva già nella fonte inglese viene segnalato come avviso e non interrompe mai l'esecuzione; se i conteggi degli ancoraggi di origine e di traduzione differiscono e un ancoraggio valido per la fonte è coinvolto, la mancata corrispondenza viene segnalata anche come `LostSpan` di tipo `"anchor"` a meno che non sia già stata segnalata dal controllo dei collegamenti del segmento). I collegamenti Markdown di ogni segmento (`[text](target)`, `[text](target "title")`, immagini `![alt](src)`, collegamenti di riferimento `[text][label]`, elementi collassati `[text][]` e collegamenti rapidi `[label]` risolti rispetto alle definizioni del file `[label]: target`) devono preservare l'insieme esatto di target di collegamento non di ancoraggio e il conteggio esatto dei collegamenti `#slug` all'interno della pagina (segnalato come tipo `"link"` quando un collegamento è interrotto, non chiuso o eliminato). Qualsiasi delimitatore di segnaposto `⟦` o `⟧` non sostituito lasciato al di fuori del codice in un segmento tradotto oltre a quanto presente nella fonte viene segnalato come tipo `"placeholder"`. Ogni cella della tabella deve contenere gli stessi numeri della cella di origine, confrontati come un insieme, non in ordine: una traduzione cinese corretta per "218/224" mette il totale per primo (`224 首中的 218 首`), quindi un controllo dell'ordine segnalerebbe la risposta corretta. Le cifre di altri script vengono normalizzate prima del confronto. Il file deve anche mantenere i blocchi di codice delimitati e i frammenti di codice inline.

`--on-lost-span=fail|report` determina cosa succede quando qualcosa viene perso:

- **`fail`**: l'esecuzione termina con un codice di errore diverso da zero e viene visualizzato un elenco di lingua, segmento ed elemento mancante. Questo è il valore predefinito per `scripts/translate-all.mjs`, che viene eseguito prima del rilascio. I file vengono comunque scritti, quindi possono essere corretti manualmente e salvati. Il file JSON di riepilogo contiene l'elenco e un errore `LOST_SPAN` nel formato `PolyglotError` standard (`code`, `message`, `hint`, `retryable`).
- **`report`**: l'elenco viene scritto e l'esecuzione termina con codice 0. Questo è il valore predefinito per gli strumenti MCP (parametro `onLostSpan`) e per l'API della libreria `translateMarkdown` (opzione `onLostSpan`, campo del risultato `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Traduzioni salvate (`.polyglot-pins.json`)
Una traduzione salvata ha sempre la precedenza. `.polyglot-pins.json` si trova accanto alla cache; ogni voce è indicizzata con un hash del segmento inglese più la lingua di destinazione e contiene la traduzione corretta manualmente. Una traduzione salvata prevale sulla cache e sul modello e sopravvive a ogni esecuzione successiva, incluso `--cache-clear`. Quando l'inglese cambia, l'hash cambia, quindi una traduzione salvata non può sopravvivere al testo per cui è stata creata.

Per salvare le correzioni manuali, correggere il file tradotto, quindi eseguire:

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

Associa ogni segmento del testo inglese con il testo corrispondente nel file corretto e contrassegna ogni segmento il cui testo differisce dalla traduzione memorizzata nella cache. `--dry-run` elenca i contrassegni senza salvarli. `--model=NAME` imposta il modello di cui confronta le voci della cache (impostazione predefinita: `$POLYGLOT_MODEL` o `translategemma:27b`, come negli script). `--include-uncached` contrassegna anche i segmenti per i quali la cache non dispone di una traduzione. Esegui il commit di `.polyglot-pins.json` e `.polyglot-terms.json` insieme al file README.

### Ollama Cloud (opzionale)
Imposta `OLLAMA_HOST` per inviare le richieste a un altro server Ollama invece di `localhost:11434`. Per [Ollama Cloud](https://ollama.com), imposta anche `OLLAMA_API_KEY`: la chiave viene inviata come token Bearer e solo a un host non di loopback.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Semàforo di concorrenza
Tutte le chiamate a Ollama sono protette da un semàforo di conteggio (limite predefinito: 1) per evitare errori di esaurimento della memoria della GPU su sistemi con VRAM limitata. Sovrascrivi con `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Token di avanzamento MCP
Tutti gli strumenti segnalano l'avanzamento tramite MCP `notifications/progress` quando il client fornisce un `progressToken`. Traduci i report per ogni blocco, translate_markdown per ogni gruppo di segmenti, translate_all per ogni lingua e check_status per ogni passaggio.

### Glossario del software
Un glossario integrato di 12 termini tecnici (API, CLI, SDK, ecc.) garantisce una traduzione coerente della terminologia del software. È possibile passare voci di glossario personalizzate per ogni richiesta e queste vengono unite con quelle predefinite.

### Traduzione in batch
`translateBatch` raggruppa più segmenti in un'unica richiesta, quando possibile, riducendo il numero di richieste e risposte. In caso di problemi con il separatore di batch, torna alla traduzione individuale.

### Modello predefinito configurabile
Il modello predefinito è `translategemma:27b`. Imposta la variabile d'ambiente `POLYGLOT_MODEL` per utilizzare un altro modello, ad esempio su una GPU con meno VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Errori strutturati
Tutti gli errori utilizzano `PolyglotError` con un codice leggibile dalla macchina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, ecc.), un messaggio leggibile dall'utente, un suggerimento facoltativo e un flag `retryable`.

### Validazione dell'output
Ogni traduzione viene automaticamente convalidata: l'output vuoto genera un errore (riproducibile), l'eco del testo di origine viene segnalata, la troncatura eccessiva e le allucinazioni vengono avvisate, la codifica errata e i meta-commenti del modello vengono rilevati. Gli avvisi compaiono nella risposta dello strumento MCP.

### Streaming
`OllamaClient.generateStream()` restituisce i token tramite NDJSON man mano che Ollama li produce. La funzione `translate()` accetta una funzione di callback `onToken` per la visualizzazione dell'avanzamento in tempo reale. Sia il percorso di streaming che quello non di streaming condividono la logica di ripetizione.

## Lingue supportate

Afrikaans, Albanese, Arabo, Bengali, Bulgaro, Catalano, Cinese (semplificato), Cinese (tradizionale), Croato, Ceco, Danese, Olandese, Inglese, Estone, Finlandese, Francese, Galiziano, Tedesco, Greco, Gujarati, Ebraico, Hindi, Ungherese, Indonesiano, Irlandese, Italiano, Giapponese, Kannada, Coreano, Lettone, Lituano, Macedone, Malese, Malayalam, Maltese, Marathi, Norvegese, Persiano, Polacco, Portoghese, Rumeno, Russo, Gaelico scozzese, Serbo, Slovacco, Sloveno, Spagnolo, Swahili, Svedese, Tamil, Telugu, Tailandese, Turco, Ucraino, Urdu, Vietnamita, Gallese.

## Prestazioni

| Metrica | 27B (impostazione predefinita), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| Prima traduzione (caricamento del modello a freddo) | ~30 s | ~15 s |
| Traduzioni successive | ~1–2 s per ogni gruppo di segmenti del file README | ~600 ms |
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
| **Data touched** | Testo inviato all'API di Ollama: locale (`localhost:11434`) per impostazione predefinita, oppure l'host in `OLLAMA_HOST` se ne hai impostato uno. `.polyglot-cache.json` cache dei segmenti accanto a un file tradotto (solo per libreria e CLI). `.polyglot-terms.json` e `.polyglot-pins.json` accanto a un file README tradotto vengono letti se presenti. |
| **Files written** | `translate_readme` scrive `README.<lang>.md` accanto al file README che gli passi e aggiorna la barra di navigazione della lingua di quel file README. `scripts/pin-translation.mjs` scrive `.polyglot-pins.json` accanto al file README. |
| **Data NOT touched** | Nessun dato del browser, nessuna credenziale del sistema operativo, nulla al di fuori delle directory di cui sopra. |
| **Network** | HTTP a `localhost:11434` solo per impostazione predefinita: zero traffico esterno. Remoto solo quando `OLLAMA_HOST` punta altrove. |
| **Secrets** | `OLLAMA_API_KEY`, se impostato, viene letto dall'ambiente e inviato solo come token Bearer a un host non di loopback `OLLAMA_HOST`; non viene mai scritto su disco o registrato. |
| **Telemetry** | Nessun dato raccolto o inviato. |

Consulta [SECURITY.md](SECURITY.md) per la politica di segnalazione delle vulnerabilità.

## Sviluppo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 512 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licenza

MIT: consulta [LICENSE](LICENSE).

> Creato da [MCP Tool Shop](https://mcp-tool-shop.github.io/)
