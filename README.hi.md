<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center"><img src="logo.png" alt="Polyglot MCP" width="340"></p>

<p align="center"><strong>स्थानीय जीपीयू अनुवाद सर्वर - 55 भाषाएँ, बिना किसी क्लाउड पर निर्भरता।</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp"><img src="https://img.shields.io/npm/v/@mcptoolshop/polyglot-mcp.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="node 18+"></a>
  <a href="https://ollama.com/library/translategemma"><img src="https://img.shields.io/badge/TranslateGemma-Ollama-blue" alt="TranslateGemma"></a>
  <a href="https://mcp-tool-shop-org.github.io/polyglot-mcp/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

---

## यह क्या करता है।

यह [TranslateGemma](https://ollama.com/library/translategemma) नामक उपकरण का उपयोग करके 55 भाषाओं के बीच पाठ का अनुवाद करता है। यह उपकरण आपके कंप्यूटर के ग्राफिक्स प्रोसेसिंग यूनिट (GPU) पर स्थानीय रूप से चलता है, और इसके लिए [Ollama](https://ollama.com) की आवश्यकता होती है। इसमें किसी एपीआई कुंजी की आवश्यकता नहीं है, यह क्लाउड पर निर्भर नहीं है, और इसकी कोई उपयोग सीमा नहीं है - सब कुछ आपके अपने कंप्यूटर पर चलता है।

## आवश्यक शर्तें।

1. **[ओलामा](https://ollama.com)** स्थापित और चल रहा है (`ollama serve` कमांड के साथ)।
2. **ट्रांसलेटगेमा (TranslateGemma)** मॉडल डाउनलोड किया गया:
   ```bash
   ollama pull translategemma:12b   # 8.1 जीबी — सर्वोत्तम गुणवत्ता/गति का संतुलन
   # या
   ollama pull translategemma:4b    # 3.3 जीबी — तेज़, लेकिन कम गुणवत्ता
   ```
3. **नोड.जेएस 18 या उससे ऊपर का संस्करण**।

## स्थापना।

### क्लाउड कोड / क्लाउड डेस्कटॉप

अपने एमसीपी कॉन्फ़िगरेशन (MCP configuration) में निम्नलिखित जोड़ें (`claude_desktop_config.json` या `.mcp.json` फ़ाइल में):

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

### स्रोत से।

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

## उपकरण।

### `translate`

किसी भी समर्थित भाषा युग्म के बीच पाठ का अनुवाद करें।

| पैरामीटर। | आवश्यक। | विवरण। |
|-----------|----------|-------------|
| `text` | yes | कृपया वह पाठ प्रदान करें जिसका आप अनुवाद करवाना चाहते हैं। |
| `from` | yes | स्रोत भाषा का कोड या नाम (उदाहरण के लिए, `en`, `अंग्रेजी`) |
| `to` | yes | लक्ष्य भाषा का कोड या नाम (उदाहरण के लिए, `ja`, `जापानी`)। |
| `model` | no | ओलामा मॉडल (डिफ़ॉल्ट: `translategemma:12b`) |

### `list_languages`

सभी 55 समर्थित भाषाओं की सूची उनके कोड के साथ दी गई है।

### `check_status`

जांच करें कि क्या ओलामा चल रहा है और कौन से ट्रांसलेटगेमा मॉडल स्थापित हैं।

## समर्थित भाषाएँ।

अफ्रीकांस, अल्बानियाई, अरबी, बंगाली, बुल्गारियाई, कैटलन, चीनी (सरलीकृत), चीनी (पारंपरिक), क्रोएशियाई, चेक, डैनिश, डच, अंग्रेजी, एस्टोनियाई, फिनिश, फ्रेंच, गैलिसियाई, जर्मन, ग्रीक, गुजराती, हिब्रू, हिंदी, हंगेरियाई, इंडोनेशियाई, आयरिश, इतालवी, जापानी, कन्नड़, कोरियाई, लातवियाई, लिथुआनियाई, मैसेडोनियाई, मलय, मलयालम, माल्टीज़, मराठी, नार्वेजियन, फ़ारसी, पोलिश, पुर्तगाली, रोमानियाई, रूसी, स्कॉटिश गेलिक, सर्बियाई, स्लोवाक, स्लोवेनियाई, स्पेनिश, स्वाहिली, स्वीडिश, तमिल, तेलुगु, थाई, तुर्की, यूक्रेनी, उर्दू, वियतनामी, वेल्श।

## प्रदर्शन।

एक RTX 5080 (16 जीबी वीआरएएम) पर, "ट्रांसलेटजेमा" 12बी (क्यू4) का उपयोग करके:

| मापन प्रणाली। | Value |
|--------|-------|
| पहला अनुवाद (ठंडा भार)। | ~15s |
| निम्नलिखित अनुवाद। | लगभग 600 मिलीसेकंड। |
| वीआरएएम का उपयोग. | लगभग 8.1 जीबी। |
| लंबा पाठ (खंडों में विभाजित) | लगभग 600 मिलीसेकंड प्रति खंड। |

## यह कैसे काम करता है।

1. आपका एमसीपी क्लाइंट (क्लाउड कोड, आदि) `translate` टूल को कॉल करता है।
2. पॉलीग्लॉट, स्रोत/लक्ष्य भाषा के जोड़े के साथ, एक ट्रांसलेटगेमा प्रॉम्प्ट बनाता है।
3. यह प्रॉम्प्ट ओलामा के स्थानीय एचटीटीपी एपीआई को भेजा जाता है।
4. ओलामा, आपके जीपीयू पर ट्रांसलेटगेमा चलाता है और अनुवाद वापस करता है।
5. लंबे टेक्स्ट के लिए, सामग्री को पैराग्राफ/वाक्य सीमाओं पर छोटे-छोटे हिस्सों में विभाजित किया जाता है।

## लाइसेंस।

एमआईटी लाइसेंस - विवरण के लिए [LICENSE](LICENSE) देखें।

यह [MCP टूल शॉप](https://mcptoolshop.com) का एक हिस्सा है।
