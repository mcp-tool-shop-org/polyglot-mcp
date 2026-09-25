<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Servidor de tradução de GPU local — 57 idiomas, sem dependência da nuvem.</strong></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/polyglot-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="node 20+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## O que ele faz

Traduz texto entre 57 idiomas usando [TranslateGemma](https://ollama.com/library/translategemma) executado localmente em sua GPU por meio de [Ollama](https://ollama.com). Sem chaves de API, sem nuvem, sem limites de taxa — por padrão, tudo permanece em sua máquina. Você pode optar por usar um Ollama remoto, como [Ollama Cloud](#ollama-cloud-optional).

## Primeiros passos

### 1. Instale o Ollama

Baixe em [ollama.com](https://ollama.com) e inicie-o:

```bash
ollama serve
```

### 2. Obtenha um modelo

```bash
ollama pull translategemma:27b   # 17 GB  — the default, highest quality
# or
ollama pull translategemma:12b   # 8.1 GB — faster, for GPUs with less VRAM
# or
ollama pull translategemma:4b    # 3.3 GB — fastest, lower quality
```

> **Dica:** Você pode pular esta etapa — o Polyglot baixa automaticamente o modelo padrão (27B, 17 GB) na primeira utilização. Em uma GPU menor, defina `POLYGLOT_MODEL=translategemma:12b` primeiro (veja [Modelo padrão configurável](#modelo-padrao-configuravel)).

### 3. Adicione ao seu cliente MCP

**Claude Code / Claude Desktop** — adicione a `claude_desktop_config.json` ou `.mcp.json`:

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

**A partir do código-fonte:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

É isso. Peça ao Claude para traduzir algo e ele usará a ferramenta `translate` automaticamente.

## Ferramentas

O Polyglot expõe seis ferramentas MCP:

### `translate`

Traduz texto entre qualquer par de idiomas suportado.

| Parâmetro | Obrigatório | Descrição |
|-------------|----------|-------------|
| `text`      | sim | Texto a ser traduzido |
| `from`      | sim | Código ou nome do idioma de origem (por exemplo, `en`, `English`) |
| `to`        | sim | Código ou nome do idioma de destino (por exemplo, `ja`, `Japanese`) |
| `model`     | no       | Modelo Ollama (padrão: `translategemma:27b`) |
| `glossary`  | no       | Substituições de termos personalizadas como `{"source": "translation"}` — mescladas com o glossário de software integrado |

Textos longos são automaticamente divididos em trechos nos limites de parágrafos e frases, traduzidos em sequência e remontados. Todas as traduções são validadas quanto à qualidade (saída vazia, detecção de eco, truncamento, texto ilegível).

### `translate_markdown`

Traduza um documento Markdown inteiro, preservando a estrutura. Blocos de código, elementos HTML, distintivos, URLs e formatação de tabela são mantidos intactos — apenas o conteúdo em prosa (títulos, parágrafos, slogans, células de tabela) é traduzido. Trechos de código embutidos são substituídos por espaços reservados antes da tradução e restaurados depois, para que comandos, sinalizadores, nomes de pacotes e identificadores retornem exatamente como foram escritos.

| Parâmetro | Obrigatório | Descrição |
|-------------|----------|-------------|
| `markdown`  | sim | O conteúdo Markdown completo a ser traduzido |
| `from`      | sim | Código ou nome do idioma de origem |
| `to`        | sim | Código ou nome do idioma de destino |
| `model`     | no       | Modelo Ollama (padrão: `translategemma:27b`) |

### `list_languages`

Liste todos os 57 idiomas suportados com seus códigos.

### `check_status`

Verifique se o Ollama está em execução e quais modelos TranslateGemma estão instalados. Tenta iniciar automaticamente se o Ollama não estiver em execução.

### `translate_all`

Traduza o conteúdo Markdown para vários idiomas de uma só vez (padrão: 7 — japonês, chinês, espanhol, francês, hindi, italiano, português). Executa as traduções simultaneamente com um limite de semáforo seguro para GPU.

| Parâmetro | Obrigatório | Descrição |
|---------------|----------|-------------|
| `markdown`    | sim | O conteúdo Markdown completo a ser traduzido |
| `from`        | no       | Código do idioma de origem (padrão: `en`) |
| `languages`   | no       | Matriz de códigos de idioma de destino (padrão: todos os 7) |
| `model`       | no       | Modelo Ollama (padrão: `translategemma:27b`) |
| `concurrency` | no       | Número máximo de traduções simultâneas (padrão: 2, máximo: 3) |
| `navBar`      | no       | Injetar barra de navegação de idioma (padrão: verdadeiro) |

### `translate_readme`

Traduza um arquivo README.md para os mesmos 7 idiomas e grave os arquivos `README.<lang>.md` ao lado dele, atualizando a barra de navegação de idioma no README de origem e em cada tradução. Retorna um resumo de status por idioma (ok/falha, tempos, arquivos gravados) em vez do texto traduzido; use `translate_markdown` quando quiser o conteúdo de volta.

| Parâmetro | Obrigatório | Descrição |
|---------------|----------|-------------|
| `readmePath`  | sim | Caminho absoluto para o arquivo README.md de origem |
| `tier`        | no       | `quality` (`translategemma:27b`, padrão), `bulk` (`12b`) ou `draft` (`2b`); ignorado quando `model` está definido |
| `model`       | no       | Modelo Ollama explícito; substitui `tier` |
| `languages`   | no       | Subconjunto de códigos de idioma de destino (padrão: todos os 7) |
| `concurrency` | no       | Número máximo de traduções simultâneas (padrão: 2, máximo: 3) |
| `navBar`      | no       | Injetar ou atualizar a barra de navegação de idioma (padrão: verdadeiro) |

## Recursos

### Início e download automático
O Ollama é iniciado automaticamente se não estiver em execução. O modelo TranslateGemma é baixado automaticamente se não estiver instalado. Não é necessário nenhum processo de configuração manual.

### Repetição com retrocesso exponencial
Falhas transitórias do Ollama (interrupções de rede, sobrecarga temporária) são automaticamente repetidas até 2 vezes com retrocesso exponencial (1 s, 2 s). Erros não repetíveis (nome de modelo incorreto, entrada inválida) falham imediatamente.

### Divisão inteligente
Textos longos são divididos em limites naturais — parágrafos, depois frases — para que o contexto da tradução seja preservado. Os tamanhos dos trechos se adaptam ao modelo: 2 mil caracteres para modelos de 2B/4B, 4 mil para 12B, 6 mil para 27B.

### Cache de segmentos
Os segmentos traduzidos são armazenados em cache por hash de conteúdo (SHA-256 do texto de origem + idioma de destino + modelo). Os segmentos inalterados ignoram completamente a retradução, para que a execução de uma tradução após uma edição afete apenas o que foi alterado. O cache fica em `.polyglot-cache.json`, ao lado do arquivo de origem, com um TTL de 30 dias. Ele é usado pela API da biblioteca `translateMarkdown` quando recebe um `filePath` (e pela CLI `scripts/translate-*.mjs` do repositório); as ferramentas MCP traduzem sem ele.

Várias execuções podem compartilhar um único arquivo de cache. Cada salvamento mescla apenas suas próprias alterações no arquivo sob um bloqueio e substitui o arquivo atomicamente, para que os idiomas traduzidos em paralelo mantenham as entradas uns dos outros e a limpeza do cache para um idioma deixe os outros intactos.

### Memória de tradução (cache difuso)
Quando uma correspondência exata no cache não é encontrada, uma tradução em cache é reutilizada apenas se sua origem for diferente da nova apenas no layout do espaço em branco: espaçamento dentro de uma linha, espaço em branco em qualquer extremidade ou CRLF versus LF. Qualquer outra edição é retraduzida, incluindo uma palavra, número, sinal de pontuação, letra ou trecho de código embutido alterado. Uma tradução em cache é a tradução de sua própria origem, portanto, reutilizá-la para texto editado enviaria a redação antiga.

### Ollama Cloud (opcional)
Defina `OLLAMA_HOST` para enviar solicitações para outro servidor Ollama em vez de `localhost:11434`. Para [Ollama Cloud](https://ollama.com), também defina `OLLAMA_API_KEY`: a chave é enviada como um token Bearer e apenas para um host que não seja de loopback.

```bash
OLLAMA_HOST=https://ollama.com OLLAMA_API_KEY=... npx @mcptoolshop/polyglot-mcp
```

### Semáforo de Concorrência
Todas as chamadas Ollama são protegidas por um semáforo de contagem (limite padrão: 1) para evitar estouro de memória da GPU em sistemas com VRAM limitada. Substitua com `POLYGLOT_CONCURRENCY`:

```bash
POLYGLOT_CONCURRENCY=2 npx @mcptoolshop/polyglot-mcp
```

### Tokens de Progresso MCP
Todas as ferramentas relatam o progresso por meio de MCP `notifications/progress` quando o cliente fornece um `progressToken`. Traduza relatórios por trecho, translate_markdown por lote de segmentos, translate_all por idioma e check_status por etapa.

### Glossário de Software
Um glossário integrado de 12 termos técnicos (API, CLI, SDK, etc.) garante a tradução consistente da terminologia de software. Entradas de glossário personalizadas podem ser passadas por solicitação e são mescladas com os padrões.

### Tradução em Lote
`translateBatch` agrupa vários segmentos em um único prompt, quando possível, reduzindo as viagens de ida e volta. Retorna à tradução individual se o separador de lote estiver corrompido.

### Modelo Padrão Configurável
O modelo padrão é `translategemma:27b`. Defina a variável de ambiente `POLYGLOT_MODEL` para usar outro, por exemplo, em uma GPU com menos VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Erros Estruturados
Todos os erros usam `PolyglotError` com um código legível por máquina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), uma mensagem legível por humanos, uma dica opcional e um sinalizador `retryable`.

### Validação de Saída
Cada tradução é validada automaticamente: saída vazia gera (reponível), a repetição do texto de origem é sinalizada, truncamento e alucinação graves são alertados, codificação corrompida e comentários meta do modelo são detectados. Os avisos aparecem na resposta da ferramenta MCP.

### Streaming
`OllamaClient.generateStream()` gera tokens via NDJSON conforme o Ollama os produz. A função `translate()` aceita um callback `onToken` para exibição de progresso em tempo real. Tanto os caminhos de streaming quanto os não streaming compartilham a lógica de repetição.

## Idiomas Suportados

Africâner, Albanês, Árabe, Bengali, Búlgaro, Catalão, Chinês (Simplificado), Chinês (Tradicional), Croata, Tcheco, Dinamarquês, Holandês, Inglês, Estoniano, Finlandês, Francês, Galego, Alemão, Grego, Gujarati, Hebraico, Hindi, Húngaro, Indonésio, Irlandês, Italiano, Japonês, Kannada, Coreano, Letão, Lituano, Macedônio, Malaio, Malaiala, Maltês, Marathi, Norueguês, Persa, Polonês, Português, Romeno, Russo, Gaélico Escocês, Sérvio, Eslovaco, Esloveno, Espanhol, Suaíli, Sueco, Tâmil, Telugu, Tailandês, Turco, Ucraniano, Urdu, Vietnamita, Galês.

## Desempenho

| Métrica | 27B (padrão), RTX 5090 32 GB | 12B (Q4), RTX 5080 16 GB |
|--------|-------------------------------|--------------------------|
| Primeira tradução (carregamento do modelo a frio) | ~30 s | ~15 s |
| Traduções subsequentes | ~1–2 s por lote de segmentos do README | ~600 ms |
| Memória do modelo | 17 GB, totalmente na GPU (conforme relatado por `ollama ps`) | ~8,1 GB |

## Arquitetura

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

## Segurança e Escopo de Dados

| Aspecto | Detalhe |
|--------|--------|
| **Data touched** | Texto enviado para a API Ollama — local (`localhost:11434`) por padrão ou o host em `OLLAMA_HOST`, se você definir um. Cache de segmento `.polyglot-cache.json` ao lado de um arquivo traduzido (uso apenas de biblioteca e CLI) |
| **Files written** | `translate_readme` grava `README.<lang>.md` ao lado do README que você passa e atualiza a barra de navegação de idioma desse README |
| **Data NOT touched** | Nenhum dado do navegador, nenhuma credencial do sistema operacional, nada fora dos diretórios acima |
| **Network** | HTTP para `localhost:11434` apenas por padrão — saída externa zero. Remoto apenas quando `OLLAMA_HOST` aponta para outro lugar |
| **Secrets** | `OLLAMA_API_KEY`, se definido, é lido do ambiente e enviado apenas como um token Bearer para um host que não seja de loopback `OLLAMA_HOST`; nunca gravado em disco ou registrado |
| **Telemetry** | Nenhum dado coletado ou enviado |

Consulte [SECURITY.md](SECURITY.md) para a política de relatório de vulnerabilidades.

## Desenvolvimento

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 362 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licença

MIT — consulte [LICENSE](LICENSE).

> Criado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
