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
# The context window (tokens, per slot) the server is started with (OLLAMA_CONTEXT_LENGTH) and every request asks for
# (num_ctx). src/numCtx.ts DEFAULT_NUM_CTX must equal it (a test checks). 8192, not 4096: the largest batch translate.ts
# builds (6000 source characters, about 2000 tokens, plus its prompt, about 2200 tokens in all) cannot hold its own
# translation in 4096, and 8192 holds the prompt plus an output of up to 3x the source. Unpinned, Ollama 0.40.15 picked
# 131072 on a G4 (a 49,152 MiB KV cache for one slot) and the run crawled.
PINNED_TRANSLATOR_CONTEXT="8192"
# Parallel slots on the server (OLLAMA_NUM_PARALLEL) and languages translate-all runs at once (--concurrency). The
# window uses fewer when the card's VRAM cannot hold that many KV caches (see the ollama_serve step); the number used is
# recorded in fit_probe.json.
PINNED_NUM_PARALLEL="7"
# R&D measured peak VRAM for translategemma:27b on Ollama 0.40.15 (GPU ledger, polyglot row, 2026-11-09)
# plus required safety headroom before translation starts (22547 + 1024 = 23571 MiB).
PINNED_MODEL_PEAK_VRAM_MIB="22547"
PINNED_VRAM_HEADROOM_MIB="1024"

PINNED_LAUNCH_GUARDS_SHA="4e6d30ee02773a23deec84fa64df056395a31730ca4b8686cc2fdc7831a0d873"
PINNED_REMOTE_RUNNER_SHA="834e669de7f611c8d3b0e24dcd65c568c0d97a2bafb6080b235ea9a22b4f99d9"
PINNED_COLAB_WINDOW_SHA="580b5d34c73491a3625185e8d8b8572bce189cdc528bcf2c4f735eb176374f08"
PINNED_BUNDLE_NOW_SHA="dadc1f2956cd84d357506b1397c39f83dd2ab5541081a5db3f557ba6258d1db8"
PINNED_COMPARE_SHA="1ebd61b21583133d8baa38acb333dac2b41f19dfb19df435a19e77bf8a3cda25"
PINNED_TRANSLATE_ALL_SHA="474d9cb9a7977ea63788793f108c2270138fab00dd401a73a5a3d1ca9c7a34af"
PINNED_TRANSLATE_README_SHA="3b9cee469b4c75b84db26459ecfe803cc73510839caaa0b86b33abc7273a9e57"
PINNED_PACKAGE_JSON_SHA="914dcc28c71e43ef024c9fbc8c79e8d9a437a0f1aca77d32c5e899b20cb836fe"
PINNED_PACKAGE_LOCK_SHA="712e9c93680b481daff0eaada8ec509da4ca025df5959561e6b3301174c00b22"
PINNED_SELF_SHA="63216e298df46af2ac1c406f7081a569025cb2d483088804e13e894fbe5c9b6f"

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
STUB_MODE=0
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
    --stub)
      STUB_MODE=1
      shift
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

if [ "${STUB_MODE}" = "1" ]; then
  if ! colab_card_is_cpu "${CARD}"; then
    echo "REFUSED: STUB_CPU_ONLY: --stub runs only on a CPU card (got --card ${CARD})" >&2
    exit 2
  fi
  if [ -n "${POLYGLOT_TEST_SKIP_VM_INSTALL:-}" ]; then
    echo "REFUSED: STUB_SKIP_INSTALL_FORBIDDEN: POLYGLOT_TEST_SKIP_VM_INSTALL cannot be set with --stub" >&2
    exit 2
  fi
fi

HAS_READMES=1
if [ "${#README_PATHS[@]}" -eq 0 ] && [ -z "${README_TAR}" ]; then
  HAS_READMES=0
fi

if [ "${STUB_MODE}" != "1" ] && [ "${HAS_READMES}" = "0" ]; then
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

POLYGLOT_MODE_VAL="translate"
if [ "${STUB_MODE}" = "1" ]; then
  POLYGLOT_MODE_VAL="stub"
fi

REMOTE_ENV=()
build_remote_env() {
  local env_test_mode="$1"
  local env_repo_commit="$2"
  REMOTE_ENV=(
    "SDLAB_REMOTE_SCRIPT=/content/remote_translate.sh"
    "POLYGLOT_MODE=${POLYGLOT_MODE_VAL}"
    "PINNED_NODE_VERSION=${PINNED_NODE_VERSION}"
    "PINNED_NODE_TAR_SHA256=${POLYGLOT_TEST_NODE_TAR_SHA256:-${PINNED_NODE_TAR_SHA256}}"
    "PINNED_OLLAMA_VERSION=${PINNED_OLLAMA_VERSION}"
    "PINNED_OLLAMA_LINUX_AMD64_SHA256=${POLYGLOT_TEST_OLLAMA_TAR_SHA256:-${PINNED_OLLAMA_LINUX_AMD64_SHA256}}"
    "PINNED_TRANSLATEGEMMA_MODEL=${PINNED_TRANSLATEGEMMA_MODEL}"
    "PINNED_MODEL_DIGEST=${POLYGLOT_TEST_MODEL_DIGEST:-${PINNED_MODEL_DIGEST}}"
    "PINNED_TRANSLATOR_CONTEXT=${PINNED_TRANSLATOR_CONTEXT}"
    "PINNED_NUM_PARALLEL=${PINNED_NUM_PARALLEL}"
    "PINNED_MODEL_PEAK_VRAM_MIB=${PINNED_MODEL_PEAK_VRAM_MIB}"
    "PINNED_VRAM_HEADROOM_MIB=${PINNED_VRAM_HEADROOM_MIB}"
    "COLAB_CARD=${CARD}"
    "REPO_COMMIT=${env_repo_commit}"
  )
  if [ "${env_test_mode}" = "1" ]; then
    REMOTE_ENV+=("REPO_ROOT_FOR_TEST_MODULES=${REPO_ROOT}")
    if [ -n "${POLYGLOT_TEST_FAKE_OLLAMA_URL:-}" ]; then
      REMOTE_ENV+=("OLLAMA_HOST=${POLYGLOT_TEST_FAKE_OLLAMA_URL}")
    fi
    if [ "${STUB_MODE}" != "1" ] && [ -n "${POLYGLOT_TEST_SKIP_VM_INSTALL:-}" ]; then
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
    if [ -n "${POLYGLOT_TEST_ZSTD_INSTALL_TIMEOUT_S:-}" ]; then
      REMOTE_ENV+=("POLYGLOT_TEST_ZSTD_INSTALL_TIMEOUT_S=${POLYGLOT_TEST_ZSTD_INSTALL_TIMEOUT_S}")
    fi
    if [ -n "${POLYGLOT_TEST_OLLAMA_SERVE_WAIT_S:-}" ]; then
      REMOTE_ENV+=("POLYGLOT_TEST_OLLAMA_SERVE_WAIT_S=${POLYGLOT_TEST_OLLAMA_SERVE_WAIT_S}")
    fi
    if [ -n "${POLYGLOT_TEST_SERVE_STOP_TIMEOUT_S:-}" ]; then
      REMOTE_ENV+=("POLYGLOT_TEST_SERVE_STOP_TIMEOUT_S=${POLYGLOT_TEST_SERVE_STOP_TIMEOUT_S}")
    fi
    if [ -n "${POLYGLOT_TEST_VITALS_STEPS:-}" ]; then
      REMOTE_ENV+=("POLYGLOT_TEST_VITALS_STEPS=${POLYGLOT_TEST_VITALS_STEPS}")
    fi
  fi
}

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
  DRY_REPO_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  build_remote_env "${DRY_TEST_MODE}" "${DRY_REPO_COMMIT}"

  "${PY_BIN}" - "${GUARDS_PY}" "${CARD}" "${SHAPE}" "${MAX_RATE:-0.26}" "${CAP}" "${MARGIN}" "${WALL_S}" "${GRACE_S}" "${SESSION}" "${OUT_DIR}" "${PINNED_TRANSLATEGEMMA_MODEL}" "${PINNED_MODEL_DIGEST}" "${PINNED_OLLAMA_VERSION}" "${PINNED_NODE_VERSION}" "${PINNED_OLLAMA_LINUX_AMD64_SHA256}" "${COLAB_CLEANUP_BOUND_S}" "${MIN_RUNTIME_S}" "${STUB_MODE}" "${README_TAR}" "${#README_PATHS[@]}" "${README_PATHS[@]}" "${REMOTE_ENV[@]}" << 'DRYPYEOF'
import json
import shlex
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
ollama_sha = sys.argv[15]
cleanup_bound_s = float(sys.argv[16])
min_runtime_raw = sys.argv[17]
min_runtime_s = float(min_runtime_raw) if min_runtime_raw else None
stub_mode = sys.argv[18] == "1"
readme_tar = sys.argv[19]
readme_count = int(sys.argv[20])
readme_paths = sys.argv[21 : 21 + readme_count]
remote_env = sys.argv[21 + readme_count :]

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
exec_timeout = int(wall_s) + int(grace_s) + 60

new_cmd = f"colab new --high-mem -s {session}" if card in ("CPU", "CPU-high-mem") else (
    f"colab new --gpu {card}" + (" --high-mem" if shape == "high-mem" else "") + f" -s {session}"
)
remote_command = shlex.join(["env", *remote_env, "bash", "/content/remote_translate.sh"])
exec_command = shlex.join(
    [
        "colab",
        "exec",
        "-s",
        session,
        "-f",
        "scripts/colab/remote_runner.py",
        "--timeout",
        str(exec_timeout),
        *[arg for kv in remote_env for arg in ("--env", kv)],
    ]
)
readmes_list = readme_paths if readme_paths else ([readme_tar] if readme_tar else [])
remote_steps = [
    "token_shred",
    "node_install",
    "ollama_download",
    "zstd_install",
    "ollama_unpack",
    "ollama_serve",
]
if not stub_mode:
    remote_steps.extend(["model_pull", "model_digest", "fit_probe", "repo_build", "translate"])

commands = [
    "colab usage",
    new_cmd,
    "colab sessions",
    "colab usage",
    f"colab upload -s {session} <out_dir>/repo_archive.tar.gz /content/repo_archive.tar.gz",
]
if readmes_list:
    commands.append(
        f"colab upload -s {session} <out_dir>/readmes_input.tar.gz /content/readmes_input.tar.gz"
    )
commands.extend(
    [
        f"colab upload -s {session} scripts/colab/launch_guards.py /content/launch_guards.py",
        f"colab upload -s {session} <out_dir>/remote_translate.sh /content/remote_translate.sh",
        exec_command,
        f"colab download -s {session} /content/polyglot_translate_bundle.tar.gz {out_dir}/polyglot_translate_bundle.tar.gz",
        f"colab stop -s {session}",
        "colab sessions",
    ]
)

plan = {
    "dry_run": True,
    "mode": "stub" if stub_mode else "paid",
    "stub": stub_mode,
    "session": session,
    "card": card,
    "shape": shape,
    "cap": cap,
    "cap_ccu": cap,
    "wall_s": int(wall_s),
    "grace_s": int(grace_s),
    "margin": margin,
    "langs": [] if stub_mode else langs,
    "readmes": readmes_list,
    "out_dir": out_dir,
    "pinned": {
        "node_version": node_ver,
        "ollama_version": ollama_ver,
        "ollama_archive": "ollama-linux-amd64.tar.zst",
        "ollama_archive_sha256": f"sha256:{ollama_sha}",
        "model": None if stub_mode else model,
        "model_digest": None if stub_mode else f"sha256:{model_digest}",
    },
    "remote_steps": remote_steps,
    "remote_command": remote_command,
    "exec_command": exec_command,
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
    "commands": commands,
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
  POLYGLOT_TEST_ZSTD_INSTALL_TIMEOUT_S
  POLYGLOT_TEST_OLLAMA_SERVE_WAIT_S
  POLYGLOT_TEST_SERVE_STOP_TIMEOUT_S
  POLYGLOT_TEST_VITALS_STEPS
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
if [ "${HAS_READMES}" = "1" ]; then
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
else
  printf '{\n  "items": []\n}\n' > "${INPUT_READMES_JSON}"
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

translate_unpack_bundle() {
  # <bundle.tar.gz> <out_dir>: extract into <out_dir>/bundle_extracted and publish what is in it.
"${PY_BIN}" - "$1" "$2" << 'UNPACKPYEOF'
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

for name in (
    "manifest.json",
    "SHA256SUMS",
    "fit_probe.json",
    "vm_window.json",
    "readme_results.json",
    "remote_failure.json",
    "remote_step.txt",
    "zstd_version.txt",
    "node_version.txt",
):
    src = extract_dir / name
    if src.is_file():
        shutil.copy2(src, out_dir / name)

# An accepted run publishes translations/. A run that stopped early (a refusal, a stall, the wall, a dead
# harness) never renamed its staging directory, but every README staged there passed its gates, so it is
# published the same way: nothing the window produced is left behind in the bundle.
trans_dir = extract_dir / "translations"
if not trans_dir.is_dir() and (extract_dir / "_staging_translations").is_dir():
    trans_dir = extract_dir / "_staging_translations"
# Raw output of every refused language, kept for a human hand-fix and a pin.
refused_dir = extract_dir / "refused_raw"
if refused_dir.is_dir():
    dst_refused = out_dir / "refused_raw"
    if dst_refused.exists():
        shutil.rmtree(dst_refused)
    shutil.copytree(refused_dir, dst_refused)
for summ in sorted(extract_dir.glob("summary_*.json")):
    shutil.copy2(summ, out_dir / summ.name)
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
}

translate_download_bundle_after_failure() {
  local rc="$1"
  colab_salvage_bundle_after_failure \
    "${SESSION}" "${BUNDLE_NOW_PY}" /content/polyglot_translate_bundle.tar.gz \
    "${OUT_DIR}/polyglot_translate_bundle.tar.gz" "${OUT_DIR}" "${rc}"
}

cleanup_on_exit() {
  local rc=$?
  # Release the open lock first if an exit or signal arrived while it was held, so no cleanup child
  # inherits fd 9 and keeps the queue blocked after this window is gone.
  colab_release_open_lock_if_held "${OUT_DIR}" "${SESSION} on_exit rc=${rc}" 2>/dev/null || true
  colab_enter_cleanup_trap "${OUT_DIR}"
  colab_kill_tracked_pids "${OUT_DIR}" "${WALL_WATCHER_PID}"
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
  # Every exit path publishes what the bundle holds: a README that finished clean before a later refusal,
  # a stall or the wall comes back with its summaries and logs (window polyglot-rb-d lost one this way).
  if [ "${rc}" -ne 0 ] && [ -s "${OUT_DIR}/polyglot_translate_bundle.tar.gz" ] && [ ! -d "${OUT_DIR}/bundle_extracted" ]; then
    translate_unpack_bundle "${OUT_DIR}/polyglot_translate_bundle.tar.gz" "${OUT_DIR}" || true
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
  colab_stamp_close "${OUT_DIR}"
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

mkdir -p /content/polyglot_out /content/polyglot_work /content/readmes_in
# The setup block below runs in a pipeline subshell, so what it assigns or exports is lost when it ends.
# It hands the ollama serve pid, the PATH directories, OLLAMA_HOST, and step markers to this shell through
# files in this directory, which is deliberately outside the archived polyglot_out.
POLYGLOT_STATE_DIR="/content/polyglot_state"
rm -rf "${POLYGLOT_STATE_DIR}"
mkdir -p "${POLYGLOT_STATE_DIR}"
echo "setup" > /content/polyglot_out/phase.txt
: > /content/polyglot_out/setup.log

begin_remote_step() {
  local step="$1"
  printf '%s\n' "${step}" > "${POLYGLOT_STATE_DIR}/current_step.txt"
  printf '%s\n' "${step}" > /content/polyglot_out/remote_step.txt
  printf 'REMOTE_STEP step=%s\n' "${step}"
}

write_remote_failure_marker() {
  local step="$1"
  local code="$2"
  local reason="$3"
  local rc="${4:-1}"
  python3 - "${step}" "${code}" "${reason}" "${rc}" "${POLYGLOT_STATE_DIR}" << 'MARKPYEOF'
import json
import sys
from pathlib import Path

step, code, reason, rc_s, state_dir_s = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
rc_val = int(rc_s) if rc_s.lstrip("-").isdigit() and int(rc_s) != 0 else 1
why_clean = reason.strip()
if step and f"[{step}]" not in why_clean and not why_clean.startswith(f"{step}:"):
    why_with_step = f"[{step}] {why_clean}" if why_clean else f"[{step}] remote step failed (rc={rc_val})"
else:
    why_with_step = why_clean or f"[{step or 'unknown'}] remote step failed (rc={rc_val})"
marker = {
    "step": step or "unknown",
    "refusal_code": code,
    "reason": why_clean,
    "why": why_with_step,
    "rc": rc_val,
}
out_dir = Path("/content/polyglot_out")
out_dir.mkdir(parents=True, exist_ok=True)
state_dir = Path(state_dir_s)
state_dir.mkdir(parents=True, exist_ok=True)
payload = json.dumps(marker, indent=2) + "\n"
(out_dir / "remote_failure.json").write_text(payload, encoding="utf-8", newline="\n")
(state_dir / "remote_failure.json").write_text(payload, encoding="utf-8", newline="\n")
print("REMOTE_STEP_FAILED_MARKER " + json.dumps(marker), flush=True)
sys.stderr.write(f"REFUSED: {code}: {why_with_step}\n")
sys.stderr.flush()
MARKPYEOF
}

fail_remote_step() {
  local step="$1"
  local code="$2"
  local reason="$3"
  local rc="${4:-1}"
  case "${rc}" in
    ''|0|*[!0-9-]*) rc=1 ;;
  esac
  write_remote_failure_marker "${step}" "${code}" "${reason}" "${rc}"
  exit "${rc}"
}

# If an optional token file was uploaded (/content/polyglot_token), read and shred it immediately.
begin_remote_step "token_shred"
POLYGLOT_UPLOADED_TOKEN=""
if [ -f /content/polyglot_token ]; then
  POLYGLOT_UPLOADED_TOKEN="$(cat /content/polyglot_token)"
  shred -u /content/polyglot_token 2>/dev/null || rm -f /content/polyglot_token || true
  if [ -e /content/polyglot_token ]; then
    fail_remote_step "token_shred" "TOKEN_SHRED_FAILED" "/content/polyglot_token is still on the VM" 1
  fi
fi

if [ "${POLYGLOT_MODE:-translate}" = "stub" ] && [ -n "${POLYGLOT_TEST_SKIP_VM_INSTALL:-}" ]; then
  fail_remote_step "stub_env_guard" "STUB_SKIP_INSTALL_FORBIDDEN" "POLYGLOT_TEST_SKIP_VM_INSTALL cannot be set with --stub" 2
fi

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
      # (|| true: with pipefail an absent counter dir must not end this sampler.)
      # Segments translated so far, summed over every language's heartbeat counter (translate-readme.mjs writes
      # one file per language and README; see POLYGLOT_PROGRESS_DIR). The rig's stall guard reads this line.
      SEG_SUM="$(cat /content/polyglot_state/progress/*.txt 2>/dev/null | awk '{s += $1} END {print s + 0}' || true)"
      echo "SEGMENTS_DONE: ${SEG_SUM:-0}"
      echo "PROC:"
      ps -ef | grep -E "ollama|translate-all\.mjs|translate-readme\.mjs|node" | grep -v grep || true
      CUR_PHASE="$(cat /content/polyglot_out/phase.txt 2>/dev/null || echo setup)"
      printf 'HARNESS: {"phase": "%s"}\n' "${CUR_PHASE}"
    } | tee -a /content/polyglot_out/vitals.log
    for _ in $(seq 1 "${POLYGLOT_TEST_VITALS_STEPS:-30}"); do
      [ -f /content/polyglot_out/.remote_done ] && exit 0
      sleep 0.5 </dev/null >/dev/null 2>&1
    done
  done
) &
VITALS_PID="$!"

OLLAMA_SERVE_PID=""
# STOP_WRITERS_BEGIN: vitals and ollama serve both append to logs inside the tarred polyglot_out;
# stop them before the final scrub and tar (and again, harmlessly, from remote_on_exit).
# A zombie writes nothing and holds no open files, so a pid in state Z counts as gone (nothing reaps it here).
# Returns 0 if the pid is alive, 1 if it is gone or a zombie (and sets SERVE_PID_ZOMBIE=1 for a zombie).
SERVE_PID_ZOMBIE=0
serve_pid_alive() {
  local p="${1:-}" st="" rest=""
  kill -0 "${p}" 2>/dev/null || return 1
  if [ -r "/proc/${p}/stat" ]; then
    if IFS= read -r st < "/proc/${p}/stat" 2>/dev/null; then
      rest="${st##*) }"
      case "${rest}" in
        Z*) SERVE_PID_ZOMBIE=1; return 1 ;;
      esac
      return 0
    fi
    kill -0 "${p}" 2>/dev/null || return 1
  fi
  return 0
}
stop_writers() {
  printf '1\n' > /content/polyglot_out/.remote_done 2>/dev/null || true
  local wp state_dir="${POLYGLOT_STATE_DIR:-/content/polyglot_state}"
  if [ -z "${OLLAMA_SERVE_PID:-}" ] && [ -f "${state_dir}/ollama_serve.pid" ]; then
    IFS= read -r OLLAMA_SERVE_PID < "${state_dir}/ollama_serve.pid" 2>/dev/null || true
    case "${OLLAMA_SERVE_PID:-}" in
      ''|*[!0-9]*) OLLAMA_SERVE_PID="" ;;
    esac
  fi
  for wp in "${VITALS_PID:-}" "${OLLAMA_SERVE_PID:-}"; do
    [ -n "${wp}" ] || continue
    if [ "${wp}" = "${VITALS_PID:-}" ]; then
      for _ in 1 2 3 4 5 6; do
        kill -0 "${wp}" 2>/dev/null || break
        sleep 0.1
      done
    fi
    if [ "${wp}" = "${VITALS_PID:-}" ]; then
      pkill -P "${wp}" 2>/dev/null || true
      kill -9 "${wp}" 2>/dev/null || true
      wait "${wp}" 2>/dev/null || true
      continue
    fi
    # ollama serve is not a child of this shell (the setup block ran in a subshell), so wait returns at once:
    # signal it, poll until it is gone or serve_timeout_s passes, then kill -9 and poll briefly again.
    local serve_timeout_s="${POLYGLOT_TEST_SERVE_STOP_TIMEOUT_S:-5}" serve_tick serve_ticks serve_killed9=0 serve_result="gone" serve_msg
    case "${serve_timeout_s}" in
      ''|*[!0-9]*|0) serve_timeout_s=5 ;;
    esac
    serve_ticks=$(( serve_timeout_s * 10 ))
    SERVE_PID_ZOMBIE=0
    pkill -P "${wp}" 2>/dev/null || true
    kill "${wp}" 2>/dev/null || true
    for serve_tick in $(seq 1 "${serve_ticks}"); do
      serve_pid_alive "${wp}" || break
      sleep 0.1
    done
    if serve_pid_alive "${wp}"; then
      serve_killed9=1
      pkill -P "${wp}" 2>/dev/null || true
      kill -9 "${wp}" 2>/dev/null || true
      for serve_tick in 1 2 3 4 5 6 7 8 9 10; do
        serve_pid_alive "${wp}" || break
        sleep 0.1
      done
    fi
    if serve_pid_alive "${wp}"; then
      serve_result="present"
    fi
    serve_msg="SERVE_STOP: pid=${wp} result=${serve_result} timeout_s=${serve_timeout_s} killed9=${serve_killed9}"
    if [ "${SERVE_PID_ZOMBIE}" = "1" ]; then
      serve_msg="${serve_msg} zombie=1"
    fi
    printf '%s\n' "${serve_msg}" >> /content/polyglot_out/serve_stop.log 2>/dev/null || true
    printf '%s\n' "${serve_msg}"
  done
  VITALS_PID=""
  OLLAMA_SERVE_PID=""
  rm -f "${state_dir}/ollama_serve.pid" 2>/dev/null || true
}
# STOP_WRITERS_END

remote_on_exit() {
  local rc=$?
  trap - EXIT
  stop_writers
  rm -f /content/polyglot_out/.remote_done 2>/dev/null || true
  if [ "${rc}" -ne 0 ]; then
    python3 - "${rc}" "${POLYGLOT_STATE_DIR}" << 'EXITMARKPYEOF' || true
import json
import re
import sys
from pathlib import Path

rc = int(sys.argv[1]) if sys.argv[1].lstrip("-").isdigit() else 1
state_dir = Path(sys.argv[2])
out_dir = Path("/content/polyglot_out")
out_dir.mkdir(parents=True, exist_ok=True)
rf_out = out_dir / "remote_failure.json"
rf_state = state_dir / "remote_failure.json"

if not rf_out.is_file() and rf_state.is_file():
    rf_out.write_text(rf_state.read_text(encoding="utf-8", errors="replace"), encoding="utf-8", newline="\n")

last_step = "setup"
for sp in (state_dir / "current_step.txt", out_dir / "remote_step.txt"):
    if sp.is_file():
        val = sp.read_text(encoding="utf-8", errors="replace").strip()
        if val:
            last_step = val.splitlines()[-1].strip()
            break
(out_dir / "remote_step.txt").write_text(f"{last_step}\n", encoding="utf-8", newline="\n")

if not rf_out.is_file():
    setup_txt = (out_dir / "setup.log").read_text(encoding="utf-8", errors="replace") if (out_dir / "setup.log").is_file() else ""
    ref_re = re.compile(r"^REFUSED:\s+([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?::\s*(.*))?$")
    found_code = None
    found_reason = ""
    tail_lines = []
    for raw in setup_txt.splitlines():
        ln = raw.strip()
        if not ln:
            continue
        m = ref_re.match(ln)
        if m:
            found_code = m.group(1)
            found_reason = (m.group(2) or "").strip()
        elif not ln.startswith("REMOTE_STEP "):
            tail_lines.append(ln)
    code = found_code or "REMOTE_STEP_FAILED"
    if found_code and found_reason:
        reason = found_reason
    else:
        tail_snip = tail_lines[-1][:240] if tail_lines else ""
        reason = f"remote step '{last_step}' exited with rc={rc}" + (f": {tail_snip}" if tail_snip else "")
    why = reason if (f"[{last_step}]" in reason or reason.startswith(f"{last_step}:")) else f"[{last_step}] {reason}"
    marker = {
        "step": last_step,
        "refusal_code": code,
        "reason": reason,
        "why": why,
        "rc": rc,
    }
    payload = json.dumps(marker, indent=2) + "\n"
    rf_out.write_text(payload, encoding="utf-8", newline="\n")
    print("REMOTE_STEP_FAILED_MARKER " + json.dumps(marker), flush=True)
    sys.stderr.write(f"REFUSED: {code}: {why}\n")
    sys.stderr.flush()

vm_win_p = out_dir / "vm_window.json"
if not vm_win_p.is_file():
    zstd_ver = None
    for zp in (out_dir / "zstd_version.txt", state_dir / "zstd_version"):
        if zp.is_file():
            zv = zp.read_text(encoding="utf-8", errors="replace").strip()
            if zv:
                zstd_ver = zv.splitlines()[0].strip()
                break
    rec: dict[str, object] = {"remote_step": last_step, "failed_rc": rc}
    if zstd_ver:
        rec["zstd_version"] = zstd_ver
    vm_win_p.write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8", newline="\n")
EXITMARKPYEOF
  fi
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
  set -euo pipefail
  if [ "${POLYGLOT_MODE:-translate}" = "stub" ] || [ "${POLYGLOT_TEST_SKIP_VM_INSTALL:-0}" != "1" ]; then
    # 1. Install pinned Node.js checked by sha256
    begin_remote_step "node_install"
    NODE_TAR="/content/node-${PINNED_NODE_VERSION}-linux-x64.tar.xz"
    NODE_URL="${POLYGLOT_TEST_NODE_TAR_URL:-https://nodejs.org/dist/${PINNED_NODE_VERSION}/node-${PINNED_NODE_VERSION}-linux-x64.tar.xz}"
    node_dl_rc=0
    curl -fsSL "${NODE_URL}" -o "${NODE_TAR}" > /content/polyglot_out/node_download.log 2>&1 || node_dl_rc=$?
    if [ -s /content/polyglot_out/node_download.log ]; then
      cat /content/polyglot_out/node_download.log
    fi
    if [ "${node_dl_rc}" -ne 0 ] || [ ! -s "${NODE_TAR}" ]; then
      node_dl_err="$(tr '\r\n' '  ' < /content/polyglot_out/node_download.log 2>/dev/null | sed 's/  */ /g; s/^ //; s/ $//' || true)"
      fail_remote_step "node_install" "NODE_INSTALL_FAILED" "curl download of ${NODE_URL} failed (rc=${node_dl_rc})${node_dl_err:+: ${node_dl_err}}" "${node_dl_rc}"
    fi
    GOT_NODE_SHA="$(sha256sum "${NODE_TAR}" | awk '{print $1}')"
    if [ "${GOT_NODE_SHA}" != "${PINNED_NODE_TAR_SHA256}" ]; then
      fail_remote_step "node_install" "NODE_INSTALL_SHA_MISMATCH" "got ${GOT_NODE_SHA} expected ${PINNED_NODE_TAR_SHA256}" 1
    fi
    mkdir -p /content/node
    node_tar_rc=0
    tar -xJf "${NODE_TAR}" -C /content/node --strip-components=1 > /content/polyglot_out/node_unpack.log 2>&1 || node_tar_rc=$?
    if [ -s /content/polyglot_out/node_unpack.log ]; then
      cat /content/polyglot_out/node_unpack.log
    fi
    if [ "${node_tar_rc}" -ne 0 ] || [ ! -f /content/node/bin/node ]; then
      node_tar_err="$(tr '\r\n' '  ' < /content/polyglot_out/node_unpack.log 2>/dev/null | sed 's/  */ /g; s/^ //; s/ $//' || true)"
      fail_remote_step "node_install" "NODE_INSTALL_FAILED" "tar -xJf ${NODE_TAR} failed (rc=${node_tar_rc})${node_tar_err:+: ${node_tar_err}}" "${node_tar_rc}"
    fi
    export PATH="$(cd /content/node/bin && pwd):${PATH}"
    (cd /content/node/bin && pwd) >> "${POLYGLOT_STATE_DIR}/path_dirs"
    node_ver_rc=0
    NODE_VER_OUT="$(/content/node/bin/node --version </dev/null 2>&1)" || node_ver_rc=$?
    NODE_VER_CLEAN="$(printf '%s\n' "${NODE_VER_OUT}" | awk 'NF {sub(/\r$/, ""); print; exit}')"
    if [ "${node_ver_rc}" -ne 0 ] || [ -z "${NODE_VER_CLEAN}" ]; then
      fail_remote_step "node_install" "NODE_INSTALL_FAILED" "node --version failed after unpack (rc=${node_ver_rc}): ${NODE_VER_OUT}" "${node_ver_rc}"
    fi
    printf '%s\n' "${NODE_VER_CLEAN}" > /content/polyglot_out/node_version.txt
    printf '%s\n' "${NODE_VER_CLEAN}" > "${POLYGLOT_STATE_DIR}/node_version"

    # 2. Download pinned Ollama archive and verify sha256 BEFORE zstd install and unpack
    begin_remote_step "ollama_download"
    OLLAMA_ARCHIVE="/content/ollama-linux-amd64.tar.zst"
    OLLAMA_URL_ARCHIVE="${POLYGLOT_TEST_OLLAMA_TAR_URL:-https://github.com/ollama/ollama/releases/download/v${PINNED_OLLAMA_VERSION}/ollama-linux-amd64.tar.zst}"
    ollama_dl_rc=0
    curl -fsSL "${OLLAMA_URL_ARCHIVE}" -o "${OLLAMA_ARCHIVE}" > /content/polyglot_out/ollama_download.log 2>&1 || ollama_dl_rc=$?
    if [ -s /content/polyglot_out/ollama_download.log ]; then
      cat /content/polyglot_out/ollama_download.log
    fi
    if [ "${ollama_dl_rc}" -ne 0 ] || [ ! -s "${OLLAMA_ARCHIVE}" ]; then
      ollama_dl_err="$(tr '\r\n' '  ' < /content/polyglot_out/ollama_download.log 2>/dev/null | sed 's/  */ /g; s/^ //; s/ $//' || true)"
      fail_remote_step "ollama_download" "OLLAMA_DOWNLOAD_FAILED" "curl download of ${OLLAMA_URL_ARCHIVE} failed (rc=${ollama_dl_rc})${ollama_dl_err:+: ${ollama_dl_err}}" "${ollama_dl_rc}"
    fi
    GOT_OLLAMA_SHA="$(sha256sum "${OLLAMA_ARCHIVE}" | awk '{print $1}')"
    if [ "${GOT_OLLAMA_SHA}" != "${PINNED_OLLAMA_LINUX_AMD64_SHA256}" ]; then
      fail_remote_step "ollama_download" "OLLAMA_INSTALL_SHA_MISMATCH" "got ${GOT_OLLAMA_SHA} expected ${PINNED_OLLAMA_LINUX_AMD64_SHA256}" 1
    fi

    # 3. Install zstd on the stock Colab image BEFORE unpacking .tar.zst (Ollama v0.40.15 publishes only .tar.zst for Linux x86_64)
    begin_remote_step "zstd_install"
    ZSTD_INSTALL_TIMEOUT_S="${POLYGLOT_TEST_ZSTD_INSTALL_TIMEOUT_S:-180}"
    zstd_apt_rc=0
    DEBIAN_FRONTEND=noninteractive timeout -k 10 "${ZSTD_INSTALL_TIMEOUT_S}" apt-get install -y zstd > /content/polyglot_out/zstd_install.log 2>&1 || zstd_apt_rc=$?
    if [ "${zstd_apt_rc}" -ne 0 ]; then
      DEBIAN_FRONTEND=noninteractive timeout -k 10 "${ZSTD_INSTALL_TIMEOUT_S}" apt-get update -y >> /content/polyglot_out/zstd_install.log 2>&1 || true
      zstd_apt_rc=0
      DEBIAN_FRONTEND=noninteractive timeout -k 10 "${ZSTD_INSTALL_TIMEOUT_S}" apt-get install -y zstd >> /content/polyglot_out/zstd_install.log 2>&1 || zstd_apt_rc=$?
    fi
    if [ -s /content/polyglot_out/zstd_install.log ]; then
      cat /content/polyglot_out/zstd_install.log
    fi
    hash -r 2>/dev/null || true
    if [ "${zstd_apt_rc}" -ne 0 ]; then
      zstd_apt_err="$(tail -n 5 /content/polyglot_out/zstd_install.log 2>/dev/null | tr '\r\n' '  ' | sed 's/  */ /g; s/^ //; s/ $//' || true)"
      fail_remote_step "zstd_install" "ZSTD_INSTALL_FAILED" "apt-get install -y zstd exited ${zstd_apt_rc}${zstd_apt_err:+: ${zstd_apt_err}}" "${zstd_apt_rc}"
    fi
    if ! command -v zstd >/dev/null 2>&1; then
      fail_remote_step "zstd_install" "ZSTD_INSTALL_FAILED" "zstd is still missing on PATH after apt-get install -y zstd" 1
    fi
    zstd_ver_rc=0
    ZSTD_VER_RAW="$(zstd --version </dev/null 2>&1)" || zstd_ver_rc=$?
    ZSTD_VER_LINE="$(printf '%s\n' "${ZSTD_VER_RAW}" | awk 'NF {sub(/\r$/, ""); print; exit}')"
    if [ "${zstd_ver_rc}" -ne 0 ] || [ -z "${ZSTD_VER_LINE}" ]; then
      fail_remote_step "zstd_install" "ZSTD_INSTALL_FAILED" "zstd --version failed after install (rc=${zstd_ver_rc}): ${ZSTD_VER_RAW}" "${zstd_ver_rc}"
    fi
    printf '%s\n' "${ZSTD_VER_LINE}" > /content/polyglot_out/zstd_version.txt
    printf '%s\n' "${ZSTD_VER_LINE}" > "${POLYGLOT_STATE_DIR}/zstd_version"
    printf 'ZSTD_VERSION %s\n' "${ZSTD_VER_LINE}"

    # 4. Unpack Ollama archive with tar --zstd
    begin_remote_step "ollama_unpack"
    mkdir -p /content/ollama
    ollama_tar_rc=0
    tar --zstd -xf "${OLLAMA_ARCHIVE}" -C /content/ollama > /content/polyglot_out/ollama_unpack.log 2>&1 || ollama_tar_rc=$?
    if [ -s /content/polyglot_out/ollama_unpack.log ]; then
      cat /content/polyglot_out/ollama_unpack.log
    fi
    if [ "${ollama_tar_rc}" -ne 0 ] || [ ! -f /content/ollama/bin/ollama ]; then
      ollama_tar_err="$(tr '\r\n' '  ' < /content/polyglot_out/ollama_unpack.log 2>/dev/null | sed 's/  */ /g; s/^ //; s/ $//' || true)"
      fail_remote_step "ollama_unpack" "OLLAMA_UNPACK_FAILED" "tar --zstd -xf ${OLLAMA_ARCHIVE} failed (rc=${ollama_tar_rc})${ollama_tar_err:+: ${ollama_tar_err}}" "${ollama_tar_rc}"
    fi
    export PATH="$(cd /content/ollama/bin && pwd):${PATH}"
    (cd /content/ollama/bin && pwd) >> "${POLYGLOT_STATE_DIR}/path_dirs"

    # 5. Start ollama serve and wait until ready
    begin_remote_step "ollama_serve"
    OLLAMA_URL="${OLLAMA_HOST:-http://127.0.0.1:11434}"
    export OLLAMA_HOST="${OLLAMA_URL}"
    printf '%s\n' "${OLLAMA_URL}" > "${POLYGLOT_STATE_DIR}/ollama_host"
    # Slots: PINNED_NUM_PARALLEL, fewer when the card cannot hold that many KV caches. KV per token is 0.375 MiB
    # (Gemma 3 27B, fp16); the measured peak (PINNED_MODEL_PEAK_VRAM_MIB) covers the weights plus one slot at 4096.
    NUM_PARALLEL="$(python3 - "${COLAB_CARD}" "${PINNED_NUM_PARALLEL}" "${PINNED_TRANSLATOR_CONTEXT}" "${PINNED_MODEL_PEAK_VRAM_MIB}" "${PINNED_VRAM_HEADROOM_MIB}" << 'SLOTPYEOF'
import subprocess
import sys

card, want, ctx, peak, headroom = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
if card in ("CPU", "CPU-high-mem"):
    print(want)
    raise SystemExit(0)
try:
    out = subprocess.run(
        ["nvidia-smi", "--query-gpu=name,memory.used,memory.total,memory.free", "--format=csv,noheader,nounits"],
        capture_output=True, text=True, check=False, timeout=30,
    ).stdout.strip().splitlines()
    total = int(float(out[0].split(",")[2])) if out else 0
except Exception:
    total = 0
# A fake or odd nvidia-smi line is parsed again, whole, by the fit probe; here an unreadable total means one slot.
budget = total - peak - headroom + int(4096 * 0.375)
print(max(1, min(want, int(budget // (ctx * 0.375)))) if total else 1)
SLOTPYEOF
)"
    printf '%s\n' "${NUM_PARALLEL}" > "${POLYGLOT_STATE_DIR}/num_parallel"
    OLLAMA_CONTEXT_LENGTH="${PINNED_TRANSLATOR_CONTEXT}" OLLAMA_NUM_PARALLEL="${NUM_PARALLEL}" ollama serve </dev/null > /content/polyglot_out/ollama_serve.log 2>&1 &
    OLLAMA_SERVE_PID="$!"
    printf '%s\n' "${OLLAMA_SERVE_PID}" > "${POLYGLOT_STATE_DIR}/ollama_serve.pid"
    OLLAMA_SERVE_WAIT_S="${POLYGLOT_TEST_OLLAMA_SERVE_WAIT_S:-30}"
    OLLAMA_SERVE_READY=0
    for _ in $(seq 1 "${OLLAMA_SERVE_WAIT_S}"); do
      if ! serve_pid_alive "${OLLAMA_SERVE_PID}"; then
        break
      fi
      if ollama --version >/dev/null 2>&1 && curl -sf "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
        OLLAMA_SERVE_READY=1
        break
      fi
      sleep 1
    done
    if [ "${OLLAMA_SERVE_READY}" != "1" ]; then
      serve_err="$(tail -n 5 /content/polyglot_out/ollama_serve.log 2>/dev/null | tr '\r\n' '  ' | sed 's/  */ /g; s/^ //; s/ $//' || true)"
      fail_remote_step "ollama_serve" "OLLAMA_SERVE_FAILED" "ollama serve did not become ready at ${OLLAMA_URL}/api/tags within ${OLLAMA_SERVE_WAIT_S}s${serve_err:+: ${serve_err}}" 1
    fi
    VERSION_JSON="/content/polyglot_out/ollama_version.json"
    curl -sf "${OLLAMA_URL}/api/version" > "${VERSION_JSON}" 2>/dev/null || printf '{"version":"%s"}\n' "${PINNED_OLLAMA_VERSION}" > "${VERSION_JSON}"
  fi

  OLLAMA_URL="${OLLAMA_HOST:-http://127.0.0.1:11434}"
  export OLLAMA_HOST="${OLLAMA_URL}"
  printf '%s\n' "${OLLAMA_URL}" > "${POLYGLOT_STATE_DIR}/ollama_host"

  if [ "${POLYGLOT_MODE:-translate}" != "stub" ]; then
    # 6. Pull model and verify digest against PINNED_MODEL_DIGEST
    begin_remote_step "model_pull"
    if [ "${POLYGLOT_TEST_SKIP_VM_INSTALL:-0}" != "1" ]; then
      pull_rc=0
      ollama pull "${PINNED_TRANSLATEGEMMA_MODEL}" || pull_rc=$?
      if [ "${pull_rc}" -ne 0 ]; then
        fail_remote_step "model_pull" "OLLAMA_PULL_FAILED" "ollama pull ${PINNED_TRANSLATEGEMMA_MODEL} failed (rc=${pull_rc})" "${pull_rc}"
      fi
    else
      pull_rc=0
      curl -sf -X POST "${OLLAMA_URL}/api/pull" -H "Content-Type: application/json" \
        -d "{\"name\":\"${PINNED_TRANSLATEGEMMA_MODEL}\",\"stream\":false}" >/dev/null || pull_rc=$?
      if [ "${pull_rc}" -ne 0 ]; then
        fail_remote_step "model_pull" "OLLAMA_PULL_FAILED" "POST ${OLLAMA_URL}/api/pull for ${PINNED_TRANSLATEGEMMA_MODEL} failed (rc=${pull_rc})" "${pull_rc}"
      fi
    fi

    begin_remote_step "model_digest"
    TAGS_JSON="/content/polyglot_out/ollama_tags.json"
    tags_rc=0
    curl -sf "${OLLAMA_URL}/api/tags" > "${TAGS_JSON}" || tags_rc=$?
    if [ "${tags_rc}" -ne 0 ] || [ ! -s "${TAGS_JSON}" ]; then
      fail_remote_step "model_digest" "MODEL_DIGEST_MISMATCH" "failed to read ${OLLAMA_URL}/api/tags (rc=${tags_rc})" "${tags_rc}"
    fi
    VERSION_JSON="/content/polyglot_out/ollama_version.json"
    if [ ! -s "${VERSION_JSON}" ]; then
      curl -sf "${OLLAMA_URL}/api/version" > "${VERSION_JSON}" 2>/dev/null || printf '{"version":"%s"}\n' "${PINNED_OLLAMA_VERSION}" > "${VERSION_JSON}"
    fi

    python3 - "${TAGS_JSON}" "${PINNED_TRANSLATEGEMMA_MODEL}" "${PINNED_MODEL_DIGEST}" "${POLYGLOT_STATE_DIR}" << 'DIGPYEOF'
import json
import sys
from pathlib import Path

tags = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
want_model = sys.argv[2]
want_digest = sys.argv[3].lower().removeprefix("sha256:")
state_dir = Path(sys.argv[4])

observed_digest = ""
for m in tags.get("models", []):
    name = m.get("name", "")
    if name == want_model or name.startswith(want_model + ":"):
        observed_digest = str(m.get("digest", "")).lower().removeprefix("sha256:")
        break

Path("/content/polyglot_out/model_digest.txt").write_text(f"sha256:{observed_digest}\n", encoding="utf-8")
# Exact match, or one side is a prefix of the other AND the prefix is at least 12 hex chars.
MIN_DIGEST_PREFIX = 12
def _digest_ok(obs: str, want: str) -> bool:
    if not obs or not want:
        return False
    if obs == want:
        return True
    short, long_ = (obs, want) if len(obs) <= len(want) else (want, obs)
    return len(short) >= MIN_DIGEST_PREFIX and long_.startswith(short)

if not _digest_ok(observed_digest, want_digest):
    reason = f"model {want_model} digest={observed_digest or 'none'} expected={want_digest}"
    why = f"[model_digest] {reason}"
    marker = {"step": "model_digest", "refusal_code": "MODEL_DIGEST_MISMATCH", "reason": reason, "why": why, "rc": 1}
    payload = json.dumps(marker, indent=2) + "\n"
    Path("/content/polyglot_out/remote_failure.json").write_text(payload, encoding="utf-8", newline="\n")
    (state_dir / "remote_failure.json").write_text(payload, encoding="utf-8", newline="\n")
    print("REMOTE_STEP_FAILED_MARKER " + json.dumps(marker), flush=True)
    sys.stderr.write(f"REFUSED: MODEL_DIGEST_MISMATCH: {why}\n")
    raise SystemExit(1)
print(f"MODEL_DIGEST_OK model={want_model} digest=sha256:{observed_digest}", flush=True)
DIGPYEOF

    # 7. VM-side Fit Probe: warm model at translator context, record nvidia-smi memory, KV size, and ollama ps GPU residency
    begin_remote_step "fit_probe"
    warmup_rc=0
    curl -sf -X POST "${OLLAMA_URL}/api/generate" -H "Content-Type: application/json" \
      -d "{\"model\":\"${PINNED_TRANSLATEGEMMA_MODEL}\",\"prompt\":\"Warmup probe.\",\"stream\":false,\"options\":{\"num_ctx\":${PINNED_TRANSLATOR_CONTEXT},\"num_predict\":16}}" > /content/polyglot_out/warmup_response.json || warmup_rc=$?
    if [ "${warmup_rc}" -ne 0 ]; then
      fail_remote_step "fit_probe" "FIT_PROBE_FAILED" "warmup POST ${OLLAMA_URL}/api/generate failed (rc=${warmup_rc})" "${warmup_rc}"
    fi

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

    python3 - "${PS_JSON}" "${PS_TEXT}" "${SMI_CSV}" "${PINNED_TRANSLATEGEMMA_MODEL}" "${PINNED_TRANSLATOR_CONTEXT}" "${COLAB_CARD}" "${PINNED_MODEL_PEAK_VRAM_MIB}" "${PINNED_VRAM_HEADROOM_MIB}" "${POLYGLOT_STATE_DIR}" << 'FITPYEOF'
import json
import os
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
state_dir = Path(sys.argv[9])
required_total_vram_mib = measured_peak_vram_mib + required_headroom_mib
_np_file = state_dir / "num_parallel"
num_parallel = int(_np_file.read_text(encoding="utf-8").strip()) if _np_file.is_file() else int(os.environ.get("PINNED_NUM_PARALLEL", "1"))
# The measured peak covers the weights plus one slot at 4096 tokens; every slot beyond that is KV the peak never saw.
kv_per_token_mib = 0.375
extra_kv_mib = max(0, round((num_parallel * translator_ctx - 4096) * kv_per_token_mib))
ps_context_length = None
is_cpu_card = card in ("CPU", "CPU-high-mem")

def _fail_probe(code: str, reason: str) -> None:
    why = f"[fit_probe] {reason}"
    marker = {"step": "fit_probe", "refusal_code": code, "reason": reason, "why": why, "rc": 1}
    payload = json.dumps(marker, indent=2) + "\n"
    Path("/content/polyglot_out/remote_failure.json").write_text(payload, encoding="utf-8", newline="\n")
    (state_dir / "remote_failure.json").write_text(payload, encoding="utf-8", newline="\n")
    print("REMOTE_STEP_FAILED_MARKER " + json.dumps(marker), flush=True)
    sys.stderr.write(f"REFUSED: {code}: {why}\n")
    raise SystemExit(1)

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
            ps_context_length = context_length
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
    "pinned_context_tokens": translator_ctx,
    "num_parallel": num_parallel,
    "extra_kv_mib": extra_kv_mib,
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
# Whether `ollama ps` reports the per-slot context or the total over all slots is not verified for 0.40.15
# (PR #82 review): accept exactly either, record which one was seen, refuse anything else.
_ctx_ok = {translator_ctx: "per_slot", translator_ctx * max(1, num_parallel): "total_over_slots"}
probe["ps_context_basis"] = (
    "not_reported" if ps_context_length is None else _ctx_ok.get(ps_context_length, "mismatch")
)
Path("/content/polyglot_out/fit_probe.json").write_text(json.dumps(probe, indent=2) + "\n", encoding="utf-8")
print("FIT_PROBE " + json.dumps(probe), flush=True)

if ps_context_length is not None and ps_context_length not in _ctx_ok:
    # The server is not running at the pinned window (a KV cache sized by Ollama's own default is what made the
    # 2026-11-12 window crawl): refuse before any translation spends units.
    _fail_probe(
        "CONTEXT_PIN_MISMATCH",
        f"ollama ps reports context_length={ps_context_length} but the pin is {translator_ctx} (OLLAMA_CONTEXT_LENGTH / num_ctx not applied)",
    )

if not fully_on_gpu:
    # A GPU window refuses any CPU/GPU split immediately; a CPU stub also refuses if a split probe is injected.
    if not is_cpu_card or (processor_str and "CPU" in processor_str and processor_str != "100% CPU"):
        _fail_probe(
            "MODEL_NOT_FULLY_ON_GPU",
            f"ollama ps reports processor={processor_str!r} gpu_percent={gpu_pct}% (size={size_bytes} size_vram={size_vram_bytes})",
        )

if not is_cpu_card:
    if vram_total_mib is None or vram_total_mib < required_total_vram_mib:
        _fail_probe(
            "VRAM_HEADROOM_LOW",
            f"card={card} gpu_name={gpu_name!r} vram_total_mib={vram_total_mib} < required_total_vram_mib={required_total_vram_mib} (measured_peak_vram_mib={measured_peak_vram_mib} + required_headroom_mib={required_headroom_mib})",
        )

    if vram_total_mib < required_total_vram_mib + extra_kv_mib:
        _fail_probe(
            "VRAM_HEADROOM_LOW",
            f"card={card} gpu_name={gpu_name!r} vram_total_mib={vram_total_mib} cannot hold {num_parallel} slots at {translator_ctx} tokens: required_total_vram_mib={required_total_vram_mib} + extra_kv_mib={extra_kv_mib}",
        )
FITPYEOF

    # 8. Extract and build the repo at the pinned commit
    begin_remote_step "repo_build"
    repo_tar_rc=0
    tar -xzf /content/repo_archive.tar.gz -C /content/polyglot_work || repo_tar_rc=$?
    if [ "${repo_tar_rc}" -ne 0 ]; then
      fail_remote_step "repo_build" "REPO_BUILD_FAILED" "tar -xzf /content/repo_archive.tar.gz failed (rc=${repo_tar_rc})" "${repo_tar_rc}"
    fi
    if [ "${POLYGLOT_TEST_SKIP_VM_INSTALL:-0}" != "1" ]; then
      build_rc=0
      (
        cd /content/polyglot_work
        npm ci
        npm run build
      ) || build_rc=$?
      if [ "${build_rc}" -ne 0 ]; then
        fail_remote_step "repo_build" "REPO_BUILD_FAILED" "npm ci && npm run build failed (rc=${build_rc})" "${build_rc}"
      fi
    elif [ ! -d /content/polyglot_work/node_modules ] && [ -d "${REPO_ROOT_FOR_TEST_MODULES:-}" ]; then
      link_rc=0
      python3 -c 'import os, subprocess, sys
src, dst = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
if os.name == "nt":
    subprocess.run(["cmd", "/c", "mklink", "/J", dst, src], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
else:
    os.symlink(src, dst)
' "${REPO_ROOT_FOR_TEST_MODULES}/node_modules" /content/polyglot_work/node_modules || link_rc=$?
      if [ "${link_rc}" -ne 0 ]; then
        fail_remote_step "repo_build" "REPO_BUILD_FAILED" "failed to link test node_modules (rc=${link_rc})" "${link_rc}"
      fi
    fi
  fi
} 2>&1 | tee -a /content/polyglot_out/setup.log

# Re-export what the setup block (a pipeline subshell) set, so the steps below see the installed Node and Ollama.
if [ -f "${POLYGLOT_STATE_DIR}/path_dirs" ]; then
  while IFS= read -r state_path_dir || [ -n "${state_path_dir}" ]; do
    if [ -n "${state_path_dir}" ]; then
      PATH="${state_path_dir}:${PATH}"
    fi
  done < "${POLYGLOT_STATE_DIR}/path_dirs"
  export PATH
fi
if [ -f "${POLYGLOT_STATE_DIR}/ollama_host" ]; then
  IFS= read -r state_ollama_host < "${POLYGLOT_STATE_DIR}/ollama_host" || true
  if [ -n "${state_ollama_host:-}" ]; then
    export OLLAMA_HOST="${state_ollama_host}"
  fi
fi

if [ "${POLYGLOT_MODE:-translate}" = "stub" ]; then
  python3 - "/content/polyglot_out" "${REPO_COMMIT}" "${PINNED_OLLAMA_VERSION}" "${PINNED_NODE_VERSION}" << 'STUBPYEOF'
import json
import sys
from pathlib import Path

out_root = Path(sys.argv[1])
repo_commit = sys.argv[2]
pinned_ollama = sys.argv[3]
pinned_node = sys.argv[4]

ver_data = (
    json.loads((out_root / "ollama_version.json").read_text(encoding="utf-8"))
    if (out_root / "ollama_version.json").is_file()
    else {}
)
zstd_ver = (
    (out_root / "zstd_version.txt").read_text(encoding="utf-8", errors="replace").strip()
    if (out_root / "zstd_version.txt").is_file()
    else None
)
node_ver = (
    (out_root / "node_version.txt").read_text(encoding="utf-8", errors="replace").strip()
    if (out_root / "node_version.txt").is_file()
    else pinned_node
)
vm_win = {
    "mode": "stub",
    "stub": True,
    "repo_commit": repo_commit,
    "node_version": node_ver,
    "zstd_version": zstd_ver,
    "ollama_version": ver_data.get("version") or pinned_ollama,
    "remote_step": "ollama_serve",
    "translated_readmes": 0,
}
(out_root / "vm_window.json").write_text(json.dumps(vm_win, indent=2) + "\n", encoding="utf-8", newline="\n")
print("WINDOW_JSON " + json.dumps(vm_win), flush=True)
STUBPYEOF
else
  begin_remote_step "translate"
  echo "run" > /content/polyglot_out/phase.txt
  readmes_tar_rc=0
  tar -xzf /content/readmes_input.tar.gz -C /content/readmes_in || readmes_tar_rc=$?
  if [ "${readmes_tar_rc}" -ne 0 ]; then
    fail_remote_step "translate" "TRANSLATION_FAILED" "tar -xzf /content/readmes_input.tar.gz failed (rc=${readmes_tar_rc})" "${readmes_tar_rc}"
  fi

  # 9. Run scripts/translate-all.mjs unchanged for each README (all 7 languages, no --langs),
  #    enforce #67's verified-file receipt & structural check rule, check nav bar, and record timings
  python3 - "/content/polyglot_work" "/content/readmes_in" "/content/polyglot_out" "${PINNED_TRANSLATEGEMMA_MODEL}" "${REPO_COMMIT}" "${POLYGLOT_STATE_DIR}" << 'RUNPYEOF'
import hashlib
import json
import os
import re as _re
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
state_dir = Path(sys.argv[6])

def _fail_translate(code: str, reason: str, raw_stderr: str = "") -> None:
    # Nothing is deleted here: _staging_translations (every README that already passed its gates), refused_raw
    # (the raw output of every refused language), every summary and every log stay in polyglot_out, so the
    # bundle that comes back carries all of it. (This used to rmtree the staging directory, which threw away
    # a README that had finished 7/7 clean when a later README was refused: window polyglot-rb-d.)
    why = reason if reason.startswith("[translate]") else f"[translate] {reason}"
    marker = {"step": "translate", "refusal_code": code, "reason": reason, "why": why, "rc": 1}
    payload = json.dumps(marker, indent=2) + "\n"
    (out_root / "remote_failure.json").write_text(payload, encoding="utf-8", newline="\n")
    (state_dir / "remote_failure.json").write_text(payload, encoding="utf-8", newline="\n")
    print("REMOTE_STEP_FAILED_MARKER " + json.dumps(marker), flush=True)
    line = f"REFUSED: {code}: {why}\n"
    if raw_stderr and "REFUSED:" not in raw_stderr:
        sys.stderr.write(raw_stderr if raw_stderr.endswith("\n") else raw_stderr + "\n")
    sys.stderr.write(line)
    sys.stderr.flush()
    with (out_root / "setup.log").open("a", encoding="utf-8") as sf:
        sf.write(line)
    raise SystemExit(1)

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
readme_results = []
refused_root = out_root / "refused_raw"

for slot in slots:
    src_readme = slot / "README.md"
    pre_run_source_md = src_readme.read_text(encoding="utf-8")
    (out_root / f"pre_source_{slot.name}.md").write_text(pre_run_source_md, encoding="utf-8")
    input_sha = "sha256:" + hashlib.sha256(src_readme.read_bytes()).hexdigest()
    t0 = time.monotonic()
    # One slot per language on the server, so the languages decode side by side instead of queueing on one slot.
    num_parallel_file = state_dir / "num_parallel"
    num_parallel = int(num_parallel_file.read_text(encoding="utf-8").strip()) if num_parallel_file.is_file() else int(os.environ.get("PINNED_NUM_PARALLEL", "1"))
    # Per-language child timeout scaled to the README (PR #82 review): translate-all's 900 s default would end a
    # large README's language while it is still working; the window's wall and stall guard still bound the run.
    lang_timeout_s = max(900, -(-len(pre_run_source_md.encode("utf-8")) // 1000) * 60)
    cmd = [
        "node", str(work_dir / "scripts" / "translate-all.mjs"), str(src_readme), "--no-cache",
        f"--concurrency={num_parallel}", f"--timeout={lang_timeout_s}",
    ]
    env = dict(os.environ)
    env["POLYGLOT_MODEL"] = model_name
    env["POLYGLOT_NUM_CTX"] = os.environ.get("PINNED_TRANSLATOR_CONTEXT", "8192")
    env["POLYGLOT_MAX_CONCURRENCY"] = str(num_parallel)
    # Per-segment heartbeat: translate-readme.mjs writes its segment counter here; the vitals sampler sums them.
    progress_dir = state_dir / "progress"
    progress_dir.mkdir(parents=True, exist_ok=True)
    env["POLYGLOT_PROGRESS_DIR"] = str(progress_dir)
    env["POLYGLOT_PROGRESS_TAG"] = slot.name
    proc = subprocess.run(cmd, cwd=str(work_dir), env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    elapsed_s = round(time.monotonic() - t0, 3)

    log_prefix = slot.name
    (out_root / f"translate_{log_prefix}.stdout.log").write_text(proc.stdout or "", encoding="utf-8")
    (out_root / f"translate_{log_prefix}.stderr.log").write_text(proc.stderr or "", encoding="utf-8")
    sys.stdout.write(proc.stdout or "")
    sys.stderr.write(proc.stderr or "")
    sys.stdout.flush()
    sys.stderr.flush()

    # Failures are per README and per language: a README (or one of its languages) that a gate refuses is
    # marked refused with its reason, its raw output is kept for a human hand-fix and a pin, and the next
    # README still runs. Only a window with zero passed languages fails.
    row = {
        "slug": slot.name,
        "status": "ok",
        "passed": [],
        "refused": [],
        "refusal_code": None,
        "reason": None,
        "total_elapsed_s": elapsed_s,
    }

    def _keep_raw(lc: str):
        fname = lang_file_map[lc]
        fp = slot / fname
        if not fp.is_file():
            return None
        d = refused_root / slot.name
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy2(fp, d / fname)
        return f"refused_raw/{slot.name}/{fname}"

    def _close_row(note_manifest: dict) -> None:
        if row["refused"]:
            row["status"] = "partial" if row["passed"] else "refused"
        readme_results.append(row)
        readme_manifests.append(note_manifest)
        (out_root / "readme_results.json").write_text(
            json.dumps({"complete": False, "readmes": readme_results}, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"README_RESULT slug={slot.name} status={row['status']} passed={len(row['passed'])} refused={len(row['refused'])}", flush=True)

    if proc.returncode != 0 and "POLYGLOT_COMPLETE" not in (proc.stdout or ""):
        err_snip = ((proc.stderr or "").strip().splitlines() or [""])[-1][:200]
        crash = f"translate-all.mjs exited {proc.returncode} for {slot.name}" + (f": {err_snip}" if err_snip else "")
        row["refusal_code"] = "TRANSLATION_FAILED"
        row["reason"] = crash
        for lc in langs:
            row["refused"].append({"lang": lc, "file": lang_file_map[lc], "reasons": ["translate_all_crashed"], "raw": _keep_raw(lc)})
        _close_row({
            "slug": slot.name, "input_sha256": input_sha, "status": "refused", "output_shas": {},
            "verified_languages": [], "refused_languages": row["refused"], "refusal_code": "TRANSLATION_FAILED",
            "reason": crash, "total_elapsed_s": elapsed_s,
        })
        continue

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
    raw_summary_path = out_root / f"summary_{slot.name}.translate-all.json"
    raw_summary_path.write_text(json.dumps(summary_json, indent=2) + "\n", encoding="utf-8")
    summary_path.write_text(json.dumps(summary_json, indent=2) + "\n", encoding="utf-8")

    # Optional test-only fault injection to simulate #67 unverified receipt/structural check or #65 nav-bar drop
    corrupt_lang = os.environ.get("POLYGLOT_TEST_CORRUPT_RECEIPT_LANG", "").strip()
    corrupt_slot = os.environ.get("POLYGLOT_TEST_CORRUPT_RECEIPT_SLOT", "").strip()
    corrupt_set = {x.strip() for x in corrupt_lang.split(",") if x.strip()}
    if corrupt_set and (not corrupt_slot or corrupt_slot == slot.name) and summary_json.get("results"):
        for r in summary_json["results"]:
            if r.get("lang") in corrupt_set:
                r["status"] = "written-unverified"
                r["failedChecks"] = ["no_write_receipt"]
                summary_json.setdefault("writtenUnverified", []).append({
                    "lang": r["lang"],
                    "file": lang_file_map.get(r["lang"], f"README.{r['lang']}.md"),
                    "failedChecks": ["no_write_receipt"],
                })
        summary_path.write_text(json.dumps(summary_json, indent=2) + "\n", encoding="utf-8")

    # Test-only: mark one language as lost-span in the summary (translate-all's own gate verdict), the shape of
    # the window polyglot-rb-d refusal, where the model returned a file for every language and its summary
    # still counted the lost-span ones as succeeded.
    ls_lang = os.environ.get("POLYGLOT_TEST_LOST_SPAN_LANG", "").strip()
    ls_slot = os.environ.get("POLYGLOT_TEST_LOST_SPAN_SLOT", "").strip()
    if ls_lang and (not ls_slot or ls_slot == slot.name) and summary_json.get("results"):
        for r in summary_json["results"]:
            if r.get("lang") == ls_lang:
                r["status"] = "lost-span"
                r["lostSpans"] = 1
        summary_json.setdefault("lostSpans", []).append(
            {"lang": ls_lang, "segment": "[docs](docs/a.md)", "span": "docs/a.md", "kind": "link", "found": "(no links)"})
        summary_path.write_text(json.dumps(summary_json, indent=2) + "\n", encoding="utf-8")

    drop_lang = os.environ.get("POLYGLOT_TEST_DROP_NAV_BAR_LANG", "").strip()
    if drop_lang:
        drop_file = lang_file_map.get(drop_lang, f"README.{drop_lang}.md")
        txt = src_readme.read_text(encoding="utf-8")
        txt = _re.sub(rf'\s*\|\s*<a href="{_re.escape(drop_file)}">[^<]*</a>', "", txt)
        txt = _re.sub(rf'<a href="{_re.escape(drop_file)}">[^<]*</a>\s*\|\s*', "", txt)
        src_readme.write_text(txt, encoding="utf-8")

    # Adopt #67's receipt & structural verification rule + #65 nav-bar check in the Colab lane. The script only
    # reports (verified languages, unverified languages with their failed checks, the nav bar result); the
    # caller below decides what is refused, so one bad language never stops the rest.
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
        "const unverified = [];"
        "for (const lang of TRANSLATE_ALL_LANGUAGES) {"
        "  const r = results.find((x) => x.lang === lang.code);"
        "  const fname = `README.${lang.file ?? lang.code}.md`;"
        "  const fpath = resolve(slotDir, fname);"
        "  if (!r || (r.status !== 'ok' && r.status !== 'done-after-silence')) {"
        "    const checks = (r && Array.isArray(r.failedChecks) && r.failedChecks.length) ? r.failedChecks : [r ? r.status : 'missing_result'];"
        "    if (checks.includes('receipt_sha_mismatch')) rejectedCodes.push(lang.code);"
        "    unverified.push({ lang: lang.code, file: fname, checks });"
        "    continue;"
        "  }"
        "  let cand = '';"
        "  try { cand = readFileSync(fpath, 'utf-8'); } catch { unverified.push({ lang: lang.code, file: fname, checks: ['missing_file'] }); continue; }"
        "  const mdCheck = verifyTranslatedMarkdown(preSrc, cand);"
        "  if (!mdCheck.verified) {"
        "    unverified.push({ lang: lang.code, file: fname, checks: mdCheck.failedChecks });"
        "    continue;"
        "  }"
        "  verifiedThisRun.push(lang.code);"
        "}"
        "const navBarLangCodes = resolveNavBarLangCodes(slotDir, preSrc, verifiedThisRun, TRANSLATE_ALL_LANGUAGES, rejectedCodes);"
        "const navRes = checkSourceNavBar(postSrc, navBarLangCodes, TRANSLATE_ALL_LANGUAGES);"
        "const unverifiedDetails = unverified.map((u) => `${u.lang}(${u.file}: ${u.checks.join(',')})`);"
        "console.log(JSON.stringify({ verifiedThisRun, navBarLangCodes: Array.from(navBarLangCodes), navBarCheck: navRes, unverified, unverifiedDetails }));"
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
    verify_payload = None
    if nav_check_proc.returncode == 0:
        try:
            verify_payload = json.loads(nav_check_proc.stdout.strip())
        except ValueError:
            verify_payload = None
    if verify_payload is None:
        vfail = f"verification script failed (rc={nav_check_proc.returncode}) for {slot.name}"
        sys.stderr.write((nav_check_proc.stderr or "") + "\n")
        row["refusal_code"] = "TRANSLATION_FAILED"
        row["reason"] = vfail
        for lc in langs:
            row["refused"].append({"lang": lc, "file": lang_file_map[lc], "reasons": ["verification_script_failed"], "raw": _keep_raw(lc)})
        _close_row({
            "slug": slot.name, "input_sha256": input_sha, "status": "refused", "output_shas": {},
            "verified_languages": [], "refused_languages": row["refused"], "refusal_code": "TRANSLATION_FAILED",
            "reason": vfail, "total_elapsed_s": elapsed_s,
        })
        continue

    nav_res = verify_payload["navBarCheck"]
    verified_langs = list(verify_payload["verifiedThisRun"])
    unverified_by_lang = {u["lang"]: u for u in verify_payload.get("unverified", [])}
    refused_entries = []
    passed_langs = []
    if not nav_res.get("ok"):
        # The source README's nav bar is incomplete: this README is refused as a whole (its own summary and
        # raw outputs are kept), and the other READMEs carry on.
        nav_code = nav_res.get("refusalCode") or "NAV_BAR_INCOMPLETE"
        nav_why = nav_res.get("why") or "source README nav bar incomplete"
        for lc in langs:
            u = unverified_by_lang.get(lc)
            reasons = list(u["checks"]) if u else [f"held_back:{nav_code}"]
            refused_entries.append({"lang": lc, "file": lang_file_map[lc], "reasons": reasons, "raw": _keep_raw(lc)})
        row["refusal_code"] = nav_code
        row["reason"] = nav_why
    else:
        for lc in langs:
            u = unverified_by_lang.get(lc)
            if u:
                refused_entries.append({"lang": lc, "file": lang_file_map[lc], "reasons": list(u["checks"]), "raw": _keep_raw(lc)})
            elif lc in verified_langs:
                passed_langs.append(lc)
        if refused_entries:
            row["refusal_code"] = "TRANSLATION_UNVERIFIED"
            row["reason"] = "unverified translation(s): " + "; ".join(
                f"{e['lang']}({e['file']}: {','.join(e['reasons'])})" for e in refused_entries)

    output_shas = {}
    dest_dir = staging_root if single_slot else (staging_root / slot.name)
    if passed_langs:
        dest_dir.mkdir(parents=True, exist_ok=True)
        # The source README (with its nav bar) is staged with the passed languages.
        for fname in ["README.md"] + [lang_file_map[lc] for lc in list(passed_langs)]:
            fp = slot / fname
            if not fp.is_file():
                lc_missing = next((lc for lc in passed_langs if lang_file_map[lc] == fname), None)
                if lc_missing:
                    passed_langs.remove(lc_missing)
                    refused_entries.append({"lang": lc_missing, "file": fname, "reasons": ["missing_file"], "raw": None})
                    row["refusal_code"] = row["refusal_code"] or "TRANSLATION_UNVERIFIED"
                    row["reason"] = (row["reason"] or "unverified translation(s): ") + f" {lc_missing}({fname}: missing_file)"
                continue
            dst_fp = dest_dir / fname
            shutil.copy2(fp, dst_fp)
            f_hex = hashlib.sha256(dst_fp.read_bytes()).hexdigest()
            output_shas[fname] = f"sha256:{f_hex}"
            all_sha_entries.append((f_hex, dst_fp.relative_to(staging_root).as_posix()))

    # The summary counts what PASSED every gate (receipt, structure, lost spans, untranslated prose, nav bar),
    # not what the model returned: the translate-all summary said 7/7 succeeded for a README with 12 lost spans.
    gated = dict(summary_json)
    gated["modelReturned"] = summary_json.get("modelReturned", summary_json.get("succeeded"))
    gated["succeeded"] = len(passed_langs)
    gated["refusedLanguages"] = len(refused_entries)
    gated["gate"] = {
        "counted": "languages that passed every gate: written receipt, structure, protected spans, untranslated prose, nav bar",
        "passed": passed_langs,
        "refused": refused_entries,
        "navBarCheck": nav_res,
    }
    summary_path.write_text(json.dumps(gated, indent=2) + "\n", encoding="utf-8")

    nav_lists_refused = []
    staged_readme = dest_dir / "README.md"
    if passed_langs and staged_readme.is_file():
        staged_text = staged_readme.read_text(encoding="utf-8", errors="replace")
        nav_lists_refused = [e["lang"] for e in refused_entries if e["file"] in staged_text]

    per_lang_status = {}
    per_lang_timings = {}
    for r in summary_json.get("results", []):
        lc = r.get("lang")
        if lc:
            per_lang_status[lc] = r.get("status", "ok")
            per_lang_timings[lc] = float(r.get("time", 0.0))

    row["passed"] = list(passed_langs)
    row["refused"] = refused_entries
    _close_row({
        "slug": slot.name,
        "input_sha256": input_sha,
        "status": "ok" if not refused_entries else ("partial" if passed_langs else "refused"),
        "output_shas": output_shas,
        "verified_languages": passed_langs,
        "refused_languages": refused_entries,
        "refusal_code": row["refusal_code"],
        "reason": row["reason"],
        "nav_bar_lists_refused_languages": nav_lists_refused,
        "done_after_silence": summary_json.get("doneAfterSilence", []),
        "written_unverified": summary_json.get("writtenUnverified", []),
        "per_language_status": per_lang_status,
        "per_language_timings_s": per_lang_timings,
        "total_elapsed_s": elapsed_s,
        "nav_bar_check": nav_res,
    })
    # Test-only: die right after the first README is staged, to prove a failure exit still returns it.
    if os.environ.get("POLYGLOT_TEST_FAIL_AFTER_FIRST_STAGED", "").strip() == "1" and passed_langs:
        _fail_translate("TRANSLATION_FAILED", f"test fault injected after {slot.name} was staged")

total_passed = sum(len(r["passed"]) for r in readme_results)
total_refused = sum(len(r["refused"]) for r in readme_results)
window_status = "failed" if total_passed == 0 else ("ok" if total_refused == 0 else "partial")
window_why = None
if total_refused:
    window_why = "; ".join(f"{r['slug']}: {r['reason']}" for r in readme_results if r["refused"])

model_digest = (out_root / "model_digest.txt").read_text(encoding="utf-8").strip() if (out_root / "model_digest.txt").is_file() else ""
ver_data = json.loads((out_root / "ollama_version.json").read_text(encoding="utf-8")) if (out_root / "ollama_version.json").is_file() else {}
fit_probe = json.loads((out_root / "fit_probe.json").read_text(encoding="utf-8")) if (out_root / "fit_probe.json").is_file() else {}
zstd_ver = (
    (out_root / "zstd_version.txt").read_text(encoding="utf-8", errors="replace").strip()
    if (out_root / "zstd_version.txt").is_file()
    else None
)
node_ver = (
    (out_root / "node_version.txt").read_text(encoding="utf-8", errors="replace").strip()
    if (out_root / "node_version.txt").is_file()
    else None
)

manifest = {
    "schema_version": 1,
    "repo_commit": repo_commit,
    "model": model_name,
    "model_digest": model_digest,
    "ollama_version": ver_data.get("version", ""),
    "zstd_version": zstd_ver,
    "languages": langs,
    "fit_probe": fit_probe,
    "window_status": window_status,
    "readmes": readme_manifests,
}
(out_root / "readme_results.json").write_text(
    json.dumps({"complete": True, "window_status": window_status, "readmes": readme_results}, indent=2) + "\n",
    encoding="utf-8", newline="\n")

if total_passed == 0:
    (out_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    vm_fail = {
        "remote_step": "translate", "window_status": "failed", "readme_results": readme_results,
        "translated_readmes": 0, "model": model_name, "repo_commit": repo_commit,
    }
    (out_root / "vm_window.json").write_text(json.dumps(vm_fail, indent=2) + "\n", encoding="utf-8", newline="\n")
    first_code = next((r["refusal_code"] for r in readme_results if r["refusal_code"]), "TRANSLATION_FAILED")
    _fail_translate(first_code, window_why or "no README passed its gates")

if outputs_root.exists():
    shutil.rmtree(outputs_root)
staging_root.rename(outputs_root)

sha_lines = [f"{h}  {rel}\n" for h, rel in sorted(all_sha_entries, key=lambda x: x[1])]
(outputs_root / "SHA256SUMS").write_text("".join(sha_lines), encoding="utf-8", newline="\n")
(out_root / "SHA256SUMS").write_text("".join(sha_lines), encoding="utf-8", newline="\n")

(outputs_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
(out_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")

vm_win = {
    "mode": "paid",
    "stub": False,
    "repo_commit": repo_commit,
    "model": model_name,
    "model_digest": model_digest,
    "ollama_version": ver_data.get("version", ""),
    "fit_probe": fit_probe,
    "remote_step": "translate",
    "translated_readmes": sum(1 for r in readme_results if r["passed"]),
    "window_status": window_status,
    "languages_passed": total_passed,
    "languages_refused": total_refused,
    "readme_results": readme_results,
}
if window_why:
    vm_win["window_why"] = window_why
if zstd_ver:
    vm_win["zstd_version"] = zstd_ver
if node_ver:
    vm_win["node_version"] = node_ver
(out_root / "vm_window.json").write_text(json.dumps(vm_win, indent=2) + "\n", encoding="utf-8", newline="\n")
print("WINDOW_JSON " + json.dumps(vm_win), flush=True)
RUNPYEOF
fi

stop_writers
f_scrub_args=()
while IFS= read -r -d '' f; do
  f_scrub_args+=("--scrub-file" "${f}")
done < <(find /content/polyglot_out -type f \( -name "*.log" -o -name "*.json" -o -name "*.txt" \) -print0 2>/dev/null || true)
if [ "${#f_scrub_args[@]}" -gt 0 ]; then
  python3 /content/launch_guards.py "${f_scrub_args[@]}" </dev/null || true
fi
# FINAL_TAR_BEGIN: the ollama log inside polyglot_out may still be appended to; GNU tar then exits 1
# ("file changed as we read it") although the archive is complete. Tolerate exit 1 only.
final_tar_rc=0
tar -czf /content/polyglot_translate_bundle.tar.gz -C /content/polyglot_out . || final_tar_rc=$?
if [ "${final_tar_rc}" -gt 1 ]; then
  rm -f /content/polyglot_translate_bundle.tar.gz
  exit "${final_tar_rc}"
fi
# FINAL_TAR_END
REMOTEEOF

colab_check_pre_exec_cap "${OUT_DIR}"

# Upload inputs flat into /content
colab_upload_checked "${SESSION}" "${REPO_ARCHIVE}" /content/repo_archive.tar.gz "${OUT_DIR}"
if [ "${HAS_READMES}" = "1" ]; then
  colab_upload_checked "${SESSION}" "${READMES_TAR_PATH}" /content/readmes_input.tar.gz "${OUT_DIR}"
fi
colab_upload_checked "${SESSION}" "${GUARDS_PY}" /content/launch_guards.py "${OUT_DIR}"
if [ -n "${TOKEN_DIR}" ] && [ -f "${TOKEN_DIR}/polyglot_token" ]; then
  colab_upload_checked "${SESSION}" "${TOKEN_DIR}/polyglot_token" /content/polyglot_token "${OUT_DIR}"
  rm -rf "${TOKEN_DIR}"
  TOKEN_DIR=""
fi
colab_upload_checked "${SESSION}" "${REMOTE_SCRIPT}" /content/remote_translate.sh "${OUT_DIR}"

build_remote_env "${TEST_MODE}" "${REPO_COMMIT}"

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

translate_unpack_bundle "${BUNDLE_LOCAL}" "${OUT_DIR}"

colab_scrub_all_logs "${PY_BIN}" "${GUARDS_PY}" "${OUT_DIR}"
