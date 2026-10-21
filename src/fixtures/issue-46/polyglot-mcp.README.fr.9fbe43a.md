<!-- Extract of mcp-tool-shop-org/polyglot-mcp README.fr.md at 9fbe43a: the ATX headings and the 4 in-page anchor lines. -->

## Fonctionnement

Translates text between 57 languages using [TranslateGemma](https://ollama.com/library/translategemma) running locally on your GPU via [Ollama](https://ollama.com). No API keys, no cloud, no rate limits — by default everything stays on your machine. You can opt in to a remote Ollama such as [Ollama Cloud](#ollama-cloud-optional).

## Démarrage rapide

### 1. Installez ⟦1⟧

### 2. Téléchargez un modèle

> **Conseil :** Vous pouvez ignorer cette étape — Polyglot télécharge automatiquement le modèle par défaut (27 milliards de paramètres, 17 Go) lors de la première utilisation. Sur un GPU plus petit, définissez d’abord `POLYGLOT_MODEL=translategemma:12b` (voir [Modèle par défaut configurable](#modèle-par-défaut-configurable)).

### 3. Ajoutez-le à votre client MCP

## Outils

### `translate`

### `translate_markdown`

Traduit un document Markdown entier tout en préservant sa structure. Les blocs de code, les éléments HTML, les badges, les URL et la mise en forme des tableaux sont conservés intacts — seul le contenu textuel (titres, paragraphes, slogans, cellules de tableau) est traduit. Les portions de code en ligne et les [termes protégés](#termes-protégés-polyglot-terms.json) sont remplacés par des espaces réservés avant la traduction, puis restaurés après, de sorte que les commandes, les indicateurs, les noms de paquets et les identificateurs sont restitués exactement comme ils ont été écrits, et que chaque nombre « N sur M » est restitué sous la forme `N/M`.

| Paramètre | Obligatoire | Description |
|--------------|----------|-------------|
| `onLostSpan` | no       | `report` (par défaut) liste les portions protégées manquantes dans la traduction ; `fail` transforme cela en erreur. Voir [Vérification de survie](#vérification-de-survie---en-cas-de-portion-manquante) |

### `list_languages`

### `check_status`

### `translate_all`

### `translate_readme`

## Fonctionnalités

### Démarrage et téléchargement automatiques

### Nouvelle tentative avec recul exponentiel

### Découpage intelligent

### Cache de segments

### Mémoire de traduction (Cache flou)

### Termes protégés (`.polyglot-terms.json`)

### Vérification de la survie (`--on-lost-span`)

### Traductions fixées (`.polyglot-pins.json`)

### Ollama Cloud (facultatif)

### Sémaphore de concurrence

### Jetons de progression MCP

### Glossaire logiciel

### Traduction par lots

### Modèle par défaut configurable

### Erreurs structurées

### Validation de la sortie

### Diffusion en continu

## Langues prises en charge

## Performances

## Architecture

## Sécurité et portée des données

## Développement

## Licence
