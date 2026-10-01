<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Servidor de traducción de GPU local — 57 idiomas, sin dependencia de la nube.</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="node 20+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## Qué hace

Traduce texto entre 57 idiomas utilizando [TranslateGemma](https://ollama.com/library/translategemma) que se ejecuta localmente en su GPU a través de [Ollama](https://ollama.com). No se necesitan claves de API, ni nube, ni límites de frecuencia; de forma predeterminada, todo permanece en su máquina. Puede optar por utilizar un Ollama remoto, como [Ollama Cloud](#ollama-cloud-optional).

## Primeros pasos

### 1. Instale Ollama

Descargue desde [ollama.com](https://ollama.com) e inicie:

```bash
ollama serve
```

### 2. Descargue un modelo

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **Consejo:** Puede omitir este paso; Polyglot descarga automáticamente el modelo predeterminado (27B, 17 GB) en el primer uso. En una GPU más pequeña, establezca `POLYGLOT_MODEL=translategemma:12b` primero (consulte [Modelo predeterminado configurable](#configurable-default-model)).

### 3. Agregue a su cliente MCP

**Claude Code / Claude Desktop:** agregue a `claude_desktop_config.json` o `.mcp.json`:

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

**Desde el código fuente:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

Eso es todo. Pídale a Claude que traduzca algo y utilizará automáticamente la herramienta `translate`.

## Herramientas

Polyglot expone seis herramientas MCP:

### `translate`

Traduce texto entre cualquier par de idiomas admitidos.

| Parámetro | Obligatorio | Descripción |
|-------------|----------|-------------|
| `text`      | sí | Texto para traducir |
| `from`      | sí | Código o nombre del idioma de origen (por ejemplo, `en`, `English`) |
| `to`        | sí | Código o nombre del idioma de destino (por ejemplo, `ja`, `Japanese`) |
| `model`     | no       | Modelo de Ollama (predeterminado: `translategemma:27b`) |
| `glossary`  | no       | Anulaciones de términos personalizadas como `{"source": "translation"}`: se combinan con el glosario de software integrado |

El texto largo se divide automáticamente en fragmentos en los límites de los párrafos y las oraciones, se traduce en secuencia y se vuelve a ensamblar. Todas las traducciones se validan para garantizar la calidad (salida vacía, detección de eco, truncamiento, texto ilegible).

### `translate_markdown`

Traduzca todo un documento de Markdown conservando la estructura. Los bloques de código, los elementos HTML, las insignias, las URL y el formato de la tabla se mantienen intactos; solo se traduce el contenido en prosa (encabezados, párrafos, eslóganes, celdas de la tabla). Los fragmentos de código en línea se reemplazan por marcadores de posición antes de la traducción y se restauran después, de modo que los comandos, las marcas, los nombres de los paquetes y los identificadores se devuelven exactamente como se escribieron.

| Parámetro | Obligatorio | Descripción |
|-------------|----------|-------------|
| `markdown`  | sí | El contenido completo de Markdown que se va a traducir |
| `from`      | sí | Código o nombre del idioma de origen |
| `to`        | sí | Código o nombre del idioma de destino |
| `model`     | no       | Modelo de Ollama (predeterminado: `translategemma:27b`) |

### `list_languages`

Enumere los 57 idiomas admitidos con sus códigos.

### `check_status`

Verifique si Ollama se está ejecutando y qué modelos de TranslateGemma están instalados. Intenta iniciarse automáticamente si Ollama no se está ejecutando.

### `translate_all`

Traduzca el contenido de Markdown a varios idiomas a la vez (predeterminado: 7: japonés, chino, español, francés, hindi, italiano, portugués). Ejecuta las traducciones de forma concurrente con un semáforo seguro para la GPU.

| Parámetro | Obligatorio | Descripción |
|---------------|----------|-------------|
| `markdown`    | sí | El contenido completo de Markdown que se va a traducir |
| `from`        | no       | Código del idioma de origen (predeterminado: `en`) |
| `languages`   | no       | Matriz de códigos de idioma de destino (predeterminado: los 7) |
| `model`       | no       | Modelo de Ollama (predeterminado: `translategemma:27b`) |
| `concurrency` | no       | Número máximo de traducciones simultáneas (predeterminado: 2, máximo: 3) |
| `navBar`      | no       | Inyecte la barra de navegación de idiomas (predeterminado: verdadero) |

### `translate_readme`

Traduzca un archivo README.md a los mismos 7 idiomas y escriba los archivos `README.<lang>.md` junto a él, actualizando la barra de navegación de idiomas en el archivo README de origen y en cada traducción. Devuelve un resumen de estado por idioma (correcto/fallido, tiempos, archivos escritos) en lugar del texto traducido; utilice `translate_markdown` cuando desee recuperar el contenido.

| Parámetro | Obligatorio | Descripción |
|---------------|----------|-------------|
| `readmePath`  | sí | Ruta absoluta al archivo README.md de origen |
| `tier`        | no       | `quality` (`translategemma:27b`, predeterminado), `bulk` (`12b`) o `draft` (`2b`); se ignora cuando se establece `model` |
| `model`       | no       | Modelo de Ollama explícito; anula `tier` |
| `languages`   | no       | Subconjunto de códigos de idioma de destino (predeterminado: los 7) |
| `concurrency` | no       | Número máximo de traducciones simultáneas (predeterminado: 2, máximo: 3) |
| `navBar`      | no       | Inyecte o actualice la barra de navegación de idiomas (predeterminado: verdadero) |

## Características

### Inicio y descarga automáticos
Ollama se inicia automáticamente si no se está ejecutando. El modelo TranslateGemma se descarga automáticamente si no está instalado. No se requiere ninguna configuración manual.

### Reintento con retroceso exponencial
Los fallos transitorios de Ollama (interrupciones de la red, sobrecarga temporal) se reintentan automáticamente hasta 2 veces con retroceso exponencial (1 s, 2 s). Los errores que no se pueden reintentar (nombre de modelo incorrecto, entrada no válida) fallan inmediatamente.

### Fragmentación inteligente
El texto largo se divide en límites naturales: párrafos y luego oraciones, de modo que se conserva el contexto de la traducción. Los tamaños de los fragmentos se adaptan al modelo: 2K caracteres para los modelos de 2B/4B, 4K para 12B, 6K para 27B.

### Caché de segmentos
Los segmentos traducidos se almacenan en caché por hash de contenido (SHA-256 del texto de origen + idioma de destino + modelo). Los segmentos que no han cambiado omiten por completo la re-traducción, por lo que volver a ejecutar una traducción después de una edición solo afecta a lo que ha cambiado. La caché se encuentra en `.polyglot-cache.json` junto al archivo de origen, con un TTL de 30 días. Se utiliza mediante la API de la biblioteca `translateMarkdown` cuando se proporciona un `filePath` (y mediante la CLI `scripts/translate-*.mjs` del repositorio); las herramientas MCP traducen sin ella.

Varias ejecuciones pueden compartir un único archivo de caché. Cada guardado combina solo sus propios cambios en el archivo bajo un bloqueo y reemplaza el archivo de forma atómica, de modo que los idiomas traducidos en paralelo conservan las entradas del otro y borrar la caché de un idioma deja solos a los demás.

### Memoria de traducción (caché difusa)
Cuando no se encuentra una coincidencia exacta en la caché, una traducción en caché se reutiliza solo si su origen difiere del nuevo solo en el diseño del espacio en blanco: espaciado dentro de una línea, espacio en blanco en cualquiera de los extremos o CRLF en lugar de LF. Cualquier otra edición se vuelve a traducir, incluido un cambio de palabra, número, signo de puntuación, mayúscula o fragmento de código en línea. Una traducción en caché es la traducción de su propio origen, por lo que reutilizarla para texto editado mostraría la redacción antigua.

### Ollama Cloud (opcional)
Establezca `OLLAMA_HOST` para enviar solicitudes a otro servidor de Ollama en lugar de `localhost:11434`. Para [Ollama Cloud](https://ollama.com), también establezca `OLLAMA_API_KEY`: la clave se envía como un token Bearer y solo a un host que no sea de bucle local.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Semáforo de concurrencia
Todas las llamadas a Ollama están protegidas por un semáforo de conteo (límite predeterminado: 1) para evitar el agotamiento de la memoria de la GPU en sistemas con VRAM limitada. Anule la configuración con `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Tokens de progreso de MCP
Todas las herramientas informan del progreso a través de MCP `notifications/progress` cuando el cliente proporciona un `progressToken`. Traduzca los informes por fragmento, translate_markdown por lote de segmentos, translate_all por idioma y check_status por paso.

### Glosario de software
Un glosario integrado de 12 términos técnicos (API, CLI, SDK, etc.) garantiza una traducción coherente de la terminología del software. Se pueden pasar entradas de glosario personalizadas por solicitud y se fusionan con los valores predeterminados.

### Traducción por lotes
`translateBatch` agrupa varios segmentos en una sola solicitud cuando es posible, lo que reduce el número de intercambios. Si el separador de lotes está dañado, vuelve a la traducción individual.

### Modelo predeterminado configurable
El modelo predeterminado es `translategemma:27b`. Establezca la variable de entorno `POLYGLOT_MODEL` para usar otro modelo, por ejemplo, en una GPU con menos VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Errores estructurados
Todos los errores utilizan `PolyglotError` con un código legible por máquina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), un mensaje legible por humanos, una sugerencia opcional y una marca `retryable`.

### Validación de la salida
Cada traducción se valida automáticamente: la salida vacía genera un error (reintentable), se marca la repetición del texto de origen, se advierte sobre el truncamiento y la alucinación graves, se detecta la codificación corrupta y los metacomentarios del modelo. Las advertencias aparecen en la respuesta de la herramienta MCP.

### Transmisión en tiempo real
`OllamaClient.generateStream()` genera tokens a través de NDJSON a medida que Ollama los produce. La función `translate()` acepta una función de devolución de llamada `onToken` para mostrar el progreso en tiempo real. Tanto las rutas de transmisión en tiempo real como las que no lo son comparten la lógica de reintento.

## Idiomas admitidos

Afrikaans, albanés, árabe, bengalí, búlgaro, catalán, chino (simplificado), chino (tradicional), croata, checo, danés, neerlandés, inglés, estonio, finlandés, francés, gallego, alemán, griego, gujarati, hebreo, hindi, húngaro, indonesio, irlandés, italiano, japonés, kannada, coreano, letón, lituano, macedonio, malayo, malayam, maltés, marathi, noruego, persa, polaco, portugués, rumano, ruso, gaélico escocés, serbio, eslovaco, esloveno, español, suajili, sueco, tamil, télugu, tailandés, turco, ucraniano, urdu, vietnamita, galés.

## Rendimiento

| Métrica | 27B (predeterminado), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| Primera traducción (carga del modelo en frío) | ~30 s | ~15 s |
| Traducciones posteriores | ~1–2 s por lote de segmentos de README | ~600 ms |
| Memoria del modelo | 17 GB, completamente en la GPU (según informa `ollama ps`) | ~8,1 GB |

## Arquitectura

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

## Seguridad y ámbito de los datos

| Aspecto | Detalle |
|--------|--------|
| **Data touched** | Texto enviado a la API de Ollama: local (`localhost:11434`) de forma predeterminada, o el host en `OLLAMA_HOST` si lo establece. `.polyglot-cache.json` caché de segmentos junto a un archivo traducido (solo para la biblioteca y la CLI) |
| **Files written** | `translate_readme` escribe `README.<lang>.md` junto al archivo README que le pasa y actualiza la barra de navegación de idiomas de ese archivo README |
| **Data NOT touched** | No se recopilan ni se envían datos del navegador ni credenciales del sistema operativo, ni nada fuera de los directorios anteriores |
| **Network** | HTTP solo a `localhost:11434` de forma predeterminada: cero salida externa. Solo remoto cuando `OLLAMA_HOST` apunta a otro lugar |
| **Secrets** | `OLLAMA_API_KEY`, si se establece, se lee desde el entorno y se envía solo como un token Bearer a un host que no sea de bucle local `OLLAMA_HOST`; nunca se escribe en el disco ni se registra |
| **Telemetry** | No se recopila ni se envía nada |

Consulte [SECURITY.md](SECURITY.md) para conocer la política de notificación de vulnerabilidades.

## Desarrollo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 362 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licencia

MIT: consulte [LICENSE](LICENSE).

> Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
