<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Serveur de traduction GPU local MCP — 57 langues, aucune dépendance au cloud.</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="node 20+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## Fonctionnement

Traduit le texte entre 57 langues en utilisant [TranslateGemma](https://ollama.com/library/translategemma) exécuté localement sur votre GPU via [Ollama](https://ollama.com). Pas de clés d’API, pas de cloud, pas de limites de débit — par défaut, tout reste sur votre machine. Vous pouvez choisir d’utiliser un Ollama distant, tel que [Ollama Cloud](#ollama-cloud-optional).

## Démarrage rapide

### 1. Installez Ollama

Téléchargez-le depuis [ollama.com](https://ollama.com) et démarrez-le :

```bash
ollama serve
```

### 2. Téléchargez un modèle

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **Conseil :** Vous pouvez ignorer cette étape — Polyglot télécharge automatiquement le modèle par défaut (27 B, 17 Go) lors de la première utilisation. Sur un GPU plus petit, définissez d’abord `POLYGLOT_MODEL=translategemma:12b` (voir [Modèle par défaut configurable](#configurable-default-model)).

### 3. Ajoutez-le à votre client MCP

**Claude Code / Claude Desktop** — ajoutez-le à `claude_desktop_config.json` ou `.mcp.json` :

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

**À partir du code source :**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

C’est tout. Demandez à Claude de traduire quelque chose et il utilisera automatiquement l’outil `translate`.

## Outils

Polyglot expose six outils MCP :

### `translate`

Traduit le texte entre n’importe quelle paire de langues prises en charge.

| Paramètre | Obligatoire | Description |
|-------------|----------|-------------|
| `text`      | oui | Texte à traduire |
| `from`      | oui | Code ou nom de la langue source (par exemple, `en`, `English`) |
| `to`        | oui | Code ou nom de la langue cible (par exemple, `ja`, `Japanese`) |
| `model`     | no       | Modèle Ollama (par défaut : `translategemma:27b`) |
| `glossary`  | no       | Substitutions de termes personnalisées, telles que `{"source": "translation"}` — fusionnées avec le glossaire logiciel intégré |

Les longs textes sont automatiquement divisés en blocs aux limites des paragraphes et des phrases, traduits séquentiellement et réassemblés. Toutes les traductions sont validées pour garantir leur qualité (sortie vide, détection d’écho, troncature, texte illisible).

### `translate_markdown`

Traduit un document Markdown entier tout en préservant sa structure. Les blocs de code, les éléments HTML, les badges, les URL et la mise en forme des tableaux sont conservés intacts — seul le contenu textuel (titres, paragraphes, slogans, cellules de tableau) est traduit. Les portions de code en ligne sont remplacées par des espaces réservés avant la traduction et restaurées après, de sorte que les commandes, les indicateurs, les noms de paquets et les identificateurs sont restitués exactement comme ils ont été écrits.

| Paramètre | Obligatoire | Description |
|-------------|----------|-------------|
| `markdown`  | oui | Le contenu Markdown complet à traduire |
| `from`      | oui | Code ou nom de la langue source |
| `to`        | oui | Code ou nom de la langue cible |
| `model`     | no       | Modèle Ollama (par défaut : `translategemma:27b`) |

### `list_languages`

Affiche toutes les 57 langues prises en charge avec leurs codes.

### `check_status`

Vérifie si Ollama est en cours d’exécution et quels modèles TranslateGemma sont installés. Tente de le démarrer automatiquement si Ollama n’est pas en cours d’exécution.

### `translate_all`

Traduit le contenu Markdown dans plusieurs langues à la fois (par défaut : 7 — japonais, chinois, espagnol, français, hindi, italien, portugais). Exécute les traductions en parallèle avec une limitation de sémaphore sécurisée pour le GPU.

| Paramètre | Obligatoire | Description |
|---------------|----------|-------------|
| `markdown`    | oui | Le contenu Markdown complet à traduire |
| `from`        | no       | Code de la langue source (par défaut : `en`) |
| `languages`   | no       | Tableau des codes de langue cible (par défaut : les 7 langues) |
| `model`       | no       | Modèle Ollama (par défaut : `translategemma:27b`) |
| `concurrency` | no       | Nombre maximal de traductions simultanées (par défaut : 2, maximum : 3) |
| `navBar`      | no       | Injecte la barre de navigation des langues (par défaut : true) |

### `translate_readme`

Traduit un fichier README.md dans les 7 mêmes langues et écrit les fichiers `README.<lang>.md` à côté, en actualisant la barre de navigation des langues dans le fichier README source et dans chaque traduction. Renvoie un résumé d’état par langue (ok/échec, temps, fichiers écrits) plutôt que le texte traduit ; utilisez `translate_markdown` lorsque vous souhaitez récupérer le contenu.

| Paramètre | Obligatoire | Description |
|---------------|----------|-------------|
| `readmePath`  | oui | Chemin absolu vers le fichier README.md source |
| `tier`        | no       | `quality` (`translategemma:27b`, par défaut), `bulk` (`12b`) ou `draft` (`2b`) ; ignoré lorsque `model` est défini |
| `model`       | no       | Modèle Ollama explicite ; remplace `tier` |
| `languages`   | no       | Sous-ensemble des codes de langue cible (par défaut : les 7 langues) |
| `concurrency` | no       | Nombre maximal de traductions simultanées (par défaut : 2, maximum : 3) |
| `navBar`      | no       | Injecte ou actualise la barre de navigation des langues (par défaut : true) |

## Fonctionnalités

### Démarrage et téléchargement automatiques
Ollama est automatiquement démarré s’il n’est pas en cours d’exécution. Le modèle TranslateGemma est automatiquement téléchargé s’il n’est pas installé. Aucune configuration manuelle n’est requise.

### Nouvelle tentative avec recul exponentiel
Les échecs temporaires d’Ollama (interruptions du réseau, surcharge temporaire) sont automatiquement réessayés jusqu’à 2 fois avec un recul exponentiel (1 s, 2 s). Les erreurs non réessayables (nom de modèle incorrect, entrée non valide) échouent immédiatement.

### Découpage intelligent
Les longs textes sont divisés aux limites naturelles — paragraphes, puis phrases — afin de préserver le contexte de la traduction. Les tailles des blocs s’adaptent au modèle : 2 000 caractères pour les modèles 2 B/4 B, 4 000 pour 12 B, 6 000 pour 27 B.

### Cache de segments
Les segments traduits sont mis en cache par hachage de contenu (SHA-256 du texte source + langue cible + modèle). Les segments inchangés ne sont pas retraduits, de sorte que la réexécution d’une traduction après une modification ne touche que ce qui a changé. Le cache se trouve dans `.polyglot-cache.json` à côté du fichier source, avec une durée de vie de 30 jours. Il est utilisé par l’API de la bibliothèque `translateMarkdown` lorsqu’un `filePath` est fourni (et par l’outil CLI `scripts/translate-*.mjs` du dépôt) ; les outils MCP traduisent sans l’utiliser.

Plusieurs exécutions peuvent partager un seul fichier de cache. Chaque sauvegarde fusionne uniquement ses propres modifications dans le fichier sous un verrou et remplace le fichier de manière atomique, de sorte que les langues traduites en parallèle conservent les entrées des autres, et que la suppression du cache pour une langue laisse les autres intactes.

### Mémoire de traduction (cache flou)
Lorsqu’une correspondance exacte n’est pas trouvée dans le cache, une traduction mise en cache est réutilisée uniquement si sa source diffère de la nouvelle uniquement dans la disposition des espaces : espacement dans une ligne, espaces au début ou à la fin, ou CRLF par rapport à LF. Toute autre modification est retraduite, y compris un mot, un nombre, un signe de ponctuation, une lettre ou une portion de code en ligne modifiés. Une traduction mise en cache est la traduction de sa propre source, de sorte que sa réutilisation pour un texte modifié entraînerait l’affichage de l’ancien libellé.

### Ollama Cloud (facultatif)
Définissez `OLLAMA_HOST` pour envoyer des requêtes à un autre serveur Ollama au lieu de `localhost:11434`. Pour [Ollama Cloud](https://ollama.com), définissez également `OLLAMA_API_KEY` : la clé est envoyée sous forme de jeton Bearer, et uniquement vers un hôte non en boucle locale.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Sémaphore de concurrence
Tous les appels Ollama sont protégés par un sémaphore de comptage (limite par défaut : 1) afin d’éviter les erreurs de mémoire GPU sur les systèmes dotés d’une VRAM limitée. Remplacez-le par `POLYGLOT_CONCURRENCY` :

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Jeton d’état d’avancement MCP
Tous les outils signalent l’état d’avancement via MCP `notifications/progress` lorsque le client fournit un `progressToken`. Les rapports sont traduits par segment, translate_markdown par lot de segments, translate_all par langue et check_status par étape.

### Glossaire logiciel
Un glossaire intégré de 12 termes techniques (API, CLI, SDK, etc.) garantit une traduction cohérente de la terminologie logicielle. Des entrées de glossaire personnalisées peuvent être transmises par requête et sont fusionnées avec les valeurs par défaut.

### Traduction par lots
`translateBatch` regroupe plusieurs segments dans une seule requête lorsque cela est possible, ce qui réduit le nombre d’échanges. En cas de problème avec le séparateur de lots, il revient à la traduction individuelle.

### Modèle par défaut configurable
Le modèle par défaut est `translategemma:27b`. Définissez la variable d’environnement `POLYGLOT_MODEL` pour utiliser un autre modèle, par exemple sur un GPU doté de moins de VRAM :

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Erreurs structurées
Toutes les erreurs utilisent `PolyglotError` avec un code lisible par machine (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), un message lisible par l’utilisateur, une indication facultative et un indicateur `retryable`.

### Validation de la sortie
Chaque traduction est automatiquement validée : une sortie vide déclenche une erreur (pouvant être réessayée), l’écho du texte source est signalé, une troncature ou une hallucination importante entraînent un avertissement, un encodage corrompu et des méta-commentaires du modèle sont détectés. Les avertissements apparaissent dans la réponse de l’outil MCP.

### Diffusion en continu
`OllamaClient.generateStream()` génère des jetons via NDJSON au fur et à mesure qu’Ollama les produit. La fonction `translate()` accepte un rappel `onToken` pour afficher l’état d’avancement en temps réel. Les chemins de diffusion en continu et non en continu partagent la logique de nouvelle tentative.

## Langues prises en charge

Afrikaans, albanais, arabe, bengali, bulgare, catalan, chinois (simplifié), chinois (traditionnel), croate, tchèque, danois, néerlandais, anglais, estonien, finnois, français, galicien, allemand, grec, gujarati, hébreu, hindi, hongrois, indonésien, irlandais, italien, japonais, kannada, coréen, letton, lituanien, macédonien, malais, malayalam, maltais, marathi, norvégien, persan, polonais, portugais, roumain, russe, gaélique écossais, serbe, slovaque, slovène, espagnol, swahili, suédois, tamoul, télougou, thaï, turc, ukrainien, ourdou, vietnamien, gallois.

## Performances

| Indicateur | 27 B (par défaut), RTX 5090 32 Go | 12 B (Q4), RTX 5080 16 Go |
|--------|-------------------------------|--------------------------|
| Première traduction (chargement du modèle à froid) | ~30 s | ~15 s |
| Traductions suivantes | ~1 à 2 s par lot de segments du fichier README | ~600 ms |
| Mémoire du modèle | 17 Go, entièrement sur le GPU (tel qu’indiqué par `ollama ps`) | ~8,1 Go |

## Architecture

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

## Sécurité et portée des données

| Aspect | Détail |
|--------|--------|
| **Data touched** | Texte envoyé à l’API Ollama : local (`localhost:11434`) par défaut, ou l’hôte dans `OLLAMA_HOST` si vous en définissez un. Cache de `.polyglot-cache.json` segments à côté d’un fichier traduit (uniquement pour la bibliothèque et la CLI) |
| **Files written** | `translate_readme` écrit `README.<lang>.md` à côté du fichier README que vous lui transmettez et actualise la barre de navigation linguistique de ce fichier README |
| **Data NOT touched** | Aucune donnée du navigateur, aucun identifiant du système d’exploitation, rien en dehors des répertoires ci-dessus |
| **Network** | HTTP vers `localhost:11434` uniquement par défaut : aucun transfert de données externe. Communication distante uniquement lorsque `OLLAMA_HOST` pointe vers un autre emplacement |
| **Secrets** | `OLLAMA_API_KEY`, s’il est défini, est lu à partir de l’environnement et envoyé uniquement sous forme de jeton Bearer vers un hôte non en boucle locale `OLLAMA_HOST` ; il n’est jamais écrit sur le disque ni enregistré |
| **Telemetry** | Aucune donnée n’est collectée ni envoyée |

Consultez [SECURITY.md](SECURITY.md) pour connaître la politique de signalement des vulnérabilités.

## Développement

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 362 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licence

MIT : voir [LICENSE](LICENSE).

> Créé par [MCP Tool Shop](https://mcp-tool-shop.github.io/)
