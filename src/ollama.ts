/**
 * Minimal Ollama HTTP client — zero dependencies beyond Node fetch.
 * Auto-starts Ollama and auto-pulls models when needed.
 * All HTTP calls use AbortController timeouts to prevent silent hangs.
 */

import { execSync, spawn } from "node:child_process";

/** Default timeout for generate calls (60s — covers cold-load + inference). */
const GENERATE_TIMEOUT_MS = 60_000;
/** Timeout for lightweight API calls (list, tags). */
const API_TIMEOUT_MS = 10_000;
/** Timeout for model pulls (10 min — large models over slow connections). */
const PULL_TIMEOUT_MS = 600_000;

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
}

export class OllamaClient {
  constructor(private baseUrl: string = "http://localhost:11434") {}

  async generate(req: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
    const startMs = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, stream: false }),
        signal: controller.signal,
      });
    } catch (err) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(
          `Ollama generate timed out after ${elapsed}s (model: ${req.model}). ` +
          `Possible causes: model still loading into VRAM, GPU under pressure, or Ollama stalled. ` +
          `Try: restart Ollama, reduce parallelism, or use a smaller model (translategemma:4b).`
        );
      }
      if (err instanceof TypeError && String(err.message).includes("fetch")) {
        throw new Error(
          "Cannot connect to Ollama. Is it running? Start with: ollama serve"
        );
      }
      throw new Error(
        `Network error reaching Ollama after ${elapsed}s: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 && body.includes("not found")) {
        throw new Error(
          `Model "${req.model}" not found. Pull it with: ollama pull ${req.model}`
        );
      }
      throw new Error(
        `Ollama error (HTTP ${res.status}, model: ${req.model}): ${body.slice(0, 200)}`
      );
    }
    return res.json() as Promise<OllamaGenerateResponse>;
  }

  async listModels(): Promise<OllamaModel[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama list failed (${res.status})`);
      }
      const data = (await res.json()) as { models: OllamaModel[] };
      return data.models;
    } finally {
      clearTimeout(timer);
    }
  }

  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async hasModel(name: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(
      (m) => m.name === name || m.name.startsWith(name + ":")
    );
  }

  /** Start Ollama if not already running. Returns true if it became available. */
  async ensureRunning(): Promise<boolean> {
    if (await this.isAvailable()) return true;

    // Try to find the ollama binary
    let ollamaPath = "ollama";
    try {
      // On Windows, Ollama installs to a known location
      if (process.platform === "win32") {
        const localApp = process.env.LOCALAPPDATA ?? "";
        const candidates = [
          `${localApp}\\Programs\\Ollama\\ollama.exe`,
          `${localApp}\\Ollama\\ollama.exe`,
          "ollama",
        ];
        for (const c of candidates) {
          try {
            execSync(`"${c}" --version`, { stdio: "ignore" });
            ollamaPath = c;
            break;
          } catch { /* try next */ }
        }
      }
    } catch { /* use default */ }

    // Spawn ollama serve in the background
    try {
      const child = spawn(ollamaPath, ["serve"], {
        detached: true,
        stdio: "ignore",
        ...(process.platform === "win32" ? { shell: true } : {}),
      });
      child.unref();
    } catch {
      return false;
    }

    // Wait up to 10 seconds for it to become available
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await this.isAvailable()) return true;
    }
    return false;
  }

  /** Pull a model if not already present. Streams progress to stderr. */
  async ensureModel(name: string): Promise<boolean> {
    if (await this.hasModel(name)) return true;

    process.stderr.write(`Pulling ${name} (may be several GB)...\n`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PULL_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, stream: true }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        process.stderr.write(`Pull failed: ${text}\n`);
        return false;
      }

      // Stream NDJSON progress lines from Ollama
      const reader = res.body?.getReader();
      if (!reader) {
        process.stderr.write(`Pull failed: no response body\n`);
        return false;
      }

      const decoder = new TextDecoder();
      let lastPct = -1;
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Process complete lines
        let nlIdx: number;
        while ((nlIdx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nlIdx).trim();
          buf = buf.slice(nlIdx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line) as { status?: string; completed?: number; total?: number };
            if (msg.total && msg.completed) {
              const pct = Math.floor((msg.completed / msg.total) * 100);
              if (pct !== lastPct && pct % 10 === 0) {
                process.stderr.write(`  ${msg.status ?? "downloading"}: ${pct}%\n`);
                lastPct = pct;
              }
            } else if (msg.status && msg.status !== "pulling") {
              process.stderr.write(`  ${msg.status}\n`);
            }
          } catch { /* skip malformed lines */ }
        }
      }

      process.stderr.write(`${name} ready.\n`);
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        process.stderr.write(`Pull timed out after ${PULL_TIMEOUT_MS / 1000}s. Try: ollama pull ${name}\n`);
        return false;
      }
      process.stderr.write(
        `Pull error: ${err instanceof Error ? err.message : String(err)}\n`
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
