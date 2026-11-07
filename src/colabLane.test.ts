/**
 * Colab translation lane tests (`scripts/colab/launch_translate.sh`,
 * `scripts/colab/colab_window.sh`, `scripts/colab/launch_guards.py`,
 * `scripts/colab/compare_translations.py`), using a contract-checked fake
 * `colab` CLI and a fake Ollama HTTP server on CPU only.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const colabDir = join(root, "scripts", "colab");
const launcherPath = join(colabDir, "launch_translate.sh");
const comparePyPath = join(colabDir, "compare_translations.py");
const SEP = "---POLYGLOT_SEP---";

const PINNED_DIGEST = "21b597a243ec4fd2f05bc0ce8ef9ef174a89b09255c330d670852dfaaaa74f72";

const SAMPLE_README = [
  "# Registry Sync",
  "",
  "Synchronize package manifests and prune orphan issues across repositories.",
  "",
  "## Installation",
  "",
  "```bash",
  "npm install -g @mcptoolshop/registry-sync",
  "registry-sync plan --config sync.json",
  "```",
  "",
  "## Usage",
  "",
  "Read the [documentation](https://github.com/mcp-tool-shop-org/registry-sync) or check [issues](https://github.com/mcp-tool-shop-org/registry-sync/issues).",
  "",
].join("\n");

interface FakeOllamaConfig {
  digest: string;
  processor: string;
  sizeBytes: number;
  sizeVramBytes: number;
  contextLength: number;
  kvCacheMib: number;
  ollamaVersion: string;
}

const ollamaState: FakeOllamaConfig = {
  digest: PINNED_DIGEST,
  processor: "100% GPU",
  sizeBytes: 17358640928,
  sizeVramBytes: 17358640928,
  contextLength: 4096,
  kvCacheMib: 1536.0,
  ollamaVersion: "0.40.15",
};

let server: Server;
let ollamaUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString("utf8")));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/tags") {
        res.end(
          JSON.stringify({
            models: [
              {
                name: "translategemma:27b",
                size: ollamaState.sizeBytes,
                digest: ollamaState.digest,
                modified_at: "2026-11-07T00:00:00Z",
              },
            ],
          }),
        );
        return;
      }
      if (req.url === "/api/version") {
        res.end(JSON.stringify({ version: ollamaState.ollamaVersion }));
        return;
      }
      if (req.url === "/api/ps") {
        res.end(
          JSON.stringify({
            models: [
              {
                name: "translategemma:27b",
                model: "translategemma:27b",
                size: ollamaState.sizeBytes,
                size_vram: ollamaState.sizeVramBytes,
                digest: ollamaState.digest,
                processor: ollamaState.processor,
                context_length: ollamaState.contextLength,
                kv_cache_mib: ollamaState.kvCacheMib,
              },
            ],
          }),
        );
        return;
      }
      if (req.url === "/api/pull") {
        res.end(JSON.stringify({ status: "success" }) + "\n");
        return;
      }
      if (req.url === "/api/generate") {
        const parsed = JSON.parse(body || "{}") as { prompt?: string };
        const prompt = parsed.prompt ?? "";
        if (prompt === "Warmup probe.") {
          res.end(JSON.stringify({ model: "translategemma:27b", response: "OK", done: true }));
          return;
        }
        const lang = /translator\.[^]*? into ([A-Za-z ()]+):/.exec(prompt)?.[1] ?? "xx";
        const text = prompt.split("\n\n\n").slice(1).join("\n\n\n");
        const translatePart = (part: string) => {
          return part
            .split("\n")
            .map((line) => {
              if (!line.trim()) return line;
              // Keep headings as valid headings with a language tag
              const hMatch = /^(#{1,6}\s+)(.*)$/.exec(line);
              if (hMatch) {
                return `${hMatch[1]}[${lang}] ${hMatch[2]}`;
              }
              return `[${lang}] ${line}`;
            })
            .join("\n");
        };
        const response = text.includes(SEP)
          ? text.split(/\n?---POLYGLOT_SEP---\n?/).map(translatePart).join(`\n${SEP}\n`)
          : translatePart(text);
        res.end(JSON.stringify({ model: "translategemma:27b", response, done: true }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  ollamaUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/**
 * Create a temporary fake `colab` CLI environment with `#SDLAB_FAKE_COLAB_CLI=1`
 * and optional fake `nvidia-smi` / `ollama` binaries on PATH.
 */
function makeFakeColabEnv(baseDir: string, extraEnv: Record<string, string> = {}) {
  const binDir = join(baseDir, "bin");
  const stateDir = join(baseDir, "state");
  const contentDir = join(stateDir, "content");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(contentDir, { recursive: true });

  const fakeColabPy = join(binDir, "fake_colab_impl.py");
  writeFileSync(
    fakeColabPy,
    `#!/usr/bin/env python3
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

state_dir = Path(os.environ["FAKE_COLAB_STATE_DIR"])
content_dir = state_dir / "content"
content_dir.mkdir(parents=True, exist_ok=True)
open_dir = state_dir / "open_sessions"
open_dir.mkdir(parents=True, exist_ok=True)

raw_args = sys.argv[1:]
subcmd = raw_args[0] if raw_args else ""

# Record signal dispositions inherited by child
sig_rec = {
    "subcmd": subcmd,
    "pid": os.getpid(),
    "sigterm_ign": signal.getsignal(signal.SIGTERM) == signal.SIG_IGN,
    "sigint_ign": signal.getsignal(signal.SIGINT) == signal.SIG_IGN,
}
with (state_dir / "child_signals.jsonl").open("a", encoding="utf-8") as fh:
    fh.write(json.dumps(sig_rec) + "\\n")

with (state_dir / "calls.log").open("a", encoding="utf-8") as fh:
    fh.write("CALL " + " ".join(raw_args) + "\\n")
with (state_dir / "calls.jsonl").open("a", encoding="utf-8") as fh:
    fh.write(json.dumps({"ts": time.time(), "subcmd": subcmd, "args": raw_args}) + "\\n")

def hang_if_requested(mode_val):
    if mode_val in ("1", "ignore_term"):
        if mode_val == "ignore_term":
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGINT, signal.SIG_IGN)
        with (state_dir / "hung_pids.txt").open("a", encoding="utf-8") as fh:
            fh.write(f"{os.getpid()}\\n")
        time.sleep(3600)

if subcmd == "usage":
    opened = list(open_dir.glob("*.json"))
    rate = os.environ.get("FAKE_COLAB_POST_OPEN_RATE_STR", "1.42/hr") if opened else os.environ.get("FAKE_COLAB_PRE_OPEN_RATE_STR", "0.00/hr")
    bal = os.environ.get("FAKE_COLAB_BALANCE_STR", "99.50")
    assign = "1" if opened else "0"
    print(f"Current balance: {bal} compute units")
    print(f"Usage rate: {rate}")
    print(f"Active assignments: {assign}")
    sys.exit(0)

if subcmd == "new":
    sid = "default"
    gpu = "CPU"
    high_mem = "--high-mem" in raw_args
    for i, a in enumerate(raw_args):
        if a in ("-s", "--session") and i + 1 < len(raw_args):
            sid = raw_args[i + 1]
        if a == "--gpu" and i + 1 < len(raw_args):
            gpu = raw_args[i + 1]
    shape = os.environ.get("FAKE_COLAB_SESSION_SHAPE") or ("High-RAM" if (high_mem or gpu.upper() == "L4") else "Standard")
    (open_dir / f"{sid}.json").write_text(json.dumps({"sid": sid, "gpu": gpu, "shape": shape}), encoding="utf-8")
    print(f"[colab] Created session '{sid}'")
    sys.exit(0)

if subcmd == "sessions":
    if (state_dir / "stops.log").exists():
        hang_if_requested(os.environ.get("FAKE_COLAB_SESSIONS_CLOSE_HANG", ""))
    sessions = list(open_dir.glob("*.json"))
    if not sessions:
        print("[colab] No active sessions found on server.")
    else:
        for sf in sessions:
            info = json.loads(sf.read_text(encoding="utf-8"))
            print(f"[{info['sid']}] m-s-fake-{info['sid']} | Hardware: {info['gpu']} | Shape: {info['shape']} | Variant: DEFAULT")
    sys.exit(0)

if subcmd == "upload":
    # colab upload -s <session> <src> <dst>
    pos = []
    i = 1
    while i < len(raw_args):
        if raw_args[i] in ("-s", "--session"):
            i += 2
        else:
            pos.append(raw_args[i])
            i += 1
    src, dst = pos[0], pos[1]
    if not dst.startswith("/content/") or "/" in dst[len("/content/"):]:
        sys.stderr.write("500 Server Error: parent dir missing\\n")
        sys.exit(1)
    dst_file = content_dir / dst[len("/content/"):]
    shutil.copy2(src, dst_file)
    print(f"[colab] Uploaded '{src}' to '{dst}'")
    sys.exit(0)

if subcmd == "download":
    hang_if_requested(os.environ.get("FAKE_COLAB_DOWNLOAD_HANG", ""))
    pos = []
    i = 1
    while i < len(raw_args):
        if raw_args[i] in ("-s", "--session"):
            i += 2
        else:
            pos.append(raw_args[i])
            i += 1
    src, dst = pos[0], pos[1]
    src_file = content_dir / src[len("/content/"):]
    if not src_file.is_file():
        sys.stderr.write("File or directory not found\\n")
        sys.exit(1)
    shutil.copy2(src_file, dst)
    print(f"[colab] Downloaded '{src}' to '{dst}'")
    sys.exit(0)

if subcmd == "restart-kernel":
    hang_if_requested(os.environ.get("FAKE_COLAB_RESTART_HANG", ""))
    sid = "default"
    for i, a in enumerate(raw_args):
        if a in ("-s", "--session") and i + 1 < len(raw_args):
            sid = raw_args[i + 1]
    with (state_dir / "restarts.log").open("a", encoding="utf-8") as fh:
        fh.write(f"RESTART -s {sid}\\n")
    sys.exit(0)

if subcmd == "stop":
    sid = "default"
    for i, a in enumerate(raw_args):
        if a in ("-s", "--session") and i + 1 < len(raw_args):
            sid = raw_args[i + 1]
    cnt_f = state_dir / "stop_attempts.txt"
    cnt = int(cnt_f.read_text(encoding="utf-8").strip()) if cnt_f.is_file() else 0
    cnt += 1
    cnt_f.write_text(f"{cnt}\\n", encoding="utf-8")
    if cnt == 1:
        hang_if_requested(os.environ.get("FAKE_COLAB_STOP_HANG_ONCE", ""))
    with (state_dir / "stops.log").open("a", encoding="utf-8") as fh:
        fh.write(f"STOP -s {sid}\\n")
    (open_dir / f"{sid}.json").unlink(missing_ok=True)
    sys.exit(0)

if subcmd == "exec":
    py_file = None
    env_vars = dict(os.environ)
    i = 1
    while i < len(raw_args):
        a = raw_args[i]
        if a in ("-s", "--session", "--timeout"):
            i += 2
        elif a in ("-f", "--file"):
            py_file = raw_args[i + 1]
            i += 2
        elif a == "--env":
            kv = raw_args[i + 1]
            if "=" in kv:
                k, v = kv.split("=", 1)
                env_vars[k] = v
            i += 2
        else:
            i += 1
    code = Path(py_file).read_text(encoding="utf-8")
    # Rewrite /content paths in the uploaded scripts to point to content_dir
    c_posix = content_dir.as_posix()
    for f in content_dir.iterdir():
        if f.is_file() and f.suffix in (".sh", ".py"):
            ftxt = f.read_text(encoding="utf-8", errors="replace")
            ftxt = ftxt.replace("/content", c_posix)
            f.write_text(ftxt, encoding="utf-8")
    for k, v in list(env_vars.items()):
        if isinstance(v, str) and "/content" in v:
            env_vars[k] = v.replace("/content", c_posix)
    code = code.replace("/content", c_posix)
    runner_copy = state_dir / f"exec_{int(time.time()*1000)}.py"
    runner_copy.write_text(code, encoding="utf-8")
    proc = subprocess.run([sys.executable, str(runner_copy)], cwd=str(content_dir), env=env_vars, check=False)
    sys.exit(proc.returncode)
`,
    "utf-8",
  );
  chmodSync(fakeColabPy, 0o755);

  const colabWrapper = join(binDir, "colab");
  writeFileSync(
    colabWrapper,
    `#!/usr/bin/env bash
#SDLAB_FAKE_COLAB_CLI=1
exec python3 "${fakeColabPy}" "$@"
`,
    "utf-8",
  );
  chmodSync(colabWrapper, 0o755);

  const fakeNvidiaSmi = join(binDir, "nvidia-smi");
  writeFileSync(
    fakeNvidiaSmi,
    `#!/usr/bin/env bash
if [ "$1" = "-L" ]; then
  echo "GPU 0: NVIDIA L4 (UUID: GPU-fake-l4)"
  exit 0
fi
echo "NVIDIA L4, 19650, 23034, 3384"
`,
    "utf-8",
  );
  chmodSync(fakeNvidiaSmi, 0o755);

  const env: Record<string, string> = {
    ... (process.env as Record<string, string>),
    PATH: `${binDir}:${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
    SDLAB_TEST_FAKE_COLAB: "1",
    FAKE_COLAB_STATE_DIR: stateDir,
    POLYGLOT_TEST_FAKE_OLLAMA_URL: ollamaUrl,
    POLYGLOT_TEST_SKIP_VM_INSTALL: "1",
    SDLAB_TEST_RATE_READ_INTERVAL_S: "0.05",
    GUARD_POLL_INTERVAL_S: "0.2",
    ...extraEnv,
  };

  return { binDir, stateDir, contentDir, env };
}

function killHungPids(stateDir: string) {
  const hungFile = join(stateDir, "hung_pids.txt");
  if (!existsSync(hungFile)) return;
  for (const line of readFileSync(hungFile, "utf-8").split("\n")) {
    const pid = parseInt(line.trim(), 10);
    if (!Number.isNaN(pid) && pid > 0) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already exited
      }
    }
  }
}

function runLauncher(args: string[], env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn("bash", [launcherPath, ...args], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    child.on("close", (code) => done({ code, stdout, stderr }));
  });
}

describe("polyglot-mcp Colab translation lane", () => {
  it("(a) free stub rung end-to-end: runs real translate-all.mjs against fake Ollama, fetches 7 translations + source with nav bar, writes SHA256SUMS, manifest.json, and valid window.json", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-e2e-"));
    try {
      ollamaState.digest = PINNED_DIGEST;
      ollamaState.processor = "100% GPU";
      ollamaState.sizeBytes = 17358640928;
      ollamaState.sizeVramBytes = 17358640928;

      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp);

      const res = await runLauncher(
        ["--readme", srcReadme, "--card", "CPU", "--out-dir", outDir, "--session", "polyglot-stub-e2e"],
        env,
      );
      expect(res.code).toBe(0);

      // Verify all 7 translated files + updated source README with nav bar exist in outDir
      const expectedFiles = [
        "README.md",
        "README.ja.md",
        "README.zh.md",
        "README.es.md",
        "README.fr.md",
        "README.hi.md",
        "README.it.md",
        "README.pt-BR.md",
      ];
      for (const fname of expectedFiles) {
        const fp = join(outDir, fname);
        expect(existsSync(fp)).toBe(true);
        const content = readFileSync(fp, "utf-8");
        expect(content).toContain('<p align="center">');
      }

      // Source README nav bar lists English + all 7 target languages
      const updatedSource = readFileSync(join(outDir, "README.md"), "utf-8");
      for (const fname of expectedFiles) {
        expect(updatedSource).toContain(`href="${fname}"`);
      }

      // SHA256SUMS and manifest.json exist and are populated
      expect(existsSync(join(outDir, "SHA256SUMS"))).toBe(true);
      const shaSums = readFileSync(join(outDir, "SHA256SUMS"), "utf-8").trim().split("\n");
      expect(shaSums).toHaveLength(8);

      const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf-8"));
      expect(manifest.model).toBe("translategemma:27b");
      expect(manifest.model_digest).toBe(`sha256:${PINNED_DIGEST}`);
      expect(manifest.ollama_version).toBe("0.40.15");
      expect(manifest.languages).toEqual(["ja", "zh", "es", "fr", "hi", "it", "pt"]);
      expect(manifest.fit_probe).toMatchObject({
        model: "translategemma:27b",
        fully_on_gpu: true,
        gpu_percent: 100,
        ollama_ps_processor: "100% GPU",
      });
      expect(manifest.readmes).toHaveLength(1);
      expect(Object.keys(manifest.readmes[0].output_shas)).toHaveLength(8);
      expect(manifest.readmes[0].nav_bar_check.ok).toBe(true);

      // window.json is valid and records cleanup_bound_s = 980
      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.status).toBe("ok");
      expect(win.refusal_code).toBeNull();
      expect(win.cleanup_stop_attempted_by_s).toBe(840);
      expect(win.cleanup_bound_s).toBe(980);
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-stub-e2e");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);

  it("(b.1) refuses MODEL_DIGEST_MISMATCH when pulled model digest does not match pinned digest", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-digest-"));
    try {
      ollamaState.digest = "deadbeef".repeat(8);
      ollamaState.processor = "100% GPU";
      ollamaState.sizeBytes = 17358640928;
      ollamaState.sizeVramBytes = 17358640928;

      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp);

      const res = await runLauncher(
        ["--readme", srcReadme, "--card", "CPU", "--out-dir", outDir, "--session", "polyglot-digest-mismatch"],
        env,
      );
      expect(res.code).not.toBe(0);
      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.refusal_code).toBe("MODEL_DIGEST_MISMATCH");
      expect(win.why).toContain("translategemma:27b");
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-digest-mismatch");
    } finally {
      ollamaState.digest = PINNED_DIGEST;
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(b.2) refuses MODEL_NOT_FULLY_ON_GPU when fit probe sees a CPU/GPU split in ollama ps", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-split-"));
    try {
      ollamaState.digest = PINNED_DIGEST;
      ollamaState.processor = "18%/82% CPU/GPU";
      ollamaState.sizeBytes = 17358640928;
      ollamaState.sizeVramBytes = 14200000000;

      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp);

      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "L4",
          "--shape",
          "high-mem",
          "--max-rate",
          "2.50",
          "--out-dir",
          outDir,
          "--session",
          "polyglot-fit-split",
        ],
        env,
      );
      expect(res.code).not.toBe(0);
      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.refusal_code).toBe("MODEL_NOT_FULLY_ON_GPU");
      expect(win.why).toContain("18%/82% CPU/GPU");
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-fit-split");
    } finally {
      ollamaState.processor = "100% GPU";
      ollamaState.sizeVramBytes = ollamaState.sizeBytes;
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(b.3) refuses NAV_BAR_INCOMPLETE when a written target language is missing from the source README nav bar (#65)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-navbar-"));
    try {
      ollamaState.digest = PINNED_DIGEST;
      ollamaState.processor = "100% GPU";
      ollamaState.sizeBytes = 17358640928;
      ollamaState.sizeVramBytes = 17358640928;

      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp, {
        POLYGLOT_TEST_DROP_NAV_BAR_LANG: "ja",
      });

      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--langs",
          "ja,es",
          "--card",
          "CPU",
          "--out-dir",
          outDir,
          "--session",
          "polyglot-navbar-inc",
        ],
        env,
      );
      expect(res.code).not.toBe(0);
      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.refusal_code).toBe("NAV_BAR_INCOMPLETE");
      expect(win.why).toContain("ja");
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-navbar-inc");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(b.4) refuses MAX_RATE_REQUIRED on a GPU card when --max-rate is missing, with zero colab calls", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-maxrate-"));
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp);

      const res = await runLauncher(
        ["--readme", srcReadme, "--card", "L4", "--shape", "high-mem", "--out-dir", outDir],
        env,
      );
      expect(res.code).not.toBe(0);
      expect(res.stderr).toContain("REFUSED: MAX_RATE_REQUIRED:");
      expect(existsSync(join(stateDir, "calls.log"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("(b.5) refuses PIN_OVERRIDE_IN_LIVE_RUN when a test-hook variable is set in a live run, with zero colab calls", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-livehook-"));
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      // Live runs refuse volatile /tmp out-dirs, so place the out-dir on the persistent repo disk
      const persistentOut = join(root, ".tmp-live-refusal-test-" + process.pid);
      rmSync(persistentOut, { recursive: true, force: true });
      const { stateDir, env } = makeFakeColabEnv(tmp, {
        SDLAB_TEST_FAKE_COLAB: "0",
        POLYGLOT_TEST_SKIP_VM_INSTALL: "1",
      });

      try {
        const res = await runLauncher(
          ["--readme", srcReadme, "--card", "CPU", "--out-dir", persistentOut],
          env,
        );
        expect(res.code).not.toBe(0);
        expect(res.stderr).toContain("REFUSED: PIN_OVERRIDE_IN_LIVE_RUN:");
        expect(existsSync(join(stateDir, "calls.log"))).toBe(false);
      } finally {
        rmSync(persistentOut, { recursive: true, force: true });
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("supports --dry and prints plan and cap-bound price without any colab call", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-dry-"));
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp);

      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "L4",
          "--shape",
          "high-mem",
          "--max-rate",
          "2.50",
          "--cap",
          "1.25",
          "--wall-s",
          "1800",
          "--out-dir",
          outDir,
          "--dry",
        ],
        env,
      );
      expect(res.code).toBe(0);
      const plan = JSON.parse(res.stdout);
      expect(plan.dry_run).toBe(true);
      expect(plan.card).toBe("L4");
      expect(plan.shape).toBe("high-mem");
      expect(plan.pricing.hours).toBe(0.5);
      expect(plan.pricing.rate_ccu_per_h).toBe(2.5);
      expect(plan.pricing.wall_price_ccu).toBe(1.25);
      expect(plan.pricing.cap_bound_price_ccu).toBe(1.25);
      expect(existsSync(join(stateDir, "calls.log"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("(c) bounded cleanup: a hung download that ignores TERM is killed by timeout -k and reaches colab stop within cleanup_bound_s", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-cleanup-"));
    const { stateDir, env } = makeFakeColabEnv(tmp, {
      FAKE_COLAB_DOWNLOAD_HANG: "ignore_term",
      SDLAB_TEST_KILL_GRACE_S: "1",
      SDLAB_TEST_DOWNLOAD_TIMEOUT_S: "2",
      SDLAB_TEST_SALVAGE_RESTART_TIMEOUT_S: "2",
      SDLAB_TEST_SALVAGE_EXEC_TIMEOUT_S: "2",
      SDLAB_TEST_STOP_TIMEOUT_S: "2",
    });
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");

      const t0 = Date.now();
      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--langs",
          "es",
          "--card",
          "CPU",
          "--out-dir",
          outDir,
          "--session",
          "polyglot-hung-dl",
        ],
        env,
      );
      const elapsedS = (Date.now() - t0) / 1000;
      expect(res.code).not.toBe(0);

      const guardsLog = readFileSync(join(outDir, "guards.log"), "utf-8");
      expect(guardsLog).toContain("SALVAGE_STEP_TIMEOUT download timeout_s=2 kill_grace_s=1 rc=137");
      expect(guardsLog).toContain("REFUSED: DOWNLOAD_FAILED:");

      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.refusal_code).toBe("DOWNLOAD_FAILED");
      // Configured bounds in test: restart(2+1) + exec(2+1) + download(2+1) = 9s; stop 2*(2+1) = 6s -> cleanup_bound_s = 15s
      expect(win.cleanup_stop_attempted_by_s).toBe(9);
      expect(win.cleanup_bound_s).toBe(15);
      expect(elapsedS).toBeLessThan(win.cleanup_bound_s);

      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-hung-dl");

      // Verify child processes did not inherit SIG_IGN for TERM or INT
      const sigLines = readFileSync(join(stateDir, "child_signals.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      for (const row of sigLines) {
        expect(row.sigterm_ign).toBe(false);
        if (row.subcmd !== "exec") {
          expect(row.sigint_ign).toBe(false);
        }
      }
    } finally {
      killHungPids(stateDir);
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(d) structural comparison helper (compare_translations.py) compares headings, paragraphs, code blocks byte-for-byte, links/URLs, and nav-bar entries", () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-compare-"));
    try {
      const baseDir = join(tmp, "baseline");
      const candDir = join(tmp, "candidate");
      mkdirSync(baseDir, { recursive: true });
      mkdirSync(candDir, { recursive: true });

      const nav = [
        '<p align="center">',
        '  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.es.md">Español</a>',
        "</p>",
        "",
      ].join("\n");

      const docA = [
        nav,
        "# Title One",
        "",
        "First paragraph with [GitHub](https://github.com/mcp-tool-shop-org/polyglot-mcp) and [Docs](https://example.com/docs).",
        "",
        "## Section Two",
        "",
        "```bash",
        "npx @mcptoolshop/polyglot-mcp --version",
        "```",
        "",
        "Second paragraph after code block.",
        "",
      ].join("\n");

      const docBMatchingStructureDifferentWording = [
        nav,
        "# Título Uno",
        "",
        "Primer párrafo con [GitHub](https://github.com/mcp-tool-shop-org/polyglot-mcp) y [Documentación](https://example.com/docs).",
        "",
        "## Sección Dos",
        "",
        "```bash",
        "npx @mcptoolshop/polyglot-mcp --version",
        "```",
        "",
        "Segundo párrafo después del bloque de código.",
        "",
      ].join("\n");

      for (const fname of ["README.md", "README.ja.md", "README.es.md"]) {
        writeFileSync(join(baseDir, fname), docA, "utf-8");
        writeFileSync(join(candDir, fname), docBMatchingStructureDifferentWording, "utf-8");
      }

      // 1. Identical structure across languages passes with exit 0
      const passRun = spawnSync("python3", [comparePyPath, "--baseline", baseDir, "--candidate", candDir, "--langs", "ja,es"], {
        encoding: "utf-8",
      });
      expect(passRun.status).toBe(0);
      const passReport = JSON.parse(passRun.stdout);
      expect(passReport.match).toBe(true);
      expect(passReport.per_language.ja.code_blocks_byte_identical).toBe(true);
      expect(passReport.per_language.ja.heading_count).toEqual({ baseline: 2, candidate: 2 });
      expect(passReport.per_language.ja.paragraph_count).toEqual({ baseline: 2, candidate: 2 });

      // 2. Mutating a code block byte-for-byte, dropping a URL, adding a heading, or altering the nav bar fails with exit 1
      const mutatedJa = docBMatchingStructureDifferentWording
        .replace("--version", "--help")
        .replace("https://example.com/docs", "https://example.com/wrong")
        .replace(' | <a href="README.es.md">Español</a>', "");
      writeFileSync(join(candDir, "README.ja.md"), mutatedJa + "\n### Extra Heading\n", "utf-8");

      const failRun = spawnSync("python3", [comparePyPath, "--baseline", baseDir, "--candidate", candDir, "--langs", "ja,es"], {
        encoding: "utf-8",
      });
      expect(failRun.status).toBe(1);
      const failReport = JSON.parse(failRun.stdout);
      expect(failReport.match).toBe(false);
      expect(failReport.per_language.ja.match).toBe(false);
      expect(failReport.per_language.ja.code_blocks_byte_identical).toBe(false);
      expect(failReport.per_language.ja.mismatches.join(" | ")).toContain("heading_count");
      expect(failReport.per_language.ja.mismatches.join(" | ")).toContain("code_block_bytes_mismatch");
      expect(failReport.per_language.ja.mismatches.join(" | ")).toContain("url_set_mismatch");
      expect(failReport.per_language.ja.mismatches.join(" | ")).toContain("nav_bar_entries");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
