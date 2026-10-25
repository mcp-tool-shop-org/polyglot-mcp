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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      const one = (part: string) => (part.includes("zzechoalways") ? part : `[${lang}] ${part}`);
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
