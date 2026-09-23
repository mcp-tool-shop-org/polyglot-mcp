# polyglot-mcp: how it works

Mapped at 2026-09-23 from commit a91c112.

## What this is

7 parts. Work enters through 3 doors; the busiest is CI, which reaches 1 part.

## What changed since the last map

This is the first map.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push to main touching 9 paths; or by hand. Runs src/.
2. **Publish to npm.** When a release is published; or by hand. Runs src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs no file this map can see.

## What happens through CI

1. The workflow runs src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Publish to npm** runs src/ and publishes to npm.

**Deploy site to GitHub Pages** runs no file this map can see and deploys the site.

## What breaks what

- **src** is imported by 1 part (scripts) and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits.

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

People write .claude/, .github/, assets/ and the repository root. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → src/

Read those in order to follow one pull request end to end.

## What this map cannot see

- 4 writes and 6 reads use paths built at run time and are not named here.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 20 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
