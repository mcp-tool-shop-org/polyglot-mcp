# Priced Colab Window Request Draft — Rung 1 (Pilot Single-README Translation)

> **Status:** DRAFT ONLY — **Do not run.** R&D and the Publisher book paid Colab windows.
> **Repo / PR:** `mcp-tool-shop-org/polyglot-mcp` PR #66 (`feat/colab-translate-lane`)
> **Ticket:** `tickets/2026-11-08-publisher-03-polyglot-colab-lane.md` (updated per Publisher's booking rule and Fleet L4 ruling, 2026-11-09)

---

## 1. Window Parameters

| Parameter | Flag / Value | Rationale & Named Sources |
|---|---|---|
| **Card** | `--card A100` | **NVIDIA A100 40 GB (`40,960 MiB` total VRAM).** R&D's measured rig peak for `translategemma:27b` (`sha256:21b597a243ec...`) on `Ollama 0.40.15` is **`22,547 MiB`** (source: *R&D's GPU ledger, polyglot row, 2026-11-09*). With the fit probe's required `1,024 MiB` safety headroom (`PINNED_MODEL_PEAK_VRAM_MIB=22547` + `PINNED_VRAM_HEADROOM_MIB=1024` = `23,571 MiB`), an A100 40 GB (`40,960 MiB`) provides `18,413 MiB` (`45.0%`) headroom above the measured peak. An NVIDIA L4 (`23,034 MiB` total VRAM) leaves only `487 MiB` above the `22,547 MiB` rig peak; **an L4 attempt is permitted only after a measured fit probe on Colab, at the Publisher's call** (source: *Publisher's booking rule, 2026-11-09*). |
| **Shape** | `--shape standard` | **A100 40 GB, Standard shape** (`Shape: Standard` in `colab sessions`, verified by `colab_check_session_shape`). Required explicitly by `colab_shape_gate_arm` (`SHAPE_REQUIRED` if omitted). |
| **Max Rate Ceiling** | `--max-rate 7.50` | Refuses `RATE_ABOVE_MAX` during the post-open stability window (`2` agreeing readings `5 s` apart at `>= 1.00` CCU/h over up to `24 × 5 s` polls in `launch_guards.py`) or mid-run if the observed window burn rate exceeds `7.50` CCU/h. Observed Colab A100 40 GB Standard rate is `6.73` CCU/h live (range `5.30`–`6.73` CCU/h; source: *style-dataset-lab / R&D Colab window ledger*), giving `~11.4%` rate headroom. |
| **Units Cap** | `--cap 6.25` | Hard compute-unit cap (`6.25` CCU; source: `evaluate_cap_budget` in `scripts/colab/launch_guards.py`) covering the cleanup reserve (`2.687500` CCU for `cleanup_bound_s = 1,290 s` at `7.50` CCU/h), safety margin (`0.01` CCU), and `3.552500` CCU of effective runtime (`1,705.20 s = 28.42 min` at the `7.50` CCU/h ceiling, and `1,900.30 s = 31.67 min` at the observed `6.73` CCU/h rate — both covering `wall_limit_s = 1,680 s`). |
| **Safety Margin** | `--margin 0.01` | Standard `0.01` CCU cap guard safety margin (`scripts/colab/launch_translate.sh`). |
| **Minimum Runtime** | `--min-runtime-s 1200` | Enforces at least `1,200 s` (`20.0` min) of available runtime before `effective_trip` at `--max-rate 7.50` (`CAP_TOO_SMALL_FOR_CLEANUP` otherwise; `1,705.20 s >= 1,200 s`). |
| **Wall Limit** | `--wall-s 1800` | `1,800 s` (`30.0` min) total wall clock limit (source: central `780 s` / p90 `1,380 s` 7-language translation window duration + `420 s` buffer). |
| **Wall Grace** | `--grace-s 120` | `120 s` (`2.0` min) grace; the independent wall watcher and live wall guard trip at `wall_s - grace_s = 1,680 s` (`28.0` min). |

### Exact Command (for Publisher / R&D booking only — do not execute beforehand)

```bash
bash scripts/colab/launch_translate.sh \
  --readme /path/to/pilot/README.md \
  --card A100 \
  --shape standard \
  --max-rate 7.50 \
  --cap 6.25 \
  --margin 0.01 \
  --min-runtime-s 1200 \
  --wall-s 1800 \
  --grace-s 120 \
  --out-dir /persistent/out/rung1-pilot \
  --session polyglot-rung1-pilot
```

> **Note on L4:** Per the Publisher's booking rule (2026-11-09) and Fleet L4 ruling (`windowC2-26`: a Colab L4 has a single `Standard` shape; `--card L4 --shape high-mem` is refused with `SHAPE_HIGH_MEM_UNAVAILABLE`), Rung 1 targets **A100 40 GB, Standard shape** (`--card A100 --shape standard`). Because R&D's measured `translategemma:27b` peak is **`22,547 MiB`** against L4's `23,034 MiB` total VRAM (`487 MiB` margin), an L4 attempt (`--card L4 --shape standard`) may be scheduled **only after a measured fit probe on Colab, at the Publisher's call**.

---

## 2. Cleanup Reserve & Dual Spend Bounds Arithmetic

Sources: `colab_compute_cleanup_bounds` (`scripts/colab/colab_window.sh`) and `evaluate_cap_budget` (`scripts/colab/launch_guards.py`).

For the `translate` lane:
- `in_flight_bound_s = max(download 300, upload 120, sessions 30) + kill_grace 10 = 310 s`
- `salvage_bound_s = restart 190 + bundle_exec 340 + salvage_dl 310 = 840 s` (`SALVAGE_DEADLINE_S=840`)
- `cleanup_stop_attempted_by_s = 310 + 840 = 1,150 s`
- `stop_bound_s = 2 × (60 + 10) = 140 s`
- `cleanup_bound_s = 1,150 + 140 = 1,290 s` (`0.358333 h`)

At `--max-rate 7.50` CCU/h with `--cap 6.25` and `--margin 0.01`:
- `cleanup_reserve_units = (1290 / 3600) × 7.50 = 2.687500 CCU`
- `effective_trip_units = 6.25 - 0.01 - 2.687500 = 3.552500 CCU`
- `runtime_to_trip_s` (at `7.50` CCU/h) = `(3.552500 / 7.50) × 3600 = 1,705.20 s` (`28.42 min >= wall_limit_s 1,680 s` and `>= --min-runtime-s 1200`)
- `runtime_to_trip_s` (at observed `6.73` CCU/h) = `(3.552500 / 6.73) × 3600 = 1,900.30 s` (`31.67 min`)
- `worst_case_cap_path = effective_trip_units + margin + cleanup_reserve_units = 6.25 CCU`
- `worst_case_launcher_death_path = round(((1,705.20 + 1,290) / 3600) × 7.50, 2) = 6.24 CCU`
- `worst_case_total_spend = max(6.25, 6.24) = 6.25 CCU`

---

## 3. Central and p90 Duration & Spend Projections (1 Pilot README, 7 Languages)

Sources: R&D GPU ledger (`22,547 MiB` peak on `Ollama 0.40.15`, 2026-11-09), Colab A100 Standard rate ledger (`6.73 CCU/h` observed, `7.50 CCU/h` ceiling), and `scripts/translate-all.mjs` 7-language run timings.

| Phase | Central Duration | p90 Duration | Notes |
|---|---:|---:|---|
| **1. Session open, shape check & stable rate window** | `35 s` | `60 s` | `colab new --gpu A100 -s ...` + `colab sessions` (`Shape: Standard`) + `2 × 5 s` agreeing rate polls |
| **2. VM setup (`Node v22.22.3` + `Ollama v0.40.15` + `translategemma:27b` pull + `npm ci && npm run build`)** | `300 s` | `540 s` | Sha256-verified binary archives, `~17.4 GB` model pull over Colab network, TypeScript build |
| **3. Warmup & GPU fit probe (`ollama ps` + `nvidia-smi` VRAM check)** | `25 s` | `45 s` | Verifies `sha256:21b597a243ec...` digest, `100% GPU` residency, and `vram_total_mib (40,960 MiB) >= 23,571 MiB` (`22,547 MiB` measured peak + `1,024 MiB` headroom) |
| **4. Translation (`scripts/translate-all.mjs --no-cache`, all 7 languages) + #67 receipt/nav-bar check** | `360 s` | `635 s` | `ja`, `zh`, `es`, `fr`, `hi`, `it`, `pt-BR` (`~51 s/lang` central, `~91 s/lang` p90) |
| **5. Bundle creation, `colab download`, `colab stop` & closing audit** | `60 s` | `100 s` | Writes `SHA256SUMS`, `manifest.json`, `window.json`, `outcome.draft.json` |
| **Total Window Duration** | **`780 s` (`13.0 min`)** | **`1,380 s` (`23.0 min`)** | Inside `wall_limit_s = 1,680 s` (`28.0 min`) and `runtime_to_trip_s = 1,705.20 s` (`28.42 min`) |
| **Projected Spend at observed A100 Standard rate (`6.73 CCU/h`)** | **`1.46 CCU`** | **`2.58 CCU`** | `(780 / 3600) × 6.73 = 1.46 CCU` central; `(1380 / 3600) × 6.73 = 2.58 CCU` p90 |
| **Projected Spend at ceiling (`--max-rate 7.50 CCU/h`)** | **`1.63 CCU`** | **`2.88 CCU`** | `(780 / 3600) × 7.50 = 1.625 CCU` central; `(1380 / 3600) × 7.50 = 2.875 CCU` p90 |
| **Hard Cap Bound (`worst_case_total_spend`)** | **`6.25 CCU`** | **`6.25 CCU`** | Bounded by `--cap 6.25` across both cap-trip (`6.25 CCU`) and launcher-death (`6.24 CCU`) paths |

---

## 4. Acceptance List for Rung 1

1. **Pre-open & Pre-exec Guards:**
   - All 10 pinned input file sha256s (`launch_guards.py`, `remote_runner.py`, `colab_window.sh`, `translate_bundle_now.py`, `compare_translations.py`, `translate-all.mjs`, `translate-readme.mjs`, `package.json`, `package-lock.json`, and self-pin `launch_translate.sh`) verify cleanly.
   - `shape_check.json` records `{"requested": "standard", "expected": "Standard", "observed": "Standard", "match": true}`.
   - `rate_check.json` records a stable positive post-open window rate (2 agreeing readings 5 s apart at `>= 1.00` CCU/h) `<= 7.50` CCU/h.
2. **Model Digest & 100% GPU + Numeric VRAM Fit Probe:**
   - `manifest.json` records `model: "translategemma:27b"` and `model_digest: "sha256:21b597a243ec4fd2f05bc0ce8ef9ef174a89b09255c330d670852dfaaaa74f72"`.
   - `manifest.json` `fit_probe` records `fully_on_gpu: true`, `gpu_percent: 100`, `ollama_ps_processor: "100% GPU"`, `measured_peak_vram_mib: 22547`, `required_headroom_mib: 1024`, `required_total_vram_mib: 23571`, `vram_fit_ok: true`, plus `vram_used_mib`, `vram_total_mib` (`40,960` on A100 40 GB), `vram_free_mib`, and `kv_cache_mib`.
3. **#67 Verified Write Receipts, Structural Checks & #65 Nav-Bar Completeness:**
   - All 7 target files (`README.ja.md`, `README.zh.md`, `README.es.md`, `README.fr.md`, `README.hi.md`, `README.it.md`, `README.pt-BR.md`) and updated `README.md` are present in `--out-dir`.
   - Every target language has a sha-verified write receipt (`ok` or `done-after-silence`, zero `written-unverified` or `written-after-error`) and passes `verifyTranslatedMarkdown` (heading count, code block count, and byte-identical code blocks).
   - `manifest.json` `readmes[0].nav_bar_check` is `{"ok": true, "refusalCode": null, "missing": [], "extra": []}`.
   - `SHA256SUMS` lists all 8 output files (`README.md` + 7 translations) and `sha256sum -c SHA256SUMS` passes.
4. **Structural Quality Comparison (`compare_translations.py`):**
   - Running `python3 scripts/colab/compare_translations.py --baseline <baseline_dir> --candidate <out_dir>` reports `match: true` (`code_blocks_byte_identical: true`, matching heading/paragraph/link counts and URL sets across all 7 languages).
5. **Closing Session & Spend Accounting (`window.json`):**
   - `stop.log` contains `STOP_COMPLETED attempt=1/2 session=polyglot-rung1-pilot` and closing `colab sessions` confirms no active session remains.
   - `window.json` records `status: "ok"`, `refusal_code: null`, `stop_path: "trap"`, `watcher_wait: "none"`, `start_balance`, `end_balance`, `spend_ccu = max(start - end, rate * elapsed / 3600) <= 6.25`, and dual spend bounds (`worst_case_cap_path: 6.25`, `worst_case_launcher_death_path: 6.24`, `worst_case_total_spend: 6.25`).
