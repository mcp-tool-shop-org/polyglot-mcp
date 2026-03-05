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

यह [TranslateGemma](https://ollama.com/library/translategemma) का उपयोग करके 55 भाषाओं के बीच पाठ का अनुवाद करता है, जो आपके GPU पर [Ollama](https://ollama.com) के माध्यम से स्थानीय रूप से चलता है। इसमें कोई एपीआई कुंजी, कोई क्लाउड और कोई दर सीमा नहीं है - सब कुछ आपके मशीन पर रहता है।

## शुरुआत कैसे करें

### 1. Ollama स्थापित करें

[ollama.com](https://ollama.com) से डाउनलोड करें और इसे शुरू करें:

```bash
ollama serve
```

### 2. एक मॉडल डाउनलोड करें

```bash
ollama pull translategemma:12b   # 8.1 GB — best quality/speed balance
# or
ollama pull translategemma:4b    # 3.3 GB — faster, lower quality
# or
ollama pull translategemma:27b   # 17 GB  — highest quality
```

> **सुझाव:** आप इस चरण को छोड़ सकते हैं - पॉलीग्लॉट पहली बार उपयोग करने पर स्वचालित रूप से मॉडल डाउनलोड कर लेता है।

### 3. इसे अपने MCP क्लाइंट में जोड़ें

**क्लाउड कोड / क्लाउड डेस्कटॉप** — `claude_desktop_config.json` या `.mcp.json` में जोड़ें:

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

**स्रोत से:**

```bash
git clone https://github.com/mcp-tool-shop-org/polyglot-mcp.git
cd polyglot-mcp
npm install && npm run build
node dist/index.js
```

बस इतना ही। क्लाउड को कुछ अनुवाद करने के लिए कहें और यह स्वचालित रूप से `translate` टूल का उपयोग करेगा।

## उपकरण

पॉलीग्लॉट तीन MCP उपकरण प्रदान करता है:

### `translate`

किसी भी समर्थित भाषा जोड़ी के बीच पाठ का अनुवाद करें।

| पैरामीटर | आवश्यक | विवरण |
|-------------|----------|-------------|
| `text`      | हाँ | अनुवाद करने के लिए पाठ |
| `from`      | हाँ | स्रोत भाषा कोड या नाम (जैसे, `en`, `English`) |
| `to`        | हाँ | लक्ष्य भाषा कोड या नाम (जैसे, `ja`, `Japanese`) |
| `model`     | no       | Ollama मॉडल (डिफ़ॉल्ट: `translategemma:12b`) |
| `glossary`  | no       | कस्टम शब्द प्रतिस्थापन `{"source": "translation"}` के रूप में - अंतर्निहित सॉफ़्टवेयर शब्दावली के साथ विलय किया गया |

लंबे पाठ को स्वचालित रूप से पैराग्राफ और वाक्य सीमाओं पर छोटे भागों में विभाजित किया जाता है, क्रम में अनुवादित किया जाता है, और फिर से जोड़ा जाता है।

### `list_languages`

सभी 55 समर्थित भाषाओं को उनके कोड के साथ सूचीबद्ध करें।

### `check_status`

जांचें कि क्या Ollama चल रहा है और कौन से TranslateGemma मॉडल स्थापित हैं। यदि Ollama नहीं चल रहा है तो यह स्वचालित रूप से शुरू करने का प्रयास करता है।

## विशेषताएं

### स्वचालित शुरुआत और डाउनलोड
यदि यह नहीं चल रहा है तो Ollama स्वचालित रूप से शुरू हो जाता है। यदि यह स्थापित नहीं है तो TranslateGemma मॉडल स्वचालित रूप से डाउनलोड हो जाता है। किसी भी मैनुअल सेटअप की आवश्यकता नहीं है।

### घातांकीय बैकऑफ़ के साथ पुनः प्रयास
अस्थायी Ollama विफलताएं (नेटवर्क समस्याएं, अस्थायी अधिभार) स्वचालित रूप से 2 बार तक घातांकीय बैकऑफ़ (1 सेकंड, 2 सेकंड) के साथ पुनः प्रयास की जाती हैं। खराब मॉडल नाम या अमान्य इनपुट जैसी त्रुटियों को पुनः प्रयास नहीं किया जा सकता है और वे तुरंत विफल हो जाती हैं।

### स्मार्ट विभाजन
लंबे पाठ को प्राकृतिक सीमाओं पर विभाजित किया जाता है - पैराग्राफ, फिर वाक्य - ताकि अनुवाद संदर्भ बना रहे। मॉडल के आधार पर खंडों का आकार अनुकूलित होता है: 2B/4B मॉडल के लिए 2K अक्षर, 12B के लिए 4K, 27B के लिए 6K।

### खंड कैश
अनुवादित खंडों को सामग्री हैश (स्रोत पाठ + लक्ष्य भाषा + मॉडल का SHA-256) द्वारा कैश किया जाता है। अपरिवर्तित खंडों को पूरी तरह से पुनः अनुवादित नहीं किया जाता है। कैश `.polyglot-cache.json` में 30 दिनों की TTL के साथ संग्रहीत होता है।

### सॉफ़्टवेयर शब्दावली
12 तकनीकी शब्दों (API, CLI, SDK, आदि) की एक अंतर्निहित शब्दावली सॉफ़्टवेयर शब्दावली के सुसंगत अनुवाद को सुनिश्चित करती है। कस्टम शब्दावली प्रविष्टियों को प्रति-अनुरोध पास किया जा सकता है और उन्हें डिफ़ॉल्ट के साथ विलय कर दिया जाता है।

### बैच अनुवाद
`translateBatch` कई खंडों को एक ही प्रॉम्प्ट में समूहित करता है, जहां संभव हो, राउंड-ट्रिप की संख्या को कम करता है। यदि बैच विभाजक खराब है तो यह व्यक्तिगत अनुवाद पर वापस आ जाता है।

### कॉन्फ़िगर करने योग्य डिफ़ॉल्ट मॉडल
डिफ़ॉल्ट मॉडल को ओवरराइड करने के लिए `POLYGLOT_MODEL` पर्यावरण चर सेट करें:

```bash
POLYGLOT_MODEL=translategemma:27b npx @mcptoolshop/polyglot-mcp
```

### संरचित त्रुटियाँ
सभी त्रुटियों में `PolyglotError` का उपयोग किया जाता है जिसमें एक मशीन-पठनीय कोड (`MODEL_NOT_FOUND`, `OLLAMA_UNAVAILABLE`, `TRANSLATION_FAILED`, आदि), एक मानव-पठनीय संदेश, एक वैकल्पिक संकेत और एक `retryable` ध्वज होता है।

## समर्थित भाषाएँ

अफ्रीकांस, अल्बानियाई, अरबी, बंगाली, बल्गेरियाई, कैटलन, चीनी (सरलीकृत), चीनी (पारंपरिक), क्रोएशियाई, चेक, डैनिश, डच, अंग्रेजी, एस्टोनियाई, फिनिश, फ्रेंच, गैलिसियाई, जर्मन, ग्रीक, गुजराती, हिब्रू, हिंदी, हंगेरियाई, इंडोनेशियाई, आयरिश, इतालवी, जापानी, कन्नड़, कोरियाई, लातवियाई, लिथुआनियाई, मैसेडोनियाई, मलय, मलयालम, माल्टीज़, मराठी, नार्वेजियन, फ़ारसी, पोलिश, पुर्तगाली, रोमानियाई, रूसी, स्कॉटिश गेलिक, सर्बियाई, स्लोवाक, स्लोवेनियाई, स्पेनिश, स्वाहिली, स्वीडिश, तमिल, तेलुगु, थाई, तुर्की, यूक्रेनी, उर्दू, वियतनामी, वेल्श।

## प्रदर्शन

एक RTX 5080 (16 GB VRAM) पर, TranslateGemma 12B (Q4) के साथ:

| माप | मान |
|--------|-------|
| पहली बार अनुवाद (कोल्ड मॉडल लोड) | ~15 सेकंड |
| बाद के अनुवाद | ~600 मिलीसेकंड |
| VRAM का उपयोग | ~8.1 GB |
| लंबा पाठ (प्रत्येक खंड के लिए) | ~600 मिलीसेकंड |

## आर्किटेक्चर

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

## सुरक्षा और डेटा दायरा

| पहलू | विवरण |
|--------|--------|
| **Data touched** | स्थानीय Ollama API (`localhost:11434`) को भेजा गया पाठ, `.polyglot-cache.json` सेगमेंट कैश |
| **Data NOT touched** | कार्यशील निर्देशिका के बाहर कोई फ़ाइल नहीं, कोई ब्राउज़र डेटा नहीं, कोई OS क्रेडेंशियल नहीं |
| **Network** | केवल `localhost:11434` पर HTTP — कोई बाहरी/इंटरनेट डेटा नहीं |
| **Telemetry** | कुछ भी एकत्र या भेजा नहीं गया |

भेद्यता रिपोर्टिंग नीति के लिए [SECURITY.md](SECURITY.md) देखें।

## विकास

```bash
npm install             # install deps
npm run typecheck       # type-check without emitting
npm test                # run 114 unit tests (vitest)
npm run build           # compile TypeScript to dist/
npm run verify          # typecheck + test + build + pack (full gate)
```

## लाइसेंस

MIT — [LICENSE](LICENSE) देखें।

> [MCP Tool Shop](https://mcp-tool-shop.github.io/) द्वारा बनाया गया।
