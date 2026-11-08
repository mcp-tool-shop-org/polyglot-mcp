/**
 * The scripts end to end, against a scripted Ollama on a local port: a language
 * whose prose came back in English must not be reported "ok".
 *
 * translate-readme.mjs and translate-all.mjs run as the real processes (they
 * import dist/, so `npm run build` comes first, as for the other CLI tests).
 * The server translates by prefixing "[xx] " to each part; a part containing
 * zzechoalways is returned as the English however it is sent.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEP = "---POLYGLOT_SEP---";

const ECHOED = "The second paragraph says what a receipt records after a measured run zzechoalways";
const CLEAN = [
  "# Title",
  "",
  "The first paragraph explains how the router picks a device for every job.",
  "",
  "The third paragraph lists the limits the guard enforces before it starts.",
  "",
].join("\n");
const WITH_ECHO = [
  "# Title",
  "",
  "The first paragraph explains how the router picks a device for every job.",
  "",
  ECHOED,
  "",
  "The third paragraph lists the limits the guard enforces before it starts.",
  "",
].join("\n");

const STRUCTURED_README = [
  "# Title",
  "",
  "The first paragraph explains how the router picks a device for every job.",
  "",
  "## Installation",
  "",
  "```bash",
  "npm install -g @mcptoolshop/polyglot-mcp",
  "polyglot-mcp --help",
  "```",
  "",
  "The third paragraph lists the limits the guard enforces before it starts.",
  "",
].join("\n");

const VALID_TRANSLATED = (label: string) =>
  [
    `# [${label}] Title`,
    "",
    `[${label}] The first paragraph explains how the router picks a device for every job.`,
    "",
    `## [${label}] Installation`,
    "",
    "```bash",
    "npm install -g @mcptoolshop/polyglot-mcp",
    "polyglot-mcp --help",
    "```",
    "",
    `[${label}] The third paragraph lists the limits the guard enforces before it starts.`,
    "",
  ].join("\n");

let server: Server;
let host = "";

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
      const lang = /translator\.[^]*? into ([A-Za-z ()]+):/.exec(prompt)?.[1] ?? "xx";
      const text = prompt.split("\n\n\n").slice(1).join("\n\n\n");
      const one = (part: string) => {
        if (part.includes("zzechoalways")) return part;
        const headingMatch = /^(#{1,6}\s+)(.*)$/.exec(part);
        if (headingMatch) return `${headingMatch[1]}[${lang}] ${headingMatch[2]}`;
        return `[${lang}] ${part}`;
      };
      const response = text.includes(SEP)
        ? text.split(/\n?---POLYGLOT_SEP---\n?/).map(one).join(`\n${SEP}\n`)
        : one(text);
      res.end(JSON.stringify({ model: "translategemma:27b", response, done: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function run(script: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(root, "scripts", script), ...args], {
      cwd,
      env: { ...process.env, OLLAMA_HOST: host, POLYGLOT_MODEL: "translategemma:27b" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    child.on("close", (code) => done({ code, stdout, stderr }));
  });
}

describe("translate-readme.mjs and translate-all.mjs — prose left in English", () => {
  let dir: string;
  let readme: string;
  const setup = (md: string) => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-cli-"));
    readme = join(dir, "README.md");
    writeFileSync(readme, md, "utf-8");
  };
  const cleanup = () => rmSync(dir, { recursive: true, force: true });

  it("a clean language exits 0 and lists nothing untranslated", async () => {
    setup(CLEAN);
    try {
      const r = await run("translate-readme.mjs", [readme, "es", "--no-cache"], dir);
      expect(r.code).toBe(0);
      expect(r.stdout).not.toContain("POLYGLOT_UNTRANSLATED");
    } finally {
      cleanup();
    }
  }, 60_000);

  it("a segment still English after its retry exits 3 by default, after writing the file", async () => {
    setup(WITH_ECHO);
    try {
      const r = await run("translate-readme.mjs", [readme, "es", "--no-cache"], dir);
      expect(r.code).toBe(3);
      expect(readFileSync(join(dir, "README.es.md"), "utf-8")).toContain(ECHOED);
      const line = r.stdout.split("\n").find((l) => l.startsWith("POLYGLOT_UNTRANSLATED "))!;
      const items = JSON.parse(line.slice("POLYGLOT_UNTRANSLATED ".length));
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ lang: "es", retried: true });
      expect(r.stdout).toContain("POLYGLOT_FALLBACKS ");
      expect(r.stderr).toContain("came back in English");
      expect(r.stderr).toContain("--on-untranslated=report");
    } finally {
      cleanup();
    }
  }, 60_000);

  it("--on-untranslated=report writes the file, lists the line and exits 0", async () => {
    setup(WITH_ECHO);
    try {
      const r = await run("translate-readme.mjs", [readme, "es", "--no-cache", "--on-untranslated=report"], dir);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("POLYGLOT_UNTRANSLATED ");
    } finally {
      cleanup();
    }
  }, 60_000);

  it("an invalid policy is a CONFIG_ERROR before any work", async () => {
    setup(CLEAN);
    try {
      const r = await run("translate-readme.mjs", [readme, "es", "--on-untranslated=sometimes"], dir);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("--on-untranslated=fail");
    } finally {
      cleanup();
    }
  }, 60_000);

  it("translate-all marks the language untranslated instead of ok, and exits 1", async () => {
    setup(WITH_ECHO);
    try {
      const r = await run("translate-all.mjs", [readme, "--no-cache", "--no-nav-bar", "--concurrency=3"], dir);
      expect(r.code).toBe(1);
      const summary = JSON.parse(r.stdout.slice(r.stdout.indexOf('{\n  "polyglot"')).split("\n====")[0]);
      expect(summary.onUntranslated).toBe("fail");
      expect(summary.results).toHaveLength(7);
      expect(summary.results.every((x: { status: string }) => x.status === "untranslated")).toBe(true);
      expect(summary.untranslated).toHaveLength(7);
      // A language that wrote its file but is not clean is not a success.
      expect(summary.succeeded).toBe(0);
      expect(summary.untranslatedLanguages).toBe(7);
      expect(summary.error.code ?? summary.error.error?.code ?? JSON.stringify(summary.error)).toContain("UNTRANSLATED");
      expect(r.stderr).toContain("prose line(s) came back in English");
    } finally {
      cleanup();
    }
  }, 120_000);

  it("translate-all --on-untranslated=report lists them and exits 0", async () => {
    setup(WITH_ECHO);
    try {
      const r = await run(
        "translate-all.mjs",
        [readme, "--no-cache", "--no-nav-bar", "--concurrency=3", "--on-untranslated=report"],
        dir,
      );
      expect(r.code).toBe(0);
      expect(r.stderr).toContain("prose line(s) came back in English");
    } finally {
      cleanup();
    }
  }, 120_000);

  it("translate-all on a clean README reports every language ok", async () => {
    setup(CLEAN);
    try {
      const r = await run("translate-all.mjs", [readme, "--no-cache", "--no-nav-bar", "--concurrency=3"], dir);
      expect(r.code).toBe(0);
      const summary = JSON.parse(r.stdout.slice(r.stdout.indexOf('{\n  "polyglot"')).split("\n====")[0]);
      expect(summary.results.every((x: { status: string }) => x.status === "ok")).toBe(true);
      expect(summary.untranslated).toEqual([]);
    } finally {
      cleanup();
    }
  }, 120_000);
});

describe("translate-all.mjs — verified written files nav bar (polyglot-mcp#65)", () => {
  let dir: string;
  let readme: string;
  let fakeBinDir: string;

  const setupWithFakeChildren = (md: string, behaviors: Record<string, string> = {}) => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-nav65-"));
    readme = join(dir, "README.md");
    writeFileSync(readme, md, "utf-8");

    fakeBinDir = join(dir, "fake-bin");
    mkdirSync(fakeBinDir, { recursive: true });

    const driverPath = join(fakeBinDir, "driver.mjs");
    const preloadPath = join(fakeBinDir, "fast-timer-preload.mjs");
    const wrapperPath = join(fakeBinDir, "node");

    writeFileSync(
      preloadPath,
      [
        "const origSetTimeout = globalThis.setTimeout;",
        "globalThis.setTimeout = function (fn, delay, ...args) {",
        "  const capped = typeof delay === 'number' && delay >= 300_000 ? 400 : delay;",
        "  return origSetTimeout.call(this, fn, capped, ...args);",
        "};",
      ].join("\n"),
      "utf-8",
    );

    writeFileSync(
      driverPath,
      [
        'import { writeFileSync } from "node:fs";',
        'import { spawn } from "node:child_process";',
        'const behaviors = JSON.parse(process.env.FAKE_LANG_BEHAVIORS || "{}");',
        "const realNode = process.env.REAL_NODE_BIN;",
        "const args = process.argv.slice(2);",
        "const readmeArg = args[1];",
        "const langCode = args[2];",
        "const mode = behaviors[langCode];",
        'const outPath = readmeArg ? readmeArg.replace(/README\\.md$/, "README." + langCode + ".md") : "";',
        "const validMd = (l) => [",
        '  "# [" + l + "] Title",',
        '  "",',
        '  "[" + l + "] The first paragraph explains how the router picks a device for every job.",',
        '  "",',
        '  "## [" + l + "] Installation",',
        '  "",',
        '  "```bash",',
        '  "npm install -g @mcptoolshop/polyglot-mcp",',
        '  "polyglot-mcp --help",',
        '  "```",',
        '  "",',
        '  "[" + l + "] The third paragraph lists the limits the guard enforces before it starts.",',
        '  "",',
        '].join("\\n");',
        'if (mode === "write-complete-then-error") {',
        '  writeFileSync(outPath, validMd(langCode), "utf-8");',
        "  process.exit(1);",
        '} else if (mode === "write-complete-then-timeout") {',
        '  writeFileSync(outPath, validMd(langCode), "utf-8");',
        "  setTimeout(() => {}, 60_000);",
        '} else if (mode === "write-missing-heading-then-error") {',
        '  const truncated = validMd(langCode).replace("## [" + langCode + "] Installation\\n\\n", "");',
        '  writeFileSync(outPath, truncated, "utf-8");',
        "  process.exit(1);",
        '} else if (mode === "write-missing-codeblock-then-error") {',
        '  const truncated = validMd(langCode).replace(/```bash[\\s\\S]*?```\\n\\n/, "");',
        '  writeFileSync(outPath, truncated, "utf-8");',
        "  process.exit(1);",
        '} else if (mode === "error-without-writing") {',
        "  process.exit(1);",
        '} else if (mode === "timeout-without-writing") {',
        "  setTimeout(() => {}, 60_000);",
        "} else {",
        '  const child = spawn(realNode, args, { stdio: "inherit", env: { ...process.env, NODE_OPTIONS: "" } });',
        '  child.on("exit", (c) => process.exit(c ?? 1));',
        "}",
      ].join("\n"),
      "utf-8",
    );

    writeFileSync(
      wrapperPath,
      ["#!/usr/bin/env bash", `exec "${process.execPath}" "${driverPath}" "$@"`].join("\n"),
      "utf-8",
    );
    chmodSync(wrapperPath, 0o755);

    return { preloadPath, behaviorsJson: JSON.stringify(behaviors) };
  };

  const cleanup = () => rmSync(dir, { recursive: true, force: true });

  const runTranslateAll = (
    extraArgs: string[],
    opts: { preloadPath: string; behaviorsJson: string; useFastTimerPreload?: boolean },
  ): Promise<{ code: number | null; stdout: string; stderr: string }> => {
    return new Promise((done) => {
      const nodeOptions = opts.useFastTimerPreload ? `--import ${opts.preloadPath}` : "";
      const child = spawn(process.execPath, [join(root, "scripts", "translate-all.mjs"), readme, ...extraArgs], {
        cwd: dir,
        env: {
          ...process.env,
          PATH: `${fakeBinDir}:${process.env.PATH}`,
          REAL_NODE_BIN: process.execPath,
          FAKE_LANG_BEHAVIORS: opts.behaviorsJson,
          NODE_OPTIONS: nodeOptions,
          OLLAMA_HOST: host,
          POLYGLOT_MODEL: "translategemma:27b",
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
      child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
      child.on("close", (code) => done({ code, stdout, stderr }));
    });
  };

  const parseSummary = (stdout: string) =>
    JSON.parse(stdout.slice(stdout.indexOf('{\n  "polyglot"')).split("\n====")[0]);

  it("(a) a fake child that writes its file completely and then errors or times out is included in the nav bar with status written-after-error", async () => {
    const opts = setupWithFakeChildren(STRUCTURED_README, {
      ja: "write-complete-then-error",
      pt: "write-complete-then-timeout",
    });
    try {
      const r = await runTranslateAll(["--no-cache", "--concurrency=3", "--timeout=1"], {
        ...opts,
        useFastTimerPreload: true,
      });
      expect(r.code).toBe(1);
      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter).toContain('<a href="README.ja.md">日本語</a>');
      expect(srcAfter).toContain('<a href="README.pt-BR.md">Português (BR)</a>');

      const summary = parseSummary(r.stdout);
      const ja = summary.results.find((x: { lang: string }) => x.lang === "ja");
      const pt = summary.results.find((x: { lang: string }) => x.lang === "pt");
      expect(ja.status).toBe("written-after-error");
      expect(pt.status).toBe("written-after-error");

      const jaAfter = readFileSync(join(dir, "README.ja.md"), "utf-8");
      expect(jaAfter).toContain('<a href="README.md">English</a>');
      expect(jaAfter).toContain('<a href="README.pt-BR.md">Português (BR)</a>');
    } finally {
      cleanup();
    }
  }, 60_000);

  it("(b) a fake child that writes a truncated file (missing heading or code block) and then errors is excluded, reported as written-unverified, and named in the summary", async () => {
    const opts = setupWithFakeChildren(STRUCTURED_README, {
      ja: "write-missing-heading-then-error",
      zh: "write-missing-codeblock-then-error",
    });
    try {
      const r = await runTranslateAll(["--no-cache", "--concurrency=3"], opts);
      expect(r.code).toBe(1);
      const summary = parseSummary(r.stdout);
      const ja = summary.results.find((x: { lang: string }) => x.lang === "ja");
      const zh = summary.results.find((x: { lang: string }) => x.lang === "zh");
      expect(ja.status).toBe("written-unverified");
      expect(ja.failedChecks.join("; ")).toMatch(/heading_count_mismatch/);
      expect(zh.status).toBe("written-unverified");
      expect(zh.failedChecks.join("; ")).toMatch(/code_block_count_mismatch/);

      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter).not.toContain("README.ja.md");
      expect(srcAfter).not.toContain("README.zh.md");
      expect(srcAfter).toContain('<a href="README.es.md">Español</a>');

      expect(summary.writtenUnverified).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ lang: "ja", file: "README.ja.md" }),
          expect.objectContaining({ lang: "zh", file: "README.zh.md" }),
        ]),
      );
      expect(r.stderr).toContain("written-unverified");
      expect(r.stderr).toContain("ja");
      expect(r.stderr).toContain("zh");
    } finally {
      cleanup();
    }
  }, 60_000);

  it("(c) a stale README.<lang>.md from before the run is not counted", async () => {
    const opts = setupWithFakeChildren(STRUCTURED_README, {
      ja: "error-without-writing",
    });
    const stalePath = join(dir, "README.ja.md");
    writeFileSync(stalePath, VALID_TRANSLATED("Japanese"), "utf-8");
    const past = new Date(Date.now() - 60_000);
    utimesSync(stalePath, past, past);
    try {
      const r = await runTranslateAll(["--no-cache", "--concurrency=3"], opts);
      expect(r.code).toBe(1);
      const summary = parseSummary(r.stdout);
      const ja = summary.results.find((x: { lang: string }) => x.lang === "ja");
      expect(ja.status).toBe("written-unverified");
      expect(ja.failedChecks.join("; ")).toMatch(/stale_file/);

      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter).not.toContain("README.ja.md");
      expect(srcAfter).toContain('<a href="README.es.md">Español</a>');
    } finally {
      cleanup();
    }
  }, 60_000);

  it("(d) the happy path is unchanged: 7 languages, all ok, same nav bar as before", async () => {
    const opts = setupWithFakeChildren(STRUCTURED_README, {});
    try {
      const r = await runTranslateAll(["--no-cache", "--concurrency=3"], opts);
      expect(r.code).toBe(0);
      const summary = parseSummary(r.stdout);
      expect(summary.results).toHaveLength(7);
      expect(summary.results.every((x: { status: string }) => x.status === "ok")).toBe(true);
      expect(summary.succeeded).toBe(7);
      expect(summary.failed).toBe(0);

      const expectedSourceNav = [
        '<p align="center">',
        '  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>',
        "</p>",
      ].join("\n");
      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter.startsWith(expectedSourceNav)).toBe(true);
    } finally {
      cleanup();
    }
  }, 60_000);

  it("(e) the timeout message matches the configured value", async () => {
    const opts = setupWithFakeChildren(STRUCTURED_README, {
      ja: "timeout-without-writing",
    });
    try {
      // Default configured timeout (900_000 ms = 900s)
      const rDefault = await runTranslateAll(["--no-cache", "--concurrency=3"], {
        ...opts,
        useFastTimerPreload: true,
      });
      expect(rDefault.code).toBe(1);
      const summaryDefault = parseSummary(rDefault.stdout);
      const jaDefault = summaryDefault.results.find((x: { lang: string }) => x.lang === "ja");
      expect(jaDefault.status).toBe("error");
      expect(jaDefault.error).toBe("timeout (900s)");
      expect(rDefault.stderr).toContain("timeout (900s)");
      expect(rDefault.stderr).not.toContain("timeout (300s)");

      // Explicit --timeout=1 (1s)
      const rCustom = await runTranslateAll(["--no-cache", "--concurrency=3", "--timeout=1"], {
        ...opts,
        useFastTimerPreload: true,
      });
      expect(rCustom.code).toBe(1);
      const summaryCustom = parseSummary(rCustom.stdout);
      const jaCustom = summaryCustom.results.find((x: { lang: string }) => x.lang === "ja");
      expect(jaCustom.status).toBe("error");
      expect(jaCustom.error).toBe("timeout (1s)");
      expect(rCustom.stderr).toContain("timeout (1s)");
    } finally {
      cleanup();
    }
  }, 60_000);
});
