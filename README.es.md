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

Traduce texto entre 57 idiomas utilizando TranslateGemma(https://ollama.com/library/translategemma) que se ejecuta localmente en su GPU a través de [Ollama](https://ollama.com). No hay claves de API, ni nube, ni límites de frecuencia; de forma predeterminada, todo permanece en su máquina. Puede optar por utilizar un Ollama remoto, como [Ollama Cloud](#ollama-cloud-optional).

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

> **Consejo:** Puede omitir este paso; Polyglot descarga automáticamente el modelo predeterminado (27B, 17 GB) en el primer uso. En una GPU más pequeña, configure `POLYGLOT_MODEL=translategemma:12b` primero (vea [Modelo predeterminado configurable](#configurable-default-model)).

### 3. Agregue a su cliente MCP

**Claude Code / Claude Desktop**: agregue a `claude_desktop_config.json` o `.mcp.json`:

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

Traduzca todo un documento de Markdown conservando la estructura. Los bloques de código, los elementos HTML, las insignias, las URL y el formato de la tabla se mantienen intactos; solo se traduce el contenido en prosa (encabezados, párrafos, eslóganes, celdas de la tabla). Los fragmentos de código en línea y los [términos protegidos](#protected-terms-polyglot-termsjson) se reemplazan por marcadores de posición antes de la traducción y se restauran después, de modo que los comandos, las opciones, los nombres de los paquetes y los identificadores se devuelven exactamente como se escribieron, y cada recuento de "N de M" se devuelve como `N/M`.

| Parámetro | Obligatorio | Descripción |
|--------------|----------|-------------|
| `markdown`   | sí | El contenido completo de Markdown que se va a traducir |
| `from`       | sí | Código o nombre del idioma de origen |
| `to`         | sí | Código o nombre del idioma de destino |
| `model`      | no       | Modelo de Ollama (predeterminado: `translategemma:27b`) |
| `onLostSpan` | no       | `report` (predeterminado) enumera los fragmentos protegidos que faltan en la traducción; `fail` convierte eso en un error. Consulte [Verificación de supervivencia](#survival-check---on-lost-span) |

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
| `onLostSpan`  | no       | `report` (predeterminado) enumera los fragmentos protegidos que faltan por idioma; `fail` convierte un idioma con alguno de ellos en un error |

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
| `onLostSpan`  | no       | `report` (predeterminado) escribe cada archivo y enumera los fragmentos protegidos que faltan; `fail` deja un idioma con alguno de ellos como un error |

`translate_readme` lee el `.polyglot-terms.json` y el `.polyglot-pins.json` del README si existen.

## Características

### Inicio y descarga automáticos
Ollama se inicia automáticamente si no se está ejecutando. El modelo TranslateGemma se descarga automáticamente si no está instalado. No se requiere ninguna configuración manual.

### Reintento con retroceso exponencial
Los fallos transitorios de Ollama (interrupciones de la red, sobrecarga temporal) se reintentan automáticamente hasta 2 veces con un retroceso exponencial (1 s, 2 s). Los errores que no se pueden reintentar (nombre de modelo incorrecto, entrada no válida) fallan inmediatamente.

### Fragmentación inteligente
El texto largo se divide en límites naturales: párrafos y luego oraciones, de modo que se conserva el contexto de la traducción. Los tamaños de los fragmentos se adaptan al modelo: 2K de caracteres para los modelos de 2B/4B, 4K para 12B, 6K para 27B.

### Caché de segmentos
Los segmentos traducidos se almacenan en caché por hash de contenido (SHA-256 del texto de origen enmascarado + idioma de destino + modelo, más un hash de las reglas de términos protegidos que coincidieron en el segmento). Los segmentos que no han cambiado omiten por completo la re-traducción, por lo que volver a ejecutar una traducción después de una edición solo afecta a lo que ha cambiado. Agregar un término protegido cambia la clave de cada segmento que lo contiene, por lo que una traducción en caché que volvió a escribir el término no se reproduce; otros segmentos conservan sus claves. La caché se encuentra en `.polyglot-cache.json` junto al archivo de origen, con un TTL de 30 días. Se utiliza mediante la API de la biblioteca `translateMarkdown` cuando se proporciona un `filePath` (y mediante la CLI `scripts/translate-*.mjs` del repositorio); las herramientas MCP traducen sin ella.

Varios procesos pueden compartir un único archivo de caché. Cada vez que se guarda, solo se fusionan sus propios cambios en el archivo bajo un bloqueo y se reemplaza el archivo de forma atómica, de modo que los idiomas traducidos en paralelo conserven las entradas del otro, y borrar la caché para un idioma no afecte a los demás.

### Memoria de traducción (caché difusa)
Cuando no se encuentra una coincidencia exacta en la caché, una traducción en caché se reutiliza solo si su origen difiere del nuevo solo en el formato de los espacios en blanco: espaciado dentro de una línea, espacios en blanco en cualquiera de los extremos o CRLF frente a LF. Cualquier otra modificación se vuelve a traducir, incluido un cambio en una palabra, número, signo de puntuación, mayúscula o fragmento de código en línea. Una traducción en caché es la traducción de su propio origen, por lo que reutilizarla para texto editado implicaría utilizar la redacción antigua.

### Términos protegidos (`.polyglot-terms.json`)
TranslateGemma reescribe los identificadores sin adornos en otro script: un archivo README en hindi escribió `XLS-30` como `एक्सएलएस-30` y `Kimi-K3` como `किमी-के3`. También altera los recuentos: el chino convirtió "218/224" en "224/218". Por lo tanto, los identificadores en el texto se enmascaran como fragmentos de código en línea: cada uno se reemplaza por un marcador de posición sin letras antes de la traducción y se restaura después. Los valores predeterminados son:

| Patrón | Máscaras | No se modifica |
|---------|-------|--------------|
| `url` | `https://…` hasta los espacios en blanco, una comilla, un corchete o una barra invertida | |
| `caps-id` | ALL-CAPS tokens con un dígito, o mayúsculas unidas por `-` o `_`: `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase y mixedCase palabras: `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, palabras comunes en mayúsculas |
| `model-id` | ID de modelo y producto con una parte alfanumérica: `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |

"N de M" en el texto y en las celdas de la tabla (`218 of 224`) se enmascara como un solo fragmento y se restaura como `218/224` en cada idioma, lo que se lee correctamente en todas partes y no se puede invertir ni convertir en un ordinal. Una celda de tabla que solo es un recuento no se envía al modelo.

Un repositorio agrega sus propios términos en `.polyglot-terms.json` junto con el archivo README. Cada campo es opcional:

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` son cadenas exactas que distinguen entre mayúsculas y minúsculas y que se comparan como palabras completas; `patterns` son JavaScript expresiones regulares. Ambos se añaden a los valores predeterminados. `disable` desactiva los valores predeterminados por nombre, y `"nOfM": false` desactiva la regla de recuento. Un archivo que no se puede analizar detiene el proceso con `CONFIG_ERROR` en lugar de traducir sin los términos solicitados.

### Comprobación de supervivencia (`--on-lost-span`)
Después de la traducción, se comprueba cada archivo de destino con el inglés: cada fragmento protegido (fragmento de código en línea, término protegido y cada recuento como `N/M`) debe estar presente en la traducción de su segmento, carácter por carácter. Cada celda de la tabla debe contener los mismos números que su celda de origen, comparados como un multiconjunto, no en orden: una traducción correcta al chino de "218/224" coloca el total primero (`224 首中的 218 首`), por lo que una comprobación de orden marcaría la respuesta correcta. Los dígitos de otros scripts se normalizan antes de la comparación. El archivo también debe mantener sus bloques de código delimitados y sus fragmentos de código en línea.

`--on-lost-span=fail|report` determina qué sucede cuando se pierde algo:

- **`fail`**: el proceso se cierra con un código distinto de cero y una lista de idioma, segmento y fragmento que falta. Este es el valor predeterminado para `scripts/translate-all.mjs`, que se ejecuta antes de las versiones. Los archivos aún se escriben, por lo que se pueden corregir manualmente y fijar. El archivo JSON de resumen contiene la lista y un error `LOST_SPAN` en el formato `PolyglotError` habitual (`code`, `message`, `hint`, `retryable`).
- **`report`**: la lista se escribe y el proceso se cierra con el código 0. Este es el valor predeterminado para las herramientas MCP (parámetro `onLostSpan`) y la API de la biblioteca `translateMarkdown` (opción `onLostSpan`, campo de resultado `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Traducciones fijadas (`.polyglot-pins.json`)
Una traducción fijada siempre tiene prioridad. `.polyglot-pins.json` se encuentra junto a la caché; cada entrada se identifica mediante un hash del segmento en inglés más el idioma de destino y contiene la traducción corregida manualmente. Una fijación supera a la caché y al modelo y sobrevive a cada nueva ejecución, incluida la `--cache-clear`. Cuando el inglés cambia, el hash cambia, por lo que una fijación no puede sobrevivir al texto para el que fue escrita.

Para fijar las correcciones manuales, corrija el archivo traducido y, a continuación, ejecute:

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

Asocia cada segmento del inglés con su texto en el archivo corregido y fija cada segmento cuyo texto difiere de la traducción en caché. `--dry-run` muestra las fijaciones sin escribirlas. `--model=NAME` establece el modelo cuyos elementos de la caché se comparan con (predeterminado: `$POLYGLOT_MODEL` o `translategemma:27b`, el mismo que los scripts). `--include-uncached` también fija los segmentos para los que la caché no tiene traducción. Confirme `.polyglot-pins.json` y `.polyglot-terms.json` con el archivo README.

### Ollama Cloud (opcional)
Establezca `OLLAMA_HOST` para enviar solicitudes a otro servidor Ollama en lugar de `localhost:11434`. Para [Ollama Cloud](https://ollama.com), también establezca `OLLAMA_API_KEY`: la clave se envía como un token de portador y solo a un host que no sea de bucle.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Semáforo de concurrencia
Todas las llamadas a Ollama están protegidas por un semáforo de conteo (límite predeterminado: 1) para evitar el agotamiento de la memoria de la GPU en sistemas con VRAM limitada. Anule la configuración con `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Tokens de progreso de MCP
Todas las herramientas informan del progreso a través de los tokens MCP `notifications/progress` cuando el cliente proporciona un `progressToken`. Translate informa por fragmento, translate_markdown por lote de segmentos, translate_all por idioma y check_status por paso.

### Glosario de software
Un glosario integrado de 12 términos técnicos (API, CLI, SDK, etc.) garantiza una traducción coherente de la terminología del software. Se pueden pasar entradas de glosario personalizadas por solicitud y se fusionan con los valores predeterminados.

### Traducción por lotes
`translateBatch` agrupa varios segmentos en una única solicitud cuando es posible, lo que reduce el número de intercambios. Si el separador de lotes está dañado, vuelve a la traducción individual.

### Modelo predeterminado configurable
El modelo predeterminado es `translategemma:27b`. Establezca la variable de entorno `POLYGLOT_MODEL` para utilizar otro modelo, por ejemplo, en una GPU con menos VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Errores estructurados
Todos los errores utilizan `PolyglotError` con un código legible por máquina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), un mensaje legible por humanos, una sugerencia opcional y una marca `retryable`.

### Validación de la salida
Cada traducción se valida automáticamente: una salida vacía genera un error (que se puede reintentar), se señala la repetición del texto original, se advierte sobre recortes y alucinaciones graves, se detecta la codificación incorrecta y los metacomentarios del modelo. Las advertencias aparecen en la respuesta de la herramienta MCP.

### Transmisión en tiempo real
`OllamaClient.generateStream()` genera tokens a través de NDJSON a medida que Ollama los produce. La función `translate()` acepta una función de devolución de llamada `onToken` para mostrar el progreso en tiempo real. Tanto la transmisión en tiempo real como las rutas sin transmisión comparten la lógica de reintento.

## Idiomas admitidos

Afrikaans, albanés, árabe, bengalí, búlgaro, catalán, chino (simplificado), chino (tradicional), croata, checo, danés, neerlandés, inglés, estonio, finés, francés, gallego, alemán, griego, gujarati, hebreo, hindi, húngaro, indonesio, irlandés, italiano, japonés, kannada, coreano, letón, lituano, macedonio, malayo, malayalam, maltés, marathi, noruego, persa, polaco, portugués, rumano, ruso, gaélico escocés, serbio, eslovaco, esloveno, español, suajili, sueco, tamil, télugu, tailandés, turco, ucraniano, urdu, vietnamita, galés.

## Rendimiento

| Métrica | 27B (predeterminado), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| Primera traducción (carga del modelo en frío) | ~30 s | ~15 s |
| Traducciones posteriores | ~1–2 s por lote de segmentos de README | ~600 ms |
| Memoria del modelo | 17 GB, completamente en la GPU (según lo informado por `ollama ps`) | ~8,1 GB |

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

## Seguridad y alcance de los datos

| Aspecto | Detalle |
|--------|--------|
| **Data touched** | Texto enviado a la API de Ollama: local (`localhost:11434`) de forma predeterminada, o el host en `OLLAMA_HOST` si se especifica uno. `.polyglot-cache.json` caché de segmentos junto a un archivo traducido (solo para la biblioteca y la CLI). `.polyglot-terms.json` y `.polyglot-pins.json` junto a un README traducido se leen si están presentes. |
| **Files written** | `translate_readme` escribe `README.<lang>.md` junto al README que se le pasa y actualiza la barra de navegación de idiomas de ese README. `scripts/pin-translation.mjs` escribe `.polyglot-pins.json` junto al README. |
| **Data NOT touched** | No se recopilan datos del navegador, ni credenciales del sistema operativo, ni nada fuera de los directorios anteriores. |
| **Network** | HTTP solo a `localhost:11434` de forma predeterminada: cero salida externa. Solo remoto cuando `OLLAMA_HOST` apunta a otro lugar. |
| **Secrets** | `OLLAMA_API_KEY`, si se especifica, se lee del entorno y se envía solo como un token de autenticación a un `OLLAMA_HOST` que no sea de bucle local; nunca se escribe en el disco ni se registra. |
| **Telemetry** | No se recopila ni se envía nada. |

Consulte [SECURITY.md](SECURITY.md) para conocer la política de notificación de vulnerabilidades.

## Desarrollo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 435 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licencia

MIT: consulte [LICENSE](LICENSE).

> Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
