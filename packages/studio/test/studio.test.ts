import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCanvas, saveCanvas, scanAssets, setInBuild, toggleInBuild } from '../src/assets.js';
import { startStudioServer } from '../src/server.js';

let root: string;

function seedProject(): void {
  mkdirSync(join(root, 'modules', 'system.survivor', 'assets'), { recursive: true });
  mkdirSync(join(root, 'docs', 'evidence'), { recursive: true });
  mkdirSync(join(root, '.gamedream', 'studio', 'generated'), { recursive: true });
  writeFileSync(
    join(root, 'modules', 'system.survivor', 'assets', 'player.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  writeFileSync(join(root, 'modules', 'system.survivor', 'assets', 'bgm.mp3'), 'audio');
  writeFileSync(join(root, 'docs', 'evidence', 'real-v2-screenshot.png'), 'png');
  writeFileSync(join(root, '.gamedream', 'studio', 'generated', 'concept.png'), 'png');
  writeFileSync(
    join(root, '.gamedream', 'studio', 'generated', 'concept.json'),
    JSON.stringify({ name: 'Forest Warden', prompt: 'a forest warden', seed: 42, file: 'concept.png' }),
  );
}

describe('studio assets', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gamedream-studio-'));
    seedProject();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('scans modules, evidence screenshots, and generated metadata', () => {
    const assets = scanAssets(root);
    expect(assets).toHaveLength(4);
    expect(assets.find((asset) => asset.name === 'Player')?.kind).toBe('sprite');
    expect(assets.find((asset) => asset.name === 'BGM loop')?.kind).toBe('audio');
    expect(assets.find((asset) => asset.name === 'Real V2 Screenshot')?.kind).toBe('screenshot');
    const generated = assets.find((asset) => asset.source === 'generated');
    expect(generated).toMatchObject({ name: 'Forest Warden', prompt: 'a forest warden', seed: '42' });
  });

  it('persists canvas nodes and build selection', () => {
    const asset = scanAssets(root).find((entry) => entry.kind === 'concept')!;
    saveCanvas(root, {
      nodes: [{ id: 'hero', kind: 'asset', assetId: asset.id, x: 10, y: 20, width: 300 }],
      inBuild: [],
    });
    expect(loadCanvas(root).nodes[0]).toMatchObject({ id: 'hero', assetId: asset.id });
    expect(setInBuild(root, asset.id, true).inBuild).toEqual([asset.id]);
    expect(toggleInBuild(root, asset.id).inBuild).toEqual([]);
  });

  it('serves state, files, canvas saves, and rejects missing workflow generation', async () => {
    const studio = await startStudioServer({
      projectDir: root,
      port: 0,
      comfyui: { url: 'http://127.0.0.1:1', workflow: join(root, 'missing.json') },
    });
    try {
      const state = await fetch(`${studio.url}/api/state`).then((response) => response.json()) as {
        assets: Array<{ id: string; name: string }>;
        canvas: { nodes: unknown[] };
        comfyui: { workflowExists: boolean };
      };
      expect(state.assets.length).toBe(4);
      expect(state.canvas.nodes).toEqual([]);
      expect(state.comfyui.workflowExists).toBe(false);

      const asset = state.assets.find((entry) => entry.name === 'Forest Warden')!;
      const raw = await fetch(`${studio.url}/api/assets/${asset.id}/raw`);
      expect(raw.status).toBe(200);

      const save = await fetch(`${studio.url}/api/canvas`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nodes: [{ id: 'hero', kind: 'asset', assetId: asset.id, x: 10, y: 20, width: 300 }],
          inBuild: [asset.id],
        }),
      }).then((response) => response.json()) as { canvas: { inBuild: string[] } };
      expect(save.canvas.inBuild).toEqual([asset.id]);

      const generation = await fetch(`${studio.url}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'a test asset' }),
      });
      expect(generation.status).toBe(503);
    } finally {
      await studio.close();
    }
  });
});
