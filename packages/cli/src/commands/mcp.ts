import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpConfig {
  mcpServers?: Record<
    string,
    {
      transport?: string;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    }
  >;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class McpClient {
  private child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buffer = '';
  readonly tools: McpTool[] = [];

  private constructor(
    private readonly serverName: string,
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ) {
    this.child = spawn(command, args, {
      env,
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onData(chunk));
    this.child.stderr.on('data', () => undefined);
  }

  static async connect(configPath: string, serverName = 'godot'): Promise<McpClient> {
    if (!existsSync(configPath)) throw new Error(`MCP config not found: ${configPath}`);
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as McpConfig;
    const server = config.mcpServers?.[serverName];
    if (!server?.command) throw new Error(`MCP server ${serverName} has no stdio command`);
    const child = new McpClient(
      serverName,
      server.command,
      server.args ?? [],
      { ...process.env, ...(server.env ?? {}) },
    );
    try {
      await child.request(
        'initialize',
        {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'gamedream', version: '0.0.0' },
        },
        15_000,
      );
      child.notify('notifications/initialized', {});
      const listed = (await child.request('tools/list', {}, 15_000)) as {
        tools?: McpTool[];
      };
      child.tools.push(...(listed.tools ?? []));
      return child;
    } catch (error) {
      child.close();
      throw error;
    }
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.request(
      'tools/call',
      { name, arguments: args },
      60_000,
    )) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    const text = (result.content ?? [])
      .filter((item) => item.type === 'text' && item.text)
      .map((item) => item.text)
      .join('\n');
    if (result.isError) throw new Error(text || `MCP tool ${name} failed`);
    return text || JSON.stringify(result);
  }

  close(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('MCP client closed'));
    }
    this.pending.clear();
    if (process.platform === 'win32' && this.child.pid) {
      spawn('taskkill', ['/pid', String(this.child.pid), '/t', '/f'], {
        windowsHide: true,
      });
    } else {
      this.child.kill();
    }
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${this.serverName} request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
      );
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(line) as typeof message;
      } catch {
        continue;
      }
      if (typeof message.id !== 'number') continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'MCP error'));
      else pending.resolve(message.result);
    }
  }
}

export function defaultMcpConfig(): string | undefined {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  if (!home) return undefined;
  const path = join(home, '.commandcode', 'mcp.json');
  return existsSync(path) ? path : undefined;
}
