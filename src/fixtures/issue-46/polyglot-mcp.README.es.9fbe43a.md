<!-- Extract of mcp-tool-shop-org/polyglot-mcp README.es.md at 9fbe43a: the ATX headings and the 4 in-page anchor lines. -->

## Qué hace

Traduce texto entre 57 idiomas utilizando TranslateGemma(https://ollama.com/library/translategemma) que se ejecuta localmente en su GPU a través de [Ollama](https://ollama.com). No hay claves de API, ni nube, ni límites de frecuencia; de forma predeterminada, todo permanece en su máquina. Puede optar por utilizar un Ollama remoto, como [Ollama Cloud](#ollama-cloud-optional).

## Primeros pasos

### 1. Instale Ollama

### 2. Obtenga un modelo

> **Consejo:** Puede omitir este paso; Polyglot descarga automáticamente el modelo predeterminado (27B, 17 GB) en el primer uso. En una GPU más pequeña, configure `POLYGLOT_MODEL=translategemma:12b` primero (vea [Modelo predeterminado configurable](#configurable-default-model)).

### 3. Agregue a su cliente MCP

## Herramientas

### `translate`

### `translate_markdown`

Traduzca todo un documento de Markdown conservando la estructura. Los bloques de código, los elementos HTML, las insignias, las URL y el formato de la tabla se mantienen intactos; solo se traduce el contenido en prosa (encabezados, párrafos, eslóganes, celdas de la tabla). Los fragmentos de código en línea y los [términos protegidos](#protected-terms-polyglot-termsjson) se reemplazan por marcadores de posición antes de la traducción y se restauran después, de modo que los comandos, las opciones, los nombres de los paquetes y los identificadores se devuelven exactamente como se escribieron, y cada recuento de "N de M" se devuelve como `N/M`.

| Parámetro | Obligatorio | Descripción |
|--------------|----------|-------------|
| `onLostSpan` | no       | `report` (predeterminado) enumera los fragmentos protegidos que faltan en la traducción; `fail` convierte eso en un error. Consulte [Verificación de supervivencia](#survival-check---on-lost-span) |

### `list_languages`

### `check_status`

### `translate_all`

### `translate_readme`

## Características

### Inicio y descarga automáticos

### Reintento con retroceso exponencial

### Fragmentación inteligente

### Caché de segmentos

### Memoria de traducción (caché difusa)

### Términos protegidos (`.polyglot-terms.json`)

### Comprobación de supervivencia (`--on-lost-span`)

### Traducciones fijadas (`.polyglot-pins.json`)

### Ollama Cloud (opcional)

### Semáforo de concurrencia

### Tokens de progreso de MCP

### Glosario de software

### Traducción por lotes

### Modelo predeterminado configurable

### Errores estructurados

### Validación de la salida

### Transmisión en tiempo real

## Idiomas admitidos

## Rendimiento

## Arquitectura

## Seguridad y alcance de los datos

## Desarrollo

## Licencia
