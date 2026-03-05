/**
 * Integration smoke test — starts the MCP server over stdio and calls
 * list_languages to prove the handshake works.
 *
 * This test requires only Node.js (no Ollama), making it CI-safe.
 * It spawns the compiled server as a child process and communicates
 * via the MCP protocol over stdin/stdout.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, "../dist/index.js");

/**
 * Minimal MCP JSON-RPC client over stdio.
 * Uses newline-delimited JSON (the MCP SDK stdio transport format).
 */
class StdioMcpClient {
  private process: ChildProcess;
  private buffer = "";
  private id = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private ready: Promise<void>;

  constructor(serverPath: string) {
    this.process = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.process.stdout!.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    // Capture stderr for debugging but don't fail on it
    this.process.stderr!.on("data", () => {
      /* swallow */
    });

    // Initialize the MCP handshake
    this.ready = this.initialize();
  }

  private processBuffer(): void {
    // MCP stdio transport uses newline-delimited JSON
    let nlIdx: number;
    while ((nlIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nlIdx).trim();
      this.buffer = this.buffer.slice(nlIdx + 1);
      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        /* skip malformed messages */
      }
    }
  }

  private send(msg: Record<string, unknown>): void {
    const body = JSON.stringify(msg) + "\n";
    this.process.stdin!.write(body);
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          reject(new Error(`Timeout waiting for response to ${method}`));
        },
        10_000
      );
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.send({ jsonrpc: "2.0", id, method, params: params ?? {} });
    });
  }

  private async initialize(): Promise<void> {
    const res = (await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "0.0.1" },
    })) as { result?: { serverInfo?: { name: string } } };

    // Send initialized notification
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });

    if (!res.result?.serverInfo?.name) {
      throw new Error("MCP handshake failed — no serverInfo in response");
    }
  }

  async waitReady(): Promise<void> {
    await this.ready;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    await this.ready;
    const res = (await this.request("tools/call", { name, arguments: args })) as {
      result?: {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      error?: { message: string };
    };
    if (res.error) throw new Error(`MCP error: ${res.error.message}`);
    return res.result!;
  }

  async listTools(): Promise<Array<{ name: string; description: string }>> {
    await this.ready;
    const res = (await this.request("tools/list", {})) as {
      result?: { tools: Array<{ name: string; description: string }> };
    };
    return res.result?.tools ?? [];
  }

  close(): void {
    try {
      this.process.stdin!.end();
    } catch {
      /* ignore */
    }
    this.process.kill();
  }
}

describe("MCP integration (stdio)", () => {
  let client: StdioMcpClient;

  beforeAll(async () => {
    if (!existsSync(SERVER_PATH)) {
      throw new Error(
        `Server not built — run "npm run build" first. Expected: ${SERVER_PATH}`
      );
    }
    client = new StdioMcpClient(SERVER_PATH);
    await client.waitReady();
  }, 20_000);

  afterAll(() => {
    client?.close();
  });

  it("completes MCP handshake successfully", async () => {
    // If we got here, the handshake in beforeAll succeeded
    expect(true).toBe(true);
  });

  it("lists all 4 registered tools", async () => {
    const tools = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("translate");
    expect(names).toContain("translate_markdown");
    expect(names).toContain("list_languages");
    expect(names).toContain("check_status");
  }, 10_000);

  it("list_languages returns expected format", async () => {
    const result = await client.callTool("list_languages");
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain("Supported languages");
    expect(result.content[0].text).toContain("en");
    expect(result.content[0].text).toContain("English");
    expect(result.content[0].text).toContain("ja");
    expect(result.content[0].text).toContain("Japanese");
  }, 10_000);
});
