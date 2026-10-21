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

Traduz texto entre 57 idiomas usando [TranslateGemma](https://ollama.com/library/translategemma) executado localmente em sua GPU por meio de [Ollama](https://ollama.com). Sem chaves de API, sem nuvem, sem limites de taxa — por padrão, tudo permanece em sua máquina. Você pode optar por usar um Ollama remoto, como [Ollama Cloud](#ollama-cloud-opcional).

## Início rápido

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

> **Dica:** Você pode pular esta etapa — o Polyglot baixa automaticamente o modelo padrão (27B, 17 GB) no primeiro uso. Em uma GPU menor, defina `POLYGLOT_MODEL=translategemma:12b` primeiro (veja [Modelo padrão configurável](#modelo-padrão-configurável)).

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
| `glossary`  | no       | Substituições de termos personalizados como `{"source": "translation"}` — mescladas com o glossário de software integrado |

Textos longos são automaticamente divididos em trechos nos limites de parágrafos e frases, traduzidos em sequência e remontados. Todas as traduções são validadas quanto à qualidade (saída vazia, detecção de eco, truncamento, texto ilegível).

### `translate_markdown`

Traduza um documento Markdown inteiro, preservando a estrutura. Blocos de código, elementos HTML, distintivos, URLs e formatação de tabela são mantidos intactos — apenas o conteúdo em prosa (títulos, parágrafos, slogans, células de tabela) é traduzido. Trechos de código embutidos e [termos protegidos](#termos-protegidos-polyglot-termsjson) são substituídos por espaços reservados antes da tradução e restaurados depois, para que comandos, sinalizadores, nomes de pacotes e identificadores retornem exatamente como foram escritos, e cada contagem de "N de M" retorne como `N/M`.

| Parâmetro | Obrigatório | Descrição |
|--------------|----------|-------------|
| `markdown`   | sim | O conteúdo Markdown completo a ser traduzido |
| `from`       | sim | Código ou nome do idioma de origem |
| `to`         | sim | Código ou nome do idioma de destino |
| `model`      | no       | Modelo Ollama (padrão: `translategemma:27b`) |
| `onLostSpan` | no       | `report` (padrão) lista os trechos protegidos ausentes da tradução; `fail` transforma isso em um erro. Veja [Verificação de sobrevivência](#verificação-de-sobrevivência---on-lost-span) |

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
| `onLostSpan`  | no       | `report` (padrão) lista os trechos protegidos perdidos por idioma; `fail` transforma um idioma com algum deles em um erro |

### `translate_readme`

Traduza um arquivo README.md para os mesmos 7 idiomas e escreva os arquivos `README.<lang>.md` ao lado dele, atualizando a barra de navegação de idioma no README de origem e em cada tradução. Retorna um resumo de status por idioma (ok/falha, tempos, arquivos escritos) em vez do texto traduzido; use `translate_markdown` quando você quiser o conteúdo de volta.

| Parâmetro | Obrigatório | Descrição |
|---------------|----------|-------------|
| `readmePath`  | sim | Caminho absoluto para o arquivo README.md de origem |
| `tier`        | no       | `quality` (`translategemma:27b`, padrão), `bulk` (`12b`) ou `draft` (`2b`); ignorado quando `model` é definido |
| `model`       | no       | Modelo Ollama explícito; substitui `tier` |
| `languages`   | no       | Subconjunto de códigos de idioma de destino (padrão: todos os 7) |
| `concurrency` | no       | Número máximo de traduções simultâneas (padrão: 2, máximo: 3) |
| `navBar`      | no       | Injetar ou atualizar a barra de navegação de idioma (padrão: verdadeiro) |
| `onLostSpan`  | no       | `report` (padrão) escreve cada arquivo e lista os trechos protegidos perdidos; `fail` deixa um idioma com algum não escrito, como um erro |

`translate_readme` lê o `.polyglot-terms.json` e o `.polyglot-pins.json` do README, se existirem.

## Recursos

### Início e download automático
O Ollama é iniciado automaticamente se não estiver em execução. O modelo TranslateGemma é baixado automaticamente se não estiver instalado. Não é necessário nenhum processo de configuração manual.

### Repetir com retrocesso exponencial
Falhas transitórias do Ollama (interrupções de rede, sobrecarga temporária) são repetidas automaticamente até 2 vezes com retrocesso exponencial (1 s, 2 s). Erros não repetíveis (nome de modelo incorreto, entrada inválida) falham imediatamente.

### Divisão inteligente
Textos longos são divididos em limites naturais — parágrafos e, em seguida, frases — para que o contexto da tradução seja preservado. Os tamanhos dos trechos se adaptam ao modelo: 2 mil caracteres para modelos de 2B/4B, 4 mil para 12B, 6 mil para 27B.

### Cache de segmentos
Os segmentos traduzidos são armazenados em cache por hash de conteúdo (SHA-256 do texto de origem mascarado + idioma de destino + modelo, mais um hash das regras de termos protegidos que corresponderam no segmento). Os segmentos inalterados ignoram completamente a retradução, para que a execução de uma tradução novamente após uma edição afete apenas o que foi alterado. A adição de um termo protegido altera a chave de cada segmento que o contém, para que uma tradução em cache que reescreveu o termo não seja reproduzida; outros segmentos mantêm suas chaves. O cache está localizado em `.polyglot-cache.json`, ao lado do arquivo de origem, com um TTL de 30 dias. Ele é usado pela API da biblioteca `translateMarkdown` quando um `filePath` é fornecido (e pela CLI `scripts/translate-*.mjs` do repositório); as ferramentas MCP traduzem sem ele.

Várias execuções podem compartilhar um único arquivo de cache. Cada salvamento mescla apenas suas próprias alterações no arquivo sob um bloqueio e substitui o arquivo atomicamente, de modo que os idiomas traduzidos em paralelo mantenham as entradas uns dos outros, e a limpeza do cache para um idioma não afeta os outros.

### Memória de Tradução (Cache Fuzzy)
Quando uma correspondência exata no cache não é encontrada, uma tradução em cache é reutilizada apenas se sua fonte diferir da nova apenas no layout de espaços em branco: espaçamento dentro de uma linha, espaços em branco em qualquer extremidade ou CRLF versus LF. Qualquer outra edição é retraduzida, incluindo uma palavra, número, sinal de pontuação, letra ou trecho de código embutido alterados. Uma tradução em cache é a tradução de sua própria fonte, portanto, reutilizá-la para texto editado resultaria no uso da redação antiga.

### Termos Protegidos (`.polyglot-terms.json`)
TranslateGemma reescreve identificadores simples em outro script: um arquivo README em hindi escreveu `XLS-30` como `एक्सएलएस-30` e `Kimi-K3` como `किमी-के3`. Também distorce contagens: o chinês transformou "218/224" em "224/218". Portanto, os identificadores em prosa são mascarados como trechos de código embutido: cada um é substituído por um espaço reservado sem letras antes da tradução e restaurado depois. Os padrões são:

| Padrão | Máscaras | Deixa intacto |
|---------|-------|--------------|
| `url` | `https://…` até o espaço em branco, uma aspa, um colchete ou um acento grave | |
| `caps-id` | ALL-CAPS tokens com um dígito ou letras maiúsculas unidas por `-` ou `_`: `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64` | `README`, `API`, `NASA` |
| `camel-case` | CamelCase e mixedCase palavras: `DepositAuth`, `AMMCreate`, `mixedCase`, `SoulX-Singer` | `URLs`, `IDs`, `GPUs`, palavras comuns com letras maiúsculas |
| `model-id` | IDs de modelo e produto com uma parte alfanumérica: `Kimi-K3`, `gemma4:31b`, `Qwen2.5-32B` | `Node.js`, `top-10` |
| `anchor` | Alvos `#slug` embutidos em links Markdown (`[text](#slug)`, `[text](#slug "title")`) e definições de referência (`[label]: #slug`), para que o modelo traduza o texto do link sem distorcer o fragmento | `#123` em prosa, `#heading` linhas, URLs externas `https://…#frag` (cobertas por `url`) |

Depois que todos os segmentos são traduzidos e remontados, cada cabeçalho ATX de origem é emparelhado com seu cabeçalho ATX traduzido e recebe um "slug" na ordem do documento com `github-slugger` (correspondendo aos próprios IDs de cabeçalho de GitHub, incluindo os sufixos `-1`, `-2` para cabeçalhos duplicados), e cada âncora não-código na página (`[text](#slug)`, `[label]: #slug` e HTML `href="#slug"`) é reescrita para o "slug" do cabeçalho traduzido.

"N de M" em prosa e células de tabela (`218 of 224`) é mascarado como um único trecho e restaurado como `218/224` em todos os idiomas, o que é lido corretamente em todos os lugares e não pode ser revertido ou transformado em um ordinal. Uma célula de tabela que é apenas uma contagem não é enviada para o modelo.

Um repositório adiciona seus próprios termos em `.polyglot-terms.json` ao lado do arquivo README. Cada campo é opcional:

```json
{
  "terms": ["Gemma", "TranslateGemma"],
  "patterns": ["\\bRFC \\d+\\b"],
  "disable": ["camel-case"],
  "nOfM": true
}
```

`terms` são strings exatas, sensíveis a maiúsculas e minúsculas, correspondidas como palavras inteiras; `patterns` são JavaScript expressões regulares. Ambos se adicionam aos padrões. `disable` desativa os padrões por nome (por exemplo, `"disable": ["anchor"]` desativa o mascaramento de âncoras na página, a reescrita de "slug" após a montagem e a verificação de sobrevivência da âncora), e `"nOfM": false` desativa a regra de contagem. Um arquivo que não pode ser analisado interrompe a execução com `CONFIG_ERROR` em vez de traduzir sem os termos solicitados.

### Verificação de Sobrevivência (`--on-lost-span`)
Após a tradução, cada arquivo de destino é verificado em relação ao inglês: cada trecho protegido (trecho de código embutido, termo protegido e cada contagem como `N/M`) deve estar presente na tradução de seu segmento, caractere por caractere, e cada âncora `#slug` na página que foi resolvida na fonte em inglês deve ser resolvida na tradução para um "slug" de cabeçalho ATX traduzido ou uma âncora HTML explícita `id=`/`name=` (uma âncora que já não foi resolvida na fonte em inglês é relatada como um aviso e nunca interrompe a execução). Cada célula de tabela deve conter os mesmos números de sua célula de origem, comparados como um multiconjunto, não em ordem: o chinês correto para "218/224" coloca o total primeiro (`224 首中的 218 首`), portanto, uma verificação de ordem sinalizaria a resposta correta. Os dígitos de outros scripts são normalizados antes da comparação. O arquivo também deve manter seus blocos de código delimitados e trechos de código embutido.

`--on-lost-span=fail|report` define o que acontece quando algo é perdido:

- **`fail`**: a execução é interrompida com um código de saída diferente de zero, com uma lista de idioma, segmento e trecho ausente. Este é o padrão para `scripts/translate-all.mjs`, que é executado antes dos lançamentos. Os arquivos ainda são gravados, para que possam ser corrigidos manualmente e fixados. O JSON de resumo contém a lista e um erro `LOST_SPAN` no formato `PolyglotError` usual (`code`, `message`, `hint`, `retryable`).
- **`report`**: a lista é gravada e a execução é interrompida com código de saída 0. Este é o padrão para as ferramentas MCP (parâmetro `onLostSpan`) e a API da biblioteca `translateMarkdown` (opção `onLostSpan`, campo de resultado `lostSpans`).

```bash
node scripts/translate-all.mjs README.md                       # --on-lost-span=fail
node scripts/translate-all.mjs README.md --on-lost-span=report
```

### Traduções Fixadas (`.polyglot-pins.json`)
Uma tradução fixada sempre vence. `.polyglot-pins.json` fica ao lado do cache; cada entrada é indexada por um hash do segmento em inglês mais o idioma de destino e contém a tradução corrigida manualmente. Uma fixação supera o cache e o modelo e sobrevive a cada nova execução, incluindo `--cache-clear`. Quando o inglês muda, o hash muda, portanto, uma fixação não pode sobreviver ao texto para o qual foi escrita.

Para fixar correções manuais, corrija o arquivo traduzido e, em seguida, execute:

```bash
node scripts/pin-translation.mjs README.md hi README.hi.md
```

Ele emparelha cada segmento do inglês com seu texto no arquivo corrigido e fixa cada segmento cujo texto difere da tradução em cache. `--dry-run` lista as fixações sem gravá-las. `--model=NAME` define o modelo cujas entradas de cache são comparadas (padrão: `$POLYGLOT_MODEL` ou `translategemma:27b`, o mesmo que os scripts). `--include-uncached` também fixa segmentos para os quais o cache não tem tradução. Faça o commit de `.polyglot-pins.json` e `.polyglot-terms.json` com o arquivo README.

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
Todas as ferramentas reportam o progresso através do MCP `notifications/progress` quando o cliente fornece um `progressToken`. Traduzir relatórios por bloco, translate_markdown por lote de segmentos, translate_all por idioma e check_status por etapa.

### Glossário de Software
Um glossário integrado de 12 termos técnicos (API, CLI, SDK, etc.) garante a tradução consistente da terminologia de software. Entradas de glossário personalizadas podem ser passadas por solicitação e são mescladas com os padrões.

### Tradução em Lote
`translateBatch` agrupa vários segmentos em um único prompt, sempre que possível, reduzindo o número de viagens de ida e volta. Retorna à tradução individual se o separador de lote estiver corrompido.

### Modelo Padrão Configurável
O modelo padrão é `translategemma:27b`. Defina a variável de ambiente `POLYGLOT_MODEL` para usar outro, por exemplo, em uma GPU com menos VRAM:

```bash
POLYGLOT_MODEL=translategemma:12b npx @mcptoolshop/polyglot-mcp
```

### Erros Estruturados
Todos os erros usam `PolyglotError` com um código legível por máquina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), uma mensagem legível por humanos, uma dica opcional e um sinalizador `retryable`.

### Validação de Saída
Cada tradução é automaticamente validada: saída vazia gera um erro (reponível), a repetição do texto de origem é sinalizada, truncamentos graves e alucinações são alertados, codificação corrompida e comentários meta do modelo são detectados. Os avisos aparecem na resposta da ferramenta MCP.

### Streaming
`OllamaClient.generateStream()` gera tokens via NDJSON conforme o Ollama os produz. A função `translate()` aceita um callback `onToken` para exibição de progresso em tempo real. Tanto os caminhos de streaming quanto os não-streaming compartilham a lógica de repetição.

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

## Segurança e Escopo de Dados

| Aspecto | Detalhe |
|--------|--------|
| **Data touched** | Texto enviado para a API do Ollama — local (`localhost:11434`) por padrão, ou o host em `OLLAMA_HOST` se você definir um. Cache de segmentos `.polyglot-cache.json` próximo a um arquivo traduzido (apenas biblioteca e CLI). `.polyglot-terms.json` e `.polyglot-pins.json` próximos a um README traduzido são lidos, se presentes. |
| **Files written** | `translate_readme` grava `README.<lang>.md` próximo ao README que você passa e atualiza a barra de navegação de idioma desse README. `scripts/pin-translation.mjs` grava `.polyglot-pins.json` próximo ao README. |
| **Data NOT touched** | Nenhum dado do navegador, nenhuma credencial do sistema operacional, nada fora dos diretórios acima. |
| **Network** | HTTP para `localhost:11434` apenas por padrão — saída externa zero. Apenas remoto quando `OLLAMA_HOST` aponta para outro lugar. |
| **Secrets** | `OLLAMA_API_KEY`, se definido, é lido do ambiente e enviado apenas como um token Bearer para um `OLLAMA_HOST` que não seja de loopback; nunca gravado em disco ou registrado. |
| **Telemetry** | Nenhum dado coletado ou enviado. |

Consulte [SECURITY.md](SECURITY.md) para a política de relatório de vulnerabilidades.

## Desenvolvimento

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 467 tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licença

MIT — consulte [LICENSE](LICENSE).

> Criado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
