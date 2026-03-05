<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Servidor de traducción local con GPU — 55 idiomas, sin dependencia de la nube.</strong></p>

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

Traduce texto entre 55 idiomas utilizando [TranslateGemma](https://ollama.com/library/translategemma), que se ejecuta localmente en su GPU a través de [Ollama](https://ollama.com). No requiere claves de API, ni conexión a la nube, ni límites de uso; todo se ejecuta en su máquina.

## Cómo empezar

### 1. Instale Ollama

Descargue desde [ollama.com](https://ollama.com) y ejecútelo:

```bash
ollama serve
```

### 2. Descargue un modelo

```bash
ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
# or
ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
# or
ollama pull translategemma:27b   # 17 GB  — highest quality
```

> **Consejo:** Puede omitir este paso; Polyglot descarga automáticamente el modelo en la primera ejecución.

### 3. Agregue a su cliente MCP

**Claude Code / Claude Desktop** — agregue a `claude_desktop_config.json` o `.mcp.json`:

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

**Desde la fuente:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

Eso es todo. Pídale a Claude que traduzca algo y utilizará la herramienta `translate` automáticamente.

## Herramientas

Polyglot expone tres herramientas MCP:

### `translate`

Traduce texto entre cualquier par de idiomas soportados.

| Parámetro | Requerido | Descripción |
|-------------|----------|-------------|
| `text`      | sí | Texto a traducir |
| `from`      | sí | Código o nombre del idioma de origen (ej., `en`, `English`) |
| `to`        | sí | Código o nombre del idioma de destino (ej., `ja`, `Japanese`) |
| `model`     | no       | Modelo de Ollama (por defecto: `translategemma:12b`) |
| `glossary`  | no       | Reemplazos de términos personalizados en formato `{"source": "translation"}` — se combinan con el glosario de software integrado. |

El texto largo se divide automáticamente en fragmentos en los límites de párrafo y oración, se traduce en secuencia y se vuelve a ensamblar.

### `list_languages`

Lista los 55 idiomas soportados con sus códigos.

### `check_status`

Verifica si Ollama está en ejecución y qué modelos TranslateGemma están instalados. Intenta iniciarse automáticamente si Ollama no está en ejecución.

## Características

### Inicio y descarga automática
Ollama se inicia automáticamente si no está en ejecución. El modelo TranslateGemma se descarga automáticamente si no está instalado. No se requiere configuración manual.

### Reintento con retroceso exponencial
Los fallos transitorios de Ollama (problemas de red, sobrecarga temporal) se reintentan automáticamente hasta 2 veces con retroceso exponencial (1 s, 2 s). Los errores que no se pueden reintentar (nombre de modelo incorrecto, entrada inválida) fallan inmediatamente.

### Fragmentación inteligente
El texto largo se divide en límites naturales: párrafos y luego oraciones, para preservar el contexto de la traducción. Los tamaños de los fragmentos se adaptan al modelo: 2K caracteres para modelos de 2B/4B, 4K para 12B, 6K para 27B.

### Caché de segmentos
Los segmentos traducidos se almacenan en caché mediante el hash del contenido (SHA-256 del texto de origen + idioma de destino + modelo). Los segmentos sin cambios omiten la re-traducción por completo. La caché se encuentra en `.polyglot-cache.json` y tiene un TTL de 30 días.

### Glosario de software
Un glosario integrado de 12 términos técnicos (API, CLI, SDK, etc.) garantiza una traducción coherente de la terminología de software. Las entradas personalizadas del glosario se pueden pasar por solicitud y se combinan con los valores predeterminados.

### Traducción por lotes
`translateBatch` agrupa múltiples segmentos en una sola solicitud siempre que sea posible, lo que reduce el número de viajes de ida y vuelta. Si el separador del lote se corrompe, recurre a la traducción individual.

### Modelo predeterminado configurable
Establezca la variable de entorno `POLYGLOT_MODEL` para sobrescribir el modelo predeterminado:

```bash
POLYGLOT_MODEL=translategemma:27b npx @mcptoolshop/polyglot-mcp
```

### Errores estructurados
Todos los errores utilizan `PolyglotError` con un código legible por máquina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), un mensaje legible por humanos, una sugerencia opcional y una bandera `retryable`.

## Idiomas soportados

Afrikáans, albanés, árabe, bengalí, búlgaro, catalán, chino (simplificado), chino (tradicional), croata, checo, danés, neerlandés, inglés, estonio, finlandés, francés, gallego, alemán, griego, gujarati, hebreo, hindi, húngaro, indonesio, irlandés, italiano, japonés, kannada, coreano, latín, lituano, macedonio, malayo, malayam, maltés, marathi, noruego, persa, polaco, portugués, rumano, ruso, gaélico escocés, serbio, eslovaco, esloveno, español, suajili, sueco, tamil, telugu, tailandés, turco, ucraniano, urdu, vietnamita, galés.

## Rendimiento

En una RTX 5080 (16 GB de VRAM) con TranslateGemma 12B (Q4):

| Métrica | Valor |
|--------|-------|
| Primera traducción (carga inicial del modelo) | ~15 segundos |
| Traducciones posteriores | ~600 ms |
| Uso de VRAM | ~8.1 GB |
| Texto largo (por fragmento) | ~600 ms |

## Arquitectura

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

## Seguridad y alcance de los datos

| Aspecto | Detalle |
|--------|--------|
| **Data touched** | Texto enviado a la API local de Ollama (`localhost:11434`), caché de segmentos `.polyglot-cache.json` |
| **Data NOT touched** | No hay archivos fuera del directorio de trabajo, no hay datos del navegador, no hay credenciales del sistema operativo. |
| **Network** | HTTP a `localhost:11434` solamente — sin salida externa/de internet. |
| **Telemetry** | Ninguno recopilado ni enviado. |

Consulte [SECURITY.md](SECURITY.md) para obtener la política de notificación de vulnerabilidades.

## Desarrollo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 114 unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licencia

MIT — consulte [LICENSE](LICENSE).

> Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
