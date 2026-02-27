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

Traduit du texte entre 55 langues en utilisant [TranslateGemma](https://ollama.com/library/translategemma), qui s'exécute localement sur votre GPU via [Ollama](https://ollama.com). Pas de clés API, pas de cloud, pas de limitations de débit : tout s'exécute sur votre machine.

## Prérequis

1. **[Ollama](https://ollama.com)** installé et en cours d'exécution (`ollama serve`)
2. Modèle **TranslateGemma** téléchargé :
```bash
ollama pull translategemma:12b   # 8,1 Go — meilleur équilibre qualité/vitesse
# ou
ollama pull translategemma:4b    # 3,3 Go — plus rapide, qualité inférieure
```
3. **Node.js 18+**

## Installation

### Claude Code / Claude Desktop

Ajoutez ceci à votre configuration MCP (`claude_desktop_config.json` ou `.mcp.json`) :

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

### À partir du code source

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## Outils

### `translate`

Traduit du texte entre n'importe quelle paire de langues prises en charge.

| Paramètre | Obligatoire | Description |
|-----------|----------|-------------|
| `text` | oui | Texte à traduire |
| `from` | oui | Code ou nom de la langue source (par exemple, `en`, `English`) |
| `to` | oui | Code ou nom de la langue cible (par exemple, `ja`, `Japanese`) |
| `model` | no | Modèle Ollama (par défaut : `translategemma:12b`) |

### `list_languages`

Affiche toutes les 55 langues prises en charge avec leurs codes.

### `check_status`

Vérifie si Ollama est en cours d'exécution et quels modèles TranslateGemma sont installés.

## Langues prises en charge

Afrikaans, albanais, arabe, bengali, bulgare, catalan, chinois (simplifié), chinois (traditionnel), croate, tchèque, danois, néerlandais, anglais, estonien, finnois, français, galicien, allemand, grec, gujarati, hébreu, hindi, hongrois, indonésien, irlandais, italien, japonais, kannada, coréen, letton, lituanien, macédonien, malais, malayalam, maltais, marathi, norvégien, persan, polonais, portugais, roumain, russe, gaélique écossais, serbe, slovaque, slovène, espagnol, swahili, suédois, tamoul, télougou, thaï, turc, ukrainien, ourdou, vietnamien, gallois.

## Performances

Sur un RTX 5080 (16 Go de VRAM) avec TranslateGemma 12B (Q4) :

| Métrique | Valeur |
|--------|-------|
| Première traduction (chargement initial) | ~15 secondes |
| Traductions suivantes | ~600 ms |
| Utilisation de la VRAM | ~8,1 Go |
| Long texte (divisé en blocs) | ~600 ms par bloc |

## Sécurité et portée des données

**Données traitées :** texte envoyé à l'API locale d'Ollama (`localhost:11434`) pour la traduction, cache de segments `.polyglot-cache.json`. **Données NON traitées :** aucun fichier en dehors du répertoire de travail, aucune donnée de navigateur, aucune identité système. **Réseau :** uniquement HTTP vers `localhost:11434` — pas de sortie externe/Internet. **Aucune télémétrie** n'est collectée ou envoyée.

## Fonctionnement

1. Votre client MCP (Claude Code, etc.) appelle l'outil `translate`.
2. Polyglot crée une invite TranslateGemma avec la paire de langues source/cible.
3. L'invite est envoyée à l'API HTTP locale d'Ollama.
4. Ollama exécute TranslateGemma sur votre GPU et renvoie la traduction.
5. Pour les longs textes, le contenu est divisé en blocs aux limites des paragraphes/phrases.

## Licence

Licence MIT — voir [LICENSE](LICENSE) pour plus de détails.

> Créé par [MCP Tool Shop](https://mcp-tool-shop.github.io/)
