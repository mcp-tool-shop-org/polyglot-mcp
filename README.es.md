<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## ¿Qué hace?

Traduce texto entre 55 idiomas utilizando [TranslateGemma](https://ollama.com/library/translategemma), que se ejecuta localmente en su GPU a través de [Ollama](https://ollama.com). No requiere claves de API, ni servicios en la nube, ni límites de uso; todo se ejecuta en su máquina.

## Requisitos previos

1. **[Ollama](https://ollama.com)** instalado y en ejecución (`ollama serve`).
2. Modelo **TranslateGemma** descargado:
```bash
ollama pull translategemma:12b   # 8.1 GB — mejor equilibrio entre calidad y velocidad
# o
ollama pull translategemma:4b    # 3.3 GB — más rápido, menor calidad
```
3. **Node.js 18+**

## Configuración

### Claude Code / Claude Desktop

Agregue lo siguiente a su configuración de MCP (`claude_desktop_config.json` o `.mcp.json`):

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

### Desde el código fuente

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## Herramientas

### `translate`

Traduce texto entre cualquier par de idiomas soportados.

| Parámetro | Obligatorio | Descripción |
|-----------|----------|-------------|
| `text` | sí | Texto a traducir |
| `from` | sí | Código o nombre del idioma de origen (ej., `en`, `English`). |
| `to` | sí | Código o nombre del idioma de destino (ej., `ja`, `Japanese`). |
| `model` | no | Modelo de Ollama (por defecto: `translategemma:12b`). |

### `list_languages`

Lista todos los 55 idiomas soportados con sus códigos.

### `check_status`

Verifica si Ollama está en ejecución y qué modelos de TranslateGemma están instalados.

## Idiomas soportados

Afrikáans, albanés, árabe, bengalí, búlgaro, catalán, chino (simplificado), chino (tradicional), croata, checo, danés, holandés, inglés, estonio, finlandés, francés, gallego, alemán, griego, gujarati, hebreo, hindi, húngaro, indonesio, irlandés, italiano, japonés, kannada, coreano, letón, lituano, macedonio, malayo, malayalam, maltés, marathi, noruego, persa, polaco, portugués, rumano, ruso, gaélico escocés, serbio, eslovaco, esloveno, español, suajili, sueco, tamil, telugu, tailandés, turco, ucraniano, urdu, vietnamita, galés.

## Rendimiento

En una RTX 5080 (16 GB de VRAM) con TranslateGemma 12B (Q4):

| Métrica | Valor |
|--------|-------|
| Primera traducción (carga inicial) | ~15 segundos |
| Traducciones posteriores | ~600 ms |
| Uso de VRAM | ~8.1 GB |
| Texto largo (dividido en fragmentos) | ~600 ms por fragmento |

## Seguridad y alcance de los datos

**Datos accedidos:** texto enviado a la API local de Ollama (`localhost:11434`) para la traducción, caché de segmentos `.polyglot-cache.json`. **Datos NO accedidos:** no hay archivos fuera del directorio de trabajo, no hay datos del navegador, no hay credenciales del sistema operativo. **Red:** solo HTTP a `localhost:11434` — no hay conexiones externas ni a Internet. **No se recopila ni se envía** telemetría.

## Cómo funciona

1. Su cliente de MCP (Claude Code, etc.) llama a la herramienta `translate`.
2. Polyglot crea una solicitud de TranslateGemma con el par de idiomas de origen/destino.
3. La solicitud se envía a la API HTTP local de Ollama.
4. Ollama ejecuta TranslateGemma en su GPU y devuelve la traducción.
5. Para textos largos, el contenido se divide en fragmentos en los límites de párrafo/oración.

## Licencia

Licencia MIT — consulte [LICENSE](LICENSE) para obtener más detalles.

> Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
