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

Traduz texto entre 55 idiomas usando o [TranslateGemma](https://ollama.com/library/translategemma), executado localmente na sua GPU através do [Ollama](https://ollama.com). Não requer chaves de API, nem acesso à nuvem, nem limites de uso — tudo é executado na sua máquina.

## Pré-requisitos

1. **[Ollama](https://ollama.com)** instalado e em execução (`ollama serve`)
2. Modelo **TranslateGemma** baixado:
```bash
ollama pull translategemma:12b   # 8.1 GB — melhor equilíbrio entre qualidade/velocidade
# ou
ollama pull translategemma:4b    # 3.3 GB — mais rápido, qualidade inferior
```
3. **Node.js 18+**

## Configuração

### Claude Code / Claude Desktop

Adicione à sua configuração do MCP (`claude_desktop_config.json` ou `.mcp.json`):

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

### A partir do código fonte

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## Ferramentas

### `translate`

Traduz texto entre qualquer par de idiomas suportados.

| Parâmetro | Obrigatório | Descrição |
|-----------|----------|-------------|
| `text` | sim | Texto a ser traduzido |
| `from` | sim | Código ou nome do idioma de origem (por exemplo, `en`, `Inglês`) |
| `to` | sim | Código ou nome do idioma de destino (por exemplo, `ja`, `Japonês`) |
| `model` | no | Modelo Ollama (padrão: `translategemma:12b`) |

### `list_languages`

Lista todos os 55 idiomas suportados com seus códigos.

### `check_status`

Verifica se o Ollama está em execução e quais modelos TranslateGemma estão instalados.

## Idiomas suportados

Africâner, Albanês, Árabe, Bengali, Búlgaro, Catalão, Chinês (Simplificado), Chinês (Tradicional), Croata, Tcheco, Dinamarquês, Holandês, Inglês, Estoniano, Finlandês, Francês, Galego, Alemão, Grego, Gujarati, Hebraico, Hindi, Húngaro, Indonésio, Irlandês, Italiano, Japonês, Kannada, Coreano, Letão, Lituano, Macedônio, Malaio, Malayalam, Maltês, Marathi, Norueguês, Persa, Polonês, Português, Romeno, Russo, Gaélico Escocês, Sérvio, Eslovaco, Esloveno, Espanhol, Suaíli, Sueco, Tamil, Telugu, Tailandês, Turco, Ucraniano, Urdu, Vietnamita, Galês.

## Desempenho

Em uma RTX 5080 (16 GB de VRAM) com TranslateGemma 12B (Q4):

| Métrica | Valor |
|--------|-------|
| Primeira tradução (carregamento inicial) | ~15s |
| Traduções subsequentes | ~600ms |
| Uso de VRAM | ~8.1 GB |
| Texto longo (dividido em partes) | ~600ms por parte |

## Segurança e Escopo de Dados

**Dados acessados:** texto enviado para a API local do Ollama (`localhost:11434`) para tradução, cache de segmentos `.polyglot-cache.json`. **Dados NÃO acessados:** nenhum arquivo fora do diretório de trabalho, nenhum dado do navegador, nenhuma credencial do sistema operacional. **Rede:** Acesso HTTP apenas para `localhost:11434` — sem tráfego externo/na internet. **Nenhuma telemetria** é coletada ou enviada.

## Como funciona

1. O cliente MCP (Claude Code, etc.) chama a ferramenta `translate`.
2. O Polyglot cria um prompt para o TranslateGemma com o par de idiomas de origem/destino.
3. O prompt é enviado para a API HTTP local do Ollama.
4. O Ollama executa o TranslateGemma na sua GPU e retorna a tradução.
5. Para textos longos, o conteúdo é dividido em partes nas fronteiras de parágrafos/frases.

## Licença

Licença MIT — veja [LICENSE](LICENSE) para detalhes.

> Criado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
