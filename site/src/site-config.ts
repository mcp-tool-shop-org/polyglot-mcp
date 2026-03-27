import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: '@mcptoolshop/polyglot-mcp',
  description: 'Local GPU translation MCP server — TranslateGemma via Ollama, 57 languages, zero cloud dependency.',
  logoBadge: 'PG',
  brandName: 'Polyglot MCP',
  repoUrl: 'https://github.com/mcp-tool-shop-org/polyglot-mcp',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/polyglot-mcp',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    badge: '57 languages · local GPU · zero cloud',
    headline: 'Polyglot MCP',
    headlineAccent: 'translate everything, locally.',
    description: 'An MCP server that translates text between 57 languages using TranslateGemma on your GPU via Ollama. No API keys, no cloud, no rate limits — everything runs on your machine.',
    primaryCta: { href: '#setup', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Translate', code: 'translate("Hello world", "en", "ja")' },
      { label: 'Result', code: '"こんにちは世界" // ~600ms on GPU' },
      { label: 'Setup', code: 'ollama pull translategemma:12b' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Why Local Translation',
      subtitle: 'Your data never leaves your machine.',
      features: [
        { title: 'Private', desc: 'Translations run entirely on your GPU. No text is sent to any cloud service — ever.' },
        { title: 'Fast', desc: '~600ms per translation after cold load. TranslateGemma 12B runs at full speed on consumer GPUs.' },
        { title: 'Free', desc: 'No API keys, no subscriptions, no rate limits. Ollama + TranslateGemma are fully open source (Apache 2.0).' },
      ],
    },
    {
      kind: 'features',
      id: 'capabilities',
      title: 'Capabilities',
      features: [
        { title: '57 Languages', desc: 'From Afrikaans to Vietnamese — including CJK, Arabic, Hindi, and all major European languages.' },
        { title: 'Smart Chunking', desc: 'Long text is split at paragraph and sentence boundaries, preserving context across chunks.' },
        { title: 'Model Choice', desc: 'Default to 12B for quality, switch to 4B for speed, or 27B for maximum accuracy.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'setup',
      title: 'Setup',
      cards: [
        { title: 'Claude Code / Claude Desktop', code: `// Add to your MCP config (.mcp.json)
{
  "mcpServers": {
    "polyglot": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/polyglot-mcp"]
    }
  }
}` },
        { title: 'Prerequisites', code: `# 1. Install Ollama (ollama.com)
# 2. Pull the translation model:
ollama pull translategemma:12b  # 8.1 GB

# 3. Start Ollama:
ollama serve` },
      ],
    },
    {
      kind: 'data-table',
      id: 'tools',
      title: 'MCP Tools',
      subtitle: 'Five tools exposed to your LLM agent.',
      columns: ['Tool', 'Description'],
      rows: [
        ['translate', 'Translate text between any two of 57 supported languages'],
        ['translate_markdown', 'Translate a full markdown document while preserving structure'],
        ['translate_all', 'Translate markdown into multiple languages concurrently'],
        ['list_languages', 'List all supported language codes and names'],
        ['check_status', 'Verify Ollama is running and TranslateGemma is installed'],
      ],
    },
    {
      kind: 'data-table',
      id: 'models',
      title: 'Model Options',
      subtitle: 'Choose the right balance of quality and speed.',
      columns: ['Model', 'Size', 'Speed', 'Quality'],
      rows: [
        ['translategemma:4b', '3.3 GB', '~300ms', 'Good'],
        ['translategemma:12b', '8.1 GB', '~600ms', 'Great (default)'],
        ['translategemma:27b', '17 GB', '~1.5s', 'Best'],
      ],
    },
    {
      kind: 'data-table',
      id: 'languages',
      title: 'Supported Languages',
      subtitle: '57 languages powered by Google TranslateGemma.',
      columns: ['Region', 'Languages'],
      rows: [
        ['Europe', 'English, French, German, Spanish, Portuguese, Italian, Dutch, Danish, Swedish, Norwegian, Finnish, Polish, Czech, Slovak, Slovenian, Croatian, Serbian, Albanian, Bulgarian, Romanian, Hungarian, Estonian, Latvian, Lithuanian, Macedonian, Maltese, Greek, Irish, Scottish Gaelic, Galician, Catalan, Welsh'],
        ['Asia', 'Japanese, Chinese (Simplified), Chinese (Traditional), Korean, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Tamil, Telugu, Urdu, Thai, Vietnamese, Indonesian, Malay, Persian'],
        ['Other', 'Arabic, Hebrew, Turkish, Ukrainian, Russian, Swahili, Afrikaans'],
      ],
    },
  ],
};
