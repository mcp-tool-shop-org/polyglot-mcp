/**
 * Minimal Ollama HTTP client — zero dependencies beyond Node fetch.
 * Auto-starts Ollama and auto-pulls models when needed.
 */

import { execSync, spawn } from "node:child_process";

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
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req, stream: false }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama generate failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<OllamaGenerateResponse>;
  }

  async listModels(): Promise<OllamaModel[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) {
      throw new Error(`Ollama list failed (${res.status})`);
    }
    const data = (await res.json()) as { models: OllamaModel[] };
    return data.models;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
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

  /** Pull a model if not already present. Logs progress to stderr. */
  async ensureModel(name: string): Promise<boolean> {
    if (await this.hasModel(name)) return true;

    process.stderr.write(`Pulling ${name} (this may take a few minutes)...\n`);
    try {
      const res = await fetch(`${this.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, stream: false }),
      });
      if (!res.ok) {
        const text = await res.text();
        process.stderr.write(`Pull failed: ${text}\n`);
        return false;
      }
      await res.json(); // wait for completion
      process.stderr.write(`${name} ready.\n`);
      return true;
    } catch (err) {
      process.stderr.write(
        `Pull error: ${err instanceof Error ? err.message : String(err)}\n`
      );
      return false;
    }
  }
}
