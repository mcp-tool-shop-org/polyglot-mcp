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
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

    const preloadPath = join(fakeBinDir, "fast-timer-preload.mjs");

    writeFileSync(
      preloadPath,
      [
        'import { createHash } from "node:crypto";',
        'import { writeFileSync } from "node:fs";',
        'import { basename } from "node:path";',
        "",
        "const entryScript = process.argv[1] || '';",
        "if (entryScript.endsWith('translate-all.mjs') && process.env.FAKE_FAST_TIMERS === '1') {",
        "  const origSetTimeout = globalThis.setTimeout;",
        "  globalThis.setTimeout = function (fn, delay, ...args) {",
        "    const capped = typeof delay === 'number' && delay >= 300_000 ? 400 : delay;",
        "    return origSetTimeout.call(this, fn, capped, ...args);",
        "  };",
        "} else if (entryScript.endsWith('translate-readme.mjs')) {",
        '  const behaviors = JSON.parse(process.env.FAKE_LANG_BEHAVIORS || "{}");',
        "  const readmeArg = process.argv[2];",
        "  const langCode = process.argv[3];",
        "  const mode = behaviors[langCode];",
        "  if (mode) {",
        '    const outPath = readmeArg ? readmeArg.replace(/README\\.md$/, "README." + langCode + ".md") : "";',
        "    const validMd = (l) => [",
        '      "# [" + l + "] Title",',
        '      "",',
        '      "[" + l + "] The first paragraph explains how the router picks a device for every job.",',
        '      "",',
        '      "## [" + l + "] Installation",',
        '      "",',
        '      "```bash",',
        '      "npm install -g @mcptoolshop/polyglot-mcp",',
        '      "polyglot-mcp --help",',
        '      "```",',
        '      "",',
        '      "[" + l + "] The third paragraph lists the limits the guard enforces before it starts.",',
        '      "",',
        '    ].join("\\n");',
        "    const writeWithReceipt = (content, customSha) => {",
        '      const bytes = Buffer.from(content, "utf-8");',
        "      writeFileSync(outPath, bytes);",
        '      const sha = customSha ?? createHash("sha256").update(bytes).digest("hex");',
        '      console.log("POLYGLOT_WRITTEN " + basename(outPath) + " " + sha);',
        "    };",
        '    if (mode === "write-complete-then-error") {',
        "      writeWithReceipt(validMd(langCode));",
        "      process.exit(1);",
        '    } else if (mode === "write-complete-then-timeout") {',
        "      writeWithReceipt(validMd(langCode));",
        "      await new Promise((r) => setTimeout(r, 60_000));",
        '    } else if (mode === "write-missing-heading-then-error") {',
        '      const truncated = validMd(langCode).replace("## [" + langCode + "] Installation\\n\\n", "");',
        "      writeWithReceipt(truncated);",
        "      process.exit(1);",
        '    } else if (mode === "write-missing-codeblock-then-error") {',
        '      const truncated = validMd(langCode).replace(/```bash[\\s\\S]*?```\\n\\n/, "");',
        "      writeWithReceipt(truncated);",
        "      process.exit(1);",
        '    } else if (mode === "write-bad-receipt-sha") {',
        '      writeWithReceipt(validMd(langCode), "0".repeat(64));',
        "      process.exit(0);",
        '    } else if (mode === "error-without-writing") {',
        "      process.exit(1);",
        '    } else if (mode === "timeout-without-writing") {',
        "      await new Promise((r) => setTimeout(r, 60_000));",
        "    }",
        "  }",
        "}",
      ].join("\n"),
      "utf-8",
    );

    return { preloadPath, behaviorsJson: JSON.stringify(behaviors) };
  };

  const cleanup = () => rmSync(dir, { recursive: true, force: true });

  const runTranslateAll = (
    extraArgs: string[],
    opts: {
      preloadPath: string;
      behaviorsJson: string;
      useFastTimerPreload?: boolean;
      extraEnv?: Record<string, string>;
    },
  ): Promise<{ code: number | null; stdout: string; stderr: string }> => {
    return new Promise((done) => {
      const preloadUrl = pathToFileURL(opts.preloadPath).href;
      const nodeOptions = `--import "${preloadUrl}"`;
      const child = spawn(process.execPath, [join(root, "scripts", "translate-all.mjs"), readme, ...extraArgs], {
        cwd: dir,
        env: {
          ...process.env,
          FAKE_LANG_BEHAVIORS: opts.behaviorsJson,
          FAKE_FAST_TIMERS: opts.useFastTimerPreload ? "1" : "0",
          NODE_OPTIONS: nodeOptions,
          OLLAMA_HOST: host,
          POLYGLOT_MODEL: "translategemma:27b",
          ...(opts.extraEnv ?? {}),
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
      expect(ja.failedChecks).toEqual(["no_write_receipt"]);
      expect(ja.failed_checks).toEqual(["no_write_receipt"]);

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

  it("(f) a pre-existing file with a future mtime does not cause a false drop: the language with a valid receipt is included", async () => {
    const opts = setupWithFakeChildren(STRUCTURED_README, {});
    const preExistingEs = join(dir, "README.es.md");
    writeFileSync(preExistingEs, VALID_TRANSLATED("Spanish"), "utf-8");
    const future = new Date(Date.now() + 3_600_000);
    utimesSync(preExistingEs, future, future);
    try {
      const r = await runTranslateAll(["--no-cache", "--concurrency=3"], opts);
      expect(r.code).toBe(0);
      const summary = parseSummary(r.stdout);
      expect(summary.succeeded).toBe(7);
      expect(summary.failed).toBe(0);
      expect(summary.results.every((x: { status: string }) => x.status === "ok")).toBe(true);

      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter).toContain('<a href="README.ja.md">日本語</a>');
      expect(srcAfter).toContain('<a href="README.es.md">Español</a>');
      expect(srcAfter).toContain('<a href="README.pt-BR.md">Português (BR)</a>');
    } finally {
      cleanup();
    }
  }, 60_000);

  it("(g) a stale file with no receipt is reported no_write_receipt and not counted as this run", async () => {
    const opts = setupWithFakeChildren(STRUCTURED_README, {
      ja: "error-without-writing",
    });
    const stalePath = join(dir, "README.ja.md");
    writeFileSync(stalePath, VALID_TRANSLATED("Japanese"), "utf-8");
    const future = new Date(Date.now() + 60_000);
    utimesSync(stalePath, future, future);
    try {
      const r = await runTranslateAll(["--no-cache", "--concurrency=3"], opts);
      expect(r.code).toBe(1);
      const summary = parseSummary(r.stdout);
      const ja = summary.results.find((x: { lang: string }) => x.lang === "ja");
      expect(ja.status).toBe("written-unverified");
      expect(ja.failedChecks).toEqual(["no_write_receipt"]);
      expect(ja.failed_checks).toEqual(["no_write_receipt"]);

      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter).not.toContain("README.ja.md");
      expect(srcAfter).toContain('<a href="README.es.md">Español</a>');
    } finally {
      cleanup();
    }
  }, 60_000);

  it("(h) a receipt whose sha doesn't match the file on disk is refused", async () => {
    const opts = setupWithFakeChildren(STRUCTURED_README, {
      ja: "write-bad-receipt-sha",
    });
    try {
      const r = await runTranslateAll(["--no-cache", "--concurrency=3"], opts);
      expect(r.code).toBe(1);
      const summary = parseSummary(r.stdout);
      const ja = summary.results.find((x: { lang: string }) => x.lang === "ja");
      expect(ja.status).toBe("written-unverified");
      expect(ja.failedChecks).toEqual(["receipt_sha_mismatch"]);
      expect(ja.failed_checks).toEqual(["receipt_sha_mismatch"]);

      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter).not.toContain("README.ja.md");
      expect(srcAfter).toContain('<a href="README.es.md">Español</a>');
    } finally {
      cleanup();
    }
  }, 60_000);

  it("(i) an already-linked, still-valid language that wasn't re-run stays in the bar", async () => {
    const readmeWithExistingJaLink = [
      '<p align="center">',
      '  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a>',
      "</p>",
      "",
      STRUCTURED_README,
    ].join("\n");
    const opts = setupWithFakeChildren(readmeWithExistingJaLink, {
      ja: "error-without-writing",
    });
    writeFileSync(join(dir, "README.ja.md"), VALID_TRANSLATED("Japanese"), "utf-8");
    const past = new Date(Date.now() - 60_000);
    utimesSync(join(dir, "README.ja.md"), past, past);
    try {
      const r = await runTranslateAll(["--no-cache", "--concurrency=3"], opts);
      const summary = parseSummary(r.stdout);
      expect(summary.navBarCheck.ok).toBe(true);
      expect(summary.navBarCheck.presentInNavBar).toContain("ja");

      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter).toContain('<a href="README.ja.md">日本語</a>');
      expect(srcAfter).toContain('<a href="README.es.md">Español</a>');
      expect(srcAfter).toContain('<a href="README.pt-BR.md">Português (BR)</a>');
    } finally {
      cleanup();
    }
  }, 60_000);

  it("(j) POLYGLOT_TIMEOUT_MS sets the timeout and the message", async () => {
    const opts = setupWithFakeChildren(STRUCTURED_README, {
      ja: "timeout-without-writing",
    });
    try {
      const rHelp = await run("translate-all.mjs", ["--help"], dir);
      expect(rHelp.code).toBe(0);
      expect(rHelp.stdout).toContain("Usage: node scripts/translate-all.mjs <readme-path>");
      expect(rHelp.stdout).toContain("--timeout=S");
      expect(rHelp.stdout).toContain("POLYGLOT_TIMEOUT_MS");
      expect(rHelp.stdout).not.toContain("--langs");

      const rMs = await runTranslateAll(["--no-cache", "--concurrency=3"], {
        ...opts,
        extraEnv: { POLYGLOT_TIMEOUT_MS: "250" },
      });
      expect(rMs.code).toBe(1);
      const summaryMs = parseSummary(rMs.stdout);
      const jaMs = summaryMs.results.find((x: { lang: string }) => x.lang === "ja");
      expect(jaMs.status).toBe("error");
      expect(jaMs.error).toBe("timeout (250ms)");
      expect(rMs.stderr).toContain("timeout (250ms)");

      const rSec = await runTranslateAll(["--no-cache", "--concurrency=3"], {
        ...opts,
        extraEnv: { POLYGLOT_TIMEOUT_MS: "1000" },
      });
      expect(rSec.code).toBe(1);
      const summarySec = parseSummary(rSec.stdout);
      const jaSec = summarySec.results.find((x: { lang: string }) => x.lang === "ja");
      expect(jaSec.status).toBe("error");
      expect(jaSec.error).toBe("timeout (1s)");
      expect(rSec.stderr).toContain("timeout (1s)");
    } finally {
      cleanup();
    }
  }, 60_000);
});


describe("polyglot-mcp#59 — child exit and post-write silence watchdog", () => {
  let dir: string;
  let readme: string;
  let keepAliveServer: Server;
  let keepAliveHost = "";
  const openSockets = new Set<Socket>();

  let tagsCalls = 0;

  beforeAll(async () => {
    keepAliveServer = createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString("utf8")));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.setHeader("connection", "keep-alive");
        res.setHeader("keep-alive", "timeout=60");
        if (req.url === "/api/tags") {
          tagsCalls++;
          const payload = JSON.stringify({
            models: [{ name: "translategemma:27b", size: 1, digest: "x", modified_at: "" }],
          });
          if (tagsCalls % 2 === 1) {
            // Availability probe (isAvailable): write headers + payload and keep
            // the stream actively open so an unconsumed response body holds its socket ref'd.
            res.writeHead(200);
            res.write(payload);
            const iv = setInterval(() => {
              if (!res.destroyed) res.write(" ");
            }, 150);
            iv.unref();
            req.on("close", () => clearInterval(iv));
            res.on("close", () => clearInterval(iv));
            return;
          }
          // Model listing probe (listModels): complete JSON response on keep-alive socket.
          res.end(payload);
          return;
        }
        const prompt = (JSON.parse(body || "{}") as { prompt?: string }).prompt ?? "";
        const lang = /translator\.[^]*? into ([A-Za-z ()]+):/.exec(prompt)?.[1] ?? "xx";
        const text = prompt.split("\n\n\n").slice(1).join("\n\n\n");
        const one = (part: string) => {
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
    keepAliveServer.keepAliveTimeout = 60_000;
    keepAliveServer.on("connection", (socket) => {
      openSockets.add(socket);
      socket.on("close", () => openSockets.delete(socket));
    });
    await new Promise<void>((resolve) => keepAliveServer.listen(0, "127.0.0.1", resolve));
    keepAliveHost = `http://127.0.0.1:${(keepAliveServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const s of openSockets) s.destroy();
    await new Promise<void>((resolve) => keepAliveServer.close(() => resolve()));
  });

  const setupWithFakeChildren59 = (md: string, behaviors: Record<string, string> = {}) => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-exit59-"));
    readme = join(dir, "README.md");
    writeFileSync(readme, md, "utf-8");

    const fakeBinDir = join(dir, "fake-bin");
    mkdirSync(fakeBinDir, { recursive: true });
    const preloadPath = join(fakeBinDir, "hang-preload.mjs");

    writeFileSync(
      preloadPath,
      [
        'import { createHash } from "node:crypto";',
        'import { writeFileSync } from "node:fs";',
        'import { basename } from "node:path";',
        "",
        "const entryScript = process.argv[1] || '';",
        "if (entryScript.endsWith('translate-readme.mjs')) {",
        '  const behaviors = JSON.parse(process.env.FAKE_LANG_BEHAVIORS || "{}");',
        "  const readmeArg = process.argv[2];",
        "  const langCode = process.argv[3];",
        "  const mode = behaviors[langCode];",
        "  if (mode) {",
        '    const outPath = readmeArg ? readmeArg.replace(/README\\.md$/, "README." + langCode + ".md") : "";',
        "    const validMd = (l) => [",
        '      "# [" + l + "] Title",',
        '      "",',
        '      "[" + l + "] The first paragraph explains how the router picks a device for every job.",',
        '      "",',
        '      "## [" + l + "] Installation",',
        '      "",',
        '      "```bash",',
        '      "npm install -g @mcptoolshop/polyglot-mcp",',
        '      "polyglot-mcp --help",',
        '      "```",',
        '      "",',
        '      "[" + l + "] The third paragraph lists the limits the guard enforces before it starts.",',
        '      "",',
        '    ].join("\\n");',
        "    const writeWithReceipt = (content, customSha) => {",
        '      const bytes = Buffer.from(content, "utf-8");',
        "      writeFileSync(outPath, bytes);",
        '      const sha = customSha ?? createHash("sha256").update(bytes).digest("hex");',
        '      console.log("POLYGLOT_WRITTEN " + basename(outPath) + " " + sha);',
        "    };",
        '    if (mode === "write-valid-then-hang") {',
        "      writeWithReceipt(validMd(langCode));",
        "      await new Promise((r) => setTimeout(r, 60_000));",
        '    } else if (mode === "write-bad-sha-then-hang") {',
        '      writeWithReceipt(validMd(langCode), "0".repeat(64));',
        "      await new Promise((r) => setTimeout(r, 60_000));",
        '    } else if (mode === "write-valid-and-exit") {',
        "      writeWithReceipt(validMd(langCode));",
        "      process.exit(0);",
        "    }",
        "  }",
        "}",
      ].join("\n"),
      "utf-8",
    );

    return { preloadPath, behaviorsJson: JSON.stringify(behaviors) };
  };

  const cleanup = () => rmSync(dir, { recursive: true, force: true });

  const runTranslateAll59 = (
    extraArgs: string[],
    opts: { preloadPath: string; behaviorsJson: string },
  ): Promise<{ code: number | null; stdout: string; stderr: string; elapsedMs: number }> => {
    return new Promise((done) => {
      const startMs = Date.now();
      const preloadUrl = pathToFileURL(opts.preloadPath).href;
      const child = spawn(process.execPath, [join(root, "scripts", "translate-all.mjs"), readme, ...extraArgs], {
        cwd: dir,
        env: {
          ...process.env,
          FAKE_LANG_BEHAVIORS: opts.behaviorsJson,
          NODE_OPTIONS: `--import "${preloadUrl}"`,
          OLLAMA_HOST: host,
          POLYGLOT_MODEL: "translategemma:27b",
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
      child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
      child.on("close", (code) => done({ code, stdout, stderr, elapsedMs: Date.now() - startMs }));
    });
  };

  const parseSummary = (stdout: string) =>
    JSON.parse(stdout.slice(stdout.indexOf('{\n  "polyglot"')).split("\n====")[0]);

  it("(a) translate-readme.mjs against a stub server that keeps its connection open exits 0 within a few seconds of writing", async () => {
    dir = mkdtempSync(join(tmpdir(), "polyglot-exit59-a-"));
    readme = join(dir, "README.md");
    writeFileSync(readme, CLEAN, "utf-8");
    try {
      const startMs = Date.now();
      const res = await new Promise<{
        code: number | null;
        stdout: string;
        stderr: string;
        timedOut: boolean;
        elapsedMs: number;
      }>((done) => {
        const child = spawn(process.execPath, [join(root, "scripts", "translate-readme.mjs"), readme, "es", "--no-cache"], {
          cwd: dir,
          env: { ...process.env, OLLAMA_HOST: keepAliveHost, POLYGLOT_MODEL: "translategemma:27b" },
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const guard = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, 3_500);
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
        child.on("close", (code) => {
          clearTimeout(guard);
          done({ code, stdout, stderr, timedOut, elapsedMs: Date.now() - startMs });
        });
      });

      expect(res.timedOut).toBe(false);
      expect(res.code).toBe(0);
      expect(res.elapsedMs).toBeLessThan(3_000);
      const writtenPath = join(dir, "README.es.md");
      const diskSha = createHash("sha256").update(readFileSync(writtenPath)).digest("hex");
      expect(res.stdout).toContain(`POLYGLOT_WRITTEN README.es.md ${diskSha}`);
    } finally {
      cleanup();
    }
  }, 15_000);

  it("(b) translate-all with a stub child that writes a valid receipt and then hangs finishes (DONE_AFTER_SILENCE) well under the timeout", async () => {
    const opts = setupWithFakeChildren59(STRUCTURED_README, {
      ja: "write-valid-then-hang",
      zh: "write-valid-and-exit",
      es: "write-valid-and-exit",
      fr: "write-valid-and-exit",
      hi: "write-valid-and-exit",
      it: "write-valid-and-exit",
      pt: "write-valid-and-exit",
    });
    try {
      const r = await runTranslateAll59(
        ["--no-cache", "--concurrency=3", "--timeout=8", "--silence-timeout=0.3"],
        opts,
      );
      expect(r.code).toBe(0);
      expect(r.elapsedMs).toBeLessThan(7_500);

      const summary = parseSummary(r.stdout);
      expect(summary.succeeded).toBe(7);
      expect(summary.failed).toBe(0);
      const ja = summary.results.find((x: { lang: string }) => x.lang === "ja");
      expect(Number(ja.time)).toBeLessThan(4.5);
      expect(ja.status).toBe("ok");
      expect(ja.outcome).toBe("DONE_AFTER_SILENCE");
      expect(ja.doneAfterSilence).toBe(true);
      expect(summary.doneAfterSilence).toEqual(["ja"]);
      expect(r.stdout).toContain("POLYGLOT_DONE_AFTER_SILENCE ja README.ja.md 300ms");
      expect(r.stderr).toContain("DONE_AFTER_SILENCE");

      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter).toContain('<a href="README.ja.md">日本語</a>');
    } finally {
      cleanup();
    }
  }, 30_000);

  it("(c) a receipt whose sha doesn't match the file on disk is a failure and never DONE_AFTER_SILENCE", async () => {
    const opts = setupWithFakeChildren59(STRUCTURED_README, {
      ja: "write-bad-sha-then-hang",
      zh: "write-valid-and-exit",
      es: "write-valid-and-exit",
      fr: "write-valid-and-exit",
      hi: "write-valid-and-exit",
      it: "write-valid-and-exit",
      pt: "write-valid-and-exit",
    });
    try {
      const r = await runTranslateAll59(
        ["--no-cache", "--concurrency=3", "--timeout=8", "--silence-timeout=0.3"],
        opts,
      );
      expect(r.code).toBe(1);
      expect(r.elapsedMs).toBeLessThan(7_500);

      const summary = parseSummary(r.stdout);
      const ja = summary.results.find((x: { lang: string }) => x.lang === "ja");
      expect(Number(ja.time)).toBeLessThan(4.5);
      expect(ja.status).toBe("written-unverified");
      expect(ja.failedChecks).toEqual(["receipt_sha_mismatch"]);
      expect(ja.outcome).toBeUndefined();
      expect(ja.doneAfterSilence).toBeUndefined();
      expect(summary.doneAfterSilence).toEqual([]);
      expect(r.stdout).not.toContain("POLYGLOT_DONE_AFTER_SILENCE");

      const srcAfter = readFileSync(readme, "utf-8");
      expect(srcAfter).not.toContain("README.ja.md");
      expect(srcAfter).toContain('<a href="README.es.md">Español</a>');
    } finally {
      cleanup();
    }
  }, 30_000);
});
