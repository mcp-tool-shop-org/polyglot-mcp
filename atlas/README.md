# polyglot-mcp: how it works

Mapped at 2026-09-30 from commit c3305f2 by Atlas 1.24.0.

## What this is

7 parts, mostly Markdown (71 files); code in TypeScript (39), JavaScript (4), CSS (2) and Astro (1). Work enters through 5 doors; CI, Deploy site to GitHub Pages, Publish to npm, @mcptoolshop/polyglot-mcp and polyglot-mcp each reach 1 part, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run polyglot-mcp. People import @mcptoolshop/polyglot-mcp.

## What changed since 2026-09-23 (a91c112)

- CI's pull request trigger now also names `codecov.yml`.
- CI's push trigger now also names `codecov.yml`.
- CI now also runs src/cache.concurrency.test.ts, src/cache.test.ts, src/codeSpans.test.ts and 18 more.
- And 4 more changes to doors.
- CHANGELOG.md is now read by src/version.test.ts.
- README.ja.md is now also read by src/translateAll.test.ts and src/translateReadme.test.ts.
- README.md is now also read by src/translateReadme.test.ts.
- And 6 more new writers and readers of places.
- 4 files added and 127 changed content, across 6 parts.

## What comes in

1. **CI.** On a pull request to main touching 10 paths; on a push to main touching 10 paths; or by hand. Runs src/cache.concurrency.test.ts, src/cache.test.ts, src/codeSpans.test.ts and 18 more; builds src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Publish to npm.** When a release is published; or by hand. Runs src/cache.concurrency.test.ts, src/cache.test.ts, src/codeSpans.test.ts and 18 more; builds src/.
4. **@mcptoolshop/polyglot-mcp** (the package people import). Loads src/index.ts, src/cache.ts, src/codeSpans.ts and 9 more.
5. **polyglot-mcp** (a command people run). Runs src/index.ts.

## What happens through CI

1. The workflow runs 21 files in src; it builds src/ in src.
2. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Publish to npm** runs src/cache.concurrency.test.ts, src/cache.test.ts, src/codeSpans.test.ts and 18 more, builds src/, and publishes to npm.

**@mcptoolshop/polyglot-mcp** (the package people import) loads src/index.ts, src/cache.ts, src/codeSpans.ts and 9 more.

**polyglot-mcp** (a command people run) runs src/index.ts.

## What breaks what

- **src** is imported by 1 part (scripts) and sits on the path of 4 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **scripts** is imported by no test.
- **site** is imported by no test.

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

- 3 writes and 5 reads use paths built at run time and are not named here.
- 5 writes and 6 reads go to a path their caller passes, not to this repository.
- 4 commands are built at run time and not followed, 2 of them in tests.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
