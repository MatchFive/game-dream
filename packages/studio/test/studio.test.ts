import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCanvas, saveCanvas, scanAssets, setInBuild, toggleInBuild } from '../src/assets.js';
import { ComfyRunner } from '../src/comfyui.js';
import { loadProjectSnapshot, loadRuns } from '../src/project.js';
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

  it('stages selected assets into the project build and removes them on unselect', () => {
    const asset = scanAssets(root).find((entry) => entry.kind === 'concept')!;
    setInBuild(root, asset.id, true);
    const manifestFile = join(root, 'game', 'build-assets', 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      assets: Array<{ id: string; file: string }>;
    };
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0]?.id).toBe(asset.id);
    expect(manifest.assets[0]?.file).toMatch(/^game\/build-assets\/studio\//);
    expect(existsSync(join(root, manifest.assets[0]!.file))).toBe(true);

    setInBuild(root, asset.id, false);
    const cleared = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      assets: Array<{ file: string }>;
    };
    expect(cleared.assets).toEqual([]);
    expect(existsSync(join(root, manifest.assets[0]!.file))).toBe(false);
  });

  it('builds a project snapshot with screenshot and durable runs', () => {
    const canvas = saveCanvas(root, { nodes: [], inBuild: [] });
    const snapshot = loadProjectSnapshot(root, canvas, {
      url: 'http://127.0.0.1:1',
      workflow: 'missing.json',
      workflowExists: false,
      online: false,
    });
    expect(snapshot.build.screenshot?.file).toContain('real-v2-screenshot.png');
    expect(snapshot.build.engine).toBe('unknown');
    expect(snapshot.build.runs).toEqual([]);
  });

  it('starts a bounded batch with one seed per variant', () => {
    const runner = new ComfyRunner(
      { url: 'http://127.0.0.1:1', workflow: join(root, 'missing.json') },
      join(root, '.gamedream', 'studio', 'generated'),
      root,
    );
    const jobs = runner.startBatch('a test batch', false, 4);
    expect(jobs).toHaveLength(4);
    expect(jobs.map((job) => job.variant)).toEqual([1, 2, 3, 4]);
    expect(jobs.every((job) => job.batchSize === 4)).toBe(true);
    expect(new Set(jobs.map((job) => job.seed)).size).toBeGreaterThan(1);
    expect(runner.startBatch('clamped', false, 99)).toHaveLength(4);
    expect(runner.startBatch('minimum', false, 0)).toHaveLength(1);
  });

  it('serves state, project, uploads, verification, files, and canvas saves', async () => {
    const fakeCli = join(root, 'fake-verify.mjs');
    writeFileSync(
      fakeCli,
      'console.log(JSON.stringify({ gates: { G1: { status: "pass" }, G2: { status: "pass" }, G3: { status: "pass" } }, engine: "present" }));\n',
    );
    const studio = await startStudioServer({
      projectDir: root,
      port: 0,
      cliEntry: fakeCli,
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

      const project = await fetch(`${studio.url}/api/project`).then((response) => response.json()) as {
        build: { screenshot?: { file: string }; runs: unknown[] };
      };
      expect(project.build.screenshot?.file).toContain('real-v2-screenshot.png');
      expect(project.build.runs).toEqual([]);

      const screenshot = await fetch(`${studio.url}/api/project/screenshot`);
      expect(screenshot.status).toBe(200);

      const asset = state.assets.find((entry) => entry.name === 'Forest Warden')!;
      const raw = await fetch(`${studio.url}/api/assets/${asset.id}/raw`);
      expect(raw.status).toBe(200);

      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
      const uploaded = await fetch(`${studio.url}/api/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'imported.svg', data: svg }),
      }).then((response) => response.json()) as { file: string };
      expect(uploaded.file).toContain('assets/uploads/');
      expect(existsSync(join(root, uploaded.file))).toBe(true);

      const verify = await fetch(`${studio.url}/api/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }).then((response) => response.json()) as {
        run: { ok: boolean; gates: Record<string, { status: string }> };
      };
      expect(verify.run.ok).toBe(true);
      expect(verify.run.gates.G1.status).toBe('pass');
      expect(loadRuns(root)).toHaveLength(1);

      const save = await fetch(`${studio.url}/api/canvas`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nodes: [{ id: 'hero', kind: 'asset', assetId: asset.id, x: 10, y: 20, width: 300 }],
          inBuild: [asset.id],
        }),
      }).then((response) => response.json()) as { canvas: { inBuild: string[] } };
      expect(save.canvas.inBuild).toEqual([asset.id]);
      const staged = JSON.parse(
        readFileSync(join(root, 'game', 'build-assets', 'manifest.json'), 'utf8'),
      ) as { assets: Array<{ id: string; file: string }> };
      expect(staged.assets[0]?.id).toBe(asset.id);
      expect(existsSync(join(root, staged.assets[0]!.file))).toBe(true);

      const generation = await fetch(`${studio.url}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'a test asset' }),
      });
      expect(generation.status).toBe(503);

      const rejectedCount = await fetch(`${studio.url}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'a test asset', count: 5 }),
      });
      expect(rejectedCount.status).toBe(400);
    } finally {
      await studio.close();
    }
  });

  it('serves a web playtest and reports playable capabilities', async () => {
    const playRoot = mkdtempSync(join(tmpdir(), 'gamedream-studio-play-'));
    writeFileSync(
      join(playRoot, 'index.html'),
      '<!doctype html><head><link rel="stylesheet" href="/style.css"></head><script src="/game.js"></script>',
    );
    writeFileSync(join(playRoot, 'style.css'), 'body { background: url("/bg.png"); }');
    writeFileSync(join(playRoot, 'bg.png'), 'not-a-real-png');
    writeFileSync(join(playRoot, 'game.js'), 'console.log("playable");');
    const playStudio = await startStudioServer({
      projectDir: playRoot,
      port: 0,
      comfyui: { url: 'http://127.0.0.1:1', workflow: join(playRoot, 'missing.json') },
    });
    try {
      const capabilities = await fetch(`${playStudio.url}/api/playtest/capabilities`)
        .then((response) => response.json()) as {
          engine: string;
          web: { available: boolean; url: string };
        };
      expect(capabilities.engine).toBe('web');
      expect(capabilities.web).toMatchObject({ available: true, url: '/play/' });

      const start = await fetch(`${playStudio.url}/api/playtest/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }).then((response) => response.json()) as { mode: string; url: string };
      expect(start).toEqual({ mode: 'iframe', url: '/play/' });

      const page = await fetch(`${playStudio.url}/play/`);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain('<base href="/play/">');
      expect(html).toContain('src="/play/game.js"');
      expect(html).toContain('href="/play/style.css"');
      const style = await fetch(`${playStudio.url}/play/style.css`);
      expect(style.status).toBe(200);
      expect(await style.text()).toContain('url("/play/bg.png")');
      const script = await fetch(`${playStudio.url}/play/game.js`);
      expect(script.status).toBe(200);
      expect(await script.text()).toContain('playable');

      const stop = await fetch(`${playStudio.url}/api/playtest/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(stop.status).toBe(200);
    } finally {
      await playStudio.close();
      rmSync(playRoot, { recursive: true, force: true });
    }
  });
});
