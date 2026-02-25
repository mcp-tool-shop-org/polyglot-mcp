/**
 * Glossary system — domain-specific term overrides for TranslateGemma.
 *
 * Approach: inject glossary hints into the prompt so the model uses
 * the correct translation for ambiguous terms. This is safer than
 * post-hoc string replacement because the model handles inflection
 * and sentence integration naturally.
 */

export interface GlossaryEntry {
  /** The source term (case-insensitive match) */
  term: string;
  /** Target language code → preferred translation */
  translations: Record<string, string>;
}

/**
 * Built-in glossary for software/tech context.
 * These are terms TranslateGemma commonly mistranslates
 * because it picks the wrong domain sense.
 */
export const SOFTWARE_GLOSSARY: GlossaryEntry[] = [
  {
    term: "Architecture",
    translations: {
      ja: "アーキテクチャ",
      zh: "架构",
      ko: "아키텍처",
      hi: "आर्किटेक्चर",
      ar: "بنية النظام",
    },
  },
  {
    term: "Adoption",
    translations: {
      ja: "導入",
      zh: "采用",
      ko: "도입",
      hi: "अपनाना",
      fr: "adoption (du produit)",
      de: "Einführung",
    },
  },
  {
    term: "Pipeline",
    translations: {
      ja: "パイプライン",
      zh: "流水线",
      ko: "파이프라인",
    },
  },
  {
    term: "Deploy",
    translations: {
      ja: "デプロイ",
      zh: "部署",
      ko: "배포",
    },
  },
  {
    term: "Library",
    translations: {
      ja: "ライブラリ",
      zh: "库",
      ko: "라이브러리",
    },
  },
  {
    term: "Framework",
    translations: {
      ja: "フレームワーク",
      zh: "框架",
      ko: "프레임워크",
    },
  },
  {
    term: "Build",
    translations: {
      ja: "ビルド",
      zh: "构建",
      ko: "빌드",
    },
  },
  {
    term: "Release",
    translations: {
      ja: "リリース",
      zh: "发布",
      ko: "릴리스",
    },
  },
  {
    term: "Branch",
    translations: {
      ja: "ブランチ",
      zh: "分支",
      ko: "브랜치",
    },
  },
  {
    term: "Repository",
    translations: {
      ja: "リポジトリ",
      zh: "仓库",
      ko: "리포지토리",
    },
  },
  {
    term: "Merge",
    translations: {
      ja: "マージ",
      zh: "合并",
      ko: "병합",
    },
  },
  {
    term: "Token",
    translations: {
      ja: "トークン",
      zh: "令牌",
      ko: "토큰",
    },
  },
];

/**
 * Build a glossary hint string for the prompt.
 * Only includes entries that have a translation for the target language
 * AND where the term appears in the source text.
 */
export function buildGlossaryHint(
  text: string,
  targetLang: string,
  glossary: GlossaryEntry[]
): string {
  const hints: string[] = [];
  const textLower = text.toLowerCase();
  const langBase = targetLang.split("-")[0].toLowerCase();

  for (const entry of glossary) {
    if (!textLower.includes(entry.term.toLowerCase())) continue;
    const translation = entry.translations[langBase] ?? entry.translations[targetLang];
    if (!translation) continue;
    hints.push(`"${entry.term}" → "${translation}"`);
  }

  if (hints.length === 0) return "";
  return `\nIMPORTANT: Use these specific translations for the following terms:\n${hints.join("\n")}\n`;
}
