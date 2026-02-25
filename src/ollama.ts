/**
 * Minimal Ollama HTTP client — zero dependencies beyond Node fetch.
 */

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
}
