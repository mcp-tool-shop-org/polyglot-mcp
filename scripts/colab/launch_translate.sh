#!/usr/bin/env bash
# Ported from style-dataset-lab @ 20a098e7 (scripts/colab/launch_lane3_stub.sh and
# scripts/colab/launch_lane1_stub.sh at commit 20a098e7e9a385ed3a7b4e4f53c203fe73533fe2).
# Local adaptations:
#   - installs pinned Node.js v22.22.3 + Ollama v0.40.15 and verifies translategemma:27b digest;
#   - enforces numeric VRAM fit probe (measured peak 22,547 MiB + 1,024 MiB headroom <= card total VRAM)
#     plus 100% GPU residency in `ollama ps`;
#   - runs `scripts/translate-all.mjs` across all 7 languages, enforces #67 verified write receipts
#     & structural Markdown checks + #65 source nav-bar completeness, and stages multi-README outputs
#     into `/content/polyglot_out/translations` only after every README slot passes verification.
# Launch kit for polyglot-mcp Colab translation windows (README translations via TranslateGemma 27B
# on Ollama). Runs the repo's existing `scripts/translate-all.mjs` unchanged against the VM's
# Ollama, verifies the model digest and GPU fit probe (`ollama ps` 100% GPU + numeric VRAM headroom), checks that every
# written target language appears in the source README's nav bar (`NAV_BAR_INCOMPLETE`), writes
# `SHA256SUMS` and `manifest.json`, and enforces the full Colab guard and bounded-cleanup contract.
#
# Bounded post-failure salvage and stop contract (colab_window.sh):
#   restart-kernel: timeout -k 10 180 (190 s)
#   bundle-now exec (--timeout 300): timeout -k 10 330 (340 s)
#   salvage download: timeout -k 10 300 (310 s)
#   SALVAGE_DEADLINE_S=840 (past 840 s, remaining salvage steps are skipped -> colab stop)
#   colab stop: timeout -k 10 60 with 1 retry (2 * 70 = 140 s)
#   in_flight_bound_s = 310 s (max(download 300, upload 120, sessions 30) + 10 s -k)
#   cleanup_stop_attempted_by_s = 310 + 840 = 1150 s, cleanup_bound_s = 1150 + 140 = 1290 s
set -euo pipefail

PINNED_NODE_VERSION="v22.22.3"
PINNED_NODE_TAR_SHA256="2e5d13569282d016861fae7c8f935e741693c269101a5bebcf761a5376d1f99f"
PINNED_OLLAMA_VERSION="0.40.15"
PINNED_OLLAMA_LINUX_AMD64_SHA256="628c018404a4206493efd38e46251c154ede5141b8b8dc85c659b3b027c47379"
PINNED_TRANSLATEGEMMA_MODEL="translategemma:27b"
# Ollama manifest digest (21b597a243ec) and full sha256 of the registry manifest (registry.ollama.ai/library/translategemma:27b)
PINNED_MODEL_DIGEST="21b597a243ec4fd2f05bc0ce8ef9ef174a89b09255c330d670852dfaaaa74f72"
# Ollama's default context length when num_ctx is not overridden by src/translate.ts or src/ollama.ts (4096; target 16384 when OLLAMA_CONTEXT_LENGTH=16384 is set)
PINNED_TRANSLATOR_CONTEXT="4096"
# R&D measured peak VRAM for translategemma:27b on Ollama 0.40.15 (GPU ledger, polyglot row, 2026-11-09)
# plus required safety headroom before translation starts (22547 + 1024 = 23571 MiB).
PINNED_MODEL_PEAK_VRAM_MIB="22547"
PINNED_VRAM_HEADROOM_MIB="1024"

PINNED_LAUNCH_GUARDS_SHA="0c8f9cc805bccf5ac32b65386c8072ca40e0127fc2ae235a350be27be0623d3e"
PINNED_REMOTE_RUNNER_SHA="834e669de7f611c8d3b0e24dcd65c568c0d97a2bafb6080b235ea9a22b4f99d9"
PINNED_COLAB_WINDOW_SHA="670c34f0bd312cbededf93f660c157c7fab424ef74d6ed970bac4f4df0c3c4a2"
PINNED_BUNDLE_NOW_SHA="9d550928857550352f80b7d86824a182922065927687d5c707878c0a6be33a43"
PINNED_COMPARE_SHA="1ebd61b21583133d8baa38acb333dac2b41f19dfb19df435a19e77bf8a3cda25"
PINNED_TRANSLATE_ALL_SHA="078d13e6ecd54f111eadfaa47c3d6bbc49566b285e2e5031a1bef05829e4194a"
PINNED_TRANSLATE_README_SHA="6afff1e87a87c6debce94b203e068984646b61aba68d2e96615d30f3f12c4078"
PINNED_PACKAGE_JSON_SHA="914dcc28c71e43ef024c9fbc8c79e8d9a437a0f1aca77d32c5e899b20cb836fe"
PINNED_PACKAGE_LOCK_SHA="712e9c93680b481daff0eaada8ec509da4ca025df5959561e6b3301174c00b22"
PINNED_SELF_SHA="97f170164b7e51446f75fffd0e1c735c588354b41ad5136074d32ea0aabbca9d"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SELF_SH="${SCRIPT_DIR}/launch_translate.sh"
# shellcheck source=scripts/colab/colab_window.sh
source "${SCRIPT_DIR}/colab_window.sh"

CARD="CPU"
SHAPE=""
MAX_RATE=""
CAP="0.25"
MARGIN="0.01"
MIN_RUNTIME_S=""
WALL_S="900"
GRACE_S="60"
OUT_DIR=""
SESSION="polyglot-translate-$(date -u +%Y%m%dT%H%M%SZ)"
DRY_RUN=0
README_PATHS=()
README_TAR=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --readme)
      README_PATHS+=("${2:-}")
      shift 2
      ;;
    --readme-tar)
      README_TAR="${2:-}"
      shift 2
      ;;
    --min-runtime-s)
      MIN_RUNTIME_S="${2:-}"
      shift 2
      ;;
    --card)
      CARD="${2:-}"
      shift 2
      ;;
    --shape)
      SHAPE="${2:-}"
      shift 2
      ;;
    --max-rate)
      MAX_RATE="${2:-}"
      shift 2
      ;;
    --cap)
      CAP="${2:-}"
      shift 2
      ;;
    --margin)
      MARGIN="${2:-}"
      shift 2
      ;;
    --wall-s)
      WALL_S="${2:-}"
      shift 2
      ;;
    --grace-s)
      GRACE_S="${2:-}"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --session)
      SESSION="${2:-}"
      shift 2
      ;;
    --dry)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "REFUSED: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

case "${CARD}" in
  A100 | L4 | G4 | CPU | CPU-high-mem) ;;
  *)
    echo "REFUSED: CARD_INVALID: --card ${CARD}; expected A100, L4, G4, or CPU" >&2
    exit 2
    ;;
esac

if [ "${#README_PATHS[@]}" -eq 0 ] && [ -z "${README_TAR}" ]; then
  echo "REFUSED: README_REQUIRED: pass at least one --readme <path> or --readme-tar <tarball>" >&2
  exit 2
fi

if [ "${#README_PATHS[@]}" -gt 0 ] && [ -n "${README_TAR}" ]; then
  echo "REFUSED: README_EXCLUSIVE: pass either --readme <path> (repeatable) or --readme-tar <tarball>, not both" >&2
  exit 2
fi

for rp in "${README_PATHS[@]}"; do
  if [ -z "${rp}" ] || [ ! -f "${rp}" ]; then
    echo "REFUSED: README_MISSING: --readme file not found: ${rp}" >&2
    exit 2
  fi
done

if [ -n "${README_TAR}" ] && [ ! -f "${README_TAR}" ]; then
  echo "REFUSED: README_MISSING: --readme-tar tarball not found: ${README_TAR}" >&2
  exit 2
fi


if [ -z "${OUT_DIR}" ]; then
  echo "REFUSED: OUT_DIR_REQUIRED: pass --out-dir <dir> on a persistent disk" >&2
  exit 2
fi

PY_BIN="$(colab_resolve_python)"
GUARDS_PY="${SCRIPT_DIR}/launch_guards.py"
RUNNER_PY="${SCRIPT_DIR}/remote_runner.py"
WINDOW_SH="${SCRIPT_DIR}/colab_window.sh"
BUNDLE_NOW_PY="${SCRIPT_DIR}/translate_bundle_now.py"
COMPARE_PY="${SCRIPT_DIR}/compare_translations.py"
TRANSLATE_ALL_MJS="${REPO_ROOT}/scripts/translate-all.mjs"
TRANSLATE_README_MJS="${REPO_ROOT}/scripts/translate-readme.mjs"
PACKAGE_JSON="${REPO_ROOT}/package.json"
PACKAGE_LOCK="${REPO_ROOT}/package-lock.json"

# --dry prints the plan and the price (hours x rate, cap-bound) without any colab call.
# Still validates GPU --max-rate and --shape first so an invalid request is refused before --dry succeeds.
if [ "${DRY_RUN}" = "1" ]; then
  if ! colab_card_is_cpu "${CARD}"; then
    if ! [[ "${MAX_RATE}" =~ ^[0-9]+(\.[0-9]+)?$ ]] || [[ "${MAX_RATE}" =~ ^0+(\.0+)?$ ]]; then
      echo "REFUSED: MAX_RATE_REQUIRED: a GPU card (${CARD}) needs --max-rate <units/h>, the highest window rate it may run at" >&2
      exit 2
    fi
    case "${SHAPE}" in
      standard | high-mem) ;;
      "")
        echo "REFUSED: SHAPE_REQUIRED: a GPU card (${CARD}) needs --shape standard|high-mem; there is no default" >&2
        exit 2
        ;;
      *)
        echo "REFUSED: SHAPE_INVALID: --shape ${SHAPE}: use standard or high-mem" >&2
        exit 2
        ;;
    esac
    if [ "${SHAPE}" = "high-mem" ] && colab_card_is_standard_only_shape "${CARD}"; then
      echo "REFUSED: SHAPE_HIGH_MEM_UNAVAILABLE: ${CARD} has a single Standard shape on Colab (--high-mem is ignored); pass --shape standard" >&2
      exit 2
    fi
    if [ "${SHAPE}" = "standard" ] && colab_card_is_single_shape "${CARD}"; then
      echo "REFUSED: SHAPE_STANDARD_UNAVAILABLE: ${CARD} has a single high-memory shape; pass --shape high-mem" >&2
      exit 2
    fi
  else
    if [ -n "${SHAPE}" ]; then
      echo "REFUSED: SHAPE_NOT_FOR_CPU: a CPU card (${CARD}) always opens with colab new --high-mem; drop --shape ${SHAPE}" >&2
      exit 2
    fi
  fi

  DRY_TEST_MODE=0
  if colab_fake_test_mode_active; then
    DRY_TEST_MODE=1
  fi
  colab_apply_test_cleanup_overrides "${DRY_TEST_MODE}"
  colab_compute_cleanup_bounds "translate"

  "${PY_BIN}" - "${GUARDS_PY}" "${CARD}" "${SHAPE}" "${MAX_RATE:-0.26}" "${CAP}" "${MARGIN}" "${WALL_S}" "${GRACE_S}" "${SESSION}" "${OUT_DIR}" "${PINNED_TRANSLATEGEMMA_MODEL}" "${PINNED_MODEL_DIGEST}" "${PINNED_OLLAMA_VERSION}" "${PINNED_NODE_VERSION}" "${COLAB_CLEANUP_BOUND_S}" "${MIN_RUNTIME_S}" "${README_TAR}" "${README_PATHS[@]}" << 'DRYPYEOF'
import json
import sys
from pathlib import Path

guards_py = Path(sys.argv[1])
sys.path.insert(0, str(guards_py.parent))
import launch_guards as lg

card = sys.argv[2]
shape = sys.argv[3] or ("high-mem" if card in ("CPU", "CPU-high-mem") else "")
rate = float(sys.argv[4] if card not in ("CPU", "CPU-high-mem") else "0.26")
cap = float(sys.argv[5])
margin = float(sys.argv[6])
wall_s = float(sys.argv[7])
grace_s = float(sys.argv[8])
session = sys.argv[9]
out_dir = sys.argv[10]
model = sys.argv[11]
model_digest = sys.argv[12]
ollama_ver = sys.argv[13]
node_ver = sys.argv[14]
cleanup_bound_s = float(sys.argv[15])
min_runtime_raw = sys.argv[16]
min_runtime_s = float(min_runtime_raw) if min_runtime_raw else None
readme_tar = sys.argv[17]
readme_paths = sys.argv[18:]

langs = ["ja", "zh", "es", "fr", "hi", "it", "pt"]
budget = lg.evaluate_cap_budget(
    cap=cap,
    margin=margin,
    cleanup_bound_s=cleanup_bound_s,
    priced_rate=rate,
    max_rate=rate,
    min_runtime_s=min_runtime_s,
)
if budget["tripped"]:
    sys.stderr.write(f"REFUSED: {budget['code']}: {budget['why']}\n")
    raise SystemExit(2)

hours = round(wall_s / 3600.0, 6)
wall_cost = round(hours * rate, 6)
effective_cap = round(max(0.0, cap - margin), 6)
cap_bound_price = round(min(wall_cost, cap), 6)

new_cmd = f"colab new --high-mem -s {session}" if card in ("CPU", "CPU-high-mem") else (
    f"colab new --gpu {card}" + (" --high-mem" if shape == "high-mem" else "") + f" -s {session}"
)

plan = {
    "dry_run": True,
    "session": session,
    "card": card,
    "shape": shape,
    "langs": langs,
    "readmes": readme_paths if readme_paths else [readme_tar],
    "out_dir": out_dir,
    "pinned": {
        "node_version": node_ver,
        "ollama_version": ollama_ver,
        "model": model,
        "model_digest": f"sha256:{model_digest}",
    },
    "pricing": {
        "wall_s": int(wall_s),
        "grace_s": int(grace_s),
        "hours": hours,
        "rate_ccu_per_h": rate,
        "wall_price_ccu": wall_cost,
        "cap_ccu": cap,
        "margin_ccu": margin,
        "cleanup_stop_attempted_by_s": 1150,
        "cleanup_bound_s": budget["cleanup_bound_s"],
        "cleanup_reserve_units": budget["cleanup_reserve_units"],
        "effective_trip_units": budget["effective_trip_units"],
        "runtime_to_trip_s": budget["runtime_to_trip_s"],
        "worst_case_cap_path": budget["worst_case_cap_path"],
        "worst_case_launcher_death_path": budget["worst_case_launcher_death_path"],
        "worst_case_total_spend": budget["worst_case_total_spend"],
        "assumptions": budget["assumptions"],
        "effective_cap_ccu": effective_cap,
        "cap_bound_price_ccu": cap_bound_price,
        "cap_trip_formula": budget["cap_trip_formula"],
        "formula": f"{hours:.4f} h x {rate:.2f} CCU/h = {wall_cost:.4f} CCU (cap-bound at {cap:.4f} CCU -> {cap_bound_price:.4f} CCU)",
    },
    "cleanup_stop_attempted_by_s": 1150,
    **{
        k: budget[k]
        for k in (
            "cleanup_bound_s",
            "priced_rate",
            "max_rate",
            "cleanup_reserve_units",
            "effective_trip_units",
            "runtime_to_trip_s",
            "worst_case_cap_path",
            "worst_case_launcher_death_path",
            "worst_case_total_spend",
            "assumptions",
            "cap_trip_formula",
        )
    },
    "commands": [
        "colab usage",
        new_cmd,
        "colab sessions",
        "colab usage",
        f"colab upload -s {session} <out_dir>/repo_archive.tar.gz /content/repo_archive.tar.gz",
        f"colab upload -s {session} <out_dir>/readmes_input.tar.gz /content/readmes_input.tar.gz",
        f"colab upload -s {session} scripts/colab/launch_guards.py /content/launch_guards.py",
        f"colab upload -s {session} <out_dir>/remote_translate.sh /content/remote_translate.sh",
        f"colab exec -s {session} -f scripts/colab/remote_runner.py --timeout {int(wall_s + grace_s + 60)}",
        f"colab download -s {session} /content/polyglot_translate_bundle.tar.gz {out_dir}/polyglot_translate_bundle.tar.gz",
        f"colab stop -s {session}",
        "colab sessions",
    ],
}
print(json.dumps(plan, indent=2))
DRYPYEOF
  exit $?
fi

# Test mode needs SDLAB_TEST_FAKE_COLAB=1 AND the fake-marked colab CLI on PATH.
colab_guard_fake_cli_if_test
TEST_MODE=0
if colab_fake_test_mode_active; then
  TEST_MODE=1
fi

colab_refuse_volatile_out_dir "${OUT_DIR}" "${TEST_MODE}"
colab_refuse_nonempty_out_dir "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

PIN_OVERRIDE_VARS=(
  EXPECTED_LAUNCH_GUARDS_SHA
  EXPECTED_REMOTE_RUNNER_SHA
  EXPECTED_COLAB_WINDOW_SHA
  EXPECTED_BUNDLE_NOW_SHA
  EXPECTED_COMPARE_SHA
  EXPECTED_TRANSLATE_ALL_SHA
  EXPECTED_TRANSLATE_README_SHA
  EXPECTED_PACKAGE_JSON_SHA
  EXPECTED_PACKAGE_LOCK_SHA
  EXPECTED_LAUNCH_TRANSLATE_SHA
  POLYGLOT_TEST_FAKE_OLLAMA_URL
  POLYGLOT_TEST_MODEL_DIGEST
  POLYGLOT_TEST_SKIP_VM_INSTALL
  POLYGLOT_TEST_FIT_PROBE_SPLIT
  POLYGLOT_TEST_DROP_NAV_BAR_LANG
  SDLAB_TEST_RATE_READ_INTERVAL_S
  SDLAB_TEST_KILL_GRACE_S
  SDLAB_TEST_DOWNLOAD_TIMEOUT_S
  SDLAB_TEST_SALVAGE_RESTART_TIMEOUT_S
  SDLAB_TEST_SALVAGE_EXEC_TIMEOUT_S
  SDLAB_TEST_SALVAGE_DEADLINE_S
  SDLAB_TEST_STOP_TIMEOUT_S
  SDLAB_TEST_SESSIONS_TIMEOUT_S
  SDLAB_TEST_OPEN_LOCK_TIMEOUT_S
  SDLAB_TEST_NEW_TIMEOUT_S
  SDLAB_TEST_UPLOAD_TIMEOUT_S
  SDLAB_TEST_WALL_ESCALATE_S
  POLYGLOT_TEST_CORRUPT_RECEIPT_LANG
  POLYGLOT_TEST_CORRUPT_RECEIPT_SLOT
  POLYGLOT_TEST_NODE_TAR_URL
  POLYGLOT_TEST_OLLAMA_TAR_URL
  POLYGLOT_TEST_NODE_TAR_SHA256
  POLYGLOT_TEST_OLLAMA_TAR_SHA256
  SDLAB_TEST_PROBE_ERROR_MODE
)
colab_refuse_live_pin_overrides "${OUT_DIR}" "${TEST_MODE}" "${PIN_OVERRIDE_VARS[@]}"
colab_apply_test_cleanup_overrides "${TEST_MODE}"
export TEST_MODE

EXP_GUARDS_SHA="${PINNED_LAUNCH_GUARDS_SHA}"
EXP_RUNNER_SHA="${PINNED_REMOTE_RUNNER_SHA}"
EXP_WINDOW_SHA="${PINNED_COLAB_WINDOW_SHA}"
EXP_BUNDLE_NOW_SHA="${PINNED_BUNDLE_NOW_SHA}"
EXP_COMPARE_SHA="${PINNED_COMPARE_SHA}"
EXP_TRANSLATE_ALL_SHA="${PINNED_TRANSLATE_ALL_SHA}"
EXP_TRANSLATE_README_SHA="${PINNED_TRANSLATE_README_SHA}"
EXP_PACKAGE_JSON_SHA="${PINNED_PACKAGE_JSON_SHA}"
EXP_PACKAGE_LOCK_SHA="${PINNED_PACKAGE_LOCK_SHA}"
EXP_SELF_SHA="${PINNED_SELF_SHA}"

if [ "${TEST_MODE}" = "1" ]; then
  EXP_GUARDS_SHA="${EXPECTED_LAUNCH_GUARDS_SHA:-${EXP_GUARDS_SHA}}"
  EXP_RUNNER_SHA="${EXPECTED_REMOTE_RUNNER_SHA:-${EXP_RUNNER_SHA}}"
  EXP_WINDOW_SHA="${EXPECTED_COLAB_WINDOW_SHA:-${EXP_WINDOW_SHA}}"
  EXP_BUNDLE_NOW_SHA="${EXPECTED_BUNDLE_NOW_SHA:-${EXP_BUNDLE_NOW_SHA}}"
  EXP_COMPARE_SHA="${EXPECTED_COMPARE_SHA:-${EXP_COMPARE_SHA}}"
  EXP_TRANSLATE_ALL_SHA="${EXPECTED_TRANSLATE_ALL_SHA:-${EXP_TRANSLATE_ALL_SHA}}"
  EXP_TRANSLATE_README_SHA="${EXPECTED_TRANSLATE_README_SHA:-${EXP_TRANSLATE_README_SHA}}"
  EXP_PACKAGE_JSON_SHA="${EXPECTED_PACKAGE_JSON_SHA:-${EXP_PACKAGE_JSON_SHA}}"
  EXP_PACKAGE_LOCK_SHA="${EXPECTED_PACKAGE_LOCK_SHA:-${EXP_PACKAGE_LOCK_SHA}}"
  EXP_SELF_SHA="${EXPECTED_LAUNCH_TRANSLATE_SHA:-${EXP_SELF_SHA}}"
fi

VERIFY_PAIRS=(
  "${GUARDS_PY}=${EXP_GUARDS_SHA}"
  "${RUNNER_PY}=${EXP_RUNNER_SHA}"
  "${WINDOW_SH}=${EXP_WINDOW_SHA}"
  "${BUNDLE_NOW_PY}=${EXP_BUNDLE_NOW_SHA}"
  "${COMPARE_PY}=${EXP_COMPARE_SHA}"
  "${TRANSLATE_ALL_MJS}=${EXP_TRANSLATE_ALL_SHA}"
  "${TRANSLATE_README_MJS}=${EXP_TRANSLATE_README_SHA}"
  "${PACKAGE_JSON}=${EXP_PACKAGE_JSON_SHA}"
  "${PACKAGE_LOCK}=${EXP_PACKAGE_LOCK_SHA}"
  "${SELF_SH}=${EXP_SELF_SHA}"
)

# Also record and verify the sha256 of every input --readme or --readme-tar
for rp in "${README_PATHS[@]}"; do
  rp_sha="$("${PY_BIN}" -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "${rp}")"
  VERIFY_PAIRS+=("${rp}=${rp_sha}")
done
if [ -n "${README_TAR}" ]; then
  rt_sha="$("${PY_BIN}" -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "${README_TAR}")"
  VERIFY_PAIRS+=("${README_TAR}=${rt_sha}")
fi

SHAS_Out=""
if ! SHAS_Out="$(colab_verify_input_shas "${PY_BIN}" "${GUARDS_PY}" "${VERIFY_PAIRS[@]}" 2>&1)"; then
  printf '%s\n' "${SHAS_Out}" | tee -a "${OUT_DIR}/guards.log" >&2
  exit 1
fi
SHAS_JSON="${SHAS_Out}"

# Arm GPU rate gate, shape gate, and cap budget gate BEFORE any colab call
colab_gpu_rate_gate_arm "${OUT_DIR}" "${CARD}" "${MAX_RATE}" "${TEST_MODE}"
colab_shape_gate_arm "${OUT_DIR}" "${CARD}" "${SHAPE}"
colab_cap_budget_gate "${PY_BIN}" "${GUARDS_PY}" "${OUT_DIR}" "translate" "${CARD}" "${CAP}" "${MARGIN}" "${MAX_RATE}" "${RATE_CCU_PER_HOUR:-0.26}" "${MIN_RUNTIME_S}"

# Stage input READMEs into ${OUT_DIR}/readmes_input.tar.gz and write input_readmes.json
INPUT_READMES_JSON="${OUT_DIR}/input_readmes.json"
READMES_TAR_PATH="${OUT_DIR}/readmes_input.tar.gz"
if ! "${PY_BIN}" - "${OUT_DIR}" "${READMES_TAR_PATH}" "${INPUT_READMES_JSON}" "${README_TAR}" "${README_PATHS[@]}" << 'STAGEPYEOF'
import hashlib
import json
import re
import shutil
import sys
import tarfile
from pathlib import Path

out_dir = Path(sys.argv[1])
tar_out = Path(sys.argv[2])
manifest_out = Path(sys.argv[3])
readme_tar = sys.argv[4]
readme_paths = sys.argv[5:]

stage_dir = out_dir / "_staged_readmes"
if stage_dir.exists():
    shutil.rmtree(stage_dir)
stage_dir.mkdir(parents=True, exist_ok=True)

entries = []
if readme_tar:
    tp = Path(readme_tar)
    if not tarfile.is_tarfile(tp):
        sys.stderr.write(f"REFUSED: README_TAR_INVALID: {tp} is not a valid tar archive\n")
        raise SystemExit(1)
    extract_tmp = stage_dir / "_raw_tar"
    extract_tmp.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tp, "r:*") as tf:
        try:
            tf.extractall(extract_tmp, filter="data")
        except TypeError:
            tf.extractall(extract_tmp)
    found = sorted(p for p in extract_tmp.rglob("README.md") if p.is_file())
    if not found:
        found = sorted(p for p in extract_tmp.rglob("*.md") if p.is_file() and not re.search(r"\.[a-z]{2}(?:-[A-Z]{2})?\.md$", p.name))
    if not found:
        sys.stderr.write(f"REFUSED: README_TAR_INVALID: no README.md found inside {tp}\n")
        raise SystemExit(1)
    for idx, p in enumerate(found):
        rel_parent = p.parent.relative_to(extract_tmp).as_posix()
        slug = rel_parent.replace("/", "__") if rel_parent != "." else f"readme_{idx}"
        slot_dir = stage_dir / slug
        slot_dir.mkdir(parents=True, exist_ok=True)
        dst = slot_dir / "README.md"
        shutil.copy2(p, dst)
        for sidecar in (".polyglot-terms.json", ".polyglot-pins.json"):
            sc = p.parent / sidecar
            if sc.is_file():
                shutil.copy2(sc, slot_dir / sidecar)
        sha = "sha256:" + hashlib.sha256(dst.read_bytes()).hexdigest()
        entries.append({
            "slug": slug,
            "source_path": p.relative_to(extract_tmp).as_posix(),
            "input_sha256": sha,
            "bytes": dst.stat().st_size,
        })
    shutil.rmtree(extract_tmp, ignore_errors=True)
else:
    used_slugs = set()
    for idx, rp_str in enumerate(readme_paths):
        rp = Path(rp_str).resolve()
        base_slug = rp.parent.name if rp.parent.name and rp.parent.name != "." else f"readme_{idx}"
        slug = base_slug if len(readme_paths) > 1 else "default"
        if slug in used_slugs:
            slug = f"{base_slug}_{idx}"
        used_slugs.add(slug)
        slot_dir = stage_dir / slug
        slot_dir.mkdir(parents=True, exist_ok=True)
        dst = slot_dir / "README.md"
        shutil.copy2(rp, dst)
        for sidecar in (".polyglot-terms.json", ".polyglot-pins.json"):
            sc = rp.parent / sidecar
            if sc.is_file():
                shutil.copy2(sc, slot_dir / sidecar)
        sha = "sha256:" + hashlib.sha256(dst.read_bytes()).hexdigest()
        entries.append({
            "slug": slug,
            "source_path": rp.name if len(readme_paths) == 1 else f"{slug}/README.md",
            "input_sha256": sha,
            "bytes": dst.stat().st_size,
        })

with tarfile.open(tar_out, "w:gz") as tf:
    for item in sorted(stage_dir.iterdir()):
        tf.add(item, arcname=item.name)

shutil.rmtree(stage_dir, ignore_errors=True)
manifest_out.write_text(json.dumps({"items": entries}, indent=2) + "\n", encoding="utf-8", newline="\n")
STAGEPYEOF
then
  colab_refuse_logged "${OUT_DIR}" README_TAR_INVALID "failed to stage input READMEs"
  exit 1
fi

# Build deterministic tar.gz of the repository source files (and built dist/ in fake-colab test mode)
REPO_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
REPO_ARCHIVE="${OUT_DIR}/repo_archive.tar.gz"
"${PY_BIN}" - "${REPO_ROOT}" "${REPO_ARCHIVE}" "${TEST_MODE}" << 'ARCHPYEOF'
import sys
import tarfile
from pathlib import Path

repo_root = Path(sys.argv[1])
archive_out = Path(sys.argv[2])
test_mode = sys.argv[3] == "1"

# Create a deterministic tar.gz of the repository source files needed to build and run translate-all.mjs
include_paths = ["package.json", "package-lock.json", "tsconfig.json", "src", "scripts", ".polyglot-pins.json"]
if test_mode and (repo_root / "dist").is_dir():
    include_paths.append("dist")

with tarfile.open(archive_out, "w:gz") as tf:
    for rel in include_paths:
        p = repo_root / rel
        if p.exists():
            tf.add(p, arcname=rel)
ARCHPYEOF

# Optional token staging: Ollama pulls from its registry without an HF token, but if
# POLYGLOT_OPTIONAL_TOKEN is ever provided in the environment, stage it as a mode-600 file in a
# private tmpfs directory and upload it as a file — never via `--env` or argv.
TOKEN_DIR=""
if [ -n "${POLYGLOT_OPTIONAL_TOKEN:-}" ]; then
  if ! TOKEN_DIR="$(umask 077 && mktemp -d "${XDG_RUNTIME_DIR:-/dev/shm}/polyglot-tok.XXXXXX" 2>/dev/null)"; then
    TOKEN_DIR=""
    colab_refuse_logged "${OUT_DIR}" TOKEN_STAGING_FAILED "no private tmpfs directory for token staging"
    exit 1
  fi
  if ! ( umask 077 && printf '%s' "${POLYGLOT_OPTIONAL_TOKEN}" > "${TOKEN_DIR}/polyglot_token" ) \
    || ! chmod 600 "${TOKEN_DIR}/polyglot_token"; then
    colab_refuse_logged "${OUT_DIR}" TOKEN_STAGING_FAILED "could not write mode-600 token file"
    exit 1
  fi
fi

OPENED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH="$(date -u +%s)"
SESSION_OPENED=0
WALL_WATCHER_PID=""
EXEC_PID=""
EXEC_IN_FLIGHT=0

translate_download_bundle_after_failure() {
  local rc="$1"
  colab_salvage_bundle_after_failure \
    "${SESSION}" "${BUNDLE_NOW_PY}" /content/polyglot_translate_bundle.tar.gz \
    "${OUT_DIR}/polyglot_translate_bundle.tar.gz" "${OUT_DIR}" "${rc}"
}

cleanup_on_exit() {
  local rc=$?
  colab_enter_cleanup_trap "${OUT_DIR}"
  if [ -n "${EXEC_PID}" ]; then
    pkill -P "${EXEC_PID}" 2>/dev/null || true
    kill -9 "${EXEC_PID}" 2>/dev/null || true
    wait "${EXEC_PID}" 2>/dev/null || true
  fi
  if [ -n "${TOKEN_DIR}" ]; then
    rm -rf "${TOKEN_DIR}" || true
  fi
  if [ "${rc}" -ne 0 ] && [ "${EXEC_IN_FLIGHT}" = "1" ] \
    && [ ! -s "${OUT_DIR}/polyglot_translate_bundle.tar.gz" ]; then
    translate_download_bundle_after_failure "${rc}" || true
  fi
  if [ -f "${OUT_DIR}/watcher_escalated.txt" ]; then
    sleep 3600
    exit 137
  fi
  printf 'trap\n' > "${OUT_DIR}/stop_path.txt"
  printf '1\n' > "${OUT_DIR}/stop_reached.txt"
  if [ "${SESSION_OPENED}" -eq 1 ] && { [ -f "${OUT_DIR}/session_open_started.txt" ] || [ -f "${OUT_DIR}/session_opened.txt" ]; }; then
    colab_stop_and_log_closing "${PY_BIN}" "${SESSION}" "${OUT_DIR}"
  fi
  if [ -f "${OUT_DIR}/watcher_escalated.txt" ]; then
    sleep 3600
    exit 137
  fi
  if [ -f "${OUT_DIR}/wall_trip_epoch.txt" ] && [ ! -f "${OUT_DIR}/watcher_escalated.txt" ] && [ ! -f "${OUT_DIR}/watcher_wait.txt" ]; then
    printf 'cleanup_seen\n' > "${OUT_DIR}/watcher_wait.txt"
  fi
  printf '1\n' > "${OUT_DIR}/cleanup_finished.txt"
  if [ -n "${WALL_WATCHER_PID}" ]; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "${WALL_WATCHER_PID}" 2>/dev/null || break
      sleep 0.1
    done
    pkill -P "${WALL_WATCHER_PID}" 2>/dev/null || true
    kill -9 "${WALL_WATCHER_PID}" 2>/dev/null || true
    wait "${WALL_WATCHER_PID}" 2>/dev/null || true
  fi
  rm -f "${OUT_DIR}/.watcher_tracked_pids.txt" "${OUT_DIR}/cleanup_finished.txt"
  local closed_at
  closed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  colab_write_window_and_outcome \
    "${PY_BIN}" "${OUT_DIR}" "translate" "${SESSION}" "${CARD}" \
    "${CAP}" "${WALL_S}" "${GRACE_S}" "${MARGIN}" \
    "${OPENED_AT}" "${closed_at}" "${rc}" "${SHAS_JSON}" || true
  colab_scrub_all_logs "${PY_BIN}" "${GUARDS_PY}" "${OUT_DIR}" || true
  exit "${rc}"
}
trap cleanup_on_exit EXIT
trap 'if [ "${COLAB_IN_CLEANUP:-0}" = "1" ]; then colab_on_cleanup_signal "${OUT_DIR}"; elif [ "${COLAB_IN_DOWNLOAD_CHECKED:-0}" = "1" ]; then COLAB_DEFERRED_TERM=1; else exit 143; fi' TERM INT

# Pre-open cap and host-RAM check via launch_guards.py
colab_check_cap_and_ram "${PY_BIN}" "${GUARDS_PY}" "stub" "0" "${WALL_S}" "${GRACE_S}" "${CAP}" "${MARGIN}" "${OUT_DIR}"

# Independent wall watcher (cannot be blocked by a child timeout; polls launcher liveness pre-trip and escalates to `colab stop` + SIGKILL)
WALL_INT="${WALL_S%.*}"
GRACE_INT="${GRACE_S%.*}"
WALL_LIMIT_S="$(( WALL_INT > GRACE_INT ? WALL_INT - GRACE_INT : 1 ))"
MAIN_PID="$$"
printf '%s\n' "${MAIN_PID}" > "${OUT_DIR}/launcher_pid.txt"
colab_run_wall_watcher \
  "${MAIN_PID}" "${WALL_LIMIT_S}" "${PY_BIN}" "${GUARDS_PY}" "${OUT_DIR}" \
  "translate" "${SESSION}" "${CARD}" "${CAP}" "${WALL_S}" "${GRACE_S}" "${MARGIN}" \
  "${OPENED_AT}" "${SHAS_JSON}" </dev/null >/dev/null 2>&1 &
WALL_WATCHER_PID="$!"

# Hold /tmp/colab-window-open.lock while opening with colab new
SESSION_OPENED=1
colab_open_session_locked "${SESSION}" "${CARD}" "${OUT_DIR}"
colab_scrub_all_logs "${PY_BIN}" "${GUARDS_PY}" "${OUT_DIR}"

# Write the VM remote script
REMOTE_SCRIPT="${OUT_DIR}/remote_translate.sh"
cat > "${REMOTE_SCRIPT}" << 'REMOTEEOF'
#!/usr/bin/env bash
set -euo pipefail

# If an optional token file was uploaded (/content/polyglot_token), read and shred it immediately.
POLYGLOT_UPLOADED_TOKEN=""
if [ -f /content/polyglot_token ]; then
  POLYGLOT_UPLOADED_TOKEN="$(cat /content/polyglot_token)"
  shred -u /content/polyglot_token 2>/dev/null || rm -f /content/polyglot_token
  if [ -e /content/polyglot_token ]; then
    echo "REFUSED: TOKEN_SHRED_FAILED: /content/polyglot_token is still on the VM" >&2
    exit 1
  fi
fi

mkdir -p /content/polyglot_out /content/polyglot_work /content/readmes_in
echo "setup" > /content/polyglot_out/phase.txt
: > /content/polyglot_out/setup.log

(
  while true; do
    {
      echo "=== VITALS $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
      if [ -f /sys/fs/cgroup/memory.current ]; then
        echo "CGROUP_MEM_CURRENT: $(cat /sys/fs/cgroup/memory.current)" || true
      fi
      if [ -f /sys/fs/cgroup/memory.max ]; then
        echo "CGROUP_MEM_MAX: $(cat /sys/fs/cgroup/memory.max)" || true
      fi
      if [ -f /sys/fs/cgroup/memory.events ]; then
        sed 's/^/CGROUP_MEM: /' /sys/fs/cgroup/memory.events || true
      fi
      if [ -f /sys/fs/cgroup/memory.stat ]; then
        grep -E '^(anon|shmem|file) ' /sys/fs/cgroup/memory.stat | sed 's/^/CGROUP_MEM_STAT: /' || true
      fi
      grep -E '^(MemTotal|MemAvailable|AnonPages|Shmem):' /proc/meminfo | sed 's/^/MEM: /' || true
      SETUP_SZ="$(wc -c < /content/polyglot_out/setup.log 2>/dev/null | tr -d '[:space:]' || echo 0)"
      echo "SETUP_BYTES: ${SETUP_SZ:-0}"
      echo "PROC:"
      ps -ef | grep -E "ollama|translate-all\.mjs|translate-readme\.mjs|node" | grep -v grep || true
      CUR_PHASE="$(cat /content/polyglot_out/phase.txt 2>/dev/null || echo setup)"
      printf 'HARNESS: {"phase": "%s"}\n' "${CUR_PHASE}"
    } | tee -a /content/polyglot_out/vitals.log
    for _ in $(seq 1 30); do
      [ -f /content/polyglot_out/.remote_done ] && exit 0
      sleep 0.5 </dev/null >/dev/null 2>&1
    done
  done
) &
VITALS_PID="$!"

remote_on_exit() {
  local rc=$?
  trap - EXIT
  printf '1\n' > /content/polyglot_out/.remote_done 2>/dev/null || true
  if [ -n "${VITALS_PID:-}" ]; then
    for _ in 1 2 3 4 5 6; do
      kill -0 "${VITALS_PID}" 2>/dev/null || break
      sleep 0.1
    done
    pkill -P "${VITALS_PID}" 2>/dev/null || true
    kill -9 "${VITALS_PID}" 2>/dev/null || true
    wait "${VITALS_PID}" 2>/dev/null || true
  fi
  rm -f /content/polyglot_out/.remote_done 2>/dev/null || true
  if [ ! -f /content/polyglot_translate_bundle.tar.gz ]; then
    local r_scrub_args=()
    while IFS= read -r -d '' f; do
      r_scrub_args+=("--scrub-file" "${f}")
    done < <(find /content/polyglot_out -type f \( -name "*.log" -o -name "*.json" -o -name "*.txt" \) -print0 2>/dev/null || true)
    if [ "${#r_scrub_args[@]}" -gt 0 ]; then
      python3 /content/launch_guards.py "${r_scrub_args[@]}" </dev/null || true
    fi
    tar -czf /content/polyglot_translate_bundle.tar.gz -C /content/polyglot_out . || true
  fi
  exit "${rc}"
}
trap remote_on_exit EXIT

{
  if [ "${POLYGLOT_TEST_SKIP_VM_INSTALL:-0}" != "1" ]; then
    # 1. Install pinned Node.js checked by sha256
    NODE_TAR="/content/node-${PINNED_NODE_VERSION}-linux-x64.tar.xz"
    NODE_URL="${POLYGLOT_TEST_NODE_TAR_URL:-https://nodejs.org/dist/${PINNED_NODE_VERSION}/node-${PINNED_NODE_VERSION}-linux-x64.tar.xz}"
    curl -fsSL "${NODE_URL}" -o "${NODE_TAR}"
    GOT_NODE_SHA="$(sha256sum "${NODE_TAR}" | awk '{print $1}')"
    if [ "${GOT_NODE_SHA}" != "${PINNED_NODE_TAR_SHA256}" ]; then
      echo "REFUSED: NODE_INSTALL_SHA_MISMATCH: got ${GOT_NODE_SHA} expected ${PINNED_NODE_TAR_SHA256}" >&2
      exit 1
    fi
    mkdir -p /content/node
    tar -xJf "${NODE_TAR}" -C /content/node --strip-components=1
    export PATH="$(cd /content/node/bin && pwd):${PATH}"

    # 2. Install pinned Ollama archive checked by sha256
    OLLAMA_ARCHIVE="/content/ollama-linux-amd64.tar.zst"
    OLLAMA_URL_ARCHIVE="${POLYGLOT_TEST_OLLAMA_TAR_URL:-https://github.com/ollama/ollama/releases/download/v${PINNED_OLLAMA_VERSION}/ollama-linux-amd64.tar.zst}"
    curl -fsSL "${OLLAMA_URL_ARCHIVE}" -o "${OLLAMA_ARCHIVE}"
    GOT_OLLAMA_SHA="$(sha256sum "${OLLAMA_ARCHIVE}" | awk '{print $1}')"
    if [ "${GOT_OLLAMA_SHA}" != "${PINNED_OLLAMA_LINUX_AMD64_SHA256}" ]; then
      echo "REFUSED: OLLAMA_INSTALL_SHA_MISMATCH: got ${GOT_OLLAMA_SHA} expected ${PINNED_OLLAMA_LINUX_AMD64_SHA256}" >&2
      exit 1
    fi
    mkdir -p /content/ollama
    tar --zstd -xf "${OLLAMA_ARCHIVE}" -C /content/ollama
    export PATH="$(cd /content/ollama/bin && pwd):${PATH}"

    ollama serve </dev/null > /content/polyglot_out/ollama_serve.log 2>&1 &
    for _ in $(seq 1 30); do
      if ollama --version >/dev/null 2>&1 && curl -sf "${OLLAMA_HOST:-http://127.0.0.1:11434}/api/tags" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  fi

  OLLAMA_URL="${OLLAMA_HOST:-http://127.0.0.1:11434}"
  export OLLAMA_HOST="${OLLAMA_URL}"

  # 3. Pull model and verify digest against PINNED_MODEL_DIGEST
  if [ "${POLYGLOT_TEST_SKIP_VM_INSTALL:-0}" != "1" ]; then
    if ! ollama pull "${PINNED_TRANSLATEGEMMA_MODEL}"; then
      echo "REFUSED: OLLAMA_PULL_FAILED: ollama pull ${PINNED_TRANSLATEGEMMA_MODEL} failed" >&2
      exit 1
    fi
  else
    curl -sf -X POST "${OLLAMA_URL}/api/pull" -H "Content-Type: application/json" \
      -d "{\"name\":\"${PINNED_TRANSLATEGEMMA_MODEL}\",\"stream\":false}" >/dev/null || true
  fi

  TAGS_JSON="/content/polyglot_out/ollama_tags.json"
  curl -sf "${OLLAMA_URL}/api/tags" > "${TAGS_JSON}"
  VERSION_JSON="/content/polyglot_out/ollama_version.json"
  curl -sf "${OLLAMA_URL}/api/version" > "${VERSION_JSON}" 2>/dev/null || printf '{"version":"%s"}\n' "${PINNED_OLLAMA_VERSION}" > "${VERSION_JSON}"

  python3 - "${TAGS_JSON}" "${PINNED_TRANSLATEGEMMA_MODEL}" "${PINNED_MODEL_DIGEST}" << 'DIGPYEOF'
import json
import sys
from pathlib import Path

tags = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
want_model = sys.argv[2]
want_digest = sys.argv[3].lower().removeprefix("sha256:")

observed_digest = ""
for m in tags.get("models", []):
    name = m.get("name", "")
    if name == want_model or name.startswith(want_model + ":"):
        observed_digest = str(m.get("digest", "")).lower().removeprefix("sha256:")
        break

Path("/content/polyglot_out/model_digest.txt").write_text(f"sha256:{observed_digest}\n", encoding="utf-8")
if not observed_digest or not (observed_digest == want_digest or want_digest.startswith(observed_digest) or observed_digest.startswith(want_digest)):
    sys.stderr.write(
        f"REFUSED: MODEL_DIGEST_MISMATCH: model {want_model} digest={observed_digest or 'none'} expected={want_digest}\n"
    )
    raise SystemExit(1)
print(f"MODEL_DIGEST_OK model={want_model} digest=sha256:{observed_digest}", flush=True)
DIGPYEOF

  # 4. VM-side Fit Probe: warm model at translator context, record nvidia-smi memory, KV size, and ollama ps GPU residency
  curl -sf -X POST "${OLLAMA_URL}/api/generate" -H "Content-Type: application/json" \
    -d "{\"model\":\"${PINNED_TRANSLATEGEMMA_MODEL}\",\"prompt\":\"Warmup probe.\",\"stream\":false}" > /content/polyglot_out/warmup_response.json

  PS_JSON="/content/polyglot_out/ollama_ps.json"
  if ! curl -sf "${OLLAMA_URL}/api/ps" > "${PS_JSON}" 2>/dev/null; then
    printf '{"models":[]}\n' > "${PS_JSON}"
  fi
  PS_TEXT="/content/polyglot_out/ollama_ps.txt"
  if command -v ollama >/dev/null 2>&1; then
    ollama ps > "${PS_TEXT}" 2>&1 || true
  else
    : > "${PS_TEXT}"
  fi

  SMI_CSV="/content/polyglot_out/nvidia_smi.csv"
  if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi --query-gpu=name,memory.used,memory.total,memory.free --format=csv,noheader,nounits > "${SMI_CSV}" 2>/dev/null || true
  else
    : > "${SMI_CSV}"
  fi

  python3 - "${PS_JSON}" "${PS_TEXT}" "${SMI_CSV}" "${PINNED_TRANSLATEGEMMA_MODEL}" "${PINNED_TRANSLATOR_CONTEXT}" "${COLAB_CARD}" "${PINNED_MODEL_PEAK_VRAM_MIB}" "${PINNED_VRAM_HEADROOM_MIB}" << 'FITPYEOF'
import json
import re
import sys
from pathlib import Path

ps_json_p = Path(sys.argv[1])
ps_txt_p = Path(sys.argv[2])
smi_p = Path(sys.argv[3])
model_name = sys.argv[4]
translator_ctx = int(sys.argv[5])
card = sys.argv[6]
measured_peak_vram_mib = int(sys.argv[7])
required_headroom_mib = int(sys.argv[8])
required_total_vram_mib = measured_peak_vram_mib + required_headroom_mib
is_cpu_card = card in ("CPU", "CPU-high-mem")

ps_data = json.loads(ps_json_p.read_text(encoding="utf-8")) if ps_json_p.is_file() else {}
ps_text = ps_txt_p.read_text(encoding="utf-8", errors="replace") if ps_txt_p.is_file() else ""
smi_text = smi_p.read_text(encoding="utf-8", errors="replace").strip() if smi_p.is_file() else ""

gpu_name = None
vram_used_mib = None
vram_total_mib = None
vram_free_mib = None
if smi_text:
    parts = [x.strip() for x in smi_text.splitlines()[0].split(",")]
    if len(parts) >= 4:
        gpu_name = parts[0]
        try:
            vram_used_mib = int(float(parts[1]))
            vram_total_mib = int(float(parts[2]))
            vram_free_mib = int(float(parts[3]))
        except ValueError:
            pass

size_bytes = None
size_vram_bytes = None
context_length = translator_ctx
processor_str = None
kv_cache_mib = None

for m in ps_data.get("models", []):
    if m.get("name") == model_name or str(m.get("name", "")).startswith(model_name):
        size_bytes = m.get("size")
        size_vram_bytes = m.get("size_vram")
        if m.get("context_length"):
            context_length = int(m["context_length"])
        if m.get("processor"):
            processor_str = str(m["processor"])
        if m.get("kv_cache_mib") is not None:
            kv_cache_mib = float(m["kv_cache_mib"])
        break

if processor_str is None and ps_text:
    m_proc = re.search(r"(\d+%\s*(?:/\s*\d+%\s*)?(?:CPU/GPU|GPU|CPU))", ps_text)
    if m_proc:
        processor_str = m_proc.group(1)

if size_bytes and size_vram_bytes is not None and size_bytes > 0:
    gpu_pct = round((float(size_vram_bytes) / float(size_bytes)) * 100.0, 2)
    if processor_str is None:
        processor_str = "100% GPU" if size_vram_bytes == size_bytes else f"{100 - int(gpu_pct)}%/{int(gpu_pct)}% CPU/GPU"
elif processor_str == "100% GPU":
    gpu_pct = 100.0
else:
    gpu_pct = 0.0 if is_cpu_card else 100.0

if kv_cache_mib is None:
    # Gemma 3 27B GQA KV cache at fp16: ~0.375 MiB per token (~1536 MiB at 4k context, ~6144 MiB at 16k context)
    kv_cache_mib = round(context_length * 0.375, 1)

fully_on_gpu = (gpu_pct == 100.0 and processor_str == "100% GPU")
vram_fit_ok = True if is_cpu_card else (vram_total_mib is not None and vram_total_mib >= required_total_vram_mib)
probe = {
    "card": card,
    "gpu_name": gpu_name,
    "model": model_name,
    "translator_context_tokens": context_length,
    "vram_used_mib": vram_used_mib,
    "vram_total_mib": vram_total_mib,
    "vram_free_mib": vram_free_mib,
    "measured_peak_vram_mib": measured_peak_vram_mib,
    "required_headroom_mib": required_headroom_mib,
    "required_total_vram_mib": required_total_vram_mib,
    "vram_fit_ok": vram_fit_ok,
    "model_size_bytes": size_bytes,
    "model_size_vram_bytes": size_vram_bytes,
    "kv_cache_mib": kv_cache_mib,
    "ollama_ps_processor": processor_str,
    "gpu_percent": gpu_pct,
    "fully_on_gpu": fully_on_gpu,
}
Path("/content/polyglot_out/fit_probe.json").write_text(json.dumps(probe, indent=2) + "\n", encoding="utf-8")
print("FIT_PROBE " + json.dumps(probe), flush=True)

if not fully_on_gpu:
    # A GPU window refuses any CPU/GPU split immediately; a CPU stub also refuses if a split probe is injected.
    if not is_cpu_card or (processor_str and "CPU" in processor_str and processor_str != "100% CPU"):
        sys.stderr.write(
            f"REFUSED: MODEL_NOT_FULLY_ON_GPU: ollama ps reports processor={processor_str!r} gpu_percent={gpu_pct}% (size={size_bytes} size_vram={size_vram_bytes})\n"
        )
        raise SystemExit(1)

if not is_cpu_card:
    if vram_total_mib is None or vram_total_mib < required_total_vram_mib:
        sys.stderr.write(
            f"REFUSED: VRAM_HEADROOM_LOW: card={card} gpu_name={gpu_name!r} vram_total_mib={vram_total_mib} < required_total_vram_mib={required_total_vram_mib} (measured_peak_vram_mib={measured_peak_vram_mib} + required_headroom_mib={required_headroom_mib})\n"
        )
        raise SystemExit(1)
FITPYEOF

  # 5. Extract and build the repo at the pinned commit
  tar -xzf /content/repo_archive.tar.gz -C /content/polyglot_work
  if [ "${POLYGLOT_TEST_SKIP_VM_INSTALL:-0}" != "1" ]; then
    (
      cd /content/polyglot_work
      npm ci
      npm run build
    )
  elif [ ! -d /content/polyglot_work/node_modules ] && [ -d "${REPO_ROOT_FOR_TEST_MODULES:-}" ]; then
    python3 -c 'import os, subprocess, sys
src, dst = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
if os.name == "nt":
    subprocess.run(["cmd", "/c", "mklink", "/J", dst, src], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
else:
    os.symlink(src, dst)
' "${REPO_ROOT_FOR_TEST_MODULES}/node_modules" /content/polyglot_work/node_modules
  fi
} 2>&1 | tee -a /content/polyglot_out/setup.log

echo "run" > /content/polyglot_out/phase.txt
tar -xzf /content/readmes_input.tar.gz -C /content/readmes_in

# 6. Run scripts/translate-all.mjs unchanged for each README (all 7 languages, no --langs),
#    enforce #67's verified-file receipt & structural check rule, check nav bar, and record timings
python3 - "/content/polyglot_work" "/content/readmes_in" "/content/polyglot_out" "${PINNED_TRANSLATEGEMMA_MODEL}" "${REPO_COMMIT}" << 'RUNPYEOF'
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

work_dir = Path(sys.argv[1])
in_root = Path(sys.argv[2])
out_root = Path(sys.argv[3])
model_name = sys.argv[4]
repo_commit = sys.argv[5]

langs = ["ja", "zh", "es", "fr", "hi", "it", "pt"]
lang_file_map = {
    "ja": "README.ja.md",
    "zh": "README.zh.md",
    "es": "README.es.md",
    "fr": "README.fr.md",
    "hi": "README.hi.md",
    "it": "README.it.md",
    "pt": "README.pt-BR.md",
}

outputs_root = out_root / "translations"
staging_root = out_root / "_staging_translations"
if staging_root.exists():
    shutil.rmtree(staging_root)
staging_root.mkdir(parents=True, exist_ok=True)

slots = sorted(p for p in in_root.iterdir() if p.is_dir())
single_slot = len(slots) == 1 and slots[0].name == "default"

readme_manifests = []
all_sha_entries = []

for slot in slots:
    src_readme = slot / "README.md"
    pre_run_source_md = src_readme.read_text(encoding="utf-8")
    (out_root / f"pre_source_{slot.name}.md").write_text(pre_run_source_md, encoding="utf-8")
    input_sha = "sha256:" + hashlib.sha256(src_readme.read_bytes()).hexdigest()
    t0 = time.monotonic()
    cmd = ["node", str(work_dir / "scripts" / "translate-all.mjs"), str(src_readme), "--no-cache"]
    env = dict(os.environ)
    env["POLYGLOT_MODEL"] = model_name
    proc = subprocess.run(cmd, cwd=str(work_dir), env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    elapsed_s = round(time.monotonic() - t0, 3)

    log_prefix = slot.name
    (out_root / f"translate_{log_prefix}.stdout.log").write_text(proc.stdout or "", encoding="utf-8")
    (out_root / f"translate_{log_prefix}.stderr.log").write_text(proc.stderr or "", encoding="utf-8")
    sys.stdout.write(proc.stdout or "")
    sys.stderr.write(proc.stderr or "")
    sys.stdout.flush()
    sys.stderr.flush()

    # Parse structured summary from translate-all.mjs stdout
    summary_json = {}
    if "POLYGLOT_COMPLETE" in proc.stdout:
        after = proc.stdout.split("POLYGLOT_COMPLETE", 1)[1]
        brace_idx = after.find("{")
        if brace_idx != -1:
            json_part = after[brace_idx:].split("\n====", 1)[0].strip()
            try:
                summary_json = json.loads(json_part)
            except ValueError:
                pass
    summary_path = out_root / f"summary_{slot.name}.json"
    summary_path.write_text(json.dumps(summary_json, indent=2) + "\n", encoding="utf-8")

    # Optional test-only fault injection to simulate #67 unverified receipt/structural check or #65 nav-bar drop
    corrupt_lang = os.environ.get("POLYGLOT_TEST_CORRUPT_RECEIPT_LANG", "").strip()
    corrupt_slot = os.environ.get("POLYGLOT_TEST_CORRUPT_RECEIPT_SLOT", "").strip()
    if corrupt_lang and (not corrupt_slot or corrupt_slot == slot.name) and summary_json.get("results"):
        for r in summary_json["results"]:
            if r.get("lang") == corrupt_lang:
                r["status"] = "written-unverified"
                r["failedChecks"] = ["no_write_receipt"]
                summary_json.setdefault("writtenUnverified", []).append({
                    "lang": corrupt_lang,
                    "file": lang_file_map.get(corrupt_lang, f"README.{corrupt_lang}.md"),
                    "failedChecks": ["no_write_receipt"],
                })
        summary_path.write_text(json.dumps(summary_json, indent=2) + "\n", encoding="utf-8")

    drop_lang = os.environ.get("POLYGLOT_TEST_DROP_NAV_BAR_LANG", "").strip()
    if drop_lang:
        drop_file = lang_file_map.get(drop_lang, f"README.{drop_lang}.md")
        txt = src_readme.read_text(encoding="utf-8")
        import re as _re
        txt = _re.sub(rf'\s*\|\s*<a href="{_re.escape(drop_file)}">[^<]*</a>', "", txt)
        txt = _re.sub(rf'<a href="{_re.escape(drop_file)}">[^<]*</a>\s*\|\s*', "", txt)
        src_readme.write_text(txt, encoding="utf-8")

    # Adopt #67's receipt & structural verification rule + #65 nav-bar check in the Colab lane
    verify_script = (
        "import { readFileSync } from 'node:fs';"
        "import { resolve } from 'node:path';"
        "import { TRANSLATE_ALL_LANGUAGES, verifyTranslatedMarkdown, resolveNavBarLangCodes, checkSourceNavBar } from './dist/translateAll.js';"
        "const [slotDir, preSrcPath, postSrcPath, summaryPath] = process.argv.slice(1);"
        "const preSrc = readFileSync(preSrcPath, 'utf-8');"
        "const postSrc = readFileSync(postSrcPath, 'utf-8');"
        "const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));"
        "const results = Array.isArray(summary.results) ? summary.results : [];"
        "const verifiedThisRun = [];"
        "const rejectedCodes = [];"
        "const unverifiedDetails = [];"
        "for (const lang of TRANSLATE_ALL_LANGUAGES) {"
        "  const r = results.find((x) => x.lang === lang.code);"
        "  const fname = `README.${lang.file ?? lang.code}.md`;"
        "  const fpath = resolve(slotDir, fname);"
        "  if (!r || (r.status !== 'ok' && r.status !== 'done-after-silence')) {"
        "    const checks = (r && Array.isArray(r.failedChecks) && r.failedChecks.length) ? r.failedChecks : [r ? r.status : 'missing_result'];"
        "    if (checks.includes('receipt_sha_mismatch')) rejectedCodes.push(lang.code);"
        "    unverifiedDetails.push(`${lang.code}(${fname}: ${checks.join(',')})`);"
        "    continue;"
        "  }"
        "  let cand = '';"
        "  try { cand = readFileSync(fpath, 'utf-8'); } catch { unverifiedDetails.push(`${lang.code}(${fname}: missing_file)`); continue; }"
        "  const mdCheck = verifyTranslatedMarkdown(preSrc, cand);"
        "  if (!mdCheck.verified) {"
        "    unverifiedDetails.push(`${lang.code}(${fname}: ${mdCheck.failedChecks.join(',')})`);"
        "    continue;"
        "  }"
        "  verifiedThisRun.push(lang.code);"
        "}"
        "const navBarLangCodes = resolveNavBarLangCodes(slotDir, preSrc, verifiedThisRun, TRANSLATE_ALL_LANGUAGES, rejectedCodes);"
        "const navRes = checkSourceNavBar(postSrc, navBarLangCodes, TRANSLATE_ALL_LANGUAGES);"
        "console.log(JSON.stringify({ verifiedThisRun, navBarLangCodes: Array.from(navBarLangCodes), navBarCheck: navRes, unverifiedDetails }));"
        "if (!navRes.ok) { console.error(`REFUSED: ${navRes.refusalCode}: ${navRes.why}`); process.exit(1); }"
        "if (unverifiedDetails.length > 0) { console.error(`REFUSED: TRANSLATION_UNVERIFIED: unverified translation(s): ${unverifiedDetails.join('; ')}`); process.exit(1); }"
    )
    nav_check_proc = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            verify_script,
            str(slot),
            str(out_root / f"pre_source_{slot.name}.md"),
            str(src_readme),
            str(summary_path),
        ],
        cwd=str(work_dir),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if nav_check_proc.returncode != 0:
        shutil.rmtree(staging_root, ignore_errors=True)
        shutil.rmtree(outputs_root, ignore_errors=True)
        sys.stderr.write(nav_check_proc.stderr)
        sys.stderr.flush()
        with (out_root / "setup.log").open("a", encoding="utf-8") as sf:
            sf.write(nav_check_proc.stderr)
        raise SystemExit(1)

    if proc.returncode != 0:
        shutil.rmtree(staging_root, ignore_errors=True)
        shutil.rmtree(outputs_root, ignore_errors=True)
        msg = f"REFUSED: TRANSLATION_FAILED: translate-all.mjs exited {proc.returncode} for {slot.name}\n"
        sys.stderr.write(msg)
        with (out_root / "setup.log").open("a", encoding="utf-8") as sf:
            sf.write(msg)
        raise SystemExit(1)

    verify_payload = json.loads(nav_check_proc.stdout.strip())
    dest_dir = staging_root if single_slot else (staging_root / slot.name)
    dest_dir.mkdir(parents=True, exist_ok=True)

    output_shas = {}
    copied_files = ["README.md"] + [lang_file_map[lc] for lc in verify_payload["verifiedThisRun"]]
    for fname in copied_files:
        fp = slot / fname
        if not fp.is_file():
            shutil.rmtree(staging_root, ignore_errors=True)
            shutil.rmtree(outputs_root, ignore_errors=True)
            msg = f"REFUSED: TRANSLATION_FAILED: expected output file {fname} missing for {slot.name}\n"
            sys.stderr.write(msg)
            with (out_root / "setup.log").open("a", encoding="utf-8") as sf:
                sf.write(msg)
            raise SystemExit(1)
        dst_fp = dest_dir / fname
        shutil.copy2(fp, dst_fp)
        f_hex = hashlib.sha256(dst_fp.read_bytes()).hexdigest()
        output_shas[fname] = f"sha256:{f_hex}"
        rel_out = dst_fp.relative_to(staging_root).as_posix()
        all_sha_entries.append((f_hex, rel_out))

    per_lang_status = {}
    per_lang_timings = {}
    for r in summary_json.get("results", []):
        lc = r.get("lang")
        if lc:
            per_lang_status[lc] = r.get("status", "ok")
            per_lang_timings[lc] = float(r.get("time", 0.0))

    readme_manifests.append({
        "slug": slot.name,
        "input_sha256": input_sha,
        "output_shas": output_shas,
        "verified_languages": verify_payload["verifiedThisRun"],
        "done_after_silence": summary_json.get("doneAfterSilence", []),
        "written_unverified": summary_json.get("writtenUnverified", []),
        "per_language_status": per_lang_status,
        "per_language_timings_s": per_lang_timings,
        "total_elapsed_s": elapsed_s,
        "nav_bar_check": verify_payload["navBarCheck"],
    })

if outputs_root.exists():
    shutil.rmtree(outputs_root)
staging_root.rename(outputs_root)

sha_lines = [f"{h}  {rel}\n" for h, rel in sorted(all_sha_entries, key=lambda x: x[1])]
(outputs_root / "SHA256SUMS").write_text("".join(sha_lines), encoding="utf-8", newline="\n")
(out_root / "SHA256SUMS").write_text("".join(sha_lines), encoding="utf-8", newline="\n")

model_digest = (out_root / "model_digest.txt").read_text(encoding="utf-8").strip() if (out_root / "model_digest.txt").is_file() else ""
ver_data = json.loads((out_root / "ollama_version.json").read_text(encoding="utf-8")) if (out_root / "ollama_version.json").is_file() else {}
fit_probe = json.loads((out_root / "fit_probe.json").read_text(encoding="utf-8")) if (out_root / "fit_probe.json").is_file() else {}

manifest = {
    "schema_version": 1,
    "repo_commit": repo_commit,
    "model": model_name,
    "model_digest": model_digest,
    "ollama_version": ver_data.get("version", ""),
    "languages": langs,
    "fit_probe": fit_probe,
    "readmes": readme_manifests,
}
(outputs_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
(out_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")

vm_win = {
    "repo_commit": repo_commit,
    "model": model_name,
    "model_digest": model_digest,
    "ollama_version": ver_data.get("version", ""),
    "fit_probe": fit_probe,
    "translated_readmes": len(readme_manifests),
}
(out_root / "vm_window.json").write_text(json.dumps(vm_win, indent=2) + "\n", encoding="utf-8", newline="\n")
print("WINDOW_JSON " + json.dumps(vm_win), flush=True)
RUNPYEOF

f_scrub_args=()
while IFS= read -r -d '' f; do
  f_scrub_args+=("--scrub-file" "${f}")
done < <(find /content/polyglot_out -type f \( -name "*.log" -o -name "*.json" -o -name "*.txt" \) -print0 2>/dev/null || true)
if [ "${#f_scrub_args[@]}" -gt 0 ]; then
  python3 /content/launch_guards.py "${f_scrub_args[@]}" </dev/null || true
fi
tar -czf /content/polyglot_translate_bundle.tar.gz -C /content/polyglot_out .
REMOTEEOF

colab_check_pre_exec_cap "${OUT_DIR}"

# Upload inputs flat into /content
colab_upload_checked "${SESSION}" "${REPO_ARCHIVE}" /content/repo_archive.tar.gz "${OUT_DIR}"
colab_upload_checked "${SESSION}" "${READMES_TAR_PATH}" /content/readmes_input.tar.gz "${OUT_DIR}"
colab_upload_checked "${SESSION}" "${GUARDS_PY}" /content/launch_guards.py "${OUT_DIR}"
if [ -n "${TOKEN_DIR}" ] && [ -f "${TOKEN_DIR}/polyglot_token" ]; then
  colab_upload_checked "${SESSION}" "${TOKEN_DIR}/polyglot_token" /content/polyglot_token "${OUT_DIR}"
  rm -rf "${TOKEN_DIR}"
  TOKEN_DIR=""
fi
colab_upload_checked "${SESSION}" "${REMOTE_SCRIPT}" /content/remote_translate.sh "${OUT_DIR}"

REMOTE_ENV=(
  "SDLAB_REMOTE_SCRIPT=/content/remote_translate.sh"
  "PINNED_NODE_VERSION=${PINNED_NODE_VERSION}"
  "PINNED_NODE_TAR_SHA256=${POLYGLOT_TEST_NODE_TAR_SHA256:-${PINNED_NODE_TAR_SHA256}}"
  "PINNED_OLLAMA_VERSION=${PINNED_OLLAMA_VERSION}"
  "PINNED_OLLAMA_LINUX_AMD64_SHA256=${POLYGLOT_TEST_OLLAMA_TAR_SHA256:-${PINNED_OLLAMA_LINUX_AMD64_SHA256}}"
  "PINNED_TRANSLATEGEMMA_MODEL=${PINNED_TRANSLATEGEMMA_MODEL}"
  "PINNED_MODEL_DIGEST=${POLYGLOT_TEST_MODEL_DIGEST:-${PINNED_MODEL_DIGEST}}"
  "PINNED_TRANSLATOR_CONTEXT=${PINNED_TRANSLATOR_CONTEXT}"
  "PINNED_MODEL_PEAK_VRAM_MIB=${PINNED_MODEL_PEAK_VRAM_MIB}"
  "PINNED_VRAM_HEADROOM_MIB=${PINNED_VRAM_HEADROOM_MIB}"
  "COLAB_CARD=${CARD}"
  "REPO_COMMIT=${REPO_COMMIT}"
)
if [ "${TEST_MODE}" = "1" ]; then
  REMOTE_ENV+=("REPO_ROOT_FOR_TEST_MODULES=${REPO_ROOT}")
  if [ -n "${POLYGLOT_TEST_FAKE_OLLAMA_URL:-}" ]; then
    REMOTE_ENV+=("OLLAMA_HOST=${POLYGLOT_TEST_FAKE_OLLAMA_URL}")
  fi
  if [ -n "${POLYGLOT_TEST_SKIP_VM_INSTALL:-}" ]; then
    REMOTE_ENV+=("POLYGLOT_TEST_SKIP_VM_INSTALL=${POLYGLOT_TEST_SKIP_VM_INSTALL}")
  fi
  if [ -n "${POLYGLOT_TEST_DROP_NAV_BAR_LANG:-}" ]; then
    REMOTE_ENV+=("POLYGLOT_TEST_DROP_NAV_BAR_LANG=${POLYGLOT_TEST_DROP_NAV_BAR_LANG}")
  fi
  if [ -n "${POLYGLOT_TEST_CORRUPT_RECEIPT_LANG:-}" ]; then
    REMOTE_ENV+=("POLYGLOT_TEST_CORRUPT_RECEIPT_LANG=${POLYGLOT_TEST_CORRUPT_RECEIPT_LANG}")
  fi
  if [ -n "${POLYGLOT_TEST_CORRUPT_RECEIPT_SLOT:-}" ]; then
    REMOTE_ENV+=("POLYGLOT_TEST_CORRUPT_RECEIPT_SLOT=${POLYGLOT_TEST_CORRUPT_RECEIPT_SLOT}")
  fi
  if [ -n "${POLYGLOT_TEST_NODE_TAR_URL:-}" ]; then
    REMOTE_ENV+=("POLYGLOT_TEST_NODE_TAR_URL=${POLYGLOT_TEST_NODE_TAR_URL}")
  fi
  if [ -n "${POLYGLOT_TEST_OLLAMA_TAR_URL:-}" ]; then
    REMOTE_ENV+=("POLYGLOT_TEST_OLLAMA_TAR_URL=${POLYGLOT_TEST_OLLAMA_TAR_URL}")
  fi
fi

colab_check_pre_exec_cap "${OUT_DIR}"
EXEC_IN_FLIGHT=1
colab_run_exec_with_live_guards \
  "${PY_BIN}" "${GUARDS_PY}" "${SESSION}" "${RUNNER_PY}" \
  "${START_EPOCH}" "${WALL_S}" "${GRACE_S}" "${CAP}" "${MARGIN}" "${OUT_DIR}" \
  "${REMOTE_ENV[@]}"

# Download result bundle and unpack translated files, SHA256SUMS, and manifest.json into OUT_DIR
# (EXEC_IN_FLIGHT stays 1 across colab_download_checked so a failed or timed-out normal download
# still triggers post-failure salvage in cleanup_on_exit.)
BUNDLE_LOCAL="${OUT_DIR}/polyglot_translate_bundle.tar.gz"
colab_download_checked "${SESSION}" /content/polyglot_translate_bundle.tar.gz "${BUNDLE_LOCAL}" "${OUT_DIR}"
EXEC_IN_FLIGHT=0

"${PY_BIN}" - "${BUNDLE_LOCAL}" "${OUT_DIR}" << 'UNPACKPYEOF'
import shutil
import sys
import tarfile
from pathlib import Path

bundle = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
extract_dir = out_dir / "bundle_extracted"
extract_dir.mkdir(parents=True, exist_ok=True)

with tarfile.open(bundle, "r:gz") as tf:
    try:
        tf.extractall(extract_dir, filter="data")
    except TypeError:
        tf.extractall(extract_dir)

for name in ("manifest.json", "SHA256SUMS", "fit_probe.json", "vm_window.json"):
    src = extract_dir / name
    if src.is_file():
        shutil.copy2(src, out_dir / name)

trans_dir = extract_dir / "translations"
if trans_dir.is_dir():
    for item in trans_dir.iterdir():
        dst = out_dir / item.name
        if item.is_dir():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(item, dst)
        elif item.is_file():
            shutil.copy2(item, dst)
UNPACKPYEOF

colab_scrub_all_logs "${PY_BIN}" "${GUARDS_PY}" "${OUT_DIR}"
