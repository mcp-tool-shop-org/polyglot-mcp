<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## यह क्या करता है

यह [TranslateGemma](https://ollama.com/library/translategemma) का उपयोग करके 55 भाषाओं के बीच पाठ का अनुवाद करता है, जो आपके GPU पर [Ollama](https://ollama.com) के माध्यम से स्थानीय रूप से चलता है। इसमें कोई एपीआई कुंजी, कोई क्लाउड और कोई दर सीमा नहीं है - सब कुछ आपके मशीन पर चलता है।

## आवश्यकताएं

1. **[Ollama](https://ollama.com)** स्थापित और चल रहा होना चाहिए (`ollama serve`)
2. **TranslateGemma** मॉडल डाउनलोड किया हुआ:
```bash
ollama pull translategemma:12b   # 8.1 GB — सर्वोत्तम गुणवत्ता/गति का संतुलन
# या
ollama pull translategemma:4b    # 3.3 GB — तेज़, कम गुणवत्ता
```
3. **Node.js 18+**

## स्थापना

### Claude Code / Claude Desktop

अपने MCP कॉन्फ़िगरेशन (`claude_desktop_config.json` या `.mcp.json`) में निम्नलिखित जोड़ें:

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
| `text` | हाँ | अनुवाद करने के लिए पाठ |
| `from` | हाँ | स्रोत भाषा कोड या नाम (उदाहरण के लिए, `en`, `English`) |
| `to` | हाँ | लक्ष्य भाषा कोड या नाम (उदाहरण के लिए, `ja`, `Japanese`) |
| `model` | no | Ollama मॉडल (डिफ़ॉल्ट: `translategemma:12b`) |

### `list_languages`

सभी 55 समर्थित भाषाओं को उनके कोड के साथ सूचीबद्ध करें।

### `check_status`

जांचें कि क्या Ollama चल रहा है और कौन से TranslateGemma मॉडल स्थापित हैं।

## समर्थित भाषाएँ

अफ्रीकांस, अल्बानियाई, अरबी, बंगाली, बल्गेरियाई, कैटलन, चीनी (सरलीकृत), चीनी (पारंपरिक), क्रोएशियाई, चेक, डैनिश, डच, अंग्रेजी, एस्टोनियाई, फिनिश, फ्रेंच, गैलिसियन, जर्मन, ग्रीक, गुजराती, हिब्रू, हिंदी, हंगेरियन, इंडोनेशियाई, आयरिश, इतालवी, जापानी, कन्नड़, कोरियाई, लातवियाई, लिथुआनियाई, मैसेडोनियाई, मलय, मलयालम, माल्टीज़, मराठी, नार्वेजियन, फ़ारसी, पोलिश, पुर्तगाली, रोमानियाई, रूसी, स्कॉटिश गेलिक, सर्बियाई, स्लोवाक, स्लोवेनियाई, स्पेनिश, स्वाहिली, स्वीडिश, तमिल, तेलुगु, थाई, तुर्की, यूक्रेनी, उर्दू, वियतनामी, वेल्श।

## प्रदर्शन

एक RTX 5080 (16 GB VRAM) पर TranslateGemma 12B (Q4) के साथ:

| मेट्रिक | मान |
|--------|-------|
| पहला अनुवाद (कोल्ड लोड) | ~15 सेकंड |
| बाद के अनुवाद | ~600 मिलीसेकंड |
| VRAM उपयोग | ~8.1 GB |
| लंबे पाठ (खंडित) | ~600 मिलीसेकंड प्रति खंड |

## सुरक्षा और डेटा दायरा

**डेटा जिस पर कार्रवाई की गई:** अनुवाद के लिए स्थानीय Ollama API (`localhost:11434`) पर भेजा गया पाठ, `.polyglot-cache.json` सेगमेंट कैश। **डेटा जिस पर कोई कार्रवाई नहीं की गई:** कार्यशील निर्देशिका के बाहर कोई फ़ाइल नहीं, कोई ब्राउज़र डेटा नहीं, कोई OS क्रेडेंशियल नहीं। **नेटवर्क:** केवल `localhost:11434` पर HTTP — कोई बाहरी/इंटरनेट आउटगोइंग नहीं। कोई **टेलीमेट्री** एकत्र या भेजा नहीं जाता है।

## यह कैसे काम करता है

1. आपका MCP क्लाइंट (Claude Code, आदि) `translate` टूल को कॉल करता है।
2. Polyglot स्रोत/लक्ष्य भाषा जोड़ी के साथ एक TranslateGemma प्रॉम्प्ट बनाता है।
3. प्रॉम्प्ट को Ollama के स्थानीय HTTP API पर भेजा जाता है।
4. Ollama आपके GPU पर TranslateGemma चलाता है और अनुवाद लौटाता है।
5. लंबे पाठ के लिए, सामग्री को पैराग्राफ/वाक्य सीमाओं पर खंडों में विभाजित किया जाता है।

## लाइसेंस

MIT लाइसेंस — विवरण के लिए [LICENSE](LICENSE) देखें।

> [MCP Tool Shop](https://mcp-tool-shop.github.io/) द्वारा बनाया गया।
