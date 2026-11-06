<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Servidor de traducción local de GPU MCP: 57 idiomas, sin dependencia de la nube.</strong></p>

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

Traduce texto entre 57 idiomas utilizando [TranslateGemma](https://ollama.com/library/translategemma) que se ejecuta localmente en su GPU a través de [Ollama](https://ollama.com). No hay claves de API, ni nube, ni límites de frecuencia; de forma predeterminada, todo permanece en su máquina. Puede optar por utilizar un Ollama remoto, como [Ollama Cloud](#ollama-cloud-opcional).

## Guía de inicio rápido

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

> **Consejo:** Puede omitir este paso; Polyglot descarga automáticamente el modelo predeterminado (27B, 17 GB) en el primer uso. En una GPU más pequeña, configure `POLYGLOT_MODEL=translategemma:12b` primero (vea [Modelo predeterminado configurable](#modelo-predeterminado-configurable)).

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

Traduzca texto entre cualquier par de idiomas admitidos.

| Parámetro | Obligatorio | Descripción |
|-------------|----------|-------------|
| `text`      | sí | Texto para traducir |
| `from`      | sí | Código o nombre del idioma de origen (por ejemplo, `en`, `English`) |
| `to`        | sí | Código o nombre del idioma de destino (por ejemplo, `ja`, `Japanese`) |
| `model`     | no       | Modelo de Ollama (predeterminado: `translategemma:27b`) |
| `glossary`  | no       | Anulaciones de términos personalizados como `{"source": "translation"}`: se combinan con el glosario de software integrado |

El texto largo se divide automáticamente en fragmentos en los límites de párrafos y oraciones, se traduce en secuencia y se vuelve a ensamblar. Todas las traducciones se validan para garantizar la calidad (salida vacía, detección de eco, truncamiento, texto ilegible).

### `translate_markdown`

Traduzca todo un documento de Markdown conservando la estructura. Los bloques de código, los elementos HTML, las insignias, las URL y el formato de tabla se mantienen intactos; solo se traduce el contenido en prosa (encabezados, párrafos, eslóganes, celdas de tabla). Los fragmentos de código en línea y los [términos protegidos](#términos-protegidos-polyglot-termsjson) se reemplazan por marcadores de posición antes de la traducción y se restauran después, de modo que los comandos, las opciones, los nombres de los paquetes y los identificadores se devuelven exactamente como se escribieron, y cada recuento de "N de M" se devuelve como `N/M`.

| Parámetro | Obligatorio | Descripción |
|--------------|----------|-------------|
| `markdown`   | sí | El contenido completo de Markdown que se va a traducir |
| `from`       | sí | Código o nombre del idioma de origen |
| `to`         | sí | Código o nombre del idioma de destino |
| `model`      | no       | Modelo de Ollama (predeterminado: `translategemma:27b`) |
| `onLostSpan` | no       | `report` (predeterminado) enumera los fragmentos protegidos que faltan en la traducción; `fail` convierte eso en un error. Consulte [Verificación de supervivencia](#comprobación-de-supervivencia---on-lost-span) |

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
| `onLostSpan`  | no       | `report` (predeterminado) enumera los fragmentos protegidos que se perdieron por idioma; `fail` convierte un idioma con alguno de ellos en un error |

### `translate_readme`

Traduzca un archivo README.md a los mismos 7 idiomas y escriba los archivos `README.<lang>.md` junto a él, actualizando la barra de navegación de idiomas en el README de origen y en cada traducción. Devuelve un resumen de estado por idioma (correcto/fallido, tiempos, archivos escritos) en lugar del texto traducido; use `translate_markdown` cuando desee recuperar el contenido.

| Parámetro | Obligatorio | Descripción |
|---------------|----------|-------------|
| `readmePath`  | sí | Ruta absoluta al archivo README.md de origen |
| `tier`        | no       | `quality` (`translategemma:27b`, predeterminado), `bulk` (`12b`) o `draft` (`2b`); se ignora cuando se establece `model` |
| `model`       | no       | Modelo de Ollama explícito; anula `tier` |
| `languages`   | no       | Subconjunto de códigos de idioma de destino (predeterminado: los 7) |
| `concurrency` | no       | Número máximo de traducciones simultáneas (predeterminado: 2, máximo: 3) |
| `navBar`      | no       | Inyecte o actualice la barra de navegación de idiomas (predeterminado: verdadero) |
| `onLostSpan`  | no       | `report` (predeterminado) escribe cada archivo y enumera los fragmentos protegidos que se perdieron; `fail` deja un idioma con alguno de ellos sin escribir, como un error |

`translate_readme` lee el `.polyglot-terms.json` y el `.polyglot-pins.json` del README si existen.

## Características

### Inicio y descarga automáticos
Ollama se inicia automáticamente si no se está ejecutando. El modelo TranslateGemma se descarga automáticamente si no está instalado. No se requiere ninguna configuración manual.

### Reintento con retroceso exponencial
Los fallos transitorios de Ollama (interrupciones de la red, sobrecarga temporal) se reintentan automáticamente hasta 2 veces con retroceso exponencial (1 s, 2 s). Los errores que no se pueden reintentar (nombre de modelo incorrecto, entrada no válida) fallan inmediatamente.

### Fragmentación inteligente
El texto largo se divide en límites naturales: párrafos y luego oraciones, para preservar el contexto de la traducción. Los tamaños de los fragmentos se adaptan al modelo: 2K de caracteres para los modelos de 2B/4B, 4K para 12B, 6K para 27B.

### Caché de segmentos
Los segmentos traducidos se almacenan en caché por hash de contenido (SHA-256 del texto de origen enmascarado + idioma de destino + modelo, más un hash de las reglas de términos protegidos que coincidieron en el segmento). Los segmentos que no han cambiado omiten por completo la re-traducción, por lo que volver a ejecutar una traducción después de una edición solo afecta a lo que ha cambiado. Agregar un término protegido cambia la clave de cada segmento que lo contiene, por lo que una traducción en caché que volvió a escribir el término no se reproduce; otros segmentos conservan sus claves. La caché se encuentra en `.polyglot-cache.json` junto al archivo de origen, con un TTL de 30 días. Se utiliza mediante la API de la biblioteca `translateMarkdown` cuando se proporciona un `filePath` (y mediante la CLI `scripts/translate-*.mjs` del repositorio); las herramientas MCP traducen sin ella.

Varias ejecuciones pueden compartir un único archivo de caché. Cada guardado fusiona solo sus propios cambios en el archivo bajo un bloqueo y reemplaza el archivo de forma atómica, por lo que los idiomas traducidos en paralelo conservan las entradas del otro y borrar la caché para un idioma deja solos a los demás.

### Memoria de traducción (caché difusa)
Cuando no se encuentra una coincidencia exacta en la caché, una traducción en caché se reutiliza solo si su origen difiere del nuevo en el diseño del espacio en blanco: espaciado dentro de una línea, espacio en blanco en cualquiera de los extremos o CRLF frente a LF. Cualquier otra modificación se vuelve a traducir, incluido un cambio de palabra, número, signo de puntuación, mayúscula o fragmento de código en línea. Una traducción en caché es la traducción de su propio origen, por lo que reutilizarla para texto editado implicaría utilizar la redacción antigua.

### Términos protegidos (`.polyglot-terms.json`)
TranslateGemma reescribe los identificadores simples en otro script: un archivo README en hindi escribió `XLS-30` como `एक्सएलएस-30` y `Kimi-K3` como `किमी-के3`. También distorsiona los recuentos: el chino convirtió "218/224" en "224/218". Por lo tanto, los identificadores en el texto se enmascaran como fragmentos de código en línea: cada uno se reemplaza por un marcador de posición sin letras antes de la traducción y se restaura después. Los valores predeterminados son:

| Patrón | Enmascarar | Dejar intacto |
|---------|-------|--------------|
| `url` | `https://…` hasta el espacio en blanco, una comilla, un corchete o una barra invertida (permitiendo un nivel de paréntesis equilibrados, como `https://en.wikipedia.org/wiki/Foo_(bar)`) | |
| `anchor` | Objetivos `#slug` dentro de la página en enlaces Markdown (`[text](#slug)`, `[text](#slug "title")`), definiciones de referencia (`[label]: #slug`) y atributos HTML `href="#slug"`, por lo que el modelo traduce el texto del enlace sin alterar el fragmento. | `#123` en el texto, `#heading` líneas, URL externas `https://…#frag` (cubiertas por `url`) |
| `link-target` | Objetivos que no son HTTP(S) ni anclas en enlaces en línea de Markdown, imágenes y definiciones de referencia: rutas relativas (`../facet`, `docs/Kimi-K3.md`), nombres de archivo simples (`LICENSE`), `mailto:`, `<path with spaces>` y rutas con un nivel de paréntesis equilibrados (`docs/Foo_(bar).md`) | Títulos de enlaces (`"MIT License"`), atributos HTML (`href="…"`, `src="…"`) |
| `caps-id` | ALL-CAPS tokens con un dígito o letras mayúsculas unidas por `-` o `_`: `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase y mixedCase palabras: `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, palabras comunes en mayúsculas |
| `model-id` | ID de modelo y producto con una parte alfanumérica: `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |

Después de que se traducen y vuelven a ensamblar todos los segmentos, cada encabezado ATX de origen se empareja con su encabezado ATX traducido y se asigna un "slug" en el orden del documento con `github-slugger` (coincidiendo con los ID de encabezado propios de GitHub, incluidos los sufijos `-1`, `-2` para los encabezados duplicados), y cada ancla dentro de la página que no sea código (`[text](#slug)`, `[label]: #slug` y anclas HTML `href="#slug"`) se vuelve a escribir con el "slug" del encabezado traducido.

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

`terms` son cadenas exactas que distinguen entre mayúsculas y minúsculas y que se comparan como palabras completas; `patterns` son JavaScript expresiones regulares. Ambos se suman a los valores predeterminados. `disable` desactiva los valores predeterminados por nombre (por ejemplo, `"disable": ["anchor"]` desactiva el enmascaramiento de anclas dentro de la página, la reescritura del "slug" posterior al ensamblaje y la comprobación de supervivencia de la ancla; `"disable": ["link-target"]` desactiva el enmascaramiento de objetivos de enlace que no son HTTP y omite los objetivos relativos/que no son HTTP en la comprobación de supervivencia del enlace para que los enlaces a archivos localizados como `./docs/guide.fr.md` se procesen correctamente), y `"nOfM": false` desactiva la regla de recuento. Un archivo que no se puede analizar detiene la ejecución con `CONFIG_ERROR` en lugar de traducir sin los términos solicitados.

### Comprobación de supervivencia (`--on-lost-span`)
Después de la traducción, cada archivo de destino se comprueba con respecto al inglés: cada fragmento protegido (fragmento de código en línea, término protegido y cada recuento como `N/M`) debe estar presente en la traducción de su segmento, carácter por carácter, y cada ancla `#slug` dentro de la página que se resolvió en el origen en inglés debe resolverse en la traducción a un "slug" de encabezado ATX traducido o una ancla HTML explícita `id=`/`name=` (se informa una ancla que ya no se resolvió en el origen en inglés como una advertencia y nunca detiene la ejecución; si los recuentos de anclas de origen y traducción difieren y se involucró una ancla válida en el origen, también se informa la discrepancia como un `LostSpan` de tipo `"anchor"` a menos que ya se haya señalado mediante la comprobación de enlace de segmento). Los enlaces Markdown de cada segmento (`[text](target)`, `[text](target "title")`, imágenes `![alt](src)`, enlaces de referencia `[text][label]`, elementos colapsados `[text][]` y accesos directos `[label]` resueltos con respecto a las definiciones de archivo `[label]: target`) deben preservar el multiconjunto exacto de objetivos de enlace que no son anclas y el recuento exacto de enlaces `#slug` dentro de la página (se informa como tipo `"link"` cuando un enlace está roto, no está cerrado o se elimina). Cualquier delimitador de marcador de posición `⟦` o `⟧` no reemplazado que quede fuera del código en un segmento traducido más allá de lo que contenía el origen se informa como tipo `"placeholder"`. Cada celda de tabla debe contener los mismos números que su celda de origen, comparados como un multiconjunto, no en orden: el chino correcto para "218/224" coloca el total primero (`224 首中的 218 首`), por lo que una comprobación de orden señalaría la respuesta correcta. Los dígitos de otros scripts se normalizan antes de la comparación. El archivo también debe mantener sus bloques de código con delimitadores y fragmentos de código en línea.

`--on-lost-span=fail|report` determina qué sucede cuando algo se pierde:

- **`fail`**: la ejecución finaliza con un código de salida distinto de cero y una lista de idioma, segmento y fragmento que falta. Este es el valor predeterminado para `scripts/translate-all.mjs`, que se ejecuta antes de las versiones. Los archivos aún se escriben, por lo que se pueden corregir manualmente y fijar. El archivo JSON de resumen contiene la lista y un error `LOST_SPAN` en la forma `PolyglotError` habitual (`code`, `message`, `hint`, `retryable`).
- **`report`**: la lista se escribe y la ejecución finaliza con el código 0. Este es el valor predeterminado para las herramientas MCP (parámetro `onLostSpan`) y la API de la biblioteca `translateMarkdown` (opción `onLostSpan`, campo de resultado `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Comprobación de prosa no traducida (`--on-untranslated`)
Un modelo puede devolver un párrafo en inglés mientras que el lote sigue dividiéndose correctamente, de modo que todas las demás comprobaciones se superan. Después de la traducción, se examina cada oración del texto en inglés (6 o más palabras, contando un enlace por su etiqueta y excluyendo fragmentos de código, URL y fragmentos protegidos, y no una secuencia de nombres propios) como una oración completa de la traducción de su segmento. La coincidencia ignora las mayúsculas y minúsculas, así como un punto o dos puntos final, une primero las líneas con saltos de línea forzados y funciona oración por oración, de modo que un párrafo reestructurado o una línea en la que solo se tradujo una oración siguen siendo detectados. Una secuencia de nombres (como máximo, una palabra funcional y otra palabra en minúsculas, como un encabezado con mayúsculas y minúsculas o `Format: JSON, YAML via stdio`) está exenta por esa regla, no por una lista, y un segmento fijado nunca se marca.

Una respuesta de modelo es **inútil** cuando está vacía, cuando no se devuelve un marcador de posición de fragmento de código (el segmento volvería al origen en inglés, de modo que el identificador se mantendría correcto) o cuando una oración del texto sigue siendo inglés. Antes de que se declare que un idioma ha fallado, se vuelve a intentar una respuesta inútil una vez por sí sola; un segmento que ya aplicó la opción de una llamada por elemento después de una discrepancia en el recuento de separadores cuenta esa llamada como su nuevo intento. Un segmento que sigue siendo inútil (un elemento largo de la lista con mucho código es donde un modelo omite un marcador de posición) se traduce entonces línea por línea si tiene varias líneas, y luego oración por oración si una línea tiene varias oraciones, cada parte con sus propios marcadores de posición. Solo lo que sigue siendo inútil después de esos pasos conserva el origen en inglés, y nunca permanece en silencio: se informa como no traducido con cada paso que se intentó, se advierte sobre ello y se produce un error en la ejecución con la configuración predeterminada. El mismo mecanismo de prueba controla la caché: una respuesta inútil nunca se escribe en ella, y una entrada de caché inútil se ignora, se elimina y se vuelve a traducir.

`--on-untranslated=fail|report` determina qué ocurre con lo que queda:

- **`fail`** (predeterminado para `translate-all.mjs` y `translate-readme.mjs`): se escriben los archivos, se marca el idioma como `untranslated` en lugar de `ok` (y se cuenta fuera de `succeeded`), se enumeran las líneas y la ejecución finaliza con un valor distinto de cero (`translate-readme.mjs` finaliza con 3). El resumen JSON contiene `untranslated`, `untranslatedLanguages`, `fallbacks` y un error `UNTRANSLATED`.
- **`report`**: se escribe la lista y la ejecución finaliza con 0. Esta es la configuración predeterminada para la API de la biblioteca (opción `onUntranslated`; campos de resultado `untranslated`, `fallbacks`, `retries`) y para las herramientas MCP `translate_markdown`, `translate_all` y `translate_readme` (parámetro `onUntranslated`), que añaden la lista a su salida.

Un segmento que permanece en inglés nunca se almacena en caché, por lo que `scripts/pin-translation.mjs` fija un párrafo del texto que tradujiste manualmente, incluso sin `--include-uncached`.

**Lo que la comprobación no ve.** Cuatro límites, de modo que se obtiene un resultado limpio para lo que es: (1) inglés con menos de 6 palabras, como encabezados cortos, celdas de tabla y elementos de lista; (2) un encabezado con mayúsculas y minúsculas o cualquier otra secuencia de nombres, que no se puede distinguir de un nombre de producto; (3) una oración que solo está parcialmente traducida, donde algunas palabras están en el idioma de destino y el resto siguen estando en inglés, porque una oración solo se considera no traducida cuando la totalidad de la misma no se ha modificado; (4) salida en el idioma incorrecto, como el español devuelto para el italiano, que no es inglés y, por lo tanto, no se marca. Los bloques de código delimitados están protegidos y nunca se traducen ni se comprueban.

```bash
node scripts/translate-all.mjs README.md                          # --on-untranslated=fail
node scripts/translate-all.mjs README.md --on-untranslated=report
```

### Traducciones fijadas (`.polyglot-pins.json`)
Una traducción fijada siempre tiene prioridad. `.polyglot-pins.json` se encuentra junto a la caché; cada entrada se identifica mediante un hash del segmento en inglés más el idioma de destino, y contiene la traducción corregida manualmente. Una fijación supera a la caché y al modelo, y sobrevive a todas las reejecuciones, incluida `--cache-clear`. Cuando el inglés cambia, el hash cambia, por lo que una fijación no puede sobrevivir al texto para el que se creó.

Para fijar las correcciones manuales, corrige el archivo traducido y, a continuación, ejecuta:

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

Asocia cada segmento del inglés con su texto en el archivo corregido y fija cada segmento cuyo texto difiere de la traducción almacenada en caché. `--dry-run` enumera las fijaciones sin escribirlas. `--model=NAME` establece el modelo cuyas entradas de caché se comparan con (predeterminado: `$POLYGLOT_MODEL` o `translategemma:27b`, igual que los scripts). `--include-uncached` también fija los segmentos para los que la caché no tiene traducción. Confirma `.polyglot-pins.json` y `.polyglot-terms.json` con el archivo README.

### Ollama Cloud (opcional)
Establece `OLLAMA_HOST` para enviar solicitudes a otro servidor Ollama en lugar de `localhost:11434`. Para [Ollama Cloud](https://ollama.com), también establece `OLLAMA_API_KEY`: la clave se envía como un token de autenticación y solo a un host que no sea de bucle local.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Semáforo de concurrencia
Todas las llamadas a Ollama están protegidas por un semáforo de conteo (límite predeterminado: 1) para evitar el agotamiento de la memoria de la GPU en sistemas con VRAM limitada. Anula la configuración con `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Tokens de progreso de MCP
Todas las herramientas informan del progreso a través de MCP `notifications/progress` cuando el cliente proporciona un `progressToken`. Translate informa por fragmento, translate_markdown por lote de segmentos, translate_all por idioma y check_status por paso.

### Glosario de software
Un glosario integrado de 12 términos técnicos (API, CLI, SDK, etc.) garantiza la traducción coherente de la terminología del software. Se pueden pasar entradas de glosario personalizadas por solicitud y se combinan con las predeterminadas.

### Traducción por lotes
`translateBatch` agrupa varios segmentos en una única solicitud cuando es posible, lo que reduce el número de intercambios. Vuelve a la traducción individual si el separador del lote está dañado.

### Modelo predeterminado configurable
El modelo predeterminado es `translategemma:27b`. Establece la variable de entorno `POLYGLOT_MODEL` para utilizar otro modelo, por ejemplo, en una GPU con menos VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Errores estructurados
Todos los errores utilizan `PolyglotError` con un código legible por máquina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), un mensaje legible por humanos, una sugerencia opcional y una marca `retryable`.

### Validación de la salida
Todas las traducciones se validan automáticamente: la salida vacía genera un error (que se puede reintentar), se marca la repetición del texto de origen, se advierte sobre la truncación y la alucinación graves, se detecta la codificación corrupta y los metacomentarios del modelo. Las advertencias aparecen en la respuesta de la herramienta MCP.

### Transmisión
`OllamaClient.generateStream()` genera tokens mediante NDJSON, tal como los produce Ollama. La función `translate()` acepta una función de devolución de llamada `onToken` para mostrar el progreso en tiempo real. Tanto las rutas de transmisión continua como las que no lo son comparten la lógica de reintento.

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
| **Data touched** | Texto enviado a la API de Ollama: local (`localhost:11434`) de forma predeterminada, o el host en `OLLAMA_HOST` si se especifica uno. `.polyglot-cache.json`, caché de segmentos junto a un archivo traducido (solo para la biblioteca y la CLI). `.polyglot-terms.json` y `.polyglot-pins.json` junto a un README traducido se leen si están presentes. |
| **Files written** | `translate_readme` escribe `README.<lang>.md` junto al README que se le pasa y actualiza la barra de navegación de idiomas de ese README. `scripts/pin-translation.mjs` escribe `.polyglot-pins.json` junto al README. |
| **Data NOT touched** | No se recopilan datos del navegador, ni credenciales del sistema operativo, ni nada fuera de los directorios anteriores. |
| **Network** | HTTP a `localhost:11434` solo de forma predeterminada: cero salida externa. Solo remoto cuando `OLLAMA_HOST` apunta a otro lugar. |
| **Secrets** | `OLLAMA_API_KEY`, si se establece, se lee del entorno y se envía solo como un token de autenticación a un `OLLAMA_HOST` que no sea de bucle local; nunca se escribe en el disco ni se registra. |
| **Telemetry** | No se recopila ni se envía nada. |

Consulte [SECURITY.md](SECURITY.md) para conocer la política de notificación de vulnerabilidades.

## Desarrollo

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 570 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licencia

MIT: consulte [LICENSE](LICENSE).

> Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
