#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpClient } from '../packages/cli/dist/commands/mcp.js';
function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const config = resolve(
  arg('config', process.env.GAMEDREAM_MCP_CONFIG ?? 'C:/Users/25793/.commandcode/mcp.json'),
);
const server = arg('server', 'godot');
const projectPath = resolve(arg('project', 'C:/temp/gd-mcp-scene'));
const scenePath = arg('scene', 'ui/McpHud.tscn');
if (!existsSync(config)) {
  console.error(`MCP config not found: ${config}`);
  process.exit(3);
}

const client = await McpClient.connect(config, server);
try {
  const version = await client.call('get_godot_version', {});
  console.log(`MCP_GODOT_VERSION=${version.trim()}`);
  console.log(`MCP_TOOL_COUNT=${client.tools.length}`);
  await client.call('create_scene', {
    projectPath,
    scenePath,
    rootNodeType: 'Control',
  });
  await client.call('add_node', {
    projectPath,
    scenePath,
    parentNodePath: 'root',
    nodeType: 'ColorRect',
    nodeName: 'Backdrop',
    properties: { color: { r: 0.02, g: 0.04, b: 0.08, a: 1 } },
  });
  await client.call('add_node', {
    projectPath,
    scenePath,
    parentNodePath: 'root',
    nodeType: 'Label',
    nodeName: 'Title',
    properties: { text: 'MCP HUD' },
  });
  await client.call('save_scene', { projectPath, scenePath });
  const saved = resolve(projectPath, scenePath);
  if (!existsSync(saved)) {
    console.error(`MCP scene was not saved: ${saved}`);
    process.exit(4);
  }
  const content = readFileSync(saved, 'utf8');
  const nodes = [
    ['root', 'Control'],
    ['Backdrop', 'ColorRect'],
    ['Title', 'Label'],
  ];
  for (const [name, type] of nodes) {
    if (!content.includes(`name="${name}" type="${type}"`)) {
      console.error(`MCP scene is missing ${name} (${type}): ${saved}`);
      process.exit(5);
    }
  }
  console.log(`MCP_SCENE_OK=${saved}`);
  console.log(`MCP_SCENE_NODES=${nodes.map(([name, type]) => `${name}:${type}`).join(',')}`);
  console.log('MCP_SMOKE_EXIT=0');
} finally {
  client.close();
}
