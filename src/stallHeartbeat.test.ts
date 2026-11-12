/**
 * The stall guard's per-segment heartbeat, at the launch_guards.py level (runs on every OS).
 * A SEGMENTS_DONE line repeats on every vitals sample, so it must never count as run output
 * (or a stuck run would look alive); a RISE in its value is the progress signal.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const py = process.platform === "win32" ? "python" : "python3";
const guards = new URL("../scripts/colab/launch_guards.py", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function run(args: string[], text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "polyglot-hb-"));
  try {
    const f = join(dir, "vitals.log");
    writeFileSync(f, text, "utf-8");
    const r = spawnSync(py, ["-I", guards, ...args.map((a) => (a === "FILE" ? f : a))], { encoding: "utf-8" });
    return r.stdout.trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const block = (n: number, t: number) =>
  `=== VITALS 2026-11-12T00:00:0${t}Z ===\nSETUP_BYTES: 28\nSEGMENTS_DONE: ${n}\nHARNESS: {"phase": "run"}\n`;

describe("launch_guards heartbeat", () => {
  it("reads the newest SEGMENTS_DONE, and nothing when there is none", () => {
    expect(run(["--segments-done", "FILE"], block(0, 1) + block(3, 2) + block(5, 3))).toBe("5");
    expect(run(["--segments-done", "FILE"], "no vitals here\n")).toBe("");
  });

  it("SEGMENTS_DONE lines are vitals lines: repeated samples add no run output", () => {
    const one = run(["--run-output-bytes", "FILE"], block(0, 1));
    const many = run(["--run-output-bytes", "FILE"], block(0, 1) + block(0, 2) + block(7, 3));
    expect(many).toBe(one);
  });
});
