import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { McpClient, McpRegistry } from '../src/commands/mcp.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('MCP client', () => {
  it('initializes, discovers tools, and drives a scene save', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'gamedream-mcp-'));
    const config = join(temp, 'mcp.json');
    writeFileSync(
      config,
      JSON.stringify({
        mcpServers: {
          'fake-godot': {
            command: process.execPath,
            args: [join(root, 'fixtures/mcp/fake-godot.mjs')],
          },
        },
      }),
    );
    const client = await McpClient.connect(config, 'fake-godot');
    try {
      expect(client.tools).toHaveLength(14);
      expect(await client.call('get_godot_version', {})).toBe('4.4.1.fake');
      const project = join(temp, 'project');
      const scene = 'ui/McpHud.tscn';
      await client.call('create_scene', { projectPath: project, scenePath: scene });
      await client.call('add_node', {
        projectPath: project,
        scenePath: scene,
        nodeType: 'Label',
        nodeName: 'Title',
      });
      await client.call('save_scene', { projectPath: project, scenePath: scene });
      expect(existsSync(join(project, scene))).toBe(true);
      expect(readFileSync(join(project, scene), 'utf8')).toContain('Control');
    } finally {
      client.close();
      rmSync(temp, { recursive: true, force: true });
    }
  }, 30_000);

  it('connects multiple MCP servers and namespaces their tools', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'gamedream-mcp-registry-'));
    const config = join(temp, 'mcp.json');
    const server = {
      command: process.execPath,
      args: [join(root, 'fixtures/mcp/fake-godot.mjs')],
    };
    writeFileSync(
      config,
      JSON.stringify({ mcpServers: { alpha: server, beta: server } }),
    );
    const registry = await McpRegistry.connect([config]);
    try {
      expect(registry.tools.some((tool) => tool.qualifiedName === 'alpha/get_godot_version')).toBe(true);
      expect(registry.tools.some((tool) => tool.qualifiedName === 'beta/get_godot_version')).toBe(true);
      expect(await registry.call({ name: 'alpha/get_godot_version' })).toBe('4.4.1.fake');
      expect(await registry.call({ server: 'beta', name: 'get_godot_version' })).toBe('4.4.1.fake');
    } finally {
      registry.close();
      rmSync(temp, { recursive: true, force: true });
    }
  }, 30_000);
});
