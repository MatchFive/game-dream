import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStudioServer } from '../src/server.js';
import { listProjects } from '../src/projects.js';
import {
  loadStudioSettings,
  publicStudioSettings,
  saveStudioSettings,
  settingsPath,
} from '../src/settings.js';

function fakeCreateCli(root: string): string {
  const script = join(root, 'fake-create.mjs');
  writeFileSync(
    script,
    `import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const index = process.argv.indexOf('--out');
const out = process.argv[index + 1];
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'project.godot'), '[application]\\nconfig/name="fixture"\\n');
writeFileSync(join(out, 'gamedream.yaml'), 'name: fixture\\n');
console.log(JSON.stringify({ outDir: out }));
`,
    'utf8',
  );
  return script;
}

describe('studio settings and projects', () => {
  it('persists settings, keeps the API key private, and lists projects', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'gamedream-workspace-'));
    const current = join(workspace, 'current');
    mkdirSync(current, { recursive: true });
    writeFileSync(join(current, 'project.godot'), '[application]\n');
    const cli = fakeCreateCli(workspace);
    const studio = await startStudioServer({
      projectDir: current,
      workspaceDir: workspace,
      port: 0,
      cliEntry: cli,
    });
    try {
      const initial = await fetch(`${studio.url}/api/settings`).then((response) => response.json()) as {
        workspace: string;
        settings: { model: { hasApiKey: boolean } };
      };
      expect(initial.workspace).toBe(workspace);
      expect(initial.settings.model.hasApiKey).toBe(false);

      const saved = await fetch(`${studio.url}/api/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: { provider: 'openai', model: 'gpt-4o', baseUrl: 'https://example.test/v1', apiKey: 'secret' },
          image: { url: 'http://127.0.0.1:8188', workflow: 'C:/workflow.json' },
          engines: { godotBin: 'D:/godot.exe', unityBin: 'D:/unity/Editor' },
          agent: { skillsDirs: ['D:/skills'], mcpConfigs: ['D:/mcp.json'] },
        }),
      }).then((response) => response.json()) as {
        settings: {
          model: { hasApiKey: boolean; apiKey?: string };
          agent: { skillsDirs: string[]; mcpConfigs: string[] };
        };
      };
      expect(saved.settings.model.hasApiKey).toBe(true);
      expect(saved.settings.model.apiKey).toBeUndefined();
      expect(saved.settings.agent).toEqual({
        skillsDirs: ['D:/skills'],
        mcpConfigs: ['D:/mcp.json'],
      });
      const file = settingsPath(workspace);
      expect(existsSync(file)).toBe(true);
      expect(JSON.parse(readFileSync(file, 'utf8')).model.apiKey).toBe('secret');

      const projects = await fetch(`${studio.url}/api/projects`).then((response) => response.json()) as {
        projects: Array<{ path: string }>;
      };
      expect(projects.projects.some((project) => project.path === current)).toBe(true);

      const create = await fetch(`${studio.url}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'new-game', prompt: 'a neon arena' }),
      }).then((response) => response.json()) as { project: { path: string } };
      expect(create.project.path).toBe(join(workspace, 'new-game'));
      expect(existsSync(join(create.project.path, 'project.godot'))).toBe(true);

      const opened = await fetch(`${studio.url}/api/projects/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: create.project.path }),
      }).then((response) => response.json()) as { url: string };
      const child = await fetch(opened.url);
      expect(child.status).toBe(200);

      const outside = mkdtempSync(join(tmpdir(), 'gamedream-outside-'));
      writeFileSync(join(outside, 'project.godot'), '[application]\n');
      const imported = await fetch(`${studio.url}/api/projects/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: outside }),
      });
      expect(imported.status).toBe(200);
      const importedBody = await imported.json() as {
        url: string;
        project: { engine: string; path: string };
      };
      expect(importedBody.project).toMatchObject({ engine: 'godot', path: outside });
      expect((await fetch(importedBody.url)).status).toBe(200);

      const unknown = mkdtempSync(join(tmpdir(), 'gamedream-unknown-'));
      const rejected = await fetch(`${studio.url}/api/projects/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: unknown }),
      });
      expect(rejected.status).toBe(400);
    } finally {
      await studio.close();
    }
  });

  it('loads defaults and saves normalized settings without a workspace server', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'gamedream-settings-'));
    const defaults = loadStudioSettings(workspace, {});
    const next = saveStudioSettings(workspace, defaults, {
      model: { provider: 'fake', model: 'fixture-model' },
      image: { url: 'http://localhost:8188' },
    });
    expect(next.model.provider).toBe('fake');
    expect(next.model.apiKey).toBe('');
    expect(publicStudioSettings(next).model).not.toHaveProperty('apiKey');
    expect(listProjects(workspace)).toEqual([]);
  });
});
