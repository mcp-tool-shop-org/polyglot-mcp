<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
            <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/polyglot-mcp/readme.png"
           alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>Servidor de tradução local com GPU – 55 idiomas, sem dependência de serviços em nuvem.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## O que ele faz

Traduz textos entre 55 idiomas utilizando o [TranslateGemma](https://ollama.com/library/translategemma), que é executado localmente na sua GPU através do [Ollama](https://ollama.com). Não são necessárias chaves de API, não utiliza a nuvem e não há limites de uso – tudo é executado na sua máquina.

## Pré-requisitos

1. **[Ollama](https://ollama.com)** instalado e em execução (`ollama serve`).
2. Modelo **TranslateGemma** baixado:
   ```bash
   ollama pull translategemma:12b   # 8,1 GB — melhor equilíbrio entre qualidade e velocidade
   # ou
   ollama pull translategemma:4b    # 3,3 GB — mais rápido, qualidade inferior
   ```
3. **Node.js 18 ou superior**.

## Configuração

### Claude Code / Claude para Desktop

Adicione o seguinte à sua configuração do MCP (`claude_desktop_config.json` ou `.mcp.json`):

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

### Da fonte

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## Ferramentas

### `translate`

Traduza textos entre qualquer par de idiomas suportados.

| Parâmetro. | Obrigatório. | Descrição. |
|-----------|----------|-------------|
| `text` | yes | Por favor, forneça o texto que você deseja que eu traduza. |
| `from` | yes | Código do idioma de origem ou nome (por exemplo, `en`, `Inglês`). |
| `to` | yes | Código ou nome do idioma de destino (por exemplo, `ja`, `japonês`). |
| `model` | no | Modelo Ollama (padrão: `translategemma:12b`). |

### `list_languages`

Liste todas as 55 línguas suportadas, juntamente com seus códigos.

### `check_status`

Verifique se o Ollama está em execução e quais modelos TranslateGemma estão instalados.

## Idiomas suportados

Africâner, Albanês, Árabe, Bengali, Búlgaro, Catalão, Chinês (Simplificado), Chinês (Tradicional), Croata, Checo, Dinamarquês, Holandês, Inglês, Estoniano, Finlandês, Francês, Galego, Alemão, Grego, Gujarati, Hebraico, Hindi, Húngaro, Indonésio, Irlandês, Italiano, Japonês, Kannada, Coreano, Letão, Lituano, Macedônio, Malaio, Malayalam, Maltês, Marathi, Norueguês, Persa, Polonês, Português, Romeno, Russo, Gaélico Escocês, Sérvio, Eslovaco, Esloveno, Espanhol, Suaíli, Sueco, Tamil, Telugu, Tailandês, Turco, Ucraniano, Urdu, Vietnamita, Galês.

## Desempenho

Em uma placa RTX 5080 (com 16 GB de VRAM), utilizando o modelo TranslateGemma 12B (versão Q4):

| Métrica. | Value |
|--------|-------|
| Primeira tradução (carga fria). | ~15s |
| Traduções subsequentes. | ~600 milissegundos. |
| Uso de memória de vídeo (VRAM). | ~8,1 GB |
| Texto longo (dividido em partes). | Aproximadamente 600 milissegundos por bloco. |

## Como funciona

1. Seu cliente MCP (Claude Code, etc.) chama a ferramenta `translate`.
2. O Polyglot cria um prompt para o modelo TranslateGemma, especificando o par de idiomas de origem e destino.
3. O prompt é enviado para a API HTTP local do Ollama.
4. O Ollama executa o modelo TranslateGemma na sua GPU e retorna a tradução.
5. Para textos longos, o conteúdo é dividido em partes nos limites de parágrafos/frases.

## Licença

Licença MIT – consulte o arquivo [LICENSE](LICENSE) para obter detalhes.

> Faz parte da [MCP Tool Shop](https://mcptoolshop.com).
