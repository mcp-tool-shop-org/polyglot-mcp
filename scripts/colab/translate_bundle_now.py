#!/usr/bin/env python3
# Ported from style-dataset-lab @ 20a098e7 (scripts/colab/lane3_bundle_now.py at commit
# 20a098e7e9a385ed3a7b4e4f53c203fe73533fe2).
# Local adaptations:
#   - stops lingering polyglot translation workers (`translate-(all|readme)\.mjs`) under /content/polyglot_work;
#   - scrubs logs and tars `/content/polyglot_out` into `/content/polyglot_translate_bundle.tar.gz`.
"""Run on the VM by the polyglot-mcp Colab kit's failure path (`colab exec -f translate_bundle_now.py`).

After a rig-side kill (wall, cap, stall or dead harness) the kit has stopped only its own exec; the
remote script may still be running on the VM and its EXIT trap never fired, so there is no bundle to
download. This cell kills any running translation/Ollama worker processes, records the failure in
`vm_window.json` if not yet written, scrubs the logs and tars `/content/polyglot_out` into
`/content/polyglot_translate_bundle.tar.gz`, so the kit's salvage download gets whatever outputs and
logs the run had saved. Paths come from `--env` (`SDLAB_CONTENT`, `SDLAB_BUNDLE_RC`); prints a
`SDLAB_BUNDLE_NOW_RC=<rc>` marker.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tarfile
from pathlib import Path

_HF_TOKEN_RE = re.compile(r"\bhf_[A-Za-z0-9]{16,}\b")


def _scrub_file(p: Path) -> None:
    if not p.is_file():
        return
    try:
        raw = p.read_text(encoding="utf-8", errors="replace")
        scrubbed = _HF_TOKEN_RE.sub("hf_[REDACTED]", raw)
        if scrubbed != raw:
            p.write_text(scrubbed, encoding="utf-8", newline="\n")
    except Exception:
        pass


def bundle_now(env: dict[str, str] | None = None) -> int:
    env = dict(os.environ if env is None else env)
    root_str = env.get("SDLAB_CONTENT", "/content").strip()
    rc_str = env.get("SDLAB_BUNDLE_RC", "1").strip()
    if not root_str or not rc_str.lstrip("-").isdigit():
        print("SDLAB_BUNDLE_NOW_RC=2 (SDLAB_CONTENT and SDLAB_BUNDLE_RC are required)", flush=True)
        return 2

    root = Path(root_str)
    out_dir = root / "polyglot_out"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Best-effort stop of any lingering translate-all / translate-readme processes under root/polyglot_work
    work_prefix = re.escape(str(root / "polyglot_work"))
    subprocess.run(
        ["pkill", "-f", f"{work_prefix}.*translate-(all|readme)\\.mjs"],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
    )

    vm_win = out_dir / "vm_window.json"
    if not vm_win.is_file():
        rec = {
            "salvaged_after_failure": True,
            "failed_rc": int(rc_str),
        }
        vm_win.write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8", newline="\n")

    guards_py = root / "launch_guards.py"
    for f in out_dir.rglob("*"):
        if f.is_file() and f.suffix in (".log", ".json", ".jsonl", ".txt"):
            if guards_py.is_file():
                subprocess.run(
                    [sys.executable, str(guards_py), "--scrub-file", str(f)],
                    stdin=subprocess.DEVNULL,
                    capture_output=True,
                    text=True,
                    check=False,
                )
            else:
                _scrub_file(f)

    bundle_tar = root / "polyglot_translate_bundle.tar.gz"
    with tarfile.open(bundle_tar, "w:gz") as tf:
        for item in sorted(out_dir.iterdir()):
            tf.add(item, arcname=item.name)

    print("SDLAB_BUNDLE_NOW_RC=0", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(bundle_now())
