# Product Brief — @mcptoolshop/polyglot-mcp

## What this is

A local-GPU translation MCP server. 57 languages via TranslateGemma + Ollama, zero cloud dependency. Translates text, markdown (structure-preserving), and multi-language README sets with nav bar injection. Exposes 5 MCP tools. All inference runs on localhost:11434.

## Thesis

Translation should be local, fast, and structure-aware. Cloud translation APIs have rate limits, costs, and data-leaving-machine risks. Polyglot-mcp runs entirely on localhost, handles markdown segmentation natively, and produces deterministic output from the same model + input.

## Target user

- Repo maintainers who need README translations (the org rollout primary use case)
- Claude Code sessions that need inline translation without leaving the terminal
- Any MCP client that needs local, private, structured translation

## Core value

One MCP call translates a full markdown file, preserving code blocks, tables, HTML, and headings. Seven languages in parallel with nav bar injection. No API keys, no rate limits, no data leaving the machine.

## Non-goals

- Polyglot-mcp is not a general NLP tool. It translates text. No summarization, no analysis, no generation.
- Polyglot-mcp is not a cloud service. All inference is local GPU via Ollama.
- Polyglot-mcp is not a quality assurance system. It validates output (echo detection, length ratio, garbled text) but does not guarantee translation quality.
- Polyglot-mcp is not a file manager. It translates content; the caller writes files.

## Anti-thesis — what this product must never become

1. **A cloud translation proxy.** All inference must stay on localhost:11434. No external API calls, no fallback to cloud services, no "hybrid" mode.
2. **A tool that silently produces wrong-language output.** If translation fails, the fallback-to-source behavior must be visible via warnings. No silent substitution of source-language text into target-language output without disclosure.
3. **A tool that hides translation failures behind success status.** If a chunk fails, the response must include warnings. `isError: false` with embedded warnings is acceptable; `isError: false` with silent source-text substitution and no warnings is not.
4. **A tool with dynamic language discovery.** The 57 languages are the 57 languages. No runtime detection, no model-capability probing, no "whatever the model supports."
5. **A format-destroying translator.** Markdown structure (code blocks, tables, headings, HTML) must survive translation. If a segment type can't be safely translated, it must be passed through as protected, not mangled.
6. **A tool that writes outside the working directory.** Cache files live alongside source files. No home directory writes, no temp directory, no global state.
