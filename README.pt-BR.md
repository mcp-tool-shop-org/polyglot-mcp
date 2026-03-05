<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

## O que ele faz

Traduz textos entre 55 idiomas usando o [TranslateGemma](https://ollama.com/library/translategemma), executado localmente na sua GPU através do [Ollama](https://ollama.com). Não requer chaves de API, nem acesso à nuvem, nem limites de uso — tudo permanece na sua máquina.

## Como começar

### 1. Instale o Ollama

Baixe em [ollama.com](https://ollama.com) e inicie-o:

```bash
ollama serve
```

### 2. Baixe um modelo

```bash
ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
# or
ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
# or
ollama pull translategemma:27b   # 17 GB  — highest quality
```

> **Dica:** Você pode pular esta etapa — o Polyglot baixa automaticamente o modelo na primeira utilização.

### 3. Adicione ao seu cliente MCP

**Claude Code / Claude Desktop** — adicione ao `claude_desktop_config.json` ou `.mcp.json`:

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

**A partir do código fonte:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

Pronto. Peça ao Claude para traduzir algo e ele usará a ferramenta `translate` automaticamente.

## Ferramentas

O Polyglot expõe três ferramentas MCP:

### `translate`

Traduz textos entre qualquer par de idiomas suportados.

| Parâmetros | Obrigatório | Descrição |
|-------------|----------|-------------|
| `text`      | sim | Texto a ser traduzido |
| `from`      | sim | Código ou nome do idioma de origem (por exemplo, `en`, `Inglês`) |
| `to`        | sim | Código ou nome do idioma de destino (por exemplo, `ja`, `Japonês`) |
| `model`     | no       | Modelo Ollama (padrão: `translategemma:12b`) |
| `glossary`  | no       | Substituições de termos personalizados no formato `{"source": "translation"}` — combinados com o glossário de software integrado. |

Textos longos são automaticamente divididos em partes nos limites de parágrafos e frases, traduzidos sequencialmente e remontados.

### `list_languages`

Lista todos os 55 idiomas suportados com seus códigos.

### `check_status`

Verifica se o Ollama está em execução e quais modelos TranslateGemma estão instalados. Tenta iniciar automaticamente se o Ollama não estiver em execução.

## Recursos

### Início e download automático
O Ollama é iniciado automaticamente se não estiver em execução. O modelo TranslateGemma é baixado automaticamente se não estiver instalado. Não requer configuração manual.

### Repetição com retrocesso exponencial
Falhas transitórias do Ollama (problemas de rede, sobrecarga temporária) são automaticamente repetidas até 2 vezes com retrocesso exponencial (1 s, 2 s). Erros não repetíveis (nome de modelo inválido, entrada inválida) falham imediatamente.

### Divisão inteligente
Textos longos são divididos nos limites naturais — parágrafos, depois frases — para preservar o contexto da tradução. Os tamanhos das partes se adaptam ao modelo: 2K caracteres para modelos de 2B/4B, 4K para 12B, 6K para 27B.

### Cache de segmentos
Os segmentos traduzidos são armazenados em cache com base no hash do conteúdo (SHA-256 do texto de origem + idioma de destino + modelo). Segmentos não modificados pulam a re-tradução completamente. O cache é armazenado em `.polyglot-cache.json` com um TTL de 30 dias.

### Glossário de software
Um glossário integrado de 12 termos técnicos (API, CLI, SDK, etc.) garante a tradução consistente da terminologia de software. As entradas de glossário personalizadas podem ser fornecidas por solicitação e combinadas com as configurações padrão.

### Tradução em lote
`translateBatch` agrupa vários segmentos em um único prompt, sempre que possível, reduzindo o número de requisições. Recua para a tradução individual se o separador do lote for corrompido.

### Modelo padrão configurável
Defina a variável de ambiente `POLYGLOT_MODEL` para substituir o modelo padrão:

```bash
POLYGLOT_MODEL=translategemma:27b npx @mcptoolshop/polyglot-mcp
```

### Erros estruturados
Todos os erros usam `PolyglotError` com um código legível por máquina (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, etc.), uma mensagem legível por humanos, uma dica opcional e uma flag `retryable`.

## Idiomas suportados

Africâner, Albanês, Árabe, Bengali, Búlgaro, Catalão, Chinês (Simplificado), Chinês (Tradicional), Croata, Checo, Dinamarquês, Holandês, Inglês, Estoniano, Finlandês, Francês, Galego, Alemão, Grego, Gujarati, Hebraico, Hindi, Húngaro, Indonésio, Irlandês, Italiano, Japonês, Kannada, Coreano, Letão, Lituano, Macedônio, Malaio, Malayalam, Maltês, Marathi, Norueguês, Persa, Polonês, Português, Romeno, Russo, Gaélico Escocês, Sérvio, Eslovaco, Esloveno, Espanhol, Suaíli, Sueco, Tamil, Telugu, Tailandês, Turco, Ucraniano, Urdu, Vietnamita, Galês.

## Desempenho

Em uma RTX 5080 (16 GB de VRAM) com TranslateGemma 12B (Q4):

| Métrica | Valor |
|--------|-------|
| Primeira tradução (carregamento inicial do modelo) | ~15 segundos |
| Traduções subsequentes | ~600 ms |
| Uso de VRAM | ~8.1 GB |
| Texto longo (por trecho) | ~600 ms |

## Arquitetura

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

## Segurança e Escopo de Dados

| Aspecto | Detalhe |
|--------|--------|
| **Data touched** | Texto enviado para a API local do Ollama (`localhost:11434`), cache de segmentos `.polyglot-cache.json` |
| **Data NOT touched** | Nenhum arquivo fora do diretório de trabalho, nenhum dado do navegador, nenhuma credencial do sistema operacional |
| **Network** | HTTP apenas para `localhost:11434` — sem tráfego externo/na internet |
| **Telemetry** | Nenhum dado coletado ou enviado |

Consulte [SECURITY.md](SECURITY.md) para a política de relatório de vulnerabilidades.

## Desenvolvimento

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 114 unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## Licença

MIT — veja [LICENSE](LICENSE).

> Criado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
