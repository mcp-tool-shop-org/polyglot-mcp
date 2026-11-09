# Priced Colab Window Request Draft — Rung 1 (Pilot Single-README Translation)

> **Status:** DRAFT ONLY — **Do not run.** R&D and the Publisher book paid Colab windows.
> **Repo / PR:** `mcp-tool-shop-org/polyglot-mcp` PR #66 (`feat/colab-translate-lane`)
> **Ticket:** `tickets/2026-11-08-publisher-03-polyglot-colab-lane.md`

---

## 1. Window Parameters

| Parameter | Flag / Value | Rationale |
|---|---|---|
| **Card** | `--card L4` | NVIDIA L4 (24 GB / `23,034 MiB` VRAM). `translategemma:27b` weights (`17,358,640,928` bytes = `16,554 MiB`) + KV cache at 4k context (`1,536 MiB`) require `~19,650 MiB` VRAM, which exceeds T4's 16 GB VRAM and fits 100% on GPU on L4 with `~3,384 MiB` headroom. |
| **Shape** | `--shape high-mem` | Required explicitly by the shape gate (`colab_shape_gate_arm`); L4 exists only in the `High-RAM` machine shape (`google-colab-cli 0.7.4`). |
| **Max Rate Ceiling** | `--max-rate 2.50` | Refuses `RATE_EXCEEDS_MAX_RATE` during the post-open stability window (`3` consecutive identical readings over up to `24 × 5 s` polls) or mid-run (`RATE_SPIKE_MIDRUN`) if the observed window burn rate exceeds `2.50` CCU/h. Observed L4 High-RAM rate on Colab is `~1.68` CCU/h (range `1.42`–`2.18` CCU/h). |
| **Units Cap** | `--cap 2.25` | Hard compute-unit cap (`2.25` CCU) covering the cleanup reserve (`0.895833` CCU at `2.50` CCU/h), safety margin (`0.01` CCU), and `1.344167` CCU of effective runtime (`32.26` min at `2.50` CCU/h; `58.50` min at `1.68` CCU/h). |
| **Safety Margin** | `--margin 0.01` | Standard `0.01` CCU cap guard safety margin. |
| **Minimum Runtime** | `--min-runtime-s 1200` | Enforces at least `1,200 s` (`20.0` min) of available runtime before `effective_trip` at `--max-rate 2.50` (`CAP_TOO_SMALL_FOR_CLEANUP` otherwise). |
| **Wall Limit** | `--wall-s 1800` | `1,800 s` (`30.0` min) total wall clock limit. |
| **Wall Grace** | `--grace-s 120` | `120 s` (`2.0` min) grace; the independent wall watcher and live wall guard trip at `wall_s - grace_s = 1,680 s` (`28.0` min). |

### Exact Command (for Publisher / R&D booking only — do not execute beforehand)

```bash
bash scripts/colab/launch_translate.sh \
  --readme /path/to/pilot/README.md \
  --card L4 \
  --shape high-mem \
  --max-rate 2.50 \
  --cap 2.25 \
  --margin 0.01 \
  --min-runtime-s 1200 \
  --wall-s 1800 \
  --grace-s 120 \
  --out-dir /persistent/out/rung1-pilot \
  --session polyglot-rung1-pilot
```

---

## 2. Cleanup Reserve & Dual Spend Bounds Arithmetic

For the `translate` lane (`scripts/colab/colab_window.sh`):
- `in_flight_bound_s = max(download 300, upload 120, sessions 30) + kill_grace 10 = 310 s`
- `salvage_bound_s = restart 190 + bundle_exec 340 + salvage_dl 310 = 840 s` (`SALVAGE_DEADLINE_S=840`)
- `cleanup_stop_attempted_by_s = 310 + 840 = 1,150 s`
- `stop_bound_s = 2 × (60 + 10) = 140 s`
- `cleanup_bound_s = 1,150 + 140 = 1,290 s` (`0.358333 h`)

At `--max-rate 2.50` CCU/h with `--cap 2.25` and `--margin 0.01`:
- `cleanup_reserve_units = (1290 / 3600) × 2.50 = 0.895833 CCU`
- `effective_trip_units = 2.25 - 0.01 - 0.895833 = 1.344167 CCU`
- `runtime_to_trip_s` (at `2.50` CCU/h) = `(1.344167 / 2.50) × 3600 = 1,935.60 s` (`>= --min-runtime-s 1200`)
- `worst_case_cap_path = effective_trip_units + margin + cleanup_reserve_units = 2.25 CCU`
- `worst_case_launcher_death_path = ((1,935.60 + 1,290) / 3600) × 2.50 = 2.24 CCU`
- `worst_case_total_spend = max(2.25, 2.24) = 2.25 CCU`

---

## 3. Central and p90 Duration & Spend Projections (1 Pilot README, 7 Languages)

| Phase | Central Duration | p90 Duration | Notes |
|---|---:|---:|---|
| **1. Session open, shape check & stable rate window** | `35 s` | `60 s` | `colab new` + `colab sessions` shape check + `3 × 5 s` stable rate polls |
| **2. VM setup (`Node v22.22.3` + `Ollama v0.40.15` + `translategemma:27b` pull + `npm ci && npm run build`)** | `300 s` | `540 s` | Sha256-verified binary archives, `~17.4 GB` model pull over Colab network, TypeScript build |
| **3. Warmup & GPU fit probe (`ollama ps` + `nvidia-smi`)** | `25 s` | `45 s` | Verifies `sha256:21b597a243ec...` digest and `100% GPU` residency |
| **4. Translation (`scripts/translate-all.mjs --no-cache`, all 7 languages) + #67 receipt/nav-bar check** | `360 s` | `635 s` | `ja`, `zh`, `es`, `fr`, `hi`, `it`, `pt-BR` (`~51 s/lang` central, `~91 s/lang` p90) |
| **5. Bundle creation, `colab download`, `colab stop` & closing audit** | `60 s` | `100 s` | Writes `SHA256SUMS`, `manifest.json`, `window.json`, `outcome.draft.json` |
| **Total Window Duration** | **`780 s` (`13.0 min`)** | **`1,380 s` (`23.0 min`)** | Well inside `wall_limit_s = 1,680 s` (`28.0 min`) |
| **Projected Spend at observed L4 rate (`1.68 CCU/h`)** | **`0.36 CCU`** | **`0.64 CCU`** | Central and p90 expected compute unit consumption |
| **Projected Spend at ceiling (`--max-rate 2.50 CCU/h`)** | **`0.54 CCU`** | **`0.96 CCU`** | Worst-case rate within `--max-rate` |
| **Hard Cap Bound (`worst_case_total_spend`)** | **`2.25 CCU`** | **`2.25 CCU`** | Bounded by `--cap 2.25` across both cap-trip and launcher-death paths |

---

## 4. Acceptance List for Rung 1

1. **Pre-open & Pre-exec Guards:**
   - All 10 pinned input file sha256s (`launch_guards.py`, `remote_runner.py`, `colab_window.sh`, `translate_bundle_now.py`, `compare_translations.py`, `translate-all.mjs`, `translate-readme.mjs`, `package.json`, `package-lock.json`, and self-pin `launch_translate.sh`) verify cleanly.
   - `shape_check.json` records `{"requested": "high-mem", "expected": "High-RAM", "observed": "High-RAM", "match": true}`.
   - `rate_check.json` records 3 consecutive identical positive post-open rate readings `<= 2.50` CCU/h.
2. **Model Digest & 100% GPU Fit Probe:**
   - `manifest.json` records `model: "translategemma:27b"` and `model_digest: "sha256:21b597a243ec4fd2f05bc0ce8ef9ef174a89b09255c330d670852dfaaaa74f72"`.
   - `manifest.json` `fit_probe` records `fully_on_gpu: true`, `gpu_percent: 100`, `ollama_ps_processor: "100% GPU"`, plus `vram_used_mib`, `vram_total_mib`, `vram_free_mib`, and `kv_cache_mib`.
3. **#67 Verified Write Receipts, Structural Checks & #65 Nav-Bar Completeness:**
   - All 7 target files (`README.ja.md`, `README.zh.md`, `README.es.md`, `README.fr.md`, `README.hi.md`, `README.it.md`, `README.pt-BR.md`) and updated `README.md` are present in `--out-dir`.
   - Every target language has a sha-verified write receipt (`ok` or `done-after-silence`, zero `written-unverified` or `written-after-error`) and passes `verifyTranslatedMarkdown` (heading count, code block count, and byte-identical code blocks).
   - `manifest.json` `readmes[0].nav_bar_check` is `{"ok": true, "refusalCode": null, "missing": [], "extra": []}`.
   - `SHA256SUMS` lists all 8 output files (`README.md` + 7 translations) and `sha256sum -c SHA256SUMS` passes.
4. **Structural Quality Comparison (`compare_translations.py`):**
   - Running `python3 scripts/colab/compare_translations.py --baseline <baseline_dir> --candidate <out_dir>` reports `match: true` (`code_blocks_byte_identical: true`, matching heading/paragraph/link counts and URL sets across all 7 languages).
5. **Closing Session & Spend Accounting (`window.json`):**
   - `stop.log` contains `STOP_COMPLETED attempt=1/2 session=polyglot-rung1-pilot` and closing `colab sessions` confirms no active session remains.
   - `window.json` records `status: "ok"`, `refusal_code: null`, `stop_path: "trap"`, `watcher_wait: "none"`, `start_balance`, `end_balance`, `spend_ccu = max(start - end, rate * elapsed / 3600) <= 2.25`, and dual spend bounds (`worst_case_cap_path`, `worst_case_launcher_death_path`, `worst_case_total_spend`).
