<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## Ce que fait ce programme

Traduit du texte entre 55 langues en utilisant [TranslateGemma](https://ollama.com/library/translategemma), qui s'exécute localement sur votre GPU via [Ollama](https://ollama.com). Pas de clés API, pas de cloud, pas de limites de débit : tout reste sur votre machine.

## Démarrage rapide

### 1. Installer Ollama

Téléchargez-le depuis [ollama.com](https://ollama.com) et lancez-le :

```bash
ollama serve
```

### 2. Télécharger un modèle

```bash
ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
# or
ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
# or
ollama pull translategemma:27b   # 17 GB  — highest quality
```

> **Conseil :** Vous pouvez ignorer cette étape, Polyglot télécharge automatiquement le modèle lors de la première utilisation.

### 3. Ajouter à votre client MCP

**Claude Code / Claude Desktop** — ajoutez ceci à `claude_desktop_config.json` ou `.mcp.json` :

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

**Depuis le code source :**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

C'est tout. Demandez à Claude de traduire quelque chose et il utilisera automatiquement l'outil `translate`.

## Outils

Polyglot expose trois outils MCP :

### `translate`

Traduit du texte entre n'importe quelle paire de langues prises en charge.

| Paramètre | Obligatoire | Description |
|-------------|----------|-------------|
| `text`      | oui | Texte à traduire |
| `from`      | oui | Code ou nom de la langue source (par exemple, `en`, `English`) |
| `to`        | oui | Code ou nom de la langue cible (par exemple, `ja`, `Japanese`) |
| `model`     | no       | Modèle Ollama (par défaut : `translategemma:12b`) |
| `glossary`  | no       | Remplacements de termes personnalisés sous la forme `{"source": "translation"}` — fusionnés avec le glossaire logiciel intégré. |

Les longs textes sont automatiquement divisés en segments aux limites des paragraphes et des phrases, traduits séquentiellement et réassemblés.

### `list_languages`

Liste toutes les 55 langues prises en charge avec leurs codes.

### `check_status`

Vérifie si Ollama est en cours d'exécution et quels modèles TranslateGemma sont installés. Tente de démarrer automatiquement si Ollama n'est pas en cours d'exécution.

## Fonctionnalités

### Démarrage et téléchargement automatiques
Ollama est automatiquement démarré s'il n'est pas en cours d'exécution. Le modèle TranslateGemma est automatiquement téléchargé s'il n'est pas installé. Aucune configuration manuelle requise.

### Nouvelle tentative avec ré-essai exponentiel
Les échecs transitoires d'Ollama (problèmes de réseau, surcharge temporaire) sont automatiquement retentés jusqu'à 2 fois avec un ré-essai exponentiel (1 s, 2 s). Les erreurs non retentables (nom de modèle incorrect, entrée invalide) échouent immédiatement.

### Segmentation intelligente
Les longs textes sont divisés aux limites naturelles (paragraphes, puis phrases) afin de préserver le contexte de la traduction. Les tailles de segment s'adaptent au modèle : 2 Ko pour les modèles 2 Go/4 Go, 4 Ko pour 12 Go, 6 Ko pour 27 Go.

### Cache de segments
Les segments traduits sont mis en cache en fonction de la valeur de hachage du contenu (SHA-256 du texte source + langue cible + modèle). Les segments inchangés ne sont pas re-traduits. Le cache se trouve dans `.polyglot-cache.json` et a une durée de vie de 30 jours.

### Glossaire logiciel
Un glossaire intégré de 12 termes techniques (API, CLI, SDK, etc.) garantit une traduction cohérente de la terminologie logicielle. Les entrées de glossaire personnalisées peuvent être fournies pour chaque requête et sont fusionnées avec les valeurs par défaut.

### Traduction par lots
`translateBatch` regroupe plusieurs segments dans une seule requête lorsque cela est possible, ce qui réduit le nombre d'allers-retours. Si le séparateur de lot est corrompu, la traduction individuelle est utilisée.

### Modèle par défaut configurable
Définissez la variable d'environnement `POLYGLOT_MODEL` pour remplacer le modèle par défaut :

```bash
POLYGLOT_MODEL=translategemma:27b npx @mcptoolshop/polyglot-mcp
```

### Erreurs structurées
Toutes les erreurs utilisent `PolyglotError` avec un code lisible par machine (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), un message lisible par l'homme, une indication facultative et un indicateur `retryable`.

## Langues prises en charge

Afrikaans, albanais, arabe, bengali, bulgare, catalan, chinois (simplifié), chinois (traditionnel), croate, tchèque, danois, néerlandais, anglais, estonien, finnois, français, galicien, allemand, grec, gujarati, hébreu, hindi, hongrois, indonésien, irlandais, italien, japonais, kannada, coréen, letton, lituanien, macédonien, malais, malayalam, maltais, marathi, norvégien, persan, polonais, portugais, roumain, russe, gaélique écossais, serbe, slovaque, slovène, espagnol, swahili, suédois, tamoul, télougou, thaï, turc, ukrainien, ourdou, vietnamien, gallois.

## Performance

Sur un RTX 5080 (16 Go de VRAM) avec TranslateGemma 12B (Q4) :

| Métrique | Valeur |
|--------|-------|
| Première traduction (chargement initial du modèle) | ~15 secondes |
| Traductions suivantes | ~600 millisecondes |
| Utilisation de la VRAM | ~8,1 Go |
| Texte long (par segment) | ~600 millisecondes |

## Architecture

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

## Sécurité et portée des données

| Aspect | Détail |
|--------|--------|
| **Data touched** | Texte envoyé à l'API Ollama locale (`localhost:11434`), cache de segments `.polyglot-cache.json` |
| **Data NOT touched** | Aucun fichier en dehors du répertoire de travail, aucune donnée de navigateur, aucune information d'identification du système d'exploitation. |
| **Network** | HTTP uniquement vers `localhost:11434` — aucun flux de données externe/internet. |
| **Telemetry** | Aucune donnée collectée ou envoyée. |

Voir [SECURITY.md](SECURITY.md) pour la politique de signalement des vulnérabilités.

## Développement

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 114 unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licence

MIT — voir [LICENSE](LICENSE).

> Créé par [MCP Tool Shop](https://mcp-tool-shop.github.io/)
