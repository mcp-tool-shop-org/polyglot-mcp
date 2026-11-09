/**
 * Colab translation lane tests (`scripts/colab/launch_translate.sh`,
 * `scripts/colab/colab_window.sh`, `scripts/colab/launch_guards.py`,
 * `scripts/colab/compare_translations.py`), using a contract-checked fake
 * `colab` CLI and a fake Ollama HTTP server on CPU only.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const colabDir = join(root, "scripts", "colab");
const launcherPath = join(colabDir, "launch_translate.sh").replace(/\\/g, "/");
const comparePyPath = join(colabDir, "compare_translations.py");
const bashBin =
  process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/bash.exe")
    ? "C:/Program Files/Git/usr/bin/bash.exe"
    : "bash";
const pyBin = process.platform === "win32" ? "python" : "python3";
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
const fixtureBuffers: Record<string, Buffer> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString("utf8")));
    req.on("end", () => {
      if (req.url && fixtureBuffers[req.url]) {
        res.setHeader("content-type", "application/octet-stream");
        res.end(fixtureBuffers[req.url]);
        return;
      }
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

def kill_launcher_if_requested():
    out_dir_str = os.environ.get("FAKE_COLAB_OUT_DIR", "")
    if not out_dir_str:
        return
    pid_file = Path(out_dir_str) / "launcher_pid.txt"
    if not pid_file.is_file():
        return
    main_pid = pid_file.read_text(encoding="utf-8").strip()
    if not main_pid or not main_pid.isdigit():
        return
    mpid = int(main_pid)
    bash_exe = "C:/Program Files/Git/usr/bin/bash.exe" if os.name == "nt" and Path("C:/Program Files/Git/usr/bin/bash.exe").is_file() else "bash"
    subprocess.run([bash_exe, "-c", f"kill -9 {mpid}"], check=False)
    if os.name == "nt":
        ps_exe = "C:/Program Files/Git/usr/bin/ps.exe" if Path("C:/Program Files/Git/usr/bin/ps.exe").is_file() else "ps"
        r = subprocess.run([ps_exe], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
        for line in r.stdout.splitlines()[1:]:
            parts = line.strip().split()
            while parts and not parts[0].isdigit():
                parts = parts[1:]
            if len(parts) >= 4 and parts[0].isdigit() and parts[3].isdigit() and int(parts[0]) == mpid:
                try:
                    os.kill(int(parts[3]), signal.SIGTERM)
                except OSError:
                    pass

if subcmd == "usage":
    if os.environ.get("FAKE_COLAB_FAIL_CLOSING_USAGE") == "1" and (state_dir / "stops.log").exists():
        sys.stderr.write("503 Service Unavailable: closing usage failed\\n")
        sys.exit(1)
    opened = list(open_dir.glob("*.json"))
    has_opened = bool(opened) or (state_dir / "stops.log").exists()
    default_post_rate = "0.26/hr"
    if opened:
        try:
            info = json.loads(opened[0].read_text(encoding="utf-8"))
            if str(info.get("gpu", "CPU")).upper() != "CPU":
                default_post_rate = "1.42/hr"
        except Exception:
            pass
    rate = os.environ.get("FAKE_COLAB_POST_OPEN_RATE_STR", default_post_rate) if has_opened else os.environ.get("FAKE_COLAB_PRE_OPEN_RATE_STR", "0.00/hr")
    bal = os.environ.get("FAKE_COLAB_BALANCE_POST_OPEN_STR", os.environ.get("FAKE_COLAB_BALANCE_STR", "99.50")) if has_opened else os.environ.get("FAKE_COLAB_BALANCE_STR", "99.50")
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
    shape = os.environ.get("FAKE_COLAB_SESSION_SHAPE") or ("High-RAM" if (high_mem and gpu.upper() != "L4") else "Standard")
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
    if os.environ.get("FAKE_COLAB_FAIL_UPLOAD") == "1":
        sys.stderr.write("500 Server Error: simulated upload failure\\n")
        sys.exit(1)
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
    dl_cnt_f = state_dir / "download_attempts.txt"
    dl_cnt = int(dl_cnt_f.read_text(encoding="utf-8").strip()) if dl_cnt_f.is_file() else 0
    dl_cnt += 1
    dl_cnt_f.write_text(f"{dl_cnt}\\n", encoding="utf-8")
    out_dir_str = os.environ.get("FAKE_COLAB_OUT_DIR", "")
    if dl_cnt == 1 and out_dir_str and os.environ.get("FAKE_COLAB_WAIT_FOR_WALL_TRIP_ON_DL1") == "1":
        hang_mode = os.environ.get("FAKE_COLAB_DOWNLOAD_HANG", "")
        if hang_mode == "ignore_term":
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGINT, signal.SIG_IGN)
        with (state_dir / "hung_pids.txt").open("a", encoding="utf-8") as fh:
            fh.write(f"{os.getpid()}\\n")
        for _ in range(300):
            if (Path(out_dir_str) / "wall_trip_epoch.txt").is_file():
                break
            time.sleep(0.05)
        time.sleep(3600)
    hang_if_requested(os.environ.get("FAKE_COLAB_DOWNLOAD_HANG", ""))
    if dl_cnt == 1:
        hang_if_requested(os.environ.get("FAKE_COLAB_DOWNLOAD_HANG_ONCE", ""))
    dl_delay = float(os.environ.get("FAKE_COLAB_DOWNLOAD_DELAY_S", "0") or "0")
    if dl_delay > 0:
        time.sleep(dl_delay)
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
    sid = "default"
    for i, a in enumerate(raw_args):
        if a in ("-s", "--session") and i + 1 < len(raw_args):
            sid = raw_args[i + 1]
    with (state_dir / "restarts.log").open("a", encoding="utf-8") as fh:
        fh.write(f"RESTART -s {sid}\\n")
    if os.environ.get("FAKE_COLAB_KILL_LAUNCHER_MID_CLEANUP") == "1":
        out_dir_str = os.environ.get("FAKE_COLAB_OUT_DIR", "")
        for _ in range(300):
            if out_dir_str and (Path(out_dir_str) / "wall_trip_epoch.txt").is_file():
                break
            time.sleep(0.05)
        time.sleep(0.15)
        kill_launcher_if_requested()
        time.sleep(0.2)
        sys.exit(0)
    hang_if_requested(os.environ.get("FAKE_COLAB_RESTART_HANG", ""))
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
    alive_hung: list[int] = []
    hung_f = state_dir / "hung_pids.txt"
    if hung_f.is_file():
        for line in hung_f.read_text(encoding="utf-8").splitlines():
            if line.strip().isdigit():
                hpid = int(line.strip())
                try:
                    os.kill(hpid, 0)
                    alive_hung.append(hpid)
                except OSError:
                    pass
    if os.name == "nt" and alive_hung:
        ps_exe = "C:/Program Files/Git/usr/bin/ps.exe" if Path("C:/Program Files/Git/usr/bin/ps.exe").is_file() else "ps"
        r = subprocess.run([ps_exe], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
        winpids = set()
        for line in r.stdout.splitlines()[1:]:
            parts = line.strip().split()
            while parts and not parts[0].isdigit():
                parts = parts[1:]
            if len(parts) >= 4 and parts[0].isdigit() and parts[3].isdigit():
                winpids.add(int(parts[0]))
                winpids.add(int(parts[3]))
        alive_hung = [p for p in alive_hung if p in winpids]
    done_ts = time.time()
    with (state_dir / "stops.log").open("a", encoding="utf-8") as fh:
        fh.write(f"STOP -s {sid}\\n")
    with (state_dir / "stops.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({"sid": sid, "done_ts": done_ts, "alive_hung_pids": alive_hung}) + "\\n")
    (open_dir / f"{sid}.json").unlink(missing_ok=True)
    sys.exit(0)

if subcmd == "exec":
    if os.environ.get("FAKE_COLAB_KILL_LAUNCHER_PRE_TRIP") == "1":
        if os.environ.get("FAKE_COLAB_EXEC_SURVIVES_LAUNCHER_DEATH") == "1":
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            with (state_dir / "hung_pids.txt").open("a", encoding="utf-8") as fh:
                fh.write(f"{os.getpid()}\\n")
            time.sleep(0.3)
            kill_launcher_if_requested()
            time.sleep(3600)
            sys.exit(1)
        time.sleep(0.3)
        kill_launcher_if_requested()
        time.sleep(0.2)
        sys.exit(1)
    if os.environ.get("FAKE_COLAB_EXEC_HANG") == "1":
        out_dir_str = os.environ.get("FAKE_COLAB_OUT_DIR", "")
        for _ in range(600):
            if out_dir_str and (
                (Path(out_dir_str) / "wall_trip_epoch.txt").is_file()
                or (Path(out_dir_str) / "cleanup_started.txt").is_file()
            ):
                sys.exit(143)
            time.sleep(0.1)
        sys.exit(143)
    hang_if_requested(os.environ.get("FAKE_COLAB_EXEC_HANG", ""))
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
    import re as _re
    c_posix = content_dir.as_posix()
    def _norm_content(s: str) -> str:
        s = _re.sub(r'[A-Za-z]:/[^"\\s]*?/Git/content', "/content", s)
        return s.replace("/content", c_posix)
    for f in content_dir.iterdir():
        if f.is_file() and f.suffix in (".sh", ".py"):
            ftxt = f.read_text(encoding="utf-8", errors="replace")
            ftxt = _norm_content(ftxt)
            f.write_text(ftxt, encoding="utf-8")
    for k, v in list(env_vars.items()):
        if isinstance(v, str) and "/content" in v:
            env_vars[k] = _norm_content(v)
    code = _norm_content(code)
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
exec python3 "${fakeColabPy.replace(/\\/g, "/")}" "$@"
`,
    "utf-8",
  );
  chmodSync(colabWrapper, 0o755);

  if (process.platform === "win32") {
    const py3Wrapper = join(binDir, "python3");
    writeFileSync(
      py3Wrapper,
      `#!/usr/bin/env bash
exec python "$@"
`,
      "utf-8",
    );
    chmodSync(py3Wrapper, 0o755);

    const tarWrapper = join(binDir, "tar");
    writeFileSync(
      tarWrapper,
      `#!/usr/bin/env bash
exec /usr/bin/tar --force-local "$@"
`,
      "utf-8",
    );
    chmodSync(tarWrapper, 0o755);

    const zstdWrapper = join(binDir, "zstd");
    writeFileSync(
      zstdWrapper,
      `#!/usr/bin/env bash
if [[ " $* " == *" -d "* ]]; then
  exec gzip -d
else
  exec gzip -c
fi
`,
      "utf-8",
    );
    chmodSync(zstdWrapper, 0o755);
  }

  const fakeNvidiaSmi = join(binDir, "nvidia-smi");
  writeFileSync(
    fakeNvidiaSmi,
    `#!/usr/bin/env bash
if [ "$1" = "-L" ]; then
  echo "\${FAKE_NVIDIA_SMI_LIST_LINE:-GPU 0: NVIDIA A100-SXM4-40GB (UUID: GPU-fake-a100)}"
  exit 0
fi
echo "\${FAKE_NVIDIA_SMI_LINE:-NVIDIA A100-SXM4-40GB, 22547, 40960, 18413}"
`,
    "utf-8",
  );
  chmodSync(fakeNvidiaSmi, 0o755);

  const pathParts = [
    binDir,
    dirname(process.execPath),
    ...(process.platform === "win32"
      ? ["C:\\Program Files\\Git\\mingw64\\bin", "C:\\Program Files\\Git\\bin", "C:\\Program Files\\Git\\usr\\bin"]
      : []),
    ...((process.env.PATH ?? "").split(delimiter).filter((p) => p && !p.includes(".local"))),
  ];

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: pathParts.join(delimiter),
    MSYS2_ARG_CONV_EXCL: "/content;SDLAB_",
    SDLAB_TEST_FAKE_COLAB: "1",
    COLAB_OPEN_LOCK: join(stateDir, "colab-window-open.lock").replace(/\\/g, "/"),
    FAKE_COLAB_STATE_DIR: stateDir.replace(/\\/g, "/"),
    POLYGLOT_TEST_FAKE_OLLAMA_URL: ollamaUrl,
    POLYGLOT_TEST_SKIP_VM_INSTALL: "1",
    SDLAB_TEST_RATE_READ_INTERVAL_S: "0.05",
    GUARD_POLL_INTERVAL_S: "2",
    ...extraEnv,
  };

  return { binDir, stateDir, contentDir, env };
}

function rmDirRetry(dirPath: string) {
  for (let i = 0; i < 6; i++) {
    try {
      rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch {
      spawnSync(pyBin, ["-c", "import time; time.sleep(0.15)"]);
    }
  }
  try {
    rmSync(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // ignore cleanup EBUSY on Windows
  }
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
  const normArgs = args.map((a) => (a.includes("\\") ? a.replace(/\\/g, "/") : a));
  return new Promise((done) => {
    const child = spawn(bashBin, [launcherPath, ...normArgs], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (env.FAKE_COLAB_STATE_DIR && child.pid) {
      writeFileSync(join(env.FAKE_COLAB_STATE_DIR, "launcher_winpid.txt"), `${child.pid}\n`, "utf-8");
    }
    let stdout = "";
    let stderr = "";
    let resolved = false;
    const finish = (code: number | null) => {
      if (resolved) return;
      resolved = true;
      child.stdout?.destroy();
      child.stderr?.destroy();
      done({ code, stdout, stderr });
    };
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    child.on("exit", (code) => {
      setTimeout(() => finish(code), 150);
    });
    child.on("close", (code) => finish(code));
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
      if (res.code !== 0) {
        console.error("STDERR:", res.stderr);
        if (existsSync(join(outDir, "vitals.log"))) {
          console.error("VITALS:", readFileSync(join(outDir, "vitals.log"), "utf-8"));
        }
      }
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

      // window.json is valid and records cleanup_bound_s = 1290
      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.status).toBe("ok");
      expect(win.refusal_code).toBeNull();
      expect(win.cleanup_stop_attempted_by_s).toBe(1150);
      expect(win.cleanup_bound_s).toBe(1290);
      expect(win.worst_case_cap_path).toBeTypeOf("number");
      expect(win.worst_case_launcher_death_path).toBeTypeOf("number");
      expect(win.worst_case_total_spend).toBeTypeOf("number");
      expect(win.assumptions).toMatchObject({
        cap_path: expect.any(String),
        launcher_death_path: expect.any(String),
      });
      expect(win.spend_ccu).toBeGreaterThanOrEqual(0);
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
      const { stateDir, env } = makeFakeColabEnv(tmp, {
        SDLAB_TEST_RATE_READ_INTERVAL_S: "0.05",
      });

      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "L4",
          "--shape",
          "standard",
          "--max-rate",
          "2.50",
          "--cap",
          "1.50",
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
  }, 120_000);

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
  }, 120_000);

  it("(b.4) refuses MAX_RATE_REQUIRED on a GPU card when --max-rate is missing, with zero colab calls", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-maxrate-"));
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp);

      const res = await runLauncher(
        ["--readme", srcReadme, "--card", "L4", "--shape", "standard", "--out-dir", outDir],
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
  }, 30_000);

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
          "standard",
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
      expect(plan.shape).toBe("standard");
      expect(plan.cleanup_stop_attempted_by_s).toBe(1150);
      expect(plan.cleanup_bound_s).toBe(1290);
      expect(plan.worst_case_cap_path).toBe(1.25);
      expect(plan.worst_case_launcher_death_path).toBe(1.24);
      expect(plan.worst_case_total_spend).toBe(1.25);
      expect(plan.assumptions).toMatchObject({
        cap_path: expect.any(String),
        launcher_death_path: expect.any(String),
      });
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
      SDLAB_TEST_UPLOAD_TIMEOUT_S: "10",
      SDLAB_TEST_SESSIONS_TIMEOUT_S: "10",
      SDLAB_TEST_SALVAGE_RESTART_TIMEOUT_S: "2",
      SDLAB_TEST_SALVAGE_EXEC_TIMEOUT_S: "2",
      SDLAB_TEST_STOP_TIMEOUT_S: "4",
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
      expect(guardsLog).toMatch(/SALVAGE_STEP_TIMEOUT download timeout_s=2 kill_grace_s=1 rc=(124|137)/);
      expect(guardsLog).toContain("REFUSED: DOWNLOAD_FAILED:");

      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.refusal_code).toBe("DOWNLOAD_FAILED");
      // Configured bounds in test: in_flight(max(2,10,10)+1=11) + restart(2+1) + exec(2+1) + download(2+1) = 20s; stop 2*(4+1) = 10s -> cleanup_bound_s = 30s
      expect(win.cleanup_stop_attempted_by_s).toBe(20);
      expect(win.cleanup_bound_s).toBe(30);
      // Verify actual cleanup time (from normal download failure / cleanup_started.txt to colab stop completion) is within cleanup_bound_s
      const cleanupStartedEpoch = parseFloat(readFileSync(join(outDir, "cleanup_started.txt"), "utf-8").trim());
      const stopDoneTs = JSON.parse(readFileSync(join(stateDir, "stops.jsonl"), "utf-8").trim().split("\n").pop()!).done_ts;
      expect(stopDoneTs - cleanupStartedEpoch).toBeLessThanOrEqual(win.cleanup_bound_s);

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
  }, 120_000);

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
      const passRun = spawnSync(pyBin, [comparePyPath, "--baseline", baseDir, "--candidate", candDir, "--langs", "ja,es"], {
        encoding: "utf-8",
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
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

      const failRun = spawnSync(pyBin, [comparePyPath, "--baseline", baseDir, "--candidate", candDir, "--langs", "ja,es"], {
        encoding: "utf-8",
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
      expect(failRun.status).toBe(1);
      const failReport = JSON.parse(failRun.stdout);
      expect(failReport.match).toBe(false);
      expect(failReport.per_language.ja.match).toBe(false);
      expect(failReport.per_language.ja.code_blocks_byte_identical).toBe(false);
      expect(failReport.per_language.ja.mismatches.join(" | ")).toContain("heading_count");
      expect(failReport.per_language.ja.mismatches.join(" | ")).toContain("code_block_bytes_mismatch");
      expect(failReport.per_language.ja.mismatches.join(" | ")).toContain("url_set_mismatch");
      expect( failReport.per_language.ja.mismatches.join(" | ")).toContain("nav_bar_entries");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("(ask1.a) drops --langs: refuses --langs with zero colab calls", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-nolangs-"));
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp);

      const res = await runLauncher(
        ["--readme", srcReadme, "--langs", "ja,es", "--card", "CPU", "--out-dir", outDir],
        env,
      );
      expect(res.code).not.toBe(0);
      expect(res.stderr).toContain("REFUSED: unknown argument: --langs");
      expect(existsSync(join(stateDir, "calls.log"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("(ask1.b) adopts #67 receipt rule in the Colab lane: refuses TRANSLATION_UNVERIFIED when a file fails receipt/structural verification, stops session and logs STOP", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-unverified-"));
    try {
      ollamaState.digest = PINNED_DIGEST;
      ollamaState.processor = "100% GPU";
      ollamaState.sizeBytes = 17358640928;
      ollamaState.sizeVramBytes = 17358640928;

      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp, {
        POLYGLOT_TEST_CORRUPT_RECEIPT_LANG: "ja",
      });

      const res = await runLauncher(
        ["--readme", srcReadme, "--card", "CPU", "--out-dir", outDir, "--session", "polyglot-unverified-receipt"],
        env,
      );
      expect(res.code).not.toBe(0);
      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.refusal_code).toBe("TRANSLATION_UNVERIFIED");
      expect(win.why).toContain("ja");
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-unverified-receipt");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);

  it("(ask2) style-dataset-lab #72 item 1 defect fix: failed closing colab usage keeps last good end_balance.txt and window.json spend_ccu uses floor max(start - end, rate * elapsed / 3600)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-sdlab72-"));
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");

      // Case 1: Closing `colab usage` fails (exit 1) AND start == end (99.50 -> 99.50) at GPU rate 1.42/hr.
      // Fail on first upload after session open so closing path runs without salvage overhead.
      const outDir1 = join(tmp, "out1");
      const { stateDir: state1, env: env1 } = makeFakeColabEnv(join(tmp, "case1"), {
        FAKE_COLAB_FAIL_UPLOAD: "1",
        FAKE_COLAB_FAIL_CLOSING_USAGE: "1",
        FAKE_COLAB_BALANCE_STR: "99.50",
        FAKE_COLAB_BALANCE_POST_OPEN_STR: "99.50",
        FAKE_COLAB_POST_OPEN_RATE_STR: "1.42/hr",
      });

      const res1 = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "L4",
          "--shape",
          "standard",
          "--max-rate",
          "2.50",
          "--cap",
          "1.50",
          "--out-dir",
          outDir1,
          "--session",
          "polyglot-sdlab72-floor",
        ],
        env1,
      );
      expect(res1.code).not.toBe(0);
      // 1a. end_balance.txt was preserved (not unlinked on failed closing `colab usage`)
      expect(existsSync(join(outDir1, "end_balance.txt"))).toBe(true);
      const win1 = JSON.parse(readFileSync(join(outDir1, "window.json"), "utf-8"));
      expect(win1.start_balance).toBe(99.5);
      expect(win1.end_balance).toBe(99.5);
      // 1b. Because start - end == 0, spend_ccu equals the rate floor: round(rate * elapsed_s / 3600, 6)
      const expectedFloor = Number(((1.42 * win1.elapsed_s) / 3600).toFixed(6));
      expect(win1.spend_ccu).toBeGreaterThan(0);
      expect(win1.spend_ccu).toBeCloseTo(expectedFloor, 4);
      expect(readFileSync(join(state1, "stops.log"), "utf-8")).toContain("STOP -s polyglot-sdlab72-floor");

      // Case 2: Balance drop (99.50 -> 98.00 = 1.50 CCU) exceeds rate * elapsed / 3600 -> spend_ccu == 1.50
      const outDir2 = join(tmp, "out2");
      const { stateDir: state2, env: env2 } = makeFakeColabEnv(join(tmp, "case2"), {
        FAKE_COLAB_FAIL_UPLOAD: "1",
        FAKE_COLAB_BALANCE_STR: "99.50",
        FAKE_COLAB_BALANCE_POST_OPEN_STR: "98.00",
        FAKE_COLAB_POST_OPEN_RATE_STR: "1.42/hr",
      });

      const res2 = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "L4",
          "--shape",
          "standard",
          "--max-rate",
          "2.50",
          "--cap",
          "3.00",
          "--out-dir",
          outDir2,
          "--session",
          "polyglot-sdlab72-drop",
        ],
        env2,
      );
      expect(res2.code).not.toBe(0);
      const win2 = JSON.parse(readFileSync(join(outDir2, "window.json"), "utf-8"));
      expect(win2.start_balance).toBe(99.5);
      expect(win2.end_balance).toBe(98.0);
      expect(win2.spend_ccu).toBe(1.5);
      expect(readFileSync(join(state2, "stops.log"), "utf-8")).toContain("STOP -s polyglot-sdlab72-drop");
    } finally {
      ollamaState.digest = PINNED_DIGEST;
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);

  it("(ask3.1) mutation 1 — launcher killed pre-trip: wall watcher polls liveness every ~1s, stops session on launcher_gone_pre_trip, and logs STOP", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-mut1-pretrip-"));
    const outDir = join(tmp, "out");
    const { stateDir, env } = makeFakeColabEnv(tmp, {
      FAKE_COLAB_OUT_DIR: outDir.replace(/\\/g, "/"),
      FAKE_COLAB_KILL_LAUNCHER_PRE_TRIP: "1",
      SDLAB_TEST_DOWNLOAD_TIMEOUT_S: "2",
      SDLAB_TEST_KILL_GRACE_S: "1",
      SDLAB_TEST_STOP_TIMEOUT_S: "2",
    });
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");

      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "CPU",
          "--wall-s",
          "30",
          "--grace-s",
          "2",
          "--out-dir",
          outDir,
          "--session",
          "polyglot-mut1-pretrip",
        ],
        env,
      );
      expect(res.code).not.toBe(0);

      // Wait up to 20s for detached wall watcher to detect launcher death and write outcome.draft.json + window.json + stops.log
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (
          existsSync(join(outDir, "outcome.draft.json")) &&
          existsSync(join(outDir, "window.json")) &&
          existsSync(join(stateDir, "stops.log"))
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      expect(existsSync(join(outDir, "wall_trip_epoch.txt"))).toBe(false);
      expect(existsSync(join(stateDir, "stops.log"))).toBe(true);
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-mut1-pretrip");
      expect(existsSync(join(stateDir, "open_sessions", "polyglot-mut1-pretrip.json"))).toBe(false);

      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.stop_path).toBe("watcher");
      expect(win.watcher_wait).toBe("launcher_gone_pre_trip");
    } finally {
      killHungPids(stateDir);
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(ask3.2) mutation 2 — launcher killed mid-cleanup: wall watcher detects launcher death during salvage after cleanup_started.txt, stops session on escalated_launcher_gone, and logs STOP", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-mut2-midcleanup-"));
    const outDir = join(tmp, "out");
    const { stateDir, env } = makeFakeColabEnv(tmp, {
      FAKE_COLAB_OUT_DIR: outDir.replace(/\\/g, "/"),
      FAKE_COLAB_EXEC_HANG: "1",
      FAKE_COLAB_KILL_LAUNCHER_MID_CLEANUP: "1",
      GUARD_POLL_INTERVAL_S: "0.3",
      SDLAB_TEST_WALL_ESCALATE_S: "2",
      SDLAB_TEST_DOWNLOAD_TIMEOUT_S: "10",
      SDLAB_TEST_KILL_GRACE_S: "1",
      SDLAB_TEST_SALVAGE_DEADLINE_S: "10",
      SDLAB_TEST_STOP_TIMEOUT_S: "4",
    });
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");

      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "CPU",
          "--wall-s",
          "8",
          "--grace-s",
          "1",
          "--out-dir",
          outDir,
          "--session",
          "polyglot-mut2-midcleanup",
        ],
        env,
      );
      expect(res.code).not.toBe(0);

      // Wait up to 20s for detached wall watcher to detect launcher death mid-salvage and write outcome.draft.json + window.json + stops.log
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (
          existsSync(join(outDir, "outcome.draft.json")) &&
          existsSync(join(outDir, "window.json")) &&
          existsSync(join(stateDir, "stops.log"))
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      expect(existsSync(join(outDir, "cleanup_started.txt"))).toBe(true);
      expect(existsSync(join(stateDir, "restarts.log"))).toBe(true);
      expect(existsSync(join(stateDir, "stops.log"))).toBe(true);
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-mut2-midcleanup");
      expect(existsSync(join(stateDir, "open_sessions", "polyglot-mut2-midcleanup.json"))).toBe(false);

      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.refusal_code).toBe("WALL_GUARD_TRIPPED");
      expect(win.stop_path).toBe("watcher");
      expect(win.watcher_wait).toBe("escalated_launcher_gone");
    } finally {
      killHungPids(stateDir);
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(ask3.3) mutation 3 — wall trip during a long download: wall watcher trips during post-exec download, records cleanup_started.txt epoch (#71), bounds both normal download and salvage download with timeout -k, stops session, and logs STOP", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-mut3-walldl-"));
    const outDir = join(tmp, "out");
    const { stateDir, env } = makeFakeColabEnv(tmp, {
      FAKE_COLAB_OUT_DIR: outDir.replace(/\\/g, "/"),
      FAKE_COLAB_DOWNLOAD_HANG: "ignore_term",
      FAKE_COLAB_WAIT_FOR_WALL_TRIP_ON_DL1: "1",
      GUARD_POLL_INTERVAL_S: "0.3",
      SDLAB_TEST_WALL_ESCALATE_S: "35",
      SDLAB_TEST_DOWNLOAD_TIMEOUT_S: "8",
      SDLAB_TEST_KILL_GRACE_S: "1",
      SDLAB_TEST_SALVAGE_DEADLINE_S: "25",
      SDLAB_TEST_SALVAGE_RESTART_TIMEOUT_S: "3",
      SDLAB_TEST_SALVAGE_EXEC_TIMEOUT_S: "5",
      SDLAB_TEST_STOP_TIMEOUT_S: "3",
    });
    try {
      // Keep digest valid so remote exec succeeds (~9-11s total from start) and reaches colab_download_checked on the normal path,
      // then hangs in colab_download_checked (attempt 1, timeout 8+1=9s, spanning ~10-19s) while wall trips at 14s (wall-s 15 - grace-s 1 = 14s),
      // gets killed by timeout -k in colab_download_checked / colab_run_bounded, enters cleanup_on_exit,
      // and then hangs in colab_salvage_bundle_after_failure's download step (attempt 2), which is also killed by timeout -k!
      ollamaState.digest = PINNED_DIGEST;
      ollamaState.processor = "100% GPU";
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");

      const t0 = Date.now();
      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "CPU",
          "--wall-s",
          "15",
          "--grace-s",
          "1",
          "--out-dir",
          outDir,
          "--session",
          "polyglot-mut3-walldl",
        ],
        env,
      );
      const elapsedS = (Date.now() - t0) / 1000;
      expect(res.code).not.toBe(0);
      expect(elapsedS).toBeLessThan(34);

      expect(existsSync(join(outDir, "wall_trip_epoch.txt"))).toBe(true);
      if (!existsSync(join(outDir, "cleanup_started.txt"))) {
        console.error("ASK3.3 STDERR:", res.stderr);
        console.error("ASK3.3 OUTDIR FILES:", existsSync(outDir) ? readdirSync(outDir) : "NO OUTDIR");
        if (existsSync(join(outDir, "guards.log"))) console.error("ASK3.3 GUARDS:", readFileSync(join(outDir, "guards.log"), "utf-8"));
        if (existsSync(join(stateDir, "calls.log"))) console.error("ASK3.3 CALLS:", readFileSync(join(stateDir, "calls.log"), "utf-8"));
      }
      expect(existsSync(join(outDir, "cleanup_started.txt"))).toBe(true);
      const cleanupStartedEpoch = parseFloat(readFileSync(join(outDir, "cleanup_started.txt"), "utf-8").trim());
      expect(cleanupStartedEpoch).toBeGreaterThan(1_000_000_000);

      // Both normal colab_download_checked (attempt 1) and salvage download (attempt 2) ran and were bounded by timeout -k
      if (!existsSync(join(stateDir, "download_attempts.txt")) || parseInt(readFileSync(join(stateDir, "download_attempts.txt"), "utf-8").trim(), 10) !== 2) {
        if (existsSync(join(outDir, "guards.log"))) console.error("ASK3.3 GUARDS:", readFileSync(join(outDir, "guards.log"), "utf-8"));
        if (existsSync(join(stateDir, "calls.log"))) console.error("ASK3.3 CALLS:", readFileSync(join(stateDir, "calls.log"), "utf-8"));
      }
      expect(existsSync(join(stateDir, "download_attempts.txt"))).toBe(true);
      expect(parseInt(readFileSync(join(stateDir, "download_attempts.txt"), "utf-8").trim(), 10)).toBe(2);
      const guardsLog = readFileSync(join(outDir, "guards.log"), "utf-8");
      const dlTimeouts = guardsLog.match(/SALVAGE_STEP_TIMEOUT download timeout_s=8 kill_grace_s=1 rc=(124|137)/g) ?? [];
      expect(dlTimeouts.length).toBe(2);
      expect(guardsLog).toContain("REFUSED: DOWNLOAD_FAILED:");
      expect(guardsLog).toContain("BUNDLE_AFTER_FAILURE: none on the VM");

      expect(existsSync(join(stateDir, "stops.log"))).toBe(true);
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-mut3-walldl");
      expect(existsSync(join(stateDir, "open_sessions", "polyglot-mut3-walldl.json"))).toBe(false);

      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.stop_path).toBe("trap");
      expect(win.refusal_code).toBe("WALL_GUARD_TRIPPED");
    } finally {
      ollamaState.digest = PINNED_DIGEST;
      killHungPids(stateDir);
      rmDirRetry(tmp);
    }
  }, 60_000);

  it("(ask3.4) mutation 4 — cap that is too small: refused before exec with zero fake colab new calls (CAP_TOO_SMALL_FOR_CLEANUP), and pre-exec cap check between new and exec refuses before exec (CAP_GUARD_TRIPPED) and logs STOP", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-mut4-cap-"));
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");

      // 4a. Cap too small for cleanup reserve ((1290 / 3600) * 2.50 = 0.895833 CCU) -> refused before `colab new` with ZERO fake `colab new` calls.
      const outDirA = join(tmp, "outA");
      const { stateDir: stateA, env: envA } = makeFakeColabEnv(join(tmp, "caseA"));
      const resA = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "L4",
          "--shape",
          "standard",
          "--max-rate",
          "2.50",
          "--cap",
          "0.80",
          "--margin",
          "0.01",
          "--out-dir",
          outDirA,
          "--session",
          "polyglot-mut4-preopen",
        ],
        envA,
      );
      expect(resA.code).not.toBe(0);
      expect(resA.stderr).toContain("REFUSED: CAP_TOO_SMALL_FOR_CLEANUP:");
      const callsA = existsSync(join(stateA, "calls.log")) ? readFileSync(join(stateA, "calls.log"), "utf-8") : "";
      expect(callsA).not.toContain("CALL new");
      const guardsA = readFileSync(join(outDirA, "guards.log"), "utf-8");
      expect(guardsA).toContain("REFUSED: CAP_TOO_SMALL_FOR_CLEANUP:");

      // 4b. Pre-exec cap trip between `colab new` and `colab exec`:
      // cleanup_reserve = (1290 / 3600) * 2.50 = 0.895833 CCU; cap = 0.92, margin = 0.01 -> effective_trip = 0.014167 CCU.
      // Post-open balance drops from 99.50 to 99.47 (spend = 0.03 > 0.014167), so colab_check_pre_exec_cap refuses
      // BEFORE `colab exec` (zero `CALL exec`) and stops the session (`STOP -s` in stops.log).
      const outDirB = join(tmp, "outB");
      const { stateDir: stateB, env: envB } = makeFakeColabEnv(join(tmp, "caseB"), {
        FAKE_COLAB_BALANCE_STR: "99.50",
        FAKE_COLAB_BALANCE_POST_OPEN_STR: "99.47",
        FAKE_COLAB_POST_OPEN_RATE_STR: "1.42/hr",
      });
      const resB = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "L4",
          "--shape",
          "standard",
          "--max-rate",
          "2.50",
          "--cap",
          "0.92",
          "--margin",
          "0.01",
          "--out-dir",
          outDirB,
          "--session",
          "polyglot-mut4-preexec",
        ],
        envB,
      );
      expect(resB.code).not.toBe(0);
      const callsB = readFileSync(join(stateB, "calls.log"), "utf-8");
      expect(callsB).not.toContain("CALL exec");
      expect(readFileSync(join(stateB, "stops.log"), "utf-8")).toContain("STOP -s polyglot-mut4-preexec");
      const winB = JSON.parse(readFileSync(join(outDirB, "window.json"), "utf-8"));
      expect(winB.refusal_code).toBe("CAP_GUARD_TRIPPED");
      expect(winB.phase).toBe("pre_exec");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(ask4) CPU stub rung end-to-end in real mode (POLYGLOT_TEST_SKIP_VM_INSTALL=0): runs every step including curl download, sha256 check, tar -xJf Node unpack, tar --zstd -xf Ollama unpack, ollama serve, ollama pull, digest check, fit probe, repo unpack, npm ci + npm run build, translate-all.mjs, and #67 receipt & nav-bar check", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-ask4-realmode-"));
    try {
      ollamaState.digest = PINNED_DIGEST;
      ollamaState.processor = "100% GPU";
      ollamaState.sizeBytes = 17358640928;
      ollamaState.sizeVramBytes = 17358640928;

      const { stateDir, env } = makeFakeColabEnv(tmp);

      // Build real .tar.xz Node fixture (`node-v22.22.3-linux-x64/bin/{node,npm}`) and .tar.zst Ollama fixture (`bin/ollama`)
      const fixBuildDir = join(tmp, "fixtures_build");
      const nodeStage = join(fixBuildDir, "node-v22.22.3-linux-x64", "bin");
      const ollamaStage = join(fixBuildDir, "ollama_pkg", "bin");
      mkdirSync(nodeStage, { recursive: true });
      mkdirSync(ollamaStage, { recursive: true });

      const hostNodePosix = process.execPath.replace(/\\/g, "/");
      const repoRootPosix = root.replace(/\\/g, "/");
      writeFileSync(
        join(nodeStage, "node"),
        `#!/usr/bin/env bash
exec "${hostNodePosix}" "$@"
`,
        "utf-8",
      );
      chmodSync(join(nodeStage, "node"), 0o755);

      writeFileSync(
        join(nodeStage, "npm"),
        `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "ci" ]; then
  if [ ! -d node_modules ]; then
    python3 -c 'import os, subprocess, sys
src, dst = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
if os.name == "nt":
    subprocess.run(["cmd", "/c", "mklink", "/J", dst, src], check=True)
else:
    os.symlink(src, dst)
' "${repoRootPosix}/node_modules" "./node_modules"
  fi
  echo "npm ci: linked node_modules"
  exit 0
fi
if [ "\${1:-}" = "run" ] && [ "\${2:-}" = "build" ]; then
  "${hostNodePosix}" ./node_modules/typescript/bin/tsc
  echo "npm run build: tsc completed"
  exit 0
fi
exit 0
`,
        "utf-8",
      );
      chmodSync(join(nodeStage, "npm"), 0o755);

      writeFileSync(
        join(ollamaStage, "ollama"),
        `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  serve)
    echo "ollama serve stub started"
    exit 0
    ;;
  --version|-v)
    echo "ollama version is 0.40.15"
    ;;
  pull)
    curl -sf -X POST "\${OLLAMA_HOST:-${ollamaUrl}}/api/pull" -H "Content-Type: application/json" -d "{\\"name\\":\\"\${2:-translategemma:27b}\\",\\"stream\\":false}" >/dev/null
    echo "pulling manifest... success"
    ;;
  ps)
    echo "NAME                  ID              SIZE     PROCESSOR    UNTIL"
    echo "translategemma:27b    21b597a243ec    17 GB    100% GPU     4 minutes from now"
    ;;
esac
`,
        "utf-8",
      );
      chmodSync(join(ollamaStage, "ollama"), 0o755);

      const nodeTarXz = join(fixBuildDir, "node.tar.xz");
      const ollamaTarZst = join(fixBuildDir, "ollama.tar.zst");
      const tarRes1 = spawnSync(
        bashBin,
        ["-c", `tar -cJf "${nodeTarXz.replace(/\\/g, "/")}" -C "${fixBuildDir.replace(/\\/g, "/")}" node-v22.22.3-linux-x64`],
        { env, encoding: "utf-8" },
      );
      expect(tarRes1.status).toBe(0);

      const tarRes2 = spawnSync(
        bashBin,
        ["-c", `tar --zstd -cf "${ollamaTarZst.replace(/\\/g, "/")}" -C "${join(fixBuildDir, "ollama_pkg").replace(/\\/g, "/")}" bin`],
        { env, encoding: "utf-8" },
      );
      expect(tarRes2.status).toBe(0);

      const nodeBuf = readFileSync(nodeTarXz);
      const ollamaBuf = readFileSync(ollamaTarZst);
      const nodeSha = createHash("sha256").update(nodeBuf).digest("hex");
      const ollamaSha = createHash("sha256").update(ollamaBuf).digest("hex");
      fixtureBuffers["/fixtures/node.tar.xz"] = nodeBuf;
      fixtureBuffers["/fixtures/ollama.tar.zst"] = ollamaBuf;

      env.POLYGLOT_TEST_SKIP_VM_INSTALL = "0";
      env.POLYGLOT_TEST_NODE_TAR_URL = `${ollamaUrl}/fixtures/node.tar.xz`;
      env.POLYGLOT_TEST_NODE_TAR_SHA256 = nodeSha;
      env.POLYGLOT_TEST_OLLAMA_TAR_URL = `${ollamaUrl}/fixtures/ollama.tar.zst`;
      env.POLYGLOT_TEST_OLLAMA_TAR_SHA256 = ollamaSha;

      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");

      const res = await runLauncher(
        ["--readme", srcReadme, "--card", "CPU", "--out-dir", outDir, "--session", "polyglot-ask4-real-stub"],
        env,
      );
      if (res.code !== 0) {
        console.error("ASK4 STDERR:", res.stderr);
      }
      expect(res.code).toBe(0);

      // Verify vitals.log (which tees setup.log) shows npm ci + npm run build + ollama pull ran inside the real-mode VM setup
      const setupLog = readFileSync(join(outDir, "vitals.log"), "utf-8");
      expect(setupLog).toContain("pulling manifest... success");
      expect(setupLog).toContain("MODEL_DIGEST_OK model=translategemma:27b");
      expect(setupLog).toContain("npm ci: linked node_modules");
      expect(setupLog).toContain("npm run build: tsc completed");

      const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf-8"));
      expect(manifest.readmes).toHaveLength(1);
      expect(manifest.readmes[0].verified_languages).toEqual(["ja", "zh", "es", "fr", "hi", "it", "pt"]);
      expect(manifest.readmes[0].written_unverified).toEqual([]);
      expect(manifest.readmes[0].nav_bar_check.ok).toBe(true);

      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.status).toBe("ok");
      expect(win.refusal_code).toBeNull();
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-ask4-real-stub");
    } finally {
      delete fixtureBuffers["/fixtures/node.tar.xz"];
      delete fixtureBuffers["/fixtures/ollama.tar.zst"];
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);

  it("(fix1.ask1) wall watcher kills tracked child PIDs before colab stop and window.json: an in-flight child that keeps running after launcher death is dead before fake stop runs", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-fix1-ask1-"));
    const outDir = join(tmp, "out");
    const { stateDir, env } = makeFakeColabEnv(tmp, {
      FAKE_COLAB_OUT_DIR: outDir.replace(/\\/g, "/"),
      FAKE_COLAB_KILL_LAUNCHER_PRE_TRIP: "1",
      FAKE_COLAB_EXEC_SURVIVES_LAUNCHER_DEATH: "1",
      SDLAB_TEST_DOWNLOAD_TIMEOUT_S: "2",
      SDLAB_TEST_KILL_GRACE_S: "1",
      SDLAB_TEST_STOP_TIMEOUT_S: "2",
    });
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");

      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "CPU",
          "--wall-s",
          "30",
          "--grace-s",
          "2",
          "--out-dir",
          outDir,
          "--session",
          "polyglot-fix1-ask1-killorder",
        ],
        env,
      );
      expect(res.code).not.toBe(0);

      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (
          existsSync(join(outDir, "outcome.draft.json")) &&
          existsSync(join(outDir, "window.json")) &&
          existsSync(join(stateDir, "stops.jsonl"))
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      expect(existsSync(join(stateDir, "hung_pids.txt"))).toBe(true);
      expect(existsSync(join(stateDir, "stops.jsonl"))).toBe(true);
      const stopRow = JSON.parse(readFileSync(join(stateDir, "stops.jsonl"), "utf-8").trim().split("\n").pop()!);
      expect(stopRow.sid).toBe("polyglot-fix1-ask1-killorder");
      expect(stopRow.alive_hung_pids).toEqual([]);
    } finally {
      killHungPids(stateDir);
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(fix1.ask2) launcher-liveness check: (a) probe that always raises stops within 3 consecutive errors and logs LAUNCHER_LIVENESS_PROBE_ERROR; (b) transient single error does not stop early; (c) normal early finish has watcher_wait=none and a single stop", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-fix1-ask2-"));
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");

      // (a) Probe that always raises -> stops within bound (3 consecutive errors, well before wall_limit_s = 28s) and logs each error
      const outA = join(tmp, "outA");
      const { stateDir: stateA, env: envA } = makeFakeColabEnv(join(tmp, "caseA"), {
        FAKE_COLAB_OUT_DIR: outA.replace(/\\/g, "/"),
        FAKE_COLAB_EXEC_HANG: "ignore_term",
        SDLAB_TEST_PROBE_ERROR_MODE: "always",
        SDLAB_TEST_DOWNLOAD_TIMEOUT_S: "2",
        SDLAB_TEST_KILL_GRACE_S: "1",
        SDLAB_TEST_STOP_TIMEOUT_S: "2",
      });
      try {
        const t0 = Date.now();
        const resA = await runLauncher(
          [
            "--readme",
            srcReadme,
            "--card",
            "CPU",
            "--wall-s",
            "30",
            "--grace-s",
            "2",
            "--out-dir",
            outA,
            "--session",
            "polyglot-fix1-ask2-always",
          ],
          envA,
        );
        expect(resA.code).not.toBe(0);
        const deadlineA = Date.now() + 15000;
        while (Date.now() < deadlineA) {
          if (existsSync(join(outA, "window.json")) && existsSync(join(stateA, "stops.jsonl"))) {
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        const elapsedA = (Date.now() - t0) / 1000;
        expect(elapsedA).toBeLessThan(18);
        expect(existsSync(join(outA, "wall_trip_epoch.txt"))).toBe(false);
        expect(existsSync(join(stateA, "stops.jsonl"))).toBe(true);
        const guardsA = readFileSync(join(outA, "guards.log"), "utf-8");
        const probeErrsA = guardsA.match(/LAUNCHER_LIVENESS_PROBE_ERROR stage=pre_trip .* consecutive=[123]/g) ?? [];
        expect(probeErrsA.length).toBe(3);
        const winA = JSON.parse(readFileSync(join(outA, "window.json"), "utf-8"));
        expect(winA.stop_path).toBe("watcher");
        expect(winA.watcher_wait).toBe("launcher_gone_pre_trip");
      } finally {
        killHungPids(stateA);
      }

      // (b) Healthy launcher with one transient probe error -> logs 1 error, does not stop early, completes status: "ok", watcher_wait: "none", single stop
      const outB = join(tmp, "outB");
      const { stateDir: stateB, env: envB } = makeFakeColabEnv(join(tmp, "caseB"), {
        SDLAB_TEST_PROBE_ERROR_MODE: "once",
      });
      const resB = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "CPU",
          "--wall-s",
          "30",
          "--grace-s",
          "2",
          "--out-dir",
          outB,
          "--session",
          "polyglot-fix1-ask2-once",
        ],
        envB,
      );
      expect(resB.code).toBe(0);
      await new Promise((r) => setTimeout(r, 1200));
      const guardsB = readFileSync(join(outB, "guards.log"), "utf-8");
      const probeErrsB = guardsB.match(/LAUNCHER_LIVENESS_PROBE_ERROR stage=pre_trip .* consecutive=1/g) ?? [];
      expect(probeErrsB.length).toBe(1);
      expect(guardsB).not.toContain("WALL_WATCHER_ESCALATED");
      const stopsB = readFileSync(join(stateB, "stops.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .filter((l) => l.trim());
      expect(stopsB.length).toBe(1);
      const winB = JSON.parse(readFileSync(join(outB, "window.json"), "utf-8"));
      expect(winB.status).toBe("ok");
      expect(winB.stop_path).toBe("trap");
      expect(winB.watcher_wait).toBe("none");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);

  it("(fix1.ask3) early_wall_trip.txt is test-only: in real mode (without TEST_MODE=1), early_wall_trip.txt present in out_dir gives no early trip", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-fix1-ask3-"));
    try {
      const outDir = join(tmp, "out");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "early_wall_trip.txt"), "1\n", "utf-8");
      const { stateDir, env } = makeFakeColabEnv(tmp);

      // Spawn a sleeper process to act as main_pid, and run colab_run_wall_watcher directly with TEST_MODE=0 (real mode) and wall_limit_s = 3s
      const windowLibPosix = join(colabDir, "colab_window.sh").replace(/\\/g, "/");
      const guardsPyPosix = join(colabDir, "launch_guards.py").replace(/\\/g, "/");
      const outPosix = outDir.replace(/\\/g, "/");
      const pyBinPosix = pyBin.replace(/\\/g, "/");
      const runEnv = {
        ...env,
        TEST_MODE: "0",
        SDLAB_TEST_FAKE_COLAB: "0",
      };
      const t0 = Date.now();
      const watcherRun = spawnSync(
        bashBin,
        [
          "-c",
          `source "${windowLibPosix}"
           sleep 5 &
           mpid=$!
           printf '%s\\n' "$mpid" > "${outPosix}/launcher_pid.txt"
           ( sleep 0.6; printf '1\\n' > "${outPosix}/stop_reached.txt"; printf 'STOP_COMPLETED attempt=1 session=s-real\\n' > "${outPosix}/stop.log"; kill -9 "$mpid" 2>/dev/null || true ) &
           colab_run_wall_watcher "$mpid" "4" "${pyBinPosix}" "${guardsPyPosix}" "${outPosix}" "translate" "s-real" "CPU" "0.25" "5" "1" "0.01" "2026-11-09T00:00:00Z" "{}"`,
        ],
        { env: runEnv, encoding: "utf-8", timeout: 15000 },
      );
      const elapsedS = (Date.now() - t0) / 1000;
      expect(watcherRun.status).toBe(0);
      // Because early_wall_trip.txt is ignored when TEST_MODE != 1, the watcher did NOT trip at ~0.1s;
      // instead it noticed stop_completed() and exited cleanly with wall_trip_epoch.txt absent!
      expect(existsSync(join(outDir, "wall_trip_epoch.txt"))).toBe(false);
      expect(existsSync(join(stateDir, "stops.log"))).toBe(false);
      expect(elapsedS).toBeLessThan(5);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  it("(fix1.ask6) numeric VRAM check in Fit Probe: refuses VRAM_HEADROOM_LOW on a GPU card whose total VRAM (23,034 MiB on L4) is below measured peak + 1,024 MiB headroom (23,571 MiB) before translation starts", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-fix1-ask6-"));
    try {
      ollamaState.digest = PINNED_DIGEST;
      ollamaState.processor = "100% GPU";
      ollamaState.sizeBytes = 17358640928;
      ollamaState.sizeVramBytes = 17358640928;

      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");
      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp, {
        FAKE_NVIDIA_SMI_LIST_LINE: "GPU 0: NVIDIA L4 (UUID: GPU-fake-l4)",
        FAKE_NVIDIA_SMI_LINE: "NVIDIA L4, 22547, 23034, 487",
      });

      const res = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "L4",
          "--shape",
          "standard",
          "--max-rate",
          "2.50",
          "--cap",
          "1.50",
          "--out-dir",
          outDir,
          "--session",
          "polyglot-fix1-ask6-vram",
        ],
        env,
      );
      expect(res.code).not.toBe(0);
      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.refusal_code).toBe("VRAM_HEADROOM_LOW");
      expect(win.why).toContain("vram_total_mib=23034 < required_total_vram_mib=23571");
      // Translation never started
      expect(existsSync(join(outDir, "README.ja.md"))).toBe(false);
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-fix1-ask6-vram");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(fix1.ask8) L4 shape gate (2026-11-09 Fleet ruling): --card L4 --shape high-mem is refused with SHAPE_HIGH_MEM_UNAVAILABLE and zero fake colab new calls, while --card L4 --shape standard is accepted", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-fix1-ask8-"));
    try {
      const srcReadme = join(tmp, "README.md");
      writeFileSync(srcReadme, SAMPLE_README, "utf-8");

      // 1. --card L4 --shape high-mem -> refused with SHAPE_HIGH_MEM_UNAVAILABLE and 0 fake new calls
      const outHigh = join(tmp, "outHigh");
      const { stateDir: stateHigh, env: envHigh } = makeFakeColabEnv(join(tmp, "caseHigh"));
      const resHigh = await runLauncher(
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
          "1.50",
          "--out-dir",
          outHigh,
          "--session",
          "polyglot-fix1-ask8-high",
        ],
        envHigh,
      );
      expect(resHigh.code).not.toBe(0);
      expect(resHigh.stderr).toContain("REFUSED: SHAPE_HIGH_MEM_UNAVAILABLE:");
      const callsHigh = existsSync(join(stateHigh, "calls.log")) ? readFileSync(join(stateHigh, "calls.log"), "utf-8") : "";
      expect(callsHigh).not.toContain("CALL new");
      const guardsHigh = readFileSync(join(outHigh, "guards.log"), "utf-8");
      expect(guardsHigh).toContain("REFUSED: SHAPE_HIGH_MEM_UNAVAILABLE:");

      // 2. --card L4 --shape standard -> accepted by shape gate and post-open shape check (opens with `colab new -s ... --gpu L4` and sees `Shape: Standard`)
      const outStd = join(tmp, "outStd");
      const { stateDir: stateStd, env: envStd } = makeFakeColabEnv(join(tmp, "caseStd"), {
        FAKE_COLAB_FAIL_UPLOAD: "1",
      });
      const resStd = await runLauncher(
        [
          "--readme",
          srcReadme,
          "--card",
          "L4",
          "--shape",
          "standard",
          "--max-rate",
          "2.50",
          "--cap",
          "1.50",
          "--out-dir",
          outStd,
          "--session",
          "polyglot-fix1-ask8-std",
        ],
        envStd,
      );
      expect(resStd.code).not.toBe(0);
      const callsStd = readFileSync(join(stateStd, "calls.log"), "utf-8");
      expect(callsStd).toContain("CALL new --gpu L4 -s polyglot-fix1-ask8-std");
      expect(callsStd).not.toContain("--high-mem");
      const guardsStd = readFileSync(join(outStd, "guards.log"), "utf-8");
      expect(guardsStd).toContain('"checkpoint": "post_shape_check"');
      expect(guardsStd).not.toContain("SHAPE_MISMATCH");
      expect(guardsStd).toContain("REFUSED: UPLOAD_FAILED:");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it("(fix1.ask9) multi-README atomicity: in a 2-README window where README 2 fails verification, neither outDir nor the salvaged bundle publishes README 1's translations", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "polyglot-colab-fix1-ask9-"));
    try {
      ollamaState.digest = PINNED_DIGEST;
      ollamaState.processor = "100% GPU";
      ollamaState.sizeBytes = 17358640928;
      ollamaState.sizeVramBytes = 17358640928;

      const dirA = join(tmp, "repoA");
      const dirB = join(tmp, "repoB");
      mkdirSync(dirA, { recursive: true });
      mkdirSync(dirB, { recursive: true });
      const readmeA = join(dirA, "README.md");
      const readmeB = join(dirB, "README.md");
      writeFileSync(readmeA, SAMPLE_README, "utf-8");
      writeFileSync(readmeB, SAMPLE_README.replace("# Registry Sync", "# Second Package"), "utf-8");

      const outDir = join(tmp, "out");
      const { stateDir, env } = makeFakeColabEnv(tmp, {
        POLYGLOT_TEST_CORRUPT_RECEIPT_LANG: "ja",
        POLYGLOT_TEST_CORRUPT_RECEIPT_SLOT: "repoB",
      });

      const res = await runLauncher(
        [
          "--readme",
          readmeA,
          "--readme",
          readmeB,
          "--card",
          "CPU",
          "--out-dir",
          outDir,
          "--session",
          "polyglot-fix1-ask9-multi",
        ],
        env,
      );
      expect(res.code).not.toBe(0);
      const win = JSON.parse(readFileSync(join(outDir, "window.json"), "utf-8"));
      expect(win.refusal_code).toBe("TRANSLATION_UNVERIFIED");
      expect(readFileSync(join(stateDir, "stops.log"), "utf-8")).toContain("STOP -s polyglot-fix1-ask9-multi");

      // 1. Nothing published to outDir (no README*.md or repoA/repoB slot dirs)
      const outEntries = readdirSync(outDir);
      for (const entry of outEntries) {
        expect(entry.startsWith("README")).toBe(false);
        expect(entry).not.toBe("repoA");
        expect(entry).not.toBe("repoB");
      }

      // 2. Salvaged bundle (if present) contains zero files under translations/
      const bundlePath = join(outDir, "polyglot_translate_bundle.tar.gz");
      if (existsSync(bundlePath)) {
        const listRes = spawnSync(
          pyBin,
          [
            "-c",
            `import sys, tarfile
with tarfile.open(sys.argv[1], "r:gz") as tf:
    names = [m.name for m in tf.getmembers() if "translations/" in m.name or m.name.startswith("./translations") or m.name.startswith("translations")]
print("\\n".join(names))`,
            bundlePath,
          ],
          { encoding: "utf-8" },
        );
        expect(listRes.status).toBe(0);
        expect(listRes.stdout.trim()).toBe("");
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});
