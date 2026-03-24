# Brand Rules — @mcptoolshop/polyglot-mcp

## Tone

Technical. Precise. Translation is a mechanical process with measurable quality signals, not a creative act. Polyglot-mcp reports what it translated, how long it took, how many chunks, and what warnings appeared.

## Domain language

| Term | Meaning | Never say instead |
|------|---------|-------------------|
| translate | Convert text from source language to target language via model inference | "interpret", "localize" |
| segment | A unit of markdown content (text, heading, table cell, protected block) | "section", "block" |
| chunk | A piece of text within the model's context window limit | "piece", "part" |
| protected | A segment that passes through untranslated (code blocks, HTML, rules) | "skipped", "ignored" |
| glossary | Domain-specific term overrides that override model defaults | "dictionary", "vocabulary" |
| fallback | Substitution of source text when translation fails | "default", "backup" |
| warning | A validation signal that translation may be wrong (echo, length, garbled) | "issue", "problem" |
| nav bar | Language switcher links injected at the top of translated READMEs | "header", "menu" |
| cache | Segment-level translation memory with 30-day TTL | "memory", "store" |

## Forbidden metaphors

- No "AI translation" language. Polyglot-mcp dispatches prompts to a model. It is not an AI translator.
- No "quality" promises. Polyglot-mcp validates output but does not guarantee quality. It catches empty, garbled, and echo — not subtle mistranslation.
- No "seamless" language. Translation is a lossy process. Some structures survive, some don't. Be explicit about what's protected and what's translated.
- No "automatic" language for things that require user judgment. Model selection, language choice, and glossary entries are user decisions, not automatic.

## Truth constraints

1. **Language count must be exact.** README says 57 languages. `languages.ts` must have 57 entries. If the count changes, both must update.
2. **Fallback behavior must be disclosed.** Wherever translation is described, state that empty output falls back to source text with a warning. Do not describe this as "graceful degradation."
3. **Network boundary must be stated.** All inference is localhost:11434. This must appear wherever the tool's security model is described.
4. **Warning-free output is not guaranteed correct.** Validation catches obvious failures. A clean translation with zero warnings may still be wrong. Do not imply that no-warnings means correct.

## Enforcement language bans

1. **No "guaranteed accuracy."** Model output is probabilistic. Polyglot-mcp cannot guarantee translation correctness.
2. **No "transparent" for the fallback.** Falling back to source text in target-language output is not transparent — it's a visible degradation that warnings must surface.
3. **No "smart" for the chunking.** Chunking splits at paragraph/sentence boundaries. It is rule-based, not smart.
4. **No "native quality."** The model produces model-quality output, not native-speaker quality.

## Contamination risks

- **"Translation service" drift.** The moment polyglot-mcp adds cloud fallback, external API support, or multi-provider dispatch, it has become a translation service instead of a local translation tool.
- **"Quality assurance" drift.** The moment polyglot-mcp adds human review flows, quality scoring, or translation memory merging, it has grown beyond its scope.
- **"File manager" drift.** The moment polyglot-mcp writes translated files directly (instead of returning content), it has taken ownership of file I/O it shouldn't own.
