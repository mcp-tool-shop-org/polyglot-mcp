# polyglot-mcp: how it works

Mapped at 2026-11-08 from commit 9fd9fe1 by Atlas 1.24.0.

## What this is

7 parts, mostly Markdown (83 files); code in TypeScript (50), JavaScript (5), CSS (2) and Astro (1). Work enters through 5 doors; CI, Deploy site to GitHub Pages, Publish to npm, @mcptoolshop/polyglot-mcp and polyglot-mcp each reach 1 part, and CI is followed because it comes first by name. It publishes to npm. It deploys a site to GitHub Pages. People run polyglot-mcp. People import @mcptoolshop/polyglot-mcp.

## What changed since 2026-11-08 (ef26f35)

Nothing structural changed since 2026-11-08; 7 files changed content.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 10 paths; or by hand. Runs src/cache.concurrency.test.ts, src/cache.test.ts, src/codeSpans.test.ts and 25 more; builds src/.
2. **Deploy site to GitHub Pages.** On a pull request to main touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Publish to npm.** When a release is published; or by hand. Runs src/cache.concurrency.test.ts, src/cache.test.ts, src/codeSpans.test.ts and 25 more; builds src/.
4. **@mcptoolshop/polyglot-mcp** (the package people import). Loads src/index.ts, src/cache.ts, src/codeSpans.ts and 13 more.
5. **polyglot-mcp** (a command people run). Runs src/index.ts.

## What happens through CI

1. The workflow runs 28 files in src; it builds src/ in src.
2. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push to main or by hand.

**Publish to npm** runs src/cache.concurrency.test.ts, src/cache.test.ts, src/codeSpans.test.ts and 25 more, builds src/, and publishes to npm.

**@mcptoolshop/polyglot-mcp** (the package people import) loads src/index.ts, src/cache.ts, src/codeSpans.ts and 13 more.

**polyglot-mcp** (a command people run) runs src/index.ts.

## What breaks what

- **src** is imported by 1 part (scripts) and sits on the path of 4 doors.

## What tends to change together

- **scripts/translate-readme.mjs** and **src/translateMarkdown.ts** changed together in 5 of 8 commits, and the scripts part imports the src part.
- **scripts/translate-all.mjs** and **scripts/translate-readme.mjs** changed together in 4 of 7 commits, inside the scripts part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **site** is imported by no test.

scripts is touched by tests only through a spawn: a test runs its files as a child process.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .claude/, .github/, assets/ and the repository root; 3 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/index.ts → src/translate.ts → src/languages.ts → src/ollama.ts → src/glossary.ts → src/codeSpans.ts → src/polish.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 3 writes and 11 reads use paths built at run time and are not named here.
- 6 writes and 13 reads go to a path their caller passes, not to this repository.
- 1 read goes to the directory the command is run in (LICENSE), not to this repository.
- 13 commands are built at run time and not followed, 11 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
