/**
 * Protected terms: identifiers in PROSE that must reach the page exactly as
 * written, masked with the same letter-free placeholders as inline code spans
 * (see codeSpans.ts) and restored after translation.
 *
 * TranslateGemma respells bare identifiers in another script, and nothing in
 * the code-span pass covers them because they are not in backticks:
 * - Hindi wrote all of xrpl-lab's `XLS-nn` spec IDs and `DepositAuth` /
 *   `DepositPreauth` in Devanagari (एक्सएलएस-85, डिपॉजिटऑथ).
 * - Hindi transliterated `Kimi-K3` to `किमी-के3` in ai-jam-sessions. It was
 *   fixed by hand (e4cd2fb), replayed from `.polyglot-cache.json` on the next
 *   run, and fixed by hand again (5f8d1e2).
 *
 * And it garbles "N of M" counts. In Chinese "218 of 224" came back as
 * `218 首中的 224 首` ("224 of 218") and "285 of 414" as `414个中的第285个`
 * ("the 285th of 414"). Both were fixed by hand to `218/224` and `285/414`, so
 * a count is masked as one span and restored as `N/M` in every language.
 *
 * The defaults are deliberately conservative: each one requires a shape that
 * ordinary capitalised English never has (a digit, a hyphen or underscore
 * between capitals, a lower-to-upper case change). A repository adds its own
 * names and patterns, or switches a default off, in `.polyglot-terms.json`
 * beside the README.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PolyglotError } from "./errors.js";

// ─── Default patterns ─────────────────────────────────────────────

/** Name of a default pattern, as used by `disable` in the terms file. */
export type DefaultPatternName = "url" | "anchor" | "link-target" | "caps-id" | "camel-case" | "model-id";

export interface DefaultPattern {
  name: DefaultPatternName;
  kind?: ProtectedSpanKind;
  pattern: RegExp;
  /** Examples it must mask; documentation, and pinned by the tests. */
  examples: string[];
}

/**
 * In-page anchor link targets:
 * - inline links: `](#slug)`, including `](#slug "title")`
 * - reference definitions: `[label]: #slug` (including inside blockquotes)
 * - HTML attributes: `href="#slug"`
 *
 * Masks the `#slug` only so the link text stays translatable and the model
 * never sees or rewrites a slug.
 */
export const ANCHOR_PATTERN =
  /(?=#)(?<=(?<!\\)\]\(\s*)#[^\s)<>"'`[\]]+(?=(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\r\n]*\)))?\s*\))|(?=#)(?<=(?:^|\n)[ \t>]*\[[ \t]*[^\][\s][^\][\r\n]*\]:[ \t]*)#[^\s)<>"'`[\]]+(?=(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\r\n]*\)))?[ \t]*\r?(?:\n|$))|(?=#)(?<=\bhref\s*=\s*["'])#[^"'\s<>]+(?=["'])/giu;

/**
 * Non-HTTP(S), non-anchor Markdown link, image, and reference-definition
 * targets (relative paths, bare filenames like `LICENSE`, `mailto:`, `<path with spaces>`,
 * and paths with one level of balanced parentheses). Never matches link titles
 * or HTML attributes.
 */
export const LINK_TARGET_PATTERN =
  /(?=[^\s)>])(?<=(?<!\\)\]\([ \t]*)(?!https?:\/\/|#)(?:<(?!https?:\/\/|#)(?:\\.|[^<>\\\r\n])+>|(?:\\[^\s]|[^\s()<>\\]|\((?:\\[^\s]|[^\s()<>\\])*\))+)(?=(?:[ \t]+(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|\((?:\\.|[^()\\\r\n])*\)))?[ \t]*\))|(?=[^\s)>])(?<=(?:^|\n)[ \t>]*\[[ \t]*[^\][\s][^\][\r\n]*\]:[ \t]*)(?!https?:\/\/|#)(?:<(?!https?:\/\/|#)(?:\\.|[^<>\\\r\n])+>|(?:\\[^\s]|[^\s()<>\\]|\((?:\\[^\s]|[^\s()<>\\])*\))+)(?=(?:[ \t]+(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|\((?:\\.|[^()\\\r\n])*\)))?[ \t]*\r?(?:\n|$))/giu;

/**
 * The default protected-term patterns.
 *
 * Every pattern is anchored with lookarounds so it never starts or ends inside
 * a longer word, and every one demands something ordinary prose lacks:
 *
 * - `url` — `http://` or `https://` up to whitespace, a quote, a bracket or a
 *   backtick (allowing one level of balanced parentheses), minus trailing
 *   sentence punctuation. A Markdown link's target ends at its `)`.
 * - `anchor` — in-page link target `#slug` in `](#slug)`, `](#slug "title")`,
 *   `[label]: #slug` or `href="#slug"`. Rewritten after assembly to the
 *   translated heading's slug.
 * - `link-target` — relative paths, bare filenames (`LICENSE`), `mailto:`, and
 *   `<…>` destinations in Markdown inline links, images, and reference
 *   definitions. Placed before `caps-id`, `camel-case`, and `model-id` so
 *   paths like `docs/Kimi-K3.md` are masked as one span.
 * - `caps-id` — an ALL-CAPS token that carries a digit, or joins capitals with
 *   a hyphen or underscore: `XLS-30`, `HOST_REJECTED`, `SHA-256`, `ARM64`.
 *   `README`, `API` and `NASA` have neither, so they stay prose.
 * - `camel-case` — a word with a lower-to-upper change (`DepositAuth`,
 *   `mixedCase`, `GitHub`) or two capitals followed by two lowercase letters
 *   (`AMMCreate`, `OAuth`). `URLs`, `IDs` and `GPUs` have one trailing
 *   lowercase letter and stay prose. Hyphen-joined capitalised parts stay
 *   with it (`SoulX-Singer`).
 * - `model-id` — a token, optionally joined by `-`, `:` or `.`, in which some
 *   part has a letter next to a digit: `Kimi-K3`, `gemma4:31b`,
 *   `Qwen2.5-32B`. `top-10` and `Node.js` have no such part.
 */
export const DEFAULT_PATTERNS: readonly DefaultPattern[] = [
  {
    name: "url",
    pattern:
      /\bhttps?:\/\/(?:[^\s<>"'`()[\]{}]|\([^\s<>"'`()[\]{}]*\))*(?:[^\s<>"'`()[\]{}.,;:!?]|\([^\s<>"'`()[\]{}]*\))/gu,
    examples: [
      "https://github.com/mcp-tool-shop-org/polyglot-mcp",
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ],
  },
  {
    name: "anchor",
    kind: "anchor",
    pattern: ANCHOR_PATTERN,
    examples: ["#ollama-cloud-optional", "#survival-check---on-lost-span"],
  },
  {
    name: "link-target",
    kind: "link-target",
    pattern: LINK_TARGET_PATTERN,
    examples: ["../facet", "LICENSE", "docs/Kimi-K3.md"],
  },
  {
    name: "caps-id",
    pattern: /(?<![\p{L}\p{N}_-])[A-Z](?:[A-Z0-9]*\d[A-Z0-9]*(?:[-_][A-Z0-9]+|\.\d+)*|[A-Z0-9]*(?:[-_][A-Z0-9]+)+(?:\.\d+)*)(?![\p{L}\p{N}_])/gu,
    examples: ["XLS-30", "HOST_REJECTED", "SHA-256", "ARM64"],
  },
  {
    name: "camel-case",
    pattern: /(?<![\p{L}\p{N}_-])(?=[A-Za-z0-9]*(?:[a-z][A-Z]|[A-Z]{2}[a-z]{2}))[A-Za-z][A-Za-z0-9]*(?:-[A-Z0-9][A-Za-z0-9]*)*(?![\p{L}\p{N}_])/gu,
    examples: ["DepositAuth", "DepositPreauth", "AMMCreate", "mixedCase", "SoulX-Singer"],
  },
  {
    name: "model-id",
    pattern: /(?<![\p{L}\p{N}_.:-])(?=(?:[A-Za-z0-9_]*[-:.](?=[A-Za-z0-9_]))*[A-Za-z0-9_]*(?:[A-Za-z]\d|\d[A-Za-z]))[A-Za-z][A-Za-z0-9_]*(?:[-:.][A-Za-z0-9_]+)*(?![\p{L}\p{N}_])/gu,
    examples: ["Kimi-K3", "gemma4:31b", "Qwen2.5-32B"],
  },
];

/**
 * "N of M" in prose and table cells. Masked as one span and restored as `N/M`,
 * the hand fix both Chinese counts got, which reads correctly in every target
 * language and cannot be reversed or turned into an ordinal.
 */
export const N_OF_M_PATTERN = /\b(\d[\d,]*) of (\d[\d,]*)\b/g;

// ─── Terms file ───────────────────────────────────────────────────

/** File name of the per-repository terms file, beside the README. */
export const TERMS_FILE = ".polyglot-terms.json";

/** The shape of `.polyglot-terms.json`. Every field is optional. */
export interface ProtectedTermsConfig {
  /** Exact strings, case-sensitive, matched as whole words. */
  terms?: string[];
  /** Regular expressions (JavaScript syntax, compiled with the `u` flag). */
  patterns?: string[];
  /** Default patterns to switch off, by name. */
  disable?: DefaultPatternName[];
  /** Mask "N of M" counts and restore them as `N/M`. Default: true. */
  nOfM?: boolean;
}

/** What a span stands for once restored. */
export type ProtectedSpanKind = "term" | "count" | "anchor" | "link-target";

interface Rule {
  /** Stable identity, hashed into the cache key of segments it fires in. */
  id: string;
  kind: ProtectedSpanKind;
  pattern: RegExp;
  /** Lower wins when two matches start at the same place. */
  priority: number;
}

/** A compiled, ready-to-use protected-term set. */
export interface ProtectedTermSet {
  readonly rules: readonly Rule[];
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Compile an exact term into a whole-word, case-sensitive pattern. */
function termPattern(term: string): RegExp {
  const before = WORD_CHAR.test(term[0]) ? "(?<![\\p{L}\\p{N}_])" : "";
  const after = WORD_CHAR.test(term[term.length - 1]) ? "(?![\\p{L}\\p{N}_])" : "";
  return new RegExp(`${before}${escapeRegExp(term)}${after}`, "gu");
}

function configError(message: string, cause?: unknown): PolyglotError {
  return new PolyglotError({
    code: "CONFIG_ERROR",
    message,
    hint: `Fix ${TERMS_FILE}: { "terms": [..], "patterns": [..], "disable": [..], "nOfM": true|false }.`,
    retryable: false,
    ...(cause instanceof Error ? { cause } : {}),
  });
}

/**
 * Build the effective protected-term set: the defaults, plus a repository's
 * terms and patterns, minus the defaults it switches off.
 *
 * Priority when two matches start at the same place: exact terms, then the
 * repository's patterns, then "N of M", then the defaults in their listed
 * order. Of overlapping matches the one that starts first is kept.
 */
export function buildProtectedTerms(config: ProtectedTermsConfig = {}): ProtectedTermSet {
  const rules: Rule[] = [];
  let priority = 0;

  for (const term of config.terms ?? []) {
    if (typeof term !== "string" || term.length === 0) throw configError(`"terms" must hold non-empty strings.`);
    rules.push({ id: `term:${term}`, kind: "term", pattern: termPattern(term), priority: priority++ });
  }

  for (const source of config.patterns ?? []) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(source, "gu");
    } catch (err) {
      throw configError(`Invalid pattern in "patterns": ${JSON.stringify(source)}.`, err);
    }
    rules.push({ id: `pattern:${source}`, kind: "term", pattern, priority: priority++ });
  }

  if (config.nOfM !== false) {
    rules.push({ id: `n-of-m:${N_OF_M_PATTERN.source}`, kind: "count", pattern: N_OF_M_PATTERN, priority: priority++ });
  }

  const known = new Set(DEFAULT_PATTERNS.map((d) => d.name));
  for (const name of config.disable ?? []) {
    if (!known.has(name)) {
      throw configError(`Unknown default in "disable": ${JSON.stringify(name)}. Known: ${[...known].join(", ")}.`);
    }
  }
  const disabled = new Set(config.disable ?? []);
  for (const d of DEFAULT_PATTERNS) {
    if (disabled.has(d.name)) continue;
    rules.push({
      id: `default:${d.name}:${d.pattern.source}`,
      kind: d.kind ?? "term",
      pattern: d.pattern,
      priority: priority++,
    });
  }

  return { rules };
}

/** The default set, with no terms file. */
export const DEFAULT_PROTECTED_TERMS: ProtectedTermSet = buildProtectedTerms();

/** True when the `anchor` rule is active in `set` (not switched off via `disable: ["anchor"]`). */
export function anchorsEnabled(set: ProtectedTermSet = DEFAULT_PROTECTED_TERMS): boolean {
  return set.rules.some((r) => r.kind === "anchor");
}

/** True when the `url` rule is active in `set` (not switched off via `disable: ["url"]`). */
export function urlsEnabled(set: ProtectedTermSet = DEFAULT_PROTECTED_TERMS): boolean {
  return set.rules.some((r) => r.id.startsWith("default:url:"));
}

/** True when the `link-target` rule is active in `set` (not switched off via `disable: ["link-target"]`). */
export function linkTargetsEnabled(set: ProtectedTermSet = DEFAULT_PROTECTED_TERMS): boolean {
  return set.rules.some((r) => r.kind === "link-target");
}

/** Path of the terms file beside `readmePath`. */
export function getTermsPath(readmePath: string): string {
  return join(resolve(dirname(readmePath)), TERMS_FILE);
}

/**
 * Load the protected-term set for a README: `.polyglot-terms.json` beside it
 * if there is one, else the defaults. A file that exists but cannot be parsed
 * throws a CONFIG_ERROR rather than silently translating without the terms
 * the repository asked for.
 */
export function loadProtectedTerms(readmePath: string): ProtectedTermSet {
  const path = getTermsPath(readmePath);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_PROTECTED_TERMS;
    throw configError(`Cannot read ${path}.`, err);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw configError(`${path} is not valid JSON.`, err);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw configError(`${path} must hold a JSON object.`);
  const config = data as Record<string, unknown>;
  for (const field of ["terms", "patterns", "disable"] as const) {
    if (config[field] !== undefined && !Array.isArray(config[field])) throw configError(`"${field}" must be an array.`);
  }
  if (config.nOfM !== undefined && typeof config.nOfM !== "boolean") throw configError(`"nOfM" must be true or false.`);
  return buildProtectedTerms(config as ProtectedTermsConfig);
}

// ─── Matching ─────────────────────────────────────────────────────

export interface ProtectedMatch {
  start: number;
  end: number;
  /** The text as written in the source. */
  source: string;
  /** What goes back after translation: the source itself, or `N/M` for a count. */
  restored: string;
  kind: ProtectedSpanKind;
  /** Id of the rule that matched. */
  rule: string;
}

/**
 * Find the protected spans in `text`, non-overlapping and in order.
 *
 * `blocked` ranges (placeholders already in the text) are never matched into.
 */
export function findProtectedSpans(
  text: string,
  set: ProtectedTermSet = DEFAULT_PROTECTED_TERMS,
  blocked: ReadonlyArray<readonly [number, number]> = [],
): ProtectedMatch[] {
  const candidates: Array<ProtectedMatch & { priority: number }> = [];
  for (const rule of set.rules) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`);
    for (const m of text.matchAll(re)) {
      const source = m[0];
      if (source.length === 0) continue;
      const start = m.index;
      const end = start + source.length;
      if (blocked.some(([b0, b1]) => start < b1 && end > b0)) continue;
      const restored = rule.kind === "count" ? `${m[1]}/${m[2]}` : source;
      candidates.push({ start, end, source, restored, kind: rule.kind, rule: rule.id, priority: rule.priority });
    }
  }

  candidates.sort((a, b) => a.start - b.start || a.priority - b.priority || b.end - a.end);
  const picked: ProtectedMatch[] = [];
  let cursor = 0;
  for (const { priority: _priority, ...c } of candidates) {
    if (c.start < cursor) continue;
    picked.push(c);
    cursor = c.end;
  }
  return picked;
}

/**
 * Hash of the rules that fired in one segment: the part of the effective
 * protected-term set that applies to it. Empty when none did, so a segment no
 * rule touches keeps the cache key it had before protected terms existed.
 */
export function hashRules(ruleIds: Iterable<string>): string {
  const ids = [...new Set(ruleIds)].sort();
  if (ids.length === 0) return "";
  return createHash("sha256").update(ids.join("\n")).digest("hex").slice(0, 12);
}
