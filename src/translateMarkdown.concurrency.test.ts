/**
 * Two languages translated at once against one cache file, as translate-all.mjs
 * does. Both must keep their cache entries, and `--cache-clear` for one must
 * not cost the other its cache.
 *
 * Before the fix, each run loaded the file at the start and overwrote it at the
 * end, so the run that finished last erased the other's entries. A cleared run
 * also erased every language, not just its own. This drives the real engine and
 * the real on-disk cache; only the Ollama batch layer is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("./translate.js", () => ({
  translateBatch: vi.fn(async (items: Array<{ text: string }>, _from: string, to: string) => ({
    translations: items.map((it) => `【${to}】${it.text}`),
    model: "mock",
    ollamaCalls: 1,
    durationMs: 0,
  })),
}));

import { translateMarkdown } from "./translateMarkdown.js";
import { translateBatch } from "./translate.js";

const README = ["# Guarantees", "", "Every step is hashed.", "", "Signed zero is canonicalized."].join("\n");

describe("translateMarkdown — languages sharing one cache file", () => {
  let dir: string;
  let options: { model: string; filePath: string };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-cache-"));
    options = { model: "translategemma:27b", filePath: join(dir, "README.md") };
    vi.mocked(translateBatch).mockClear();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Translate into both languages at once: both load before either saves. */
  const translateBoth = () =>
    Promise.all([translateMarkdown(README, "en", "ja", options), translateMarkdown(README, "en", "zh", options)]);

  it("keeps both languages' entries when they are translated at the same time", async () => {
    await translateBoth();
    vi.mocked(translateBatch).mockClear();

    const [ja, zh] = await translateBoth();
    expect(translateBatch).not.toHaveBeenCalled();
    expect(ja.cached).toBe(ja.segments);
    expect(zh.cached).toBe(zh.segments);
  });

  it("clears only the cleared language's entries", async () => {
    await translateBoth();
    vi.mocked(translateBatch).mockClear();

    const ja = await translateMarkdown(README, "en", "ja", { ...options, cacheClear: true });
    expect(ja.cached).toBe(0);
    vi.mocked(translateBatch).mockClear();

    const zh = await translateMarkdown(README, "en", "zh", options);
    expect(translateBatch).not.toHaveBeenCalled();
    expect(zh.cached).toBe(zh.segments);
  });
});
