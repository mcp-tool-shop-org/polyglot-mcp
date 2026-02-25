<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center"><img src="logo.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>स्थानीय जीपीयू अनुवाद एमसीपी सर्वर - 55 भाषाएँ, बिना किसी क्लाउड निर्भरता के।</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## यह क्या करता है

यह [TranslateGemma](https://ollama.com/library/translategemma) का उपयोग करके 55 भाषाओं के बीच पाठ का अनुवाद करता है, जो आपके जीपीयू पर स्थानीय रूप से [Ollama](https://ollama.com) के माध्यम से चलता है। कोई एपीआई कुंजी नहीं, कोई क्लाउड नहीं, कोई दर सीमा नहीं - सब कुछ आपके मशीन पर चलता है।

## आवश्यकताएं

1. **[Ollama](https://ollama.com)** स्थापित और चल रहा होना चाहिए (`ollama serve`)
2. **TranslateGemma** मॉडल डाउनलोड किया जाना चाहिए:
```bash
ollama pull translategemma:12b   # 8.1 GB — सर्वोत्तम गुणवत्ता/गति का संतुलन
# या
ollama pull translategemma:4b    # 3.3 GB — तेज़, कम गुणवत्ता
```
3. **Node.js 18+**

## स्थापना

### क्लाउड कोड / क्लाउड डेस्कटॉप

अपने एमसीपी कॉन्फ़िगरेशन (`claude_desktop_config.json` या `.mcp.json`) में जोड़ें:

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

### स्रोत से

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## उपकरण

### `translate`

किसी भी समर्थित भाषा जोड़ी के बीच पाठ का अनुवाद करें।

| पैरामीटर | आवश्यक | विवरण |
|-----------|----------|-------------|
| `text` | yes | अनुवाद करने के लिए पाठ |
| `from` | yes | स्रोत भाषा कोड या नाम (जैसे, `en`, `English`) |
| `to` | yes | लक्ष्य भाषा कोड या नाम (जैसे, `ja`, `Japanese`) |
| `model` | no | Ollama मॉडल (डिफ़ॉल्ट: `translategemma:12b`) |

### `list_languages`

सभी 55 समर्थित भाषाओं को उनके कोड के साथ सूचीबद्ध करें।

### `check_status`

जांचें कि Ollama चल रहा है या नहीं और कौन से TranslateGemma मॉडल स्थापित हैं।

## समर्थित भाषाएँ

अफ्रीकांस, अल्बानियाई, अरबी, बंगाली, बल्गेरियाई, कैटलन, चीनी (सरलीकृत), चीनी (पारंपरिक), क्रोएशियाई, चेक, डैनिश, डच, अंग्रेजी, एस्टोनियाई, फिनिश, फ्रेंच, गैलिसियन, जर्मन, ग्रीक, गुजराती, हिब्रू, हिंदी, हंगेरियन, इंडोनेशियाई, आयरिश, इतालवी, जापानी, कन्नड़, कोरियाई, लातवियाई, लिथुआनियाई, मैसेडोनियाई, मलय, मलयालम, माल्टीज़, मराठी, नार्वेजियन, फारसी, पोलिश, पुर्तगाली, रोमानियाई, रूसी, स्कॉटिश गेलिक, सर्बियाई, स्लोवाक, स्लोवेनियाई, स्पेनिश, स्वाहिली, स्वीडिश, तमिल, तेलुगु, थाई, तुर्की, यूक्रेनी, उर्दू, वियतनामी, वेल्श।

## प्रदर्शन

RTX 5080 (16 GB VRAM) पर TranslateGemma 12B (Q4) के साथ:

| माप | Value |
|--------|-------|
| पहला अनुवाद (कोल्ड लोड) | ~15s |
| बाद के अनुवाद | ~600ms |
| वीआरएएम उपयोग | ~8.1 GB |
| लंबे पाठ (खंडित) | ~600ms प्रति खंड |

## यह कैसे काम करता है

1. आपके एमसीपी क्लाइंट (क्लाउड कोड, आदि) द्वारा `translate` टूल को कॉल किया जाता है।
2. Polyglot स्रोत/लक्ष्य भाषा जोड़ी के साथ एक TranslateGemma प्रॉम्प्ट बनाता है।
3. प्रॉम्प्ट को Ollama के स्थानीय एचटीटीपी एपीआई पर भेजा जाता है।
4. Ollama आपके जीपीयू पर TranslateGemma चलाता है और अनुवाद लौटाता है।
5. लंबे पाठ के लिए, सामग्री को पैराग्राफ/वाक्य सीमाओं पर खंडों में विभाजित किया जाता है।

## लाइसेंस

एमआईटी लाइसेंस - विवरण के लिए [LICENSE](LICENSE) देखें।

> [MCP Tool Shop](https://mcptoolshop.com) का हिस्सा
