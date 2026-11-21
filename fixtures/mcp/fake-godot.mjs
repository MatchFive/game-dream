#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const tools = [
  'get_godot_version',
  'create_scene',
  'add_node',
  'save_scene',
  'run_project',
  'stop_project',
  'get_debug_output',
  'load_sprite',
  'export_mesh_library',
  'get_project_info',
  'get_uid',
  'update_project_uids',
  'list_projects',
  'launch_editor',
].map((name) => ({
  name,
  description: `fixture tool ${name}`,
  inputSchema: { type: 'object', properties: {} },
}));

let buffer = '';

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function fail(id, message) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } })}\n`,
  );
}

function handle(message) {
  const { id, method, params } = message;
  if (method === 'initialize') {
    respond(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'fake-godot', version: '0.0.0' },
    });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    respond(id, { tools });
    return;
  }
  if (method !== 'tools/call') {
    if (id !== undefined) fail(id, `unsupported method: ${method}`);
    return;
  }
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name === 'get_godot_version') {
    respond(id, { content: [{ type: 'text', text: '4.4.1.fake' }] });
    return;
  }
  if (name === 'save_scene') {
    const projectPath = String(args.projectPath ?? process.cwd());
    const scenePath = String(args.scenePath ?? 'ui/McpHud.tscn');
    const file = join(projectPath, scenePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      '[gd_scene load_steps=1 format=3]\n\n[node name="root" type="Control"]\n\n[node name="Backdrop" type="ColorRect" parent="."]\n\n[node name="Title" type="Label" parent="."]\n',
      'utf8',
    );
    respond(id, { content: [{ type: 'text', text: `saved ${scenePath}` }] });
    return;
  }
  respond(id, { content: [{ type: 'text', text: `${name} ok` }] });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) return;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
});
