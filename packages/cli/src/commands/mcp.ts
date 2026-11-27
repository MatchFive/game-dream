import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerConfig {
  transport?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers?: Record<string, McpServerConfig>;
}

export interface McpRegistryTool extends McpTool {
  server: string;
  toolName: string;
  qualifiedName: string;
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
    readonly serverName: string,
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ) {
    const useShell = process.platform === 'win32'
      && (/\.(cmd|bat)$/i.test(command) || !/[\\/]/.test(command));
    this.child = spawn(command, args, {
      env,
      windowsHide: true,
      shell: useShell,
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
        30_000,
      );
      child.notify('notifications/initialized', {});
      const listed = (await child.request('tools/list', {}, 30_000)) as {
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

export class McpRegistry {
  private readonly clients = new Map<string, McpClient>();
  readonly tools: McpRegistryTool[] = [];
  readonly errors: string[] = [];

  private constructor() {}

  static async connect(
    configPaths: string[],
    serverNames?: string[],
  ): Promise<McpRegistry> {
    const registry = new McpRegistry();
    const merged = new Map<string, { config: McpServerConfig; path: string }>();
    for (const path of configPaths) {
      if (!existsSync(path)) continue;
      let config: McpConfig;
      try {
        config = JSON.parse(readFileSync(path, 'utf8')) as McpConfig;
      } catch {
        continue;
      }
      for (const [name, server] of Object.entries(config.mcpServers ?? {})) {
        if (!merged.has(name)) merged.set(name, { config: server, path });
      }
    }
    const requested = serverNames?.filter(Boolean) ?? [];
    const names = requested.length > 0 ? requested : [...merged.keys()];
    for (const name of names) {
      const entry = merged.get(name);
      if (!entry) {
        registry.errors.push(`MCP server not found: ${name}`);
        continue;
      }
      try {
        const client = await McpClient.connect(entry.path, name);
        registry.clients.set(name, client);
        for (const tool of client.tools) {
          registry.tools.push({
            ...tool,
            server: name,
            toolName: tool.name,
            qualifiedName: `${name}/${tool.name}`,
            name: `${name}/${tool.name}`,
          });
        }
      } catch (error) {
        registry.errors.push(`MCP ${name}: ${(error as Error).message}`);
      }
    }
    if (registry.clients.size === 0) {
      throw new Error(
        registry.errors.join('; ')
        || `no MCP servers found in: ${configPaths.join(', ')}`,
      );
    }
    return registry;
  }

  async call(input: {
    server?: string;
    name: string;
    args?: Record<string, unknown>;
  }): Promise<string> {
    let server = input.server?.trim();
    let name = input.name.trim();
    if (!name) throw new Error('MCP tool name is required');
    if (!server && name.includes('/')) {
      const [prefix, ...rest] = name.split('/');
      server = prefix;
      name = rest.join('/');
    }
    if (!server) {
      if (this.clients.size !== 1) {
        throw new Error(
          `MCP server is required when multiple servers are configured: ${[...this.clients.keys()].join(', ')}`,
        );
      }
      server = [...this.clients.keys()][0];
    }
    const client = this.clients.get(server);
    if (!client) throw new Error(`MCP server not connected: ${server}`);
    return client.call(name, input.args ?? {});
  }

  close(): void {
    for (const client of this.clients.values()) client.close();
    this.clients.clear();
  }
}

export function defaultMcpConfigs(projectDir?: string): string[] {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  const paths = [
    ...(projectDir
      ? [
          join(projectDir, '.mcp.json'),
          join(projectDir, 'mcp.json'),
          join(projectDir, '.commandcode', 'mcp.json'),
          join(projectDir, '.claude', 'mcp.json'),
        ]
      : []),
    join(process.cwd(), '.mcp.json'),
    join(process.cwd(), '.commandcode', 'mcp.json'),
    ...(home
      ? [
          join(home, '.commandcode', 'mcp.json'),
          join(home, '.claude.json'),
          join(home, '.claude', 'mcp.json'),
        ]
      : []),
  ];
  const seen = new Set<string>();
  return paths.filter((path) => {
    if (seen.has(path) || !existsSync(path)) return false;
    seen.add(path);
    return true;
  });
}

export function defaultMcpConfig(): string | undefined {
  return defaultMcpConfigs()[0];
}
