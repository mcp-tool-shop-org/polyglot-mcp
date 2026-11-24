/**
 * Tests for dense inline code-span prose lines (fixture from
 * mcp-tool-shop-org/ai-rpg-engine README.md lines 42-92 at commit d53d90ea).
 *
 * Uses a deterministic fake Ollama model (no GPU, no Ollama process):
 * - Reproduces the production failure mode: when a single model call carries
 *   >= 4 placeholders, the model drops (es), merges (pt), or reorders/renumbers
 *   (ja) placeholders.
 * - Also tests span-alteration safety (wrapping a placeholder in backticks,
 *   injecting an extra code span, or swapping two code-span placeholders) and
 *   the scripts/translate-readme.mjs `pt-BR` alias.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const FIXTURE_PATH = join(__dirname, "fixtures", "dense-code-spans", "ai-rpg-engine.README.d53d90ea.md");
const SEP = "---POLYGLOT_SEP---";
const PLACEHOLDER_RE = /⟦[^⟦⟧\d]*(\d+)(?:[^⟦⟧\d][^⟦⟧]*)?⟧/g;

const mockState = vi.hoisted(() => ({
  calls: [] as Array<{ lang: string; batch: boolean; text: string }>,
}));

function detectTargetLang(prompt: string): string {
  const m = /translator\.[^]*? into ([A-Za-z ()]+):/.exec(prompt);
  const name = m?.[1]?.trim().toLowerCase() ?? "spanish";
  if (name.startsWith("japanese")) return "ja";
  if (name.startsWith("portuguese")) return "pt";
  if (name.startsWith("spanish")) return "es";
  return name;
}

function fakeModelTranslatePart(part: string, lang: string): string {
  if (part.includes("zzechoalways")) {
    return part;
  }
  // Explicit safety test markers (independent of placeholder density).
  if (part.includes("zzalterbacktick")) {
    return `[${lang}] ${part.replace(/⟦0⟧/, "`⟦0⟧`")}`;
  }
  if (part.includes("zzalterextra")) {
    return `[${lang}] ${part} \`extra-span\``;
  }
  if (part.includes("zzswapspans")) {
    return `[${lang}] ${part.replace("⟦0⟧", "⟦__SWAP__⟧").replace("⟦1⟧", "⟦0⟧").replace("⟦__SWAP__⟧", "⟦1⟧")}`;
  }

  // Dense-placeholder failure reproduction: models drop, merge, or renumber/reorder
  // placeholders when >= 4 appear in a single segment/call (or >= 2 with zzdroptwoplus).
  const placeholders = [...part.matchAll(PLACEHOLDER_RE)];
  if (placeholders.length >= 4 || (part.includes("zzdroptwoplus") && placeholders.length >= 2)) {
    if (lang === "es") {
      // Drop the last placeholder.
      const last = placeholders[placeholders.length - 1]!;
      const broken = part.slice(0, last.index!) + part.slice(last.index! + last[0].length);
      return `[es] ${broken}`;
    }
    if (lang === "pt") {
      // Merge the first two placeholders into "⟦0-1⟧".
      const first = placeholders[0]!;
      const second = placeholders[1]!;
      const broken =
        part.slice(0, first.index!) +
        `⟦${first[1]}-${second[1]}⟧` +
        part.slice(first.index! + first[0].length, second.index!) +
        part.slice(second.index! + second[0].length);
      return `[pt] ${broken}`;
    }
    if (lang === "ja") {
      // Renumber placeholders (+1) and swap the first two, losing index 0.
      const renumbered = part.replace(PLACEHOLDER_RE, (_m, n: string) => {
        const idx = Number(n);
        if (idx === 0) return "⟦2⟧";
        if (idx === 1) return "⟦1⟧";
        return `⟦${idx + 1}⟧`;
      });
      return `[ja] ${renumbered}`;
    }
  }

  const tag = lang === "ja" ? "【ja】" : `[${lang}] `;
  const tagged = part
    .split("\n")
    .map((line) => {
      const bullet = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(line);
      const body = bullet ? bullet[2]! : line;
      const prefix = bullet ? bullet[1]! : "";
      const sentTagged = body.replace(/([.!?]) (?=\S)/g, `$1 ${tag}`);
      return `${prefix}${tag}${sentTagged}`;
    })
    .join("\n");
  return tagged;
}

function fakeModelResponse(prompt: string): string {
  const lang = detectTargetLang(prompt);
  const text = prompt.split("\n\n\n").slice(1).join("\n\n\n");
  const isBatch = text.includes(SEP);
  mockState.calls.push({ lang, batch: isBatch, text });
  if (isBatch) {
    return text
      .split(/\n?---POLYGLOT_SEP---\n?/)
      .map((part) => fakeModelTranslatePart(part, lang))
      .join(`\n${SEP}\n`);
  }
  return fakeModelTranslatePart(text, lang);
}

vi.mock("./ollama.js", () => {
  const MockOllamaClient = vi.fn().mockImplementation(function () {
    return {
      ensureRunning: vi.fn().mockResolvedValue(true),
      ensureModel: vi.fn().mockResolvedValue(true),
      generate: vi.fn(async (req: { prompt: string }) => ({
        model: "fake-dense-model",
        response: fakeModelResponse(req.prompt),
        done: true,
      })),
      generateStream: vi.fn(),
    };
  });
  return { OllamaClient: MockOllamaClient };
});

import { translateMarkdown, splitSpanBounded, unusableReason } from "./translateMarkdown.js";
import { survivingProse } from "./survival.js";

function extractInlineCodeSpans(md: string): string[] {
  return md.match(/`[^`\n]+`/g) ?? [];
}

describe("dense inline code-span lines — ai-rpg-engine README fixture", () => {
  const fixtureRaw = readFileSync(FIXTURE_PATH, "utf-8");
  const savedNumCtx = process.env.POLYGLOT_NUM_CTX;

  beforeEach(() => {
    mockState.calls.length = 0;
  });

  afterEach(() => {
    if (savedNumCtx === undefined) delete process.env.POLYGLOT_NUM_CTX;
    else process.env.POLYGLOT_NUM_CTX = savedNumCtx;
  });

  it.each(["es", "ja", "pt"] as const)(
    "translates every line of the fixture in %s under 16k context with all code spans byte-equal in order",
    async (lang) => {
      process.env.POLYGLOT_NUM_CTX = "16384";
      const result = await translateMarkdown(fixtureRaw, "en", lang, { cache: false });

      expect(result.lostSpans).toEqual([]);
      expect(result.untranslated).toEqual([]);
      const fixtureBody = fixtureRaw.split("\n").slice(2).join("\n");
      expect(survivingProse(fixtureBody, result.markdown)).toEqual([]);

      // Compare multiset and order of inline code spans across the whole fixture and per line.
      expect(extractInlineCodeSpans(result.markdown)).toEqual(extractInlineCodeSpans(fixtureRaw));

      const srcLines = fixtureRaw.trimEnd().split("\n");
      const outLines = result.markdown.trimEnd().split("\n");
      expect(outLines).toHaveLength(srcLines.length);
      for (let i = 0; i < srcLines.length; i++) {
        const srcLine = srcLines[i]!;
        const outLine = outLines[i]!;
        if (srcLine.trim() === "" || srcLine.startsWith("<!--")) {
          expect(outLine).toBe(srcLine);
          continue;
        }
        expect(outLine, `line ${i + 1} remained English`).not.toBe(srcLine);
        expect(extractInlineCodeSpans(outLine), `code spans altered on line ${i + 1}`).toEqual(
          extractInlineCodeSpans(srcLine),
        );
      }
    },
    30_000,
  );

  it("translates the full 51-line fixture in es even under the default 8192 context window", async () => {
    delete process.env.POLYGLOT_NUM_CTX;
    const result = await translateMarkdown(fixtureRaw, "en", "es", { cache: false });

    expect(result.lostSpans).toEqual([]);
    expect(result.untranslated).toEqual([]);
    expect(extractInlineCodeSpans(result.markdown)).toEqual(extractInlineCodeSpans(fixtureRaw));
  }, 30_000);

  it("keeps an altered-span line in English, reports it, and preserves sibling dense lines", async () => {
    process.env.POLYGLOT_NUM_CTX = "16384";
    const srcLines = fixtureRaw.trimEnd().split("\n");
    const sampleFixture = srcLines.slice(0, 8).join("\n");
    const badBacktick = "- Altered backtick check with `alpha_cmd` zzalterbacktick and enough prose words to report.";
    const badExtra = "- Altered extra-span check with `beta_cmd` zzalterextra and enough prose words to report.";
    const badSwap = "- Altered swap check with `first_cmd` and `second_cmd` zzswapspans and enough prose words to report.";
    const doc = [sampleFixture, badBacktick, badExtra, badSwap].join("\n");

    const result = await translateMarkdown(doc, "en", "es", { cache: false });

    // Every altered line stayed verbatim English — never shipped a doubled backtick, extra span, or swapped span.
    expect(result.markdown).toContain(badBacktick);
    expect(result.markdown).toContain(badExtra);
    expect(result.markdown).toContain(badSwap);
    expect(result.markdown).not.toContain("``alpha_cmd``");
    expect(result.markdown).not.toContain("`extra-span`");

    // All inline code spans across the whole document match the source multiset and order.
    expect(extractInlineCodeSpans(result.markdown)).toEqual(extractInlineCodeSpans(doc));

    // All 3 altered lines are reported as untranslated with fallback/warning details.
    expect(result.untranslated).toHaveLength(3);
    expect(result.warnings.join("\n")).toMatch(/placeholders did not survive/);
    expect(result.fallbacks).toHaveLength(1);
    expect(result.fallbacks[0]).toMatchObject({ retried: true, recovered: false });

    // Sibling dense bullets in the same list still translated cleanly.
    const outLines = result.markdown.split("\n");
    expect(outLines[3]).not.toBe(srcLines[3]);
    expect(outLines[4]).not.toBe(srcLines[4]);
  }, 30_000);

  it("subdivides failed <=3-span clauses down to <=1 span and checks splitSpanBounded atomic boundaries", async () => {
    const md = "Run `cmd_one` zzdroptwoplus `cmd_two`, `cmd_three`, and `cmd_four` in one dense sentence today.";
    const result = await translateMarkdown(md, "en", "es", { cache: false });

    expect(result.untranslated).toEqual([]);
    expect(extractInlineCodeSpans(result.markdown)).toEqual([
      "`cmd_one`",
      "`cmd_two`",
      "`cmd_three`",
      "`cmd_four`",
    ]);
    expect(result.fallbacks[0]?.reason).toContain("translated span by span");

    // Atomic boundaries: HTML tags, link boxes, and adjacent placeholders without spaces.
    const htmlParts = splitSpanBounded("Use <kbd>⟦0⟧</kbd> with ⟦1⟧ and ⟦2⟧.", 1);
    expect(htmlParts.map((p) => p.piece + p.sep).join("")).toBe("Use <kbd>⟦0⟧</kbd> with ⟦1⟧ and ⟦2⟧.");
    expect(htmlParts.some((p) => p.piece.includes("<kbd>⟦0⟧</kbd>"))).toBe(true);

    expect(splitSpanBounded("[⟦0⟧](⟦1⟧).", 1)).toEqual([{ piece: "[⟦0⟧](⟦1⟧).", sep: "" }]);
    expect(splitSpanBounded("[⟦0⟧](⟦1⟧) and ⟦2⟧.", 1).map((p) => p.piece + p.sep).join("")).toBe(
      "[⟦0⟧](⟦1⟧) and ⟦2⟧.",
    );
    expect(splitSpanBounded("Run ⟦0⟧⟦1⟧.", 1).map((p) => p.piece + p.sep).join("")).toBe("Run ⟦0⟧⟦1⟧.");

    // Unmasked text (spans = []) still rejects altered code spans.
    expect(unusableReason("Footnote ⟦1⟧ and `run`.", [], "Nota ⟦1⟧ y `correr`.", false)).toBe("placeholders");

    // Linear-time guard against unclosed "<A" and long whitespace runs.
    const hostile = "⟦0⟧ " + "<A".repeat(25_000) + " " + " ".repeat(25_000) + " ⟦1⟧; ⟦2⟧ — ⟦3⟧";
    const t0 = Date.now();
    const hostileParts = splitSpanBounded(hostile, 1);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(hostileParts.map((p) => p.piece + p.sep).join("")).toBe(hostile);
  }, 30_000);

  it("does not split an echoed single sentence across protected terms in span by span", async () => {
    const echoed = "The model Kimi-K3 uses DepositAuth today zzechoalways";
    const result = await translateMarkdown(echoed, "en", "es", { cache: false });

    expect(result.retries).toBe(1);
    expect(result.untranslated).toHaveLength(1);
    expect(result.markdown).toBe(echoed);
  }, 30_000);
});

describe("scripts/translate-readme.mjs — pt-BR alias", () => {
  let server: Server;
  let host = "";
  const sockets = new Set<Socket>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString("utf8")));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (req.url === "/api/tags") {
          res.end(JSON.stringify({ models: [{ name: "translategemma:27b", size: 1, digest: "x", modified_at: "" }] }));
          return;
        }
        const prompt = (JSON.parse(body || "{}") as { prompt?: string }).prompt ?? "";
        res.end(JSON.stringify({ model: "translategemma:27b", response: fakeModelResponse(prompt), done: true }));
      });
    });
    server.on("connection", (sock) => {
      sockets.add(sock);
      sock.on("close", () => sockets.delete(sock));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function runCli(args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(repoRoot, "scripts", "translate-readme.mjs"), ...args], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, OLLAMA_HOST: host, POLYGLOT_MODEL: "translategemma:27b" },
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`CLI timed out: ${args.join(" ")}`));
      }, 20_000);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
      child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  }

  it("accepts pt-BR as an alias of pt, writes README.pt-BR.md, and shares cache with pt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polyglot-ptbr-"));
    try {
      const readme = join(dir, "README.md");
      const md = [
        "# Sample Project",
        "",
        "Run `npm test` with `--watch`, `--coverage`, `--reporter`, and `--bail` to verify every module cleanly.",
        "",
      ].join("\n");
      writeFileSync(readme, md, "utf-8");

      const helpRes = await runCli(["--help"], dir);
      expect(helpRes.code).toBe(0);
      expect(helpRes.stdout).toContain("pt-BR");

      const ptBrRes = await runCli([readme, "pt-BR"], dir);
      expect(ptBrRes.code, ptBrRes.stderr).toBe(0);

      const ptBrPath = join(dir, "README.pt-BR.md");
      const ptBrBytes = readFileSync(ptBrPath);
      const ptBrSha = createHash("sha256").update(ptBrBytes).digest("hex");
      expect(ptBrRes.stdout).toContain(`POLYGLOT_WRITTEN README.pt-BR.md ${ptBrSha}`);

      const ptBrText = ptBrBytes.toString("utf-8");
      expect(ptBrText).toContain("[pt]");
      expect(extractInlineCodeSpans(ptBrText)).toEqual(extractInlineCodeSpans(md));

      // Cache entries created via pt-BR are keyed under canonical "pt", so pt hits cache.
      const ptRes = await runCli([readme, "pt"], dir);
      expect(ptRes.code, ptRes.stderr).toBe(0);
      expect(ptRes.stdout).toContain("0 Ollama call(s)");
      expect(readFileSync(join(dir, "README.pt.md"), "utf-8")).toBe(ptBrText);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
