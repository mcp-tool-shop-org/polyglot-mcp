<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Serveur de traduction MCP GPU local — 57 langues, aucune dépendance au cloud.</strong></p>

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

Translates text between 57 languages using [TranslateGemma](https://ollama.com/library/translategemma) running locally on your GPU via [Ollama](https://ollama.com). No API keys, no cloud, no rate limits — by default everything stays on your machine. You can opt in to a remote Ollama such as [Ollama Cloud](#ollama-cloud-optional).

## Démarrage rapide

### 1. Installez ⟦1⟧

Téléchargez-le à partir de https://ollama.com et démarrez-le :

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

> **Conseil :** Vous pouvez ignorer cette étape — Polyglot télécharge automatiquement le modèle par défaut (27 milliards de paramètres, 17 Go) lors de la première utilisation. Sur un GPU plus petit, définissez d’abord `POLYGLOT_MODEL=translategemma:12b` (voir [Modèle par défaut configurable](#modèle-par-défaut-configurable)).

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
| `model`     | no       | Ollama model (default: `translategemma:27b`) |
| `glossary`  | no       | Substitutions de termes personnalisées, telles que `{"source": "translation"}` — fusionnées avec le glossaire logiciel intégré |

Le texte long est automatiquement divisé en blocs aux limites des paragraphes et des phrases, traduit en séquence, puis réassemblé. Toutes les traductions sont validées pour garantir leur qualité (sortie vide, détection d’écho, troncature, texte illisible).

### `translate_markdown`

Traduit un document Markdown entier tout en préservant sa structure. Les blocs de code, les éléments HTML, les badges, les URL et la mise en forme des tableaux sont conservés intacts — seul le contenu textuel (titres, paragraphes, slogans, cellules de tableau) est traduit. Les portions de code en ligne et les [termes protégés](#termes-protégés-polyglot-terms.json) sont remplacés par des espaces réservés avant la traduction, puis restaurés après, de sorte que les commandes, les indicateurs, les noms de paquets et les identificateurs sont restitués exactement comme ils ont été écrits, et que chaque nombre « N sur M » est restitué sous la forme `N/M`.

| Paramètre | Obligatoire | Description |
|--------------|----------|-------------|
| `markdown`   | oui | Le contenu Markdown complet à traduire |
| `from`       | oui | Code ou nom de la langue source |
| `to`         | oui | Code ou nom de la langue cible |
| `model`      | no       | Ollama model (default: `translategemma:27b`) |
| `onLostSpan` | no       | `report` (par défaut) liste les portions protégées manquantes dans la traduction ; `fail` transforme cela en erreur. Voir [Vérification de survie](#vérification-de-survie---en-cas-de-portion-manquante) |

### `list_languages`

Affiche toutes les 57 langues prises en charge avec leurs codes.

### `check_status`

Check if Ollama is running and which TranslateGemma models are installed. Attempts auto-start if Ollama isn't running.

### `translate_all`

Traduit le contenu Markdown dans plusieurs langues à la fois (par défaut : 7 — japonais, chinois, espagnol, français, hindi, italien, portugais). Exécute les traductions en parallèle avec une limite de sémaphore sécurisée pour le GPU.

| Paramètre | Obligatoire | Description |
|---------------|----------|-------------|
| `markdown`    | oui | Le contenu Markdown complet à traduire |
| `from`        | no       | Code de la langue source (par défaut : `en`) |
| `languages`   | no       | Tableau des codes de langue cible (par défaut : les 7) |
| `model`       | no       | Ollama model (default: `translategemma:27b`) |
| `concurrency` | no       | Nombre maximal de traductions simultanées (par défaut : 2, maximum : 3) |
| `navBar`      | no       | Injecte la barre de navigation des langues (par défaut : true) |
| `onLostSpan`  | no       | `report` (par défaut) liste les portions protégées manquantes par langue ; `fail` transforme une langue qui en contient en erreur |

### `translate_readme`

Traduit un fichier README.md dans les mêmes 7 langues et écrit les fichiers `README.<lang>.md` à côté, en actualisant la barre de navigation des langues dans le fichier README source et dans chaque traduction. Renvoie un résumé d’état par langue (ok/échec, temps, fichiers écrits) plutôt que le texte traduit ; utilisez `translate_markdown` lorsque vous souhaitez récupérer le contenu.

| Paramètre | Obligatoire | Description |
|---------------|----------|-------------|
| `readmePath`  | oui | Chemin absolu vers le fichier README.md source |
| `tier`        | no       | `quality` (`translategemma:27b`, par défaut), `bulk` (`12b`) ou `draft` (`2b`) ; ignoré lorsque `model` est défini |
| `model`       | no       | Explicit Ollama model; overrides `tier` |
| `languages`   | no       | Sous-ensemble des codes de langue cible (par défaut : les 7) |
| `concurrency` | no       | Nombre maximal de traductions simultanées (par défaut : 2, maximum : 3) |
| `navBar`      | no       | Injecte ou actualise la barre de navigation des langues (par défaut : true) |
| `onLostSpan`  | no       | `report` (par défaut) écrit chaque fichier et liste les portions protégées manquantes ; `fail` laisse une langue qui en contient comme erreur |

`translate_readme` lit les `.polyglot-terms.json` et `.polyglot-pins.json` du fichier README s’ils existent.

## Fonctionnalités

### Démarrage et téléchargement automatiques
Ollama is automatically started if it isn't running. The TranslateGemma model is automatically pulled if it isn't installed. Zero manual setup required.

### Nouvelle tentative avec recul exponentiel
Les échecs transitoires de ⟦1⟧ (interruptions du réseau, surcharge temporaire) sont automatiquement réessayés jusqu’à 2 fois avec un recul exponentiel (1 s, 2 s). Les erreurs non réessayables (nom de modèle incorrect, entrée non valide) échouent immédiatement.

### Découpage intelligent
Le texte long est divisé aux limites naturelles — paragraphes, puis phrases — afin que le contexte de la traduction soit préservé. Les tailles des blocs s’adaptent au modèle : 2 000 caractères pour les modèles de 2 milliards/4 milliards de paramètres, 4 000 pour 12 milliards, 6 000 pour 27 milliards.

### Cache de segments
Les segments traduits sont mis en cache par hachage de contenu (SHA-256 du texte source masqué + langue cible + modèle, plus un hachage des règles de termes protégés qui ont été mises en correspondance dans le segment). Les segments inchangés évitent complètement la nouvelle traduction, de sorte que la nouvelle exécution d’une traduction après une modification ne touche que ce qui a changé. L’ajout d’un terme protégé modifie la clé de chaque segment qui le contient, de sorte qu’une traduction mise en cache qui a modifié l’orthographe du terme n’est pas rejouée ; les autres segments conservent leurs clés. Le cache se trouve dans `.polyglot-cache.json` à côté du fichier source, avec une durée de vie de 30 jours. Il est utilisé par l’API de la bibliothèque `translateMarkdown` lorsqu’un `filePath` est fourni (et par l’outil CLI `scripts/translate-*.mjs` du dépôt) ; les outils MCP traduisent sans cela.

Plusieurs exécutions peuvent partager un seul fichier de cache. Chaque sauvegarde fusionne uniquement ses propres modifications dans le fichier sous un verrou et remplace le fichier de manière atomique, de sorte que les langues traduites en parallèle conservent les entrées de chacune, et la suppression du cache pour une langue n’affecte pas les autres.

### Mémoire de traduction (Cache flou)
Lorsqu’une correspondance exacte dans le cache n’est pas trouvée, une traduction mise en cache est réutilisée uniquement si sa source diffère de la nouvelle uniquement en termes de mise en page des espaces : espacement dans une ligne, espaces au début ou à la fin, ou CRLF par rapport à LF. Toute autre modification est retraduite, y compris un mot, un nombre, un signe de ponctuation, une casse de lettre ou une portion de code en ligne modifiés. Une traduction mise en cache est la traduction de sa propre source, de sorte que sa réutilisation pour un texte modifié entraînerait l’utilisation de la formulation ancienne.

### Termes protégés (`.polyglot-terms.json`)
TranslateGemma réécrit les identificateurs simples dans un autre script : un fichier README en hindi a écrit `XLS-30` comme `एक्सएलएस-30` et `Kimi-K3` comme `किमी-के3`. Il déforme également les nombres : le chinois a transformé « 218/224 » en « 224/218 ». Ainsi, les identificateurs dans le texte sont masqués comme des portions de code en ligne : chacun est remplacé par un espace réservé sans lettre avant la traduction et restauré après. Les valeurs par défaut :

| Motif | Masques | Ne pas modifier |
|---------|-------|--------------|
| `url` | `https://…` jusqu’aux espaces, une guillemet, une parenthèse ou un accent grave | |
| `caps-id` | ALL-CAPS jetons avec un chiffre, ou des majuscules jointes par `-` ou `_` : `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase et mixedCase mots : `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, mots courants en majuscules |
| `model-id` | ID de modèle et de produit avec une partie lettre-chiffre : `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |

« N sur M » dans le texte et les cellules de tableau (`218 of 224`) est masqué comme une seule portion et restauré comme `218/224` dans chaque langue, ce qui se lit correctement partout et ne peut pas être inversé ou transformé en un ordinal. Une cellule de tableau qui n’est qu’un nombre n’est pas envoyée du tout au modèle.

Un dépôt ajoute ses propres termes en `.polyglot-terms.json` à côté du fichier README. Chaque champ est facultatif :

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` sont des chaînes exactes, sensibles à la casse, qui correspondent à des mots entiers ; `patterns` sont JavaScript expressions régulières. Les deux s’ajoutent aux valeurs par défaut. `disable` désactive les valeurs par défaut par nom, et `"nOfM": false` désactive la règle de comptage. Un fichier qui ne peut pas être analysé arrête l’exécution avec `CONFIG_ERROR` au lieu de traduire sans les termes demandés.

### Vérification de la survie (`--on-lost-span`)
Après la traduction, chaque fichier cible est vérifié par rapport à l’anglais : chaque portion protégée (portion de code en ligne, terme protégé et chaque nombre en tant que `N/M`) doit être présente dans la traduction de son segment, caractère par caractère. Chaque cellule de tableau doit contenir les mêmes nombres que sa cellule source, comparés comme un ensemble, et non dans l’ordre : une traduction chinoise correcte de « 218/224 » place le total en premier (`224 首中的 218 首`), de sorte qu’une vérification de l’ordre signalerait la bonne réponse. Les chiffres provenant d’autres scripts sont normalisés avant la comparaison. Le fichier doit également conserver ses blocs de code délimités et ses portions de code en ligne.

`--on-lost-span=fail|report` détermine ce qui se passe lorsqu’un élément est perdu :

- **`fail`** : l’exécution se termine avec un code différent de zéro et une liste de la langue, du segment et de la portion manquante. Il s’agit de la valeur par défaut pour `scripts/translate-all.mjs`, qui s’exécute avant les versions. Les fichiers sont toujours écrits, de sorte qu’ils peuvent être corrigés manuellement et fixés. Le fichier JSON récapitulatif contient la liste et une erreur `LOST_SPAN` dans la forme `PolyglotError` habituelle (`code`, `message`, `hint`, `retryable`).
- **`report`** : la liste est écrite et l’exécution se termine avec le code 0. Il s’agit de la valeur par défaut pour les outils MCP (paramètre `onLostSpan`) et l’API de la bibliothèque `translateMarkdown` (option `onLostSpan`, champ de résultat `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Traductions fixées (`.polyglot-pins.json`)
Une traduction fixée gagne toujours. `.polyglot-pins.json` se trouve à côté du cache ; chaque entrée est indexée par un hachage du segment anglais plus la langue cible, et contient la traduction corrigée manuellement. Une traduction fixée surpasse le cache et le modèle et survit à chaque nouvelle exécution, y compris `--cache-clear`. Lorsque l’anglais change, le hachage change, de sorte qu’une traduction fixée ne peut pas survivre au texte pour lequel elle a été écrite.

Pour fixer manuellement les corrections, corrigez le fichier traduit, puis exécutez :

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

Il associe chaque segment de l’anglais à son texte dans le fichier corrigé et fixe chaque segment dont le texte diffère de la traduction mise en cache. `--dry-run` liste les traductions fixées sans les écrire. `--model=NAME` définit le modèle dont il compare les entrées de cache (par défaut : `$POLYGLOT_MODEL` ou `translategemma:27b`, comme pour les scripts). `--include-uncached` fixe également les segments pour lesquels le cache n’a pas de traduction. Validez `.polyglot-pins.json` et `.polyglot-terms.json` avec le fichier README.

### Ollama Cloud (facultatif)
Définissez `OLLAMA_HOST` pour envoyer des requêtes à un autre serveur Ollama au lieu de `localhost:11434`. Pour [Ollama Cloud](https://ollama.com), définissez également `OLLAMA_API_KEY` : la clé est envoyée sous forme de jeton Bearer et uniquement vers un hôte non en boucle.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Sémaphore de concurrence
Tous les appels Ollama sont protégés par un sémaphore de comptage (limite par défaut : 1) pour éviter les erreurs de mémoire insuffisante du GPU sur les systèmes dotés d’une VRAM limitée. Remplacez-le par `POLYGLOT_CONCURRENCY` :

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Jetons de progression MCP
Tous les outils signalent la progression via les jetons MCP `notifications/progress` lorsque le client fournit un `progressToken`. Translate signale par portion, translate_markdown par lot de segments, translate_all par langue et check_status par étape.

### Glossaire logiciel
Un glossaire intégré de 12 termes techniques (API, CLI, SDK, etc.) garantit une traduction cohérente de la terminologie logicielle. Des entrées de glossaire personnalisées peuvent être transmises par requête et sont fusionnées avec les valeurs par défaut.

### Traduction par lots
`translateBatch` regroupe plusieurs segments dans une seule invite lorsque cela est possible, ce qui réduit le nombre d’allers-retours. Il revient à la traduction individuelle si le séparateur de lot est déformé.

### Modèle par défaut configurable
Le modèle par défaut est `translategemma:27b`. Définissez la variable d’environnement `POLYGLOT_MODEL` pour en utiliser un autre, par exemple sur un GPU doté de moins de VRAM :

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Erreurs structurées
Toutes les erreurs utilisent `PolyglotError` avec un code lisible par machine (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), un message lisible par l’homme, une indication facultative et un indicateur `retryable`.

### Validation de la sortie
Chaque traduction est automatiquement validée : une sortie vide entraîne une erreur (pouvant être répétée), l’écho du texte source est signalé, les troncatures et hallucinations importantes sont signalées, le codage corrompu et les métacommentaires du modèle sont détectés. Les avertissements apparaissent dans la réponse de l’outil MCP.

### Diffusion en continu
`OllamaClient.generateStream()` génère des jetons via NDJSON, comme le fait Ollama. La fonction `translate()` accepte un rappel `onToken` pour afficher l’avancement en temps réel. Les chemins de diffusion en continu et de non-diffusion en continu partagent la même logique de nouvelle tentative.

## Langues prises en charge

Afrikaans, albanais, arabe, bengali, bulgare, catalan, chinois (simplifié), chinois (traditionnel), croate, tchèque, danois, néerlandais, anglais, estonien, finnois, français, galicien, allemand, grec, gujarati, hébreu, hindi, hongrois, indonésien, irlandais, italien, japonais, kannada, coréen, letton, lituanien, macédonien, malais, malayalam, maltais, marathi, norvégien, persan, polonais, portugais, roumain, russe, gaélique écossais, serbe, slovaque, slovène, espagnol, swahili, suédois, tamoul, télougou, thaï, turc, ukrainien, ourdou, vietnamien, gallois.

## Performances

| Indicateur | 27 B (par défaut), RTX 5090 32 Go | 12 B (Q4), RTX 5080 16 Go |
|--------|-------------------------------|--------------------------|
| Première traduction (chargement du modèle à froid) | ~30 s | ~15 s |
| Traductions suivantes | ~1 à 2 s par lot de segments README | ~600 ms |
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

## Sécurité et portée des données

| Aspect | Détail |
|--------|--------|
| **Data touched** | Texte envoyé à l’API Ollama — local (`localhost:11434`) par défaut, ou l’hôte dans `OLLAMA_HOST` si vous en définissez un. Cache `.polyglot-cache.json` des segments à côté d’un fichier traduit (utilisation uniquement pour la bibliothèque et l’interface en ligne de commande). `.polyglot-terms.json` et `.polyglot-pins.json` à côté d’un fichier README traduit sont lus s’ils sont présents. |
| **Files written** | `translate_readme` écrit `README.<lang>.md` à côté du fichier README que vous lui transmettez et actualise la barre de navigation linguistique de ce fichier README. `scripts/pin-translation.mjs` écrit `.polyglot-pins.json` à côté du fichier README. |
| **Data NOT touched** | Aucune donnée du navigateur, aucun identifiant du système d’exploitation, rien en dehors des répertoires ci-dessus. |
| **Network** | HTTP uniquement vers `localhost:11434` par défaut — aucun transfert externe. Accès distant uniquement lorsque `OLLAMA_HOST` pointe vers un autre emplacement. |
| **Secrets** | `OLLAMA_API_KEY`, s’il est défini, est lu à partir de l’environnement et envoyé uniquement sous forme de jeton Bearer vers une adresse `OLLAMA_HOST` non en boucle ; il n’est jamais écrit sur le disque ni enregistré. |
| **Telemetry** | Aucune donnée n’est collectée ni envoyée. |

Consultez [SECURITY.md](SECURITY.md) pour connaître la politique de signalement des vulnérabilités.

## Développement

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 435 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licence

MIT — voir [LICENSE](LICENSE).

> Créé par [MCP Tool Shop](https://mcp-tool-shop.github.io/)
