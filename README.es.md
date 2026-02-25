<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center"><img src="logo.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Servidor de traducción MCP con procesamiento local en la GPU: compatible con 55 idiomas y sin dependencia de la nube.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## Qué hace

Traduce texto entre 55 idiomas utilizando [TranslateGemma](https://ollama.com/library/translategemma), que se ejecuta localmente en su GPU a través de [Ollama](https://ollama.com). No requiere claves de API, no utiliza la nube y no tiene límites de uso, ya que todo se ejecuta en su propio dispositivo.

## Requisitos previos

1. **[Ollama](https://ollama.com)** instalado y en ejecución (`ollama serve`).
2. Modelo **TranslateGemma** descargado:
   ```bash
   ollama pull translategemma:12b   # 8.1 GB — mejor equilibrio entre calidad y velocidad
   # o
   ollama pull translategemma:4b    # 3.3 GB — más rápido, menor calidad
   ```
3. **Node.js 18 o superior**.

## Configuración

### Claude Code / Claude para escritorio

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

### Desde la fuente

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## Herramientas

### `translate`

Traduzca texto entre cualquier par de idiomas soportados.

| Parámetro. | Requerido. | Descripción. |
|-----------|----------|-------------|
| `text` | yes | Por favor, proporcione el texto que desea que traduzca. |
| `from` | yes | Código del idioma de origen o nombre (por ejemplo, `en`, `inglés`). |
| `to` | yes | Código o nombre del idioma de destino (por ejemplo, `ja`, `japonés`). |
| `model` | no | Modelo Ollama (por defecto: `translategemma:12b`). |

### `list_languages`

Enumere todos los 55 idiomas soportados, junto con sus códigos.

### `check_status`

Verifique si Ollama está en funcionamiento y qué modelos de TranslateGemma están instalados.

## Idiomas soportados

Afrikáans, albanés, árabe, bengalí, búlgaro, catalán, chino (simplificado), chino (tradicional), croata, checo, danés, neerlandés, inglés, estonio, finlandés, francés, gallego, alemán, griego, gujarati, hebreo, hindi, húngaro, indonesio, irlandés, italiano, japonés, kannada, coreano, latín, lituano, macedonio, malayo, malayam, maltés, marathi, noruego, persa, polaco, portugués, rumano, ruso, gaélico escocés, serbio, eslovaco, esloveno, español, suajili, sueco, tamil, telugu, tailandés, turco, ucraniano, urdu, vietnamita, galés.

## Rendimiento.
Desempeño.
Actuación.
Representación.
Funcionamiento.
Prestación

En una RTX 5080 (con 16 GB de VRAM) utilizando TranslateGemma 12B (en formato Q4):

| Métrica. | Value |
|--------|-------|
| Primera traducción (carga en vacío). | ~15s |
| Traducciones posteriores. | Aproximadamente 600 milisegundos. |
| Uso de la memoria de video (VRAM). | Aproximadamente 8.1 GB. |
| Texto extenso (dividido en partes). | Aproximadamente 600 milisegundos por fragmento. |

## Cómo funciona

1. Su cliente MCP (Claude Code, etc.) llama a la herramienta `translate`.
2. Polyglot crea una instrucción para TranslateGemma, especificando el par de idiomas de origen y destino.
3. La instrucción se envía a la API HTTP local de Ollama.
4. Ollama ejecuta TranslateGemma en su GPU y devuelve la traducción.
5. Para textos largos, el contenido se divide en fragmentos en los límites de párrafo o frase.

## Licencia

Licencia MIT: consulte el archivo [LICENSE](LICENSE) para obtener más detalles.

Forma parte de [MCP Tool Shop](https://mcptoolshop.com).
