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

Traduce texto entre 57 idiomas utilizando TranslateGemma(https://ollama.com/library/translategemma) que se ejecuta localmente en su GPU a través de [Ollama](https://ollama.com). No hay claves de API, ni nube, ni límites de frecuencia; de forma predeterminada, todo permanece en su máquina. Puede optar por utilizar un Ollama remoto, como [Ollama Cloud](#ollama-cloud-opcional).

## Primeros pasos

### 1. Instale Ollama

Descargue desde [ollama.com](https://ollama.com) e inicie:

```bash
ollama serve
```

### 2. Obtenga un modelo

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **Consejo:** Puede omitir este paso; Polyglot descarga automáticamente el modelo predeterminado (27B, 17 GB) en el primer uso. En una GPU más pequeña, establezca `POLYGLOT_MODEL=translategemma:12b` primero (vea [Modelo predeterminado configurable](#modelo-predeterminado-configurable)).

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
| `glossary`  | no       | Anulaciones de términos personalizados como `{"source": "translation"}`: se combinan con el glosario de software integrado |

El texto largo se divide automáticamente en fragmentos en los límites de los párrafos y las oraciones, se traduce en secuencia y se vuelve a ensamblar. Todas las traducciones se validan para garantizar la calidad (salida vacía, detección de eco, truncamiento, texto ilegible).

### `translate_markdown`

Traduzca todo un documento de Markdown conservando la estructura. Los bloques de código, los elementos HTML, las insignias, las URL y el formato de la tabla se mantienen intactos; solo se traduce el contenido en prosa (encabezados, párrafos, eslóganes, celdas de la tabla). Los fragmentos de código en línea y los [términos protegidos](#términos-protegidos-polyglot-termsjson) se reemplazan por marcadores de posición antes de la traducción y se restauran después, de modo que los comandos, las marcas, los nombres de los paquetes y los identificadores se devuelven exactamente como se escribieron, y cada recuento de "N de M" se devuelve como `N/M`.

| Parámetro | Obligatorio | Descripción |
|--------------|----------|-------------|
| `markdown`   | sí | El contenido completo de Markdown que se va a traducir |
| `from`       | sí | Código o nombre del idioma de origen |
| `to`         | sí | Código o nombre del idioma de destino |
| `model`      | no       | Modelo de Ollama (predeterminado: `translategemma:27b`) |
| `onLostSpan` | no       | `report` (predeterminado) enumera los fragmentos protegidos que faltan en la traducción; `fail` convierte eso en un error. Consulte [Verificación de supervivencia](#prueba-de-supervivencia---on-lost-span) |

### `list_languages`

Enumere los 57 idiomas admitidos con sus códigos.

### `check_status`

Verifique si Ollama se está ejecutando y qué modelos TranslateGemma están instalados. Intenta iniciarse automáticamente si Ollama no se está ejecutando.

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
| `onLostSpan`  | no       | `report` (predeterminado) enumera los fragmentos protegidos perdidos por idioma; `fail` convierte un idioma con alguno en un error |

### `translate_readme`

Traduzca un archivo README.md a los mismos 7 idiomas y escriba los archivos `README.<lang>.md` junto a él, actualizando la barra de navegación de idiomas en el README de origen y en cada traducción. Devuelve un resumen de estado por idioma (correcto/fallido, tiempos, archivos escritos) en lugar del texto traducido; utilice `translate_markdown` cuando desee el contenido.

| Parámetro | Obligatorio | Descripción |
|---------------|----------|-------------|
| `readmePath`  | sí | Ruta absoluta al archivo README.md de origen |
| `tier`        | no       | `quality` (`translategemma:27b`, predeterminado), `bulk` (`12b`) o `draft` (`2b`); se ignora cuando se establece `model` |
| `model`       | no       | Modelo de Ollama explícito; anula `tier` |
| `languages`   | no       | Subconjunto de códigos de idioma de destino (predeterminado: los 7) |
| `concurrency` | no       | Número máximo de traducciones simultáneas (predeterminado: 2, máximo: 3) |
| `navBar`      | no       | Inyecte o actualice la barra de navegación de idiomas (predeterminado: verdadero) |
| `onLostSpan`  | no       | `report` (predeterminado) escribe cada archivo y enumera los fragmentos protegidos perdidos; `fail` deja un idioma con alguno sin escribir, como un error |

`translate_readme` lee el `.polyglot-terms.json` y el `.polyglot-pins.json` del README si existen.

## Características

### Inicio y descarga automáticos
Ollama se inicia automáticamente si no se está ejecutando. El modelo TranslateGemma se descarga automáticamente si no está instalado. No se requiere ninguna configuración manual.

### Reintento con retroceso exponencial
Los fallos transitorios de Ollama (interrupciones de la red, sobrecarga temporal) se reintentan automáticamente hasta 2 veces con un retroceso exponencial (1 s, 2 s). Los errores que no se pueden reintentar (nombre de modelo incorrecto, entrada no válida) fallan inmediatamente.

### Fragmentación inteligente
El texto largo se divide en límites naturales: párrafos y luego oraciones, para preservar el contexto de la traducción. Los tamaños de los fragmentos se adaptan al modelo: 2K caracteres para los modelos de 2B/4B, 4K para 12B, 6K para 27B.

### Caché de segmentos
Los segmentos traducidos se almacenan en caché por hash de contenido (SHA-256 del texto de origen enmascarado + idioma de destino + modelo, más un hash de las reglas de términos protegidos que coincidieron en el segmento). Los segmentos que no han cambiado omiten por completo la re-traducción, por lo que volver a ejecutar una traducción después de una edición solo afecta a lo que ha cambiado. Agregar un término protegido cambia la clave de cada segmento que lo contiene, por lo que una traducción en caché que volvió a escribir el término no se reproduce; otros segmentos conservan sus claves. La caché se encuentra en `.polyglot-cache.json` junto al archivo de origen, con un TTL de 30 días. Se utiliza mediante la API de la biblioteca `translateMarkdown` cuando se proporciona un `filePath` (y mediante la CLI `scripts/translate-*.mjs` del repositorio); las herramientas MCP traducen sin ella.

Varias ejecuciones pueden compartir un mismo archivo de caché. Cada vez que se guarda, solo se integran los cambios propios en el archivo, bajo un sistema de bloqueo, y el archivo se reemplaza de forma atómica. De este modo, los idiomas que se traducen en paralelo conservan las entradas del otro, y borrar la caché de un idioma no afecta a los demás.

### Memoria de traducción (almacén de coincidencias parciales)
Cuando no se encuentra una coincidencia exacta en la memoria caché, una traducción almacenada en la caché se reutiliza solo si su texto original difiere del nuevo únicamente en el formato de los espacios en blanco: espaciado dentro de una línea, espacios en blanco al principio o al final, o la diferencia entre CRLF y LF. Cualquier otra modificación requiere una nueva traducción, incluso si se trata de un cambio en una palabra, un número, un signo de puntuación, la capitalización de una letra o un fragmento de código en línea. Una traducción almacenada en la caché es la traducción de su propio texto original, por lo que reutilizarla para un texto modificado implicaría utilizar la redacción antigua.

### Términos protegidos (`.polyglot-terms.json`)
TranslateGemma vuelve a escribir los identificadores sin formato en otro idioma: un archivo README en hindi escribió `XLS-30` como `एक्सएलएस-30` y `Kimi-K3` como `किमी-के3`. También distorsiona los recuentos: el chino transformó "218/224" en "224/218". Por lo tanto, los identificadores en el texto se enmascaran como fragmentos de código en línea: cada uno se reemplaza por un marcador de posición sin letras antes de la traducción y se restaura después. Los valores predeterminados:

| Patrón | Mascarillas | Déjalas en paz. |
|---------|-------|--------------|
| `url` | `https://…` hasta encontrar un espacio en blanco, una comilla, un corchete o una comilla invertida. | |
| `caps-id` | ALL-CAPS elementos que contienen un dígito o letras mayúsculas unidas por `-` o `_`: `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase y mixedCase palabras: `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, palabras comunes con la primera letra en mayúscula. |
| `model-id` | Identificadores de modelo e identificadores de producto que contienen una combinación de letras y números: `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |
| `anchor` | Los enlaces internos `#slug` en Markdown (`[text](#slug)`, `[text](#slug "title")`) y las definiciones de referencia (`[label]: #slug`) apuntan a elementos dentro de la misma página, por lo que el modelo traduce el texto del enlace sin alterar el fragmento. | `#123` en prosa, `#heading` líneas, URL externas `https://…#frag` (cubiertas por `url`) |

Una vez que se traducen y vuelven a ensamblar todos los segmentos, cada encabezado ATX original se empareja con su encabezado ATX traducido y se organiza en el documento con `github-slugger` (coincidiendo con los ID de encabezado de GitHub, incluidos los sufijos `-1` y `-2` para los encabezados duplicados), y cada ancla dentro de la página que no es código (`[text](#slug)`, `[label]: #slug` y HTML `href="#slug"`) se reescribe para que coincida con el slug del encabezado traducido.

En el texto y en las celdas de la tabla, la expresión «N de M» (`218 of 224`) se oculta como un único bloque y se restaura como `218/224` en todos los idiomas, lo que permite que se lea correctamente en todas partes y no se puede invertir ni convertir en un número ordinal. Una celda de tabla que solo contiene un recuento no se envía al modelo.

Un repositorio añade sus propios términos en `.polyglot-terms.json`, junto con el archivo README. Cada campo es opcional:

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` son cadenas exactas que distinguen entre mayúsculas y minúsculas y que se comparan como palabras completas; `patterns` son JavaScript expresiones regulares. Ambos se añaden a la configuración predeterminada. `disable` desactiva la configuración predeterminada por nombre (por ejemplo, `"disable": ["anchor"]` desactiva el enmascaramiento de anclas dentro de la página, la reescritura de slugs después del ensamblaje y la comprobación de la supervivencia de las anclas), y `"nOfM": false` desactiva la regla de recuento. Un archivo que no se puede analizar detiene la ejecución con `CONFIG_ERROR` en lugar de traducir sin los términos solicitados.

### Prueba de supervivencia (`--on-lost-span`)
Después de la traducción, se verifica cada archivo de destino con el texto en inglés: cada fragmento protegido (fragmento de código en línea, término protegido y cada recuento, indicado como `N/M`) debe estar presente en la traducción de su segmento, carácter por carácter, y cada ancla `#slug` dentro de la página que se resolvía en el texto fuente en inglés debe resolverse en la traducción a una versión traducida del encabezado ATX o a una ancla HTML explícita `id=`/`name=` (si una ancla ya no se resolvía en el texto fuente en inglés, se informa como una advertencia y nunca provoca un error en el proceso). Cada celda de la tabla debe contener los mismos números que su celda de origen, comparados como un multiconjunto, no en orden: la corrección del chino para "218/224" coloca el total primero (`224 首中的 218 首`), por lo que una verificación del orden señalaría la respuesta correcta. Los dígitos de otros sistemas de escritura se normalizan antes de la comparación. El archivo también debe conservar sus bloques de código delimitados y los fragmentos de código en línea.

`--on-lost-span=fail|report` determina qué ocurre cuando se pierde algo:

- **`fail`**: la ejecución finaliza con un código de error distinto de cero y proporciona una lista del idioma, el segmento y el fragmento faltante. Esta es la configuración predeterminada para `scripts/translate-all.mjs`, que se ejecuta antes de las versiones. Los archivos se siguen escribiendo, por lo que se pueden corregir manualmente y fijar. El resumen JSON contiene la lista y un error `LOST_SPAN` con el formato `PolyglotError` habitual (`code`, `message`, `hint`, `retryable`).
- **`report`**: se escribe la lista y la ejecución finaliza con el código 0. Esta es la configuración predeterminada para las herramientas MCP (parámetro `onLostSpan`) y la API de la biblioteca `translateMarkdown` (opción `onLostSpan`, campo de resultado `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Traducciones fijas (`.polyglot-pins.json`)
Una traducción fijada siempre prevalece. `.polyglot-pins.json` se encuentra junto a la caché; cada entrada se identifica mediante un hash del segmento en inglés más el idioma de destino, y contiene la traducción fijada manualmente. Una fijación supera a la caché y al modelo, y se mantiene en cada nueva ejecución, `--cache-clear` incluida. Cuando el texto en inglés cambia, el hash también cambia, por lo que una fijación no puede perdurar más que el texto para el que fue creada.

Para solucionar los problemas de traducción manual, corrija el archivo traducido y, a continuación, ejecute:

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

Asocia cada segmento del texto en inglés con su versión en el archivo corregido y marca cada segmento cuyo texto difiere de la traducción almacenada en la caché. `--dry-run` muestra las marcas sin guardarlas. `--model=NAME` define el modelo con el que se comparan las entradas de la caché (por defecto: `$POLYGLOT_MODEL` o `translategemma:27b`, igual que en los scripts). `--include-uncached` también marca los segmentos para los que la caché no tiene traducción. Incluya los cambios `.polyglot-pins.json` y `.polyglot-terms.json` junto con el archivo README.

### Ollama Cloud (opcional)
Establezca `OLLAMA_HOST` para enviar solicitudes a otro servidor de Ollama en lugar de `localhost:11434`. Para [Ollama Cloud](https://ollama.com), también establezca `OLLAMA_API_KEY`: la clave se envía como un token Bearer y solo a un host que no sea de bucle local.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Semáforo de concurrencia
Todas las llamadas a Ollama están protegidas por un semáforo con contador (límite predeterminado: 1) para evitar errores de falta de memoria en la GPU en sistemas con VRAM limitada. Se puede modificar este valor con `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Fichas de progreso de MCP
Todas las herramientas informan del progreso a través de MCP `notifications/progress` cuando el cliente proporciona un `progressToken`. Traduce los informes por fragmento, translate_markdown por lote de segmentos, translate_all por idioma y check_status por paso.

### Glosario de software
Un glosario integrado de 12 términos técnicos (API, CLI, SDK, etc.) garantiza una traducción coherente de la terminología del software. Se pueden pasar entradas de glosario personalizadas por solicitud y se combinan con las predeterminadas.

### Traducción por lotes
`translateBatch` agrupa varios segmentos en una única solicitud cuando es posible, lo que reduce el número de intercambios. Si el separador de lotes está dañado, vuelve a la traducción individual.

### Modelo predeterminado configurable
El modelo predeterminado es `translategemma:27b`. Establezca la variable de entorno `POLYGLOT_MODEL` para usar otro, por ejemplo, en una GPU con menos VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Errores estructurados
Todos los errores utilizan `PolyglotError` con un código legible por máquina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), un mensaje legible por humanos, una sugerencia opcional y una marca `retryable`.

### Validación de la salida
Cada traducción se valida automáticamente: la salida vacía genera un error (reintentable), se marca la repetición del texto de origen, se advierte sobre el truncamiento y la alucinación graves, se detecta la codificación corrupta y los metacomentarios del modelo. Las advertencias aparecen en la respuesta de la herramienta MCP.

### Transmisión en tiempo real
`OllamaClient.generateStream()` genera tokens a través de NDJSON a medida que Ollama los produce. La función `translate()` acepta una función de devolución de llamada `onToken` para mostrar el progreso en tiempo real. Tanto la transmisión en tiempo real como la no transmisión en tiempo real comparten la lógica de reintento.

## Idiomas admitidos

Afrikaans, albanés, árabe, bengalí, búlgaro, catalán, chino (simplificado), chino (tradicional), croata, checo, danés, neerlandés, inglés, estonio, finlandés, francés, gallego, alemán, griego, gujarati, hebreo, hindi, húngaro, indonesio, irlandés, italiano, japonés, kannada, coreano, letón, lituano, macedonio, malayo, malayalam, maltés, marathi, noruego, persa, polaco, portugués, rumano, ruso, gaélico escocés, serbio, eslovaco, esloveno, español, suajili, sueco, tamil, télugu, tailandés, turco, ucraniano, urdu, vietnamita, galés.

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

## Seguridad y ámbito de los datos

| Aspecto | Detalle |
|--------|--------|
| **Data touched** | Texto enviado a la API de Ollama: local (`localhost:11434`) de forma predeterminada, o el host en `OLLAMA_HOST` si se establece uno. `.polyglot-cache.json` caché de segmentos junto a un archivo traducido (solo para la biblioteca y la CLI). `.polyglot-terms.json` y `.polyglot-pins.json` junto a un README traducido se leen si están presentes. |
| **Files written** | `translate_readme` escribe `README.<lang>.md` junto al README que se le pasa y actualiza la barra de navegación de idiomas de ese README. `scripts/pin-translation.mjs` escribe `.polyglot-pins.json` junto al README. |
| **Data NOT touched** | No se recopilan datos del navegador, ni credenciales del sistema operativo, ni nada fuera de los directorios anteriores. |
| **Network** | HTTP a `localhost:11434` solo de forma predeterminada: cero salida externa. Solo remoto cuando `OLLAMA_HOST` apunta a otro lugar. |
| **Secrets** | `OLLAMA_API_KEY`, si se establece, se lee desde el entorno y se envía solo como un token de tipo Bearer a un `OLLAMA_HOST` que no sea de bucle local; nunca se escribe en el disco ni se registra. |
| **Telemetry** | No se recopila ni se envía nada. |

Consulte [SECURITY.md](SECURITY.md) para conocer la política de notificación de vulnerabilidades.

## Desarrollo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 467 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licencia

MIT: consulte [LICENSE](LICENSE).

> Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
