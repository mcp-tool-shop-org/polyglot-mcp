# Colab Translation Lane (`scripts/colab/`)

This kit runs `polyglot-mcp`'s README translation pipeline (`scripts/translate-all.mjs` + `scripts/translate-readme.mjs`) on a metered Google Colab runtime via the headless `colab` CLI, under the studio Colab CLI contract ([`docs/colab-cli-contract.md`](./colab-cli-contract.md)).

## Architecture & Files

| File | Role |
|---|---|
| [`scripts/colab/colab_window.sh`](../scripts/colab/colab_window.sh) | Outer window lifecycle library: `colab new`, `colab upload`, `colab exec`, `colab download`, GPU rate gate, shape gate, cap budget & pre-exec cap gate, independent wall watcher with pre-trip launcher-liveness polling, bounded post-failure salvage, and guaranteed `colab stop`. |
| [`scripts/colab/launch_guards.py`](../scripts/colab/launch_guards.py) | Pre-open cap budget & dual spend bounds (`evaluate_cap_budget`), live/pre-exec cap & wall checks, SHA256 input verification, vitals/stall/dead-harness detection, private-RAM inspection, and log secret scrubbing. |
| [`scripts/colab/remote_runner.py`](../scripts/colab/remote_runner.py) | VM-side kernel runner executed via `colab exec -s <session> -f remote_runner.py`: runs `SDLAB_REMOTE_SCRIPT`, streams line-by-line output with `hf_` token scrubbing, and finishes with an `SDLAB_REMOTE_RC=<rc>` exit marker. |
| [`scripts/colab/translate_bundle_now.py`](../scripts/colab/translate_bundle_now.py) | VM-side emergency salvage bundler invoked when a run fails or times out without producing `/content/polyglot_translate_bundle.tar.gz`. |
| [`scripts/colab/launch_translate.sh`](../scripts/colab/launch_translate.sh) | End-to-end launcher: validates flags and SHA256 pins, checks cap budget against cleanup reserve, stages READMEs and repo archive, installs pinned Node/Ollama, verifies `translategemma:27b` digest, runs the GPU Fit Probe, executes `scripts/translate-all.mjs` across all 7 languages, enforces #67's verified-receipt & structural verification rule + `NAV_BAR_INCOMPLETE` check, and unpacks outputs + `SHA256SUMS` + `manifest.json` + `window.json`. |
| [`scripts/colab/compare_translations.py`](../scripts/colab/compare_translations.py) | Structural comparison helper comparing two directories of translated READMEs across headings, paragraphs, fenced code blocks (byte-for-byte), links/URLs, and nav-bar entries. |

## Usage

### Paid GPU Window (e.g. `A100` or `L4`)

```bash
bash scripts/colab/launch_translate.sh \
  --readme /path/to/repo/README.md \
  --card A100 \
  --shape standard \
  --max-rate 7.50 \
  --cap 6.25 \
  --margin 0.01 \
  --wall-s 1500 \
  --grace-s 60 \
  --out-dir /persistent/path/polyglot-colab-out
```

### Dry Run (`--dry`)

Prints the JSON execution plan, exact `colab` commands, cleanup reserve, and dual spend bounds (`worst_case_cap_path`, `worst_case_launcher_death_path`, `worst_case_total_spend`, `assumptions`) without making any `colab` call:

```bash
bash scripts/colab/launch_translate.sh \
  --readme /path/to/repo/README.md \
  --card A100 \
  --shape standard \
  --max-rate 7.50 \
  --cap 6.25 \
  --wall-s 1500 \
  --out-dir /persistent/path/polyglot-colab-out \
  --dry
```

### Flags

- `--readme <path>` (repeatable): Path to a source `README.md`. Sibling `.polyglot-terms.json` and `.polyglot-pins.json` files are staged automatically when present. Mutually exclusive with `--readme-tar`.
- `--readme-tar <tarball>`: Tarball containing one or more `README.md` trees to translate in a single window. Mutually exclusive with `--readme`.
- `--card <A100|L4|G4|CPU>` (default `CPU`): Colab runtime accelerator card.
- `--shape <standard|high-mem>`: Required on GPU cards (`SHAPE_REQUIRED` if omitted). Under the 2026-11-09 Fleet ruling (`docs/colab-cli-contract.md` section 6), Colab returns `Runtime Shape: Standard` for `L4` regardless of `--high-mem`, so `--card L4 --shape standard` is accepted and `--card L4 --shape high-mem` is refused (`SHAPE_HIGH_MEM_UNAVAILABLE`). Single-shape TPU cards (`V5E1`, `V6E1`) accept only `--shape high-mem` (`SHAPE_STANDARD_UNAVAILABLE` if `--shape standard` is passed). CPU cards always open with `colab new --high-mem` and refuse `--shape` (`SHAPE_NOT_FOR_CPU`).
- `--max-rate <CCU/h>`: Required on GPU cards (`MAX_RATE_REQUIRED` if omitted or non-positive). Maximum burn rate in CCU/hour allowed when the post-open rate gate polls `colab usage`.
- `--cap <CCU>` (default `0.25`): Maximum compute-unit spend for the window (must cover `margin + cleanup_reserve`, or refuses `CAP_TOO_SMALL_FOR_CLEANUP` before any `colab` call).
- `--margin <CCU>` (default `0.01`): Safety margin subtracted from `--cap`.
- `--min-runtime-s <seconds>`: Optional minimum runtime required after subtracting `margin` and `cleanup_reserve` (`CAP_TOO_SMALL_FOR_CLEANUP` if `runtime_to_trip_s < --min-runtime-s`).
- `--wall-s <seconds>` (default `900`): Hard wall-clock limit for the window.
- `--grace-s <seconds>` (default `60`): Grace margin subtracted by the independent wall watcher (`WALL_LIMIT_S = wall_s - grace_s`).
- `--out-dir <dir>` (required): Output directory on a persistent filesystem (refuses `/tmp`, `/var/tmp`, `/dev/shm`, `tmpfs`, `ramfs` in live runs with `OUT_DIR_VOLATILE`, and refuses non-empty directories with `OUT_DIR_NOT_EMPTY`).
- `--session <id>` (default `polyglot-translate-<UTC>`): Explicit Colab session name.
- `--dry`: Validate flags and print the JSON plan + dual spend bounds without calling `colab`.

 Note: `scripts/translate-all.mjs` and `scripts/colab/launch_translate.sh` always translate all 7 target languages (`ja`, `zh`, `es`, `fr`, `hi`, `it`, `pt`). Passing `--langs` is refused (`REFUSED: unknown argument`).

## Cards, Pinned Versions, and the Fit Probe

### Pinned Runtime Stack

Every binary, model, and script is pinned by SHA256 at the top of [`scripts/colab/launch_translate.sh`](../scripts/colab/launch_translate.sh):

- **Model**: `translategemma:27b`
  - Manifest SHA256 (`PINNED_MODEL_DIGEST`): `21b597a243ec4fd2f05bc0ce8ef9ef174a89b09255c330d670852dfaaaa74f72`
  - GGUF layer size: `17,358,640,928` bytes (~16.17 GiB, `Q4_K_M`, `gemma3` 27.4B)
  - Translator context (`PINNED_TRANSLATOR_CONTEXT`): `4096` tokens (matches `src/ollama.ts` default context; configurable to `16384` via `OLLAMA_CONTEXT_LENGTH=16384`)
  - Measured peak VRAM (`PINNED_MODEL_PEAK_VRAM_MIB`): `22,547` MiB (R&D's GPU ledger, `polyglot` row, 2026-11-09) + `1,024` MiB required headroom (`PINNED_VRAM_HEADROOM_MIB`) = `23,571` MiB minimum total GPU VRAM (`required_total_vram_mib`).
- **Ollama**: `v0.40.15` (`ollama-linux-amd64.tar.zst` SHA256 `628c018404a4206493efd38e46251c154ede5141b8b8dc85c659b3b027c47379`)
- **Node.js**: `v22.22.3` (`node-v22.22.3-linux-x64.tar.xz` SHA256 `2e5d13569282d016861fae7c8f935e741693c269101a5bebcf761a5376d1f99f`)
- **Scripts & manifests**: `launch_guards.py`, `remote_runner.py`, `colab_window.sh`, `translate_bundle_now.py`, `compare_translations.py`, `scripts/translate-all.mjs`, `scripts/translate-readme.mjs`, `package.json`, `package-lock.json`, and `launch_translate.sh` itself.

### Fit Probe (`VRAM_HEADROOM_LOW` and `MODEL_NOT_FULLY_ON_GPU`)

After pulling `translategemma:27b` and verifying its digest (`MODEL_DIGEST_MISMATCH` on mismatch), the VM stages and runs the **Fit Probe** before translating any README:

1. Warms `translategemma:27b` via `/api/generate` at the translator context (`4096` tokens).
2. Queries `nvidia-smi --query-gpu=name,memory.used,memory.total,memory.free --format=csv,noheader,nounits`.
3. Queries `ollama ps` (`/api/ps` and CLI output) for `size`, `size_vram`, `context_length`, and `processor`.
4. Computes KV cache footprint (`~1,536 MiB` at 4k context, `~6,144 MiB` at 16k context for Gemma 3 27B GQA) and records `measured_peak_vram_mib` (`22,547` MiB), `required_headroom_mib` (`1,024` MiB), `required_total_vram_mib` (`23,571` MiB), and `vram_fit_ok` in `/content/polyglot_out/fit_probe.json` (unpacked to `<out-dir>/fit_probe.json` and embedded into `manifest.json` and `window.json`).

If `vram_total_mib < required_total_vram_mib` (`23,571` MiB) on a GPU card, the probe fails closed with `REFUSED: VRAM_HEADROOM_LOW` before translation starts. If `ollama ps` reports anything other than `100% GPU` on a GPU card (for example `80%/20% CPU/GPU` spill), the probe fails closed with `REFUSED: MODEL_NOT_FULLY_ON_GPU` and exits before starting `translate-all.mjs`.

On an NVIDIA A100 40 GB (`40,960 MiB` total VRAM):
- `translategemma:27b` measured peak VRAM (R&D's GPU ledger, `polyglot` row, 2026-11-09): `22,547 MiB`
- Required headroom (`1,024 MiB`): `22,547 + 1,024 = 23,571 MiB` (`18,413 MiB` free headroom on A100 40 GB, `100% GPU`).
- An NVIDIA L4 (`23,034 MiB` total VRAM) provides only `487 MiB` of margin above the `22,547 MiB` peak (`< 23,571 MiB`), so an L4 attempt is refused by default with `VRAM_HEADROOM_LOW` and would only be revisited after a measured fit probe at the Publisher's call.

## Guards & Refusal Codes

| Refusal Code | Stage | Trigger |
|---|---|---|
| `MAX_RATE_REQUIRED` | Pre-open | GPU card requested without a positive `--max-rate <CCU/h>`. |
| `SHAPE_REQUIRED` / `SHAPE_INVALID` / `SHAPE_HIGH_MEM_UNAVAILABLE` / `SHAPE_STANDARD_UNAVAILABLE` / `SHAPE_NOT_FOR_CPU` | Pre-open | Invalid `--card` / `--shape` combination (`L4` accepts `--shape standard` and refuses `--shape high-mem` with `SHAPE_HIGH_MEM_UNAVAILABLE`; `CPU` forbids `--shape`). |
| `CAP_TOO_SMALL_FOR_CLEANUP` | Pre-open | `effective_trip = cap - margin - cleanup_reserve <= 0`, or `runtime_to_trip_s < --min-runtime-s` (refused before any `colab` call). |
| `OUT_DIR_VOLATILE` / `OUT_DIR_NOT_EMPTY` | Pre-open | `--out-dir` is on volatile storage (`/tmp`, `tmpfs`, etc.) in a live run, or already contains files. |
| `PIN_OVERRIDE_IN_LIVE_RUN` | Pre-open | Any `EXPECTED_*_SHA`, `POLYGLOT_TEST_*`, or `SDLAB_TEST_*` override variable is set in the environment when `SDLAB_TEST_FAKE_COLAB=1` + fake `colab` marker is not active. |
| `INPUT_SHA_MISMATCH` | Pre-open | Any pinned script or manifest SHA256 does not match its pin in `launch_translate.sh`. |
| `RATE_ABOVE_MAX` / `RATE_UNREAD` / `ASSIGNMENTS_UNREADABLE` | Post-open / Mid-run | Measured `colab usage` burn rate exceeds `--max-rate` or fails to stabilize; stops the VM before uploading workload. |
| `CAP_GUARD_TRIPPED` | Pre-exec / Live | Remaining cap (`cap - margin - cleanup_reserve`) exhausted during post-open rate polling, uploads (`phase=pre_exec`), or live execution (`phase=live`). |
| `MODEL_DIGEST_MISMATCH` | VM setup | Pulled `translategemma:27b` digest does not match `PINNED_MODEL_DIGEST`. |
| `VRAM_HEADROOM_LOW` | VM fit probe | GPU total VRAM (`vram_total_mib`) is less than `measured_peak_vram_mib + required_headroom_mib` (`22,547 + 1,024 = 23,571` MiB). |
| `MODEL_NOT_FULLY_ON_GPU` | VM fit probe | `ollama ps` shows `< 100% GPU` residency (`CPU/GPU` split). |
| `TRANSLATION_UNVERIFIED` | Post-translate | Any target language lacks a matching `POLYGLOT_WRITTEN` SHA256 receipt or fails #67's structural Markdown verification against the source `README.md`. |
| `NAV_BAR_INCOMPLETE` | Post-translate | Source `README.md` top language nav bar (`checkSourceNavBar`) is missing a link to one or more verified `README.<lang>.md` files (`polyglot-mcp#65` / `#67`). |
| `WALL_GUARD_TRIPPED` / `DEAD_HARNESS_TRIPPED` / `STALL_GUARD_TRIPPED` / `SETUP_STALL_TRIPPED` / `HOST_RAM_PROJECTION_EXCEEDED` | Live exec | Runtime budget, stall, harness, or private-RAM guard tripped during execution. |

### Optional Token Rule (Mode-600 File Upload)

Ollama pulls `translategemma:27b` without authentication, so no token is required by default. If `POLYGLOT_OPTIONAL_TOKEN` is ever provided, `launch_translate.sh` stages it in a `0700` directory on `/dev/shm` (`XDG_RUNTIME_DIR`) with `umask 077` and `chmod 600`, uploads it via `colab upload` to `/content/polyglot_token`, and the VM script immediately reads and `shred -u`s `/content/polyglot_token` (`TOKEN_SHRED_FAILED` if still present). A token is **never** passed via `--env` or process `argv`.

## Bounded Cleanup (`cleanup_bound_s = 1290`) & Dual Spend Bounds

When a run exits non-zero while execution or download is in flight, `cleanup_on_exit` in `colab_window.sh` and `colab_run_wall_watcher` bound every in-flight command, salvage step, and teardown step with `timeout -k`:

1. **In-flight command bound (`in_flight_bound_s = 310` s)**:
   - `max(COLAB_DOWNLOAD_TIMEOUT_S=300, COLAB_UPLOAD_TIMEOUT_S=120, COLAB_SESSIONS_TIMEOUT_S=30) + COLAB_KILL_GRACE_S=10 = 310` s.
2. **Salvage phase (`SALVAGE_DEADLINE_S = 840` s)**:
   - `colab restart-kernel`: `timeout -k 10 180` → max **190 s**
   - `colab exec -f translate_bundle_now.py --timeout 300`: `timeout -k 10 330` → max **340 s**
   - `colab download`: `timeout -k 10 300` → max **310 s**
   - Total salvage budget: `190 + 340 + 310 = 840` s. Any step exceeding `SALVAGE_DEADLINE_S` (or receiving a second `TERM`/`INT` signal) is skipped immediately.
   - Worst-case time from guard trip to `colab stop` attempted (`cleanup_stop_attempted_by_s`): `310 + 840 = 1150` s.
3. **Stop phase (max `140` s)**:
   - `colab stop -s <session>`: `timeout -k 10 60` (70 s max per attempt) × 2 attempts = **140 s**.
4. **Total cleanup bound (`cleanup_bound_s`)**:
   - `1150 + 140 = 1290` s (`21.50` minutes). Both `cleanup_stop_attempted_by_s` (`1150`) and `cleanup_bound_s` (`1290`) are recorded in `<out-dir>/window.json`.
5. **Cleanup reserve & Dual Spend Bounds**:
   - `cleanup_reserve = (cleanup_bound_s / 3600) * priced_rate`
   - `effective_trip = cap - margin - cleanup_reserve`
   - `worst_case_cap_path = effective_trip + margin + cleanup_reserve = cap`
   - `worst_case_launcher_death_path = ((death_time_exact_s + cleanup_bound_s) / 3600) * priced_rate`
   - `worst_case_total_spend = max(worst_case_cap_path, worst_case_launcher_death_path)`
   - Closing `colab usage` failures preserve the last good `end_balance` reading instead of unlinking it, and `window.json` records `spend_ccu = max(start_balance - end_balance, priced_rate * elapsed_s / 3600)`.

## Comparing Output Sets (`compare_translations.py`)

To compare two directories of translated READMEs (e.g., rig vs. Colab A100, or two runs against a fixture) structurally:

```bash
python3 scripts/colab/compare_translations.py \
  --baseline /path/to/baseline \
  --candidate /path/to/colab-out \
  --langs ja,zh,es,fr,hi,it,pt \
  --out /tmp/compare.json
```

For each target language (`README.<lang>.md`), `compare_translations.py` verifies:
- **Heading count** (`heading_count`): ATX headings outside fenced code blocks must match.
- **Paragraph count** (`paragraph_count`): Prose blocks outside headings and fenced code blocks must match.
- **Fenced code blocks** (`code_block_count` and `code_blocks_identical`): Count and byte-for-byte contents of every fenced code block must match identically.
- **Link & URL set** (`links`): Set of Markdown link targets and bare URLs outside code must match identically.
- **Nav-bar entries** (`nav_entries`): Top language navigation bar entries (`href -> label`) must match identically.
