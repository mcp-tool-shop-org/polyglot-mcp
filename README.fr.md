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

Traduit le texte entre 57 langues en utilisant [TranslateGemma](https://ollama.com/library/translategemma) exécuté localement sur votre GPU via [Ollama](https://ollama.com). Pas de clés API, pas de cloud, pas de limites de débit — par défaut, tout reste sur votre machine. Vous pouvez choisir d’utiliser un Ollama distant, tel que [Ollama Cloud](#ollama-cloud-facultatif).

## Démarrage rapide

### 1. Installez Ollama

Téléchargez-le à partir de [ollama.com](https://ollama.com) et démarrez-le :

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

> **Conseil :** Vous pouvez ignorer cette étape — Polyglot télécharge automatiquement le modèle par défaut (27 B, 17 Go) lors de la première utilisation. Sur un GPU plus petit, définissez d’abord `POLYGLOT_MODEL=translategemma:12b` (voir [Modèle par défaut configurable](#modèle-par-défaut-configurable)).

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

C’est tout. Demandez à Claude de traduire quelque chose, et il utilisera automatiquement l’outil `translate`.

## Outils

Polyglot expose six outils MCP :

### `translate`

Traduire le texte entre n’importe quelle paire de langues prises en charge.

| Paramètre | Obligatoire | Description |
|-------------|----------|-------------|
| `text`      | oui | Texte à traduire |
| `from`      | oui | Code ou nom de la langue source (par exemple, `en`, `English`) |
| `to`        | oui | Code ou nom de la langue cible (par exemple, `ja`, `Japanese`) |
| `model`     | no       | Modèle Ollama (par défaut : `translategemma:27b`) |
| `glossary`  | no       | Remplacements de termes personnalisés, comme `{"source": "translation"}`, qui sont fusionnés avec le glossaire logiciel intégré. |

Les longs textes sont automatiquement divisés en blocs aux limites des paragraphes et des phrases, traduits séquentiellement, puis réassemblés. Toutes les traductions sont validées pour garantir leur qualité (pas de sortie vide, détection d’échos, troncature, texte illisible).

### `translate_markdown`

Traduire un document Markdown entier tout en préservant sa structure. Les blocs de code, les éléments HTML, les badges, les URL et la mise en forme des tableaux sont conservés tels quels ; seul le contenu textuel (titres, paragraphes, slogans, cellules de tableau) est traduit. Les portions de code en ligne et les [termes protégés](#termes-protégés-polyglot-termsjson) sont remplacés par des espaces réservés avant la traduction, puis restaurés après, de sorte que les commandes, les indicateurs, les noms de paquets et les identificateurs sont restitués exactement comme ils ont été écrits, et que chaque nombre « N sur M » est restitué sous la forme `N/M`.

| Paramètre | Obligatoire | Description |
|--------------|----------|-------------|
| `markdown`   | oui | Le contenu Markdown complet à traduire |
| `from`       | oui | Code ou nom de la langue source |
| `to`         | oui | Code ou nom de la langue cible |
| `model`      | no       | Modèle Ollama (par défaut : `translategemma:27b`) |
| `onLostSpan` | no       | `report` (par défaut) liste les portions protégées manquantes dans la traduction ; `fail` transforme cela en erreur. Voir [Vérification de la survie](#vérification-de-la-survie---on-lost-span). |

### `list_languages`

Afficher toutes les 57 langues prises en charge avec leurs codes.

### `check_status`

Vérifier si Ollama est en cours d’exécution et quels modèles TranslateGemma sont installés. Tente de démarrer automatiquement si Ollama n’est pas en cours d’exécution.

### `translate_all`

Traduire le contenu Markdown dans plusieurs langues à la fois (par défaut : 7 — japonais, chinois, espagnol, français, hindi, italien, portugais). Exécute les traductions en parallèle avec une limitation de sémaphore sécurisée pour le GPU.

| Paramètre | Obligatoire | Description |
|---------------|----------|-------------|
| `markdown`    | oui | Le contenu Markdown complet à traduire |
| `from`        | no       | Code de la langue source (par défaut : `en`) |
| `languages`   | no       | Tableau des codes de langue cible (par défaut : les 7 langues) |
| `model`       | no       | Modèle Ollama (par défaut : `translategemma:27b`) |
| `concurrency` | no       | Nombre maximal de traductions simultanées (par défaut : 2, maximum : 3) |
| `navBar`      | no       | Injecter la barre de navigation des langues (par défaut : true) |
| `onLostSpan`  | no       | `report` (par défaut) liste les portions protégées perdues par langue ; `fail` transforme une langue qui en contient en erreur. |

### `translate_readme`

Traduire un fichier README.md dans les 7 mêmes langues et écrire les fichiers `README.<lang>.md` à côté, en actualisant la barre de navigation des langues dans le fichier README source et dans chaque traduction. Renvoie un résumé d’état par langue (ok/échec, temps, fichiers écrits) plutôt que le texte traduit ; utilisez `translate_markdown` lorsque vous souhaitez récupérer le contenu.

| Paramètre | Obligatoire | Description |
|---------------|----------|-------------|
| `readmePath`  | oui | Chemin absolu vers le fichier README.md source |
| `tier`        | no       | `quality` (`translategemma:27b`, par défaut), `bulk` (`12b`) ou `draft` (`2b`) ; ignoré lorsque `model` est défini |
| `model`       | no       | Modèle Ollama explicite ; remplace `tier` |
| `languages`   | no       | Sous-ensemble des codes de langue cible (par défaut : les 7 langues) |
| `concurrency` | no       | Nombre maximal de traductions simultanées (par défaut : 2, maximum : 3) |
| `navBar`      | no       | Injecter ou actualiser la barre de navigation des langues (par défaut : true) |
| `onLostSpan`  | no       | `report` (par défaut) écrit chaque fichier et liste les portions protégées perdues ; `fail` laisse une langue qui en contient comme erreur. |

`translate_readme` lit les `.polyglot-terms.json` et `.polyglot-pins.json` du fichier README s’ils existent.

## Fonctionnalités

### Démarrage et téléchargement automatiques
Ollama est automatiquement démarré s’il n’est pas en cours d’exécution. Le modèle TranslateGemma est automatiquement téléchargé s’il n’est pas installé. Aucune configuration manuelle n’est requise.

### Nouvelle tentative avec recul exponentiel
Les échecs temporaires d’Ollama (interruptions du réseau, surcharge temporaire) sont automatiquement réessayés jusqu’à 2 fois avec un recul exponentiel (1 s, 2 s). Les erreurs non réessayables (nom de modèle incorrect, entrée non valide) échouent immédiatement.

### Découpage intelligent
Les longs textes sont divisés aux limites naturelles : paragraphes, puis phrases, afin de préserver le contexte de la traduction. Les tailles des blocs s’adaptent au modèle : 2 000 caractères pour les modèles 2 B/4 B, 4 000 pour 12 B, 6 000 pour 27 B.

### Cache de segments
Les segments traduits sont mis en cache par hachage de contenu (SHA-256 du texte source masqué + langue cible + modèle, plus un hachage des règles de termes protégés qui ont été mises en correspondance dans le segment). Les segments inchangés évitent complètement la re-traduction, de sorte que la réexécution d’une traduction après une modification ne touche que ce qui a changé. L’ajout d’un terme protégé modifie la clé de chaque segment qui le contient, de sorte qu’une traduction mise en cache qui a modifié l’orthographe du terme n’est pas rejouée ; les autres segments conservent leurs clés. Le cache se trouve dans `.polyglot-cache.json` à côté du fichier source, avec une durée de vie de 30 jours. Il est utilisé par l’API de la bibliothèque `translateMarkdown` lorsqu’on lui fournit un `filePath` (et par l’outil CLI `scripts/translate-*.mjs` du dépôt) ; les outils MCP traduisent sans cela.

Plusieurs exécutions peuvent partager un seul fichier de cache. Chaque sauvegarde fusionne uniquement ses propres modifications dans le fichier sous un verrou et remplace le fichier de manière atomique, de sorte que les langues traduites en parallèle conservent les entrées des autres, et que la suppression du cache pour une langue laisse les autres intactes.

### Mémoire de traduction (cache flou)
Lorsqu’une correspondance exacte dans le cache n’est pas trouvée, une traduction mise en cache est réutilisée uniquement si sa source diffère de la nouvelle uniquement dans la mise en page des espaces : espacement dans une ligne, espaces au début ou à la fin, ou CRLF par rapport à LF. Toute autre modification est re-traduite, y compris un mot, un nombre, un signe de ponctuation, une casse ou une portion de code en ligne modifiés. Une traduction mise en cache est la traduction de sa propre source, de sorte que sa réutilisation pour un texte modifié renverrait l’ancien libellé.

### Termes protégés (`.polyglot-terms.json`)
TranslateGemma reformate les identifiants simples dans un autre script : un fichier README en hindi a écrit `XLS-30` comme `एक्सएलएस-30` et `Kimi-K3` comme `किमी-के3`. Il déforme également les nombres : le chinois a transformé « 218/224 » en « 224/218 ». Ainsi, les identifiants dans le texte sont masqués comme des portions de code en ligne : chacun est remplacé par un espace réservé sans lettre avant la traduction et restauré après. Les valeurs par défaut :

| Motif | Masques | Ne modifie pas |
|---------|-------|--------------|
| `url` | `https://…` jusqu’à un espace blanc, une guillemet, une parenthèse ou un accent grave (permettant un niveau de parenthèses équilibrées, comme `https://en.wikipedia.org/wiki/Foo_(bar)`) | |
| `anchor` | Les références `#slug` dans une page ciblées dans les liens Markdown (`[text](#slug)`, `[text](#slug "title")`), les définitions de référence (`[label]: #slug`) et les attributs HTML `href="#slug"`, de sorte que le modèle traduit le texte du lien sans déformer le fragment. | `#123` dans le texte, `#heading` lignes, URL externes `https://…#frag` (couvertes par `url`) |
| `link-target` | Cibles non HTTP(S), non-ancre dans les liens en ligne Markdown, les images et les définitions de référence : chemins relatifs (`../facet`, `docs/Kimi-K3.md`), noms de fichiers simples (`LICENSE`), `mailto:`, `<path with spaces>` et chemins avec un niveau de parenthèses équilibrées (`docs/Foo_(bar).md`) | Titres de liens (`"MIT License"`), attributs HTML (`href="…"`, `src="…"`) |
| `caps-id` | ALL-CAPS jetons avec un chiffre, ou des majuscules jointes par `-` ou `_` : `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase et mixedCase mots : `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, mots courants en majuscules |
| `model-id` | ID de modèle et de produit avec une partie composée d’une lettre et d’un chiffre : `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |

Une fois que tous les segments sont traduits et réassemblés, chaque en-tête ATX source est associé à son en-tête ATX traduit et est identifié dans l’ordre du document avec `github-slugger` (correspondant aux ID d’en-tête de GitHub, y compris les suffixes `-1`, `-2` pour les en-têtes dupliqués), et chaque ancre non-code dans une page (`[text](#slug)`, `[label]: #slug` et ancre HTML `href="#slug"`) est réécrite avec l’identifiant de l’en-tête traduit.

« N sur M » dans le texte et les cellules de tableau (`218 of 224`) est masqué comme une seule portion et restauré comme `218/224` dans toutes les langues, ce qui se lit correctement partout et ne peut pas être inversé ou transformé en un ordinal. Une cellule de tableau qui n’est qu’un nombre n’est pas envoyée du tout au modèle.

Un dépôt ajoute ses propres termes en `.polyglot-terms.json` à côté du fichier README. Chaque champ est facultatif :

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` sont des chaînes exactes, sensibles à la casse, qui correspondent à des mots entiers ; `patterns` sont des JavaScript expressions régulières. Les deux ajoutent aux valeurs par défaut. `disable` désactive les valeurs par défaut par nom (par exemple, `"disable": ["anchor"]` désactive le masquage des ancres dans une page, la réécriture des identifiants après l’assemblage et la vérification de la survie des ancres ; `"disable": ["link-target"]` désactive le masquage des cibles de liens non HTTP et ignore les cibles relatives/non HTTP dans la vérification de la survie des liens afin que les liens vers des fichiers localisés comme `./docs/guide.fr.md` soient pris en compte), et `"nOfM": false` désactive la règle de comptage. Un fichier qui ne peut pas être analysé arrête l’exécution avec `CONFIG_ERROR` au lieu de traduire sans les termes demandés.

### Vérification de la survie (`--on-lost-span`)
Après la traduction, chaque fichier cible est vérifié par rapport à la langue anglaise : chaque portion protégée (portion de code en ligne, terme protégé et chaque nombre en tant que `N/M`) doit être présente dans la traduction de son segment, caractère par caractère, et chaque ancre `#slug` dans une page qui a été résolue dans la source anglaise doit être résolue dans la traduction vers un identifiant d’en-tête ATX traduit ou une ancre HTML explicite `id=`/`name=` (une ancre qui n’a pas été résolue dans la source anglaise est signalée comme un avertissement et n’entraîne jamais l’échec de l’exécution ; si les nombres d’ancres source et de traduction diffèrent et qu’une ancre valide de la source était impliquée, la divergence est également signalée comme une `LostSpan` de type `"anchor"`, sauf si elle a déjà été signalée par la vérification des liens de segment). Les liens Markdown de chaque segment (`[text](target)`, `[text](target "title")`, images `![alt](src)`, liens de référence `[text][label]`, éléments repliés `[text][]` et raccourcis `[label]` résolus par rapport aux définitions de leur fichier `[label]: target`) doivent conserver l’ensemble exact des cibles de liens non-ancre et le nombre exact de liens `#slug` dans une page (signalé comme étant de type `"link"` lorsqu’un lien est interrompu, non fermé ou supprimé). Tout délimiteur d’espace réservé `⟦` ou `⟧` non remplacé laissé en dehors du code dans un segment traduit, au-delà de ce que la source contenait, est signalé comme étant de type `"placeholder"`. Chaque cellule de tableau doit contenir les mêmes nombres que sa cellule source, comparés en tant qu’ensemble, et non dans l’ordre : une traduction chinoise correcte de « 218/224 » place le total en premier (`224 首中的 218 首`), de sorte qu’une vérification de l’ordre signalerait la bonne réponse. Les chiffres provenant d’autres scripts sont normalisés avant la comparaison. Le fichier doit également conserver ses blocs de code délimités et ses portions de code en ligne.

`--on-lost-span=fail|report` détermine ce qui se passe lorsqu’un élément est perdu :

- **`fail`** : l’exécution se termine avec un code de sortie différent de zéro et une liste de la langue, du segment et de la portion manquante. Il s’agit de la valeur par défaut pour `scripts/translate-all.mjs`, qui s’exécute avant les versions. Les fichiers sont toujours écrits, de sorte qu’ils peuvent être corrigés manuellement et fixés. Le fichier JSON récapitulatif contient la liste et une `LOST_SPAN` erreur dans la forme `PolyglotError` habituelle (`code`, `message`, `hint`, `retryable`).
- **`report`** : la liste est écrite et l’exécution se termine avec un code de sortie de 0. Il s’agit de la valeur par défaut pour les outils MCP (paramètre `onLostSpan`) et l’API de la bibliothèque `translateMarkdown` (option `onLostSpan`, champ de résultat `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Vérification du texte non traduit (`--on-untranslated`)
Un modèle peut renvoyer un paragraphe en anglais tout en conservant la capacité de diviser correctement le lot, de sorte que tous les autres contrôles soient réussis. Après la traduction, chaque phrase du texte anglais (6 mots ou plus, en comptant un lien par son libellé et en excluant les blocs de code, les URL et les blocs protégés, et en excluant une série de noms propres) est recherchée en tant que phrase complète dans la traduction de son segment. La comparaison ignore la casse et les points ou deux-points de fin, assemble d’abord les lignes séparées, et fonctionne phrase par phrase, de sorte qu’un paragraphe reformulé ou une ligne où une seule phrase a été traduite est toujours détecté. Une série de noms (au plus un mot fonctionnel et un autre mot en minuscules, comme un titre ou `Format: JSON, YAML via stdio`) est exclue de cette règle, et non par une liste, et un segment verrouillé n’est jamais signalé.

Une réponse modèle est **inutilisable** lorsqu’elle est vide, lorsqu’un espace réservé pour un extrait de code n’a pas été restitué (le segment reviendrait alors à la source en anglais, de sorte que l’identifiant reste correct), ou lorsqu’une phrase est toujours en anglais. Avant qu’une langue ne soit considérée comme non prise en charge, une réponse inutilisable est réessayée une fois seule ; un segment qui a déjà utilisé la méthode de repli consistant à effectuer un seul appel par élément après un décalage du nombre de séparateurs compte cet appel comme sa tentative de réessai. Un segment qui est toujours inutilisable (un élément de liste long et dense en code, où le modèle supprime un espace réservé) est ensuite traduit ligne par ligne s’il comporte plusieurs lignes, puis phrase par phrase si une ligne comporte plusieurs phrases, chaque partie avec ses propres espaces réservés. Seul ce qui est encore inutilisable après ces étapes conserve la source en anglais, et cela n’est jamais silencieux : cela est signalé comme non traduit à chaque étape qui a été tentée, pour laquelle un avertissement a été émis et qui échoue dans la configuration par défaut. Le même test contrôle le cache : une réponse inutilisable n’y est jamais écrite, et une entrée de cache inutilisable est ignorée, supprimée et traduite à nouveau.

`--on-untranslated=fail|report` détermine ce qui se passe avec ce qui reste :

- **`fail`** (par défaut pour `translate-all.mjs` et `translate-readme.mjs`) : les fichiers sont écrits, la langue est marquée `untranslated` au lieu de `ok` (et comptabilisée en dehors de `succeeded`), les lignes sont répertoriées et l’exécution se termine avec un code non nul (`translate-readme.mjs` se termine avec 3). Le résumé JSON contient `untranslated`, `untranslatedLanguages`, `fallbacks` et une erreur `UNTRANSLATED`.
- **`report`** : la liste est écrite et l’exécution se termine avec 0. Il s’agit de la valeur par défaut pour l’API de la bibliothèque (option `onUntranslated` ; champs de résultat `untranslated`, `fallbacks`, `retries`) et pour les outils MCP `translate_markdown`, `translate_all` et `translate_readme` (paramètre `onUntranslated`), qui ajoutent la liste à leur sortie.

Un segment qui reste en anglais n’est jamais mis en cache, de sorte que `scripts/pin-translation.mjs` conserve un paragraphe en prose que vous avez traduit manuellement, même sans `--include-uncached`.

**Ce que la vérification ne voit pas.** Quatre limites, de sorte qu’un résultat clair est lu pour ce qu’il est : (1) anglais de moins de 6 mots, comme les titres courts, les cellules de tableau et les éléments de liste ; (2) un titre en majuscule ou une autre série de noms, qui ne peut être distingué d’un nom de produit ; (3) une phrase qui n’est que partiellement traduite, où certains mots sont dans la langue cible et le reste est toujours en anglais, car une phrase est considérée comme non traduite uniquement lorsque la totalité de celle-ci est inchangée ; (4) sortie dans la mauvaise langue, comme l’espagnol renvoyé pour l’italien, ce qui n’est pas de l’anglais et n’est donc pas signalé. Les blocs de code délimités sont protégés et ne sont jamais traduits ni vérifiés.

```bash
node scripts/translate-all.mjs README.md                          # --on-untranslated=fail
node scripts/translate-all.mjs README.md --on-untranslated=report
```

### Traductions fixes (`.polyglot-pins.json`)
Une traduction fixée l’emporte toujours. `.polyglot-pins.json` se trouve à côté du cache ; chaque entrée est indexée par un hachage du segment en anglais plus la langue cible, et contient la traduction corrigée manuellement. Une traduction fixée surpasse le cache et le modèle, et survit à chaque nouvelle exécution, y compris `--cache-clear`. Lorsque l’anglais change, le hachage change, de sorte qu’une traduction fixée ne peut pas survivre au texte pour lequel elle a été écrite.

Pour fixer les corrections manuelles, corrigez le fichier traduit, puis exécutez :

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

Il associe chaque segment de l’anglais à son texte dans le fichier corrigé et fixe chaque segment dont le texte diffère de la traduction mise en cache. `--dry-run` répertorie les traductions fixées sans les écrire. `--model=NAME` définit le modèle dont les entrées de cache sont comparées (par défaut : `$POLYGLOT_MODEL` ou `translategemma:27b`, comme pour les scripts). `--include-uncached` fixe également les segments pour lesquels le cache ne contient pas de traduction. Validez `.polyglot-pins.json` et `.polyglot-terms.json` avec le fichier README.

### Ollama Cloud (facultatif)
Définissez `OLLAMA_HOST` pour envoyer des requêtes à un autre serveur Ollama au lieu de `localhost:11434`. Pour [Ollama Cloud](https://ollama.com), définissez également `OLLAMA_API_KEY` : la clé est envoyée sous forme de jeton Bearer, et uniquement vers un hôte non en boucle locale.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Sémaphore de concurrence
Tous les appels Ollama sont protégés par un sémaphore de comptage (limite par défaut : 1) afin d’éviter les erreurs de mémoire insuffisante du GPU sur les systèmes dotés d’une VRAM limitée. Remplacez-le par `POLYGLOT_CONCURRENCY` :

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Jetons de progression MCP
Tous les outils signalent la progression via MCP `notifications/progress` lorsque le client fournit un `progressToken`. Traduction des rapports par bloc, traduction_markdown par lot de segments, traduction_all par langue et check_status par étape.

### Glossaire logiciel
Un glossaire intégré de 12 termes techniques (API, CLI, SDK, etc.) garantit une traduction cohérente de la terminologie logicielle. Des entrées de glossaire personnalisées peuvent être transmises par requête et sont fusionnées avec les valeurs par défaut.

### Traduction par lots
`translateBatch` regroupe plusieurs segments en une seule invite lorsque cela est possible, ce qui réduit le nombre d’allers-retours. En cas de corruption du séparateur de lot, il revient à la traduction individuelle.

### Modèle par défaut configurable
Le modèle par défaut est `translategemma:27b`. Définissez la variable d’environnement `POLYGLOT_MODEL` pour utiliser un autre modèle, par exemple sur un GPU doté d’une VRAM inférieure :

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Erreurs structurées
Toutes les erreurs utilisent `PolyglotError` avec un code lisible par machine (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), un message lisible par l’homme, une indication facultative et un indicateur `retryable`.

### Validation de la sortie
Chaque traduction est automatiquement validée : une sortie vide déclenche une erreur (réessayable), l’écho du texte source est signalé, une troncature et une hallucination importantes entraînent un avertissement, un encodage corrompu et des métacommentaires du modèle sont détectés. Les avertissements apparaissent dans la réponse de l’outil MCP.

### Streaming
`OllamaClient.generateStream()` génère des jetons via NDJSON au fur et à mesure qu’Ollama les produit. La fonction `translate()` accepte un rappel `onToken` pour l’affichage de la progression en temps réel. Les chemins de streaming et non-streaming partagent la logique de réessai.

## Langues prises en charge

Afrikaans, albanais, arabe, bengali, bulgare, catalan, chinois (simplifié), chinois (traditionnel), croate, tchèque, danois, néerlandais, anglais, estonien, finnois, français, galicien, allemand, grec, gujarati, hébreu, hindi, hongrois, indonésien, irlandais, italien, japonais, kannada, coréen, letton, lituanien, macédonien, malais, malayalam, maltais, marathi, norvégien, persan, polonais, portugais, roumain, russe, gaélique écossais, serbe, slovaque, slovène, espagnol, swahili, suédois, tamoul, télougou, thaï, turc, ukrainien, ourdou, vietnamien, gallois.

## Performance

| Mesure | 27B (par défaut), RTX 5090 32 Go | 12B (Q4), RTX 5080 16 Go |
|--------|-------------------------------|--------------------------|
| Première traduction (chargement du modèle à froid) | ~30 s | ~15 s |
| Traductions suivantes | ~1 à 2 s par lot de segments du fichier README | ~600 ms |
| Mémoire du modèle | 17 Go, entièrement sur le GPU (tel qu’indiqué par `ollama ps`) | ~8,1 Go |

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
| **Data touched** | Texte envoyé à l’API Ollama — local (`localhost:11434`) par défaut, ou l’hôte dans `OLLAMA_HOST` si vous en définissez un. `.polyglot-cache.json`, cache de segments à côté d’un fichier traduit (uniquement pour la bibliothèque et l’interface en ligne de commande). `.polyglot-terms.json` et `.polyglot-pins.json` à côté d’un fichier README traduit sont lus s’ils sont présents. |
| **Files written** | `translate_readme` écrit `README.<lang>.md` à côté du fichier README que vous lui transmettez et actualise la barre de navigation linguistique de ce fichier README. `scripts/pin-translation.mjs` écrit `.polyglot-pins.json` à côté du fichier README. |
| **Data NOT touched** | Aucune donnée de navigateur, aucun identifiant du système d’exploitation, rien en dehors des répertoires ci-dessus. |
| **Network** | HTTP uniquement vers `localhost:11434` par défaut — aucun transfert de données externe. Accès distant uniquement lorsque `OLLAMA_HOST` pointe vers un autre endroit. |
| **Secrets** | `OLLAMA_API_KEY`, s’il est défini, est lu à partir de l’environnement et envoyé uniquement sous forme de jeton Bearer vers un `OLLAMA_HOST` qui n’est pas une adresse de boucle locale ; il n’est jamais écrit sur le disque ni enregistré. |
| **Telemetry** | Aucune donnée n’est collectée ni envoyée. |

Consultez [SECURITY.md](SECURITY.md) pour connaître la politique de signalement des vulnérabilités.

## Développement

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 570 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licence

MIT — voir [LICENSE](LICENSE).

> Créé par [MCP Tool Shop](https://mcp-tool-shop.github.io/)
