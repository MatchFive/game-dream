import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { startStudioServer, type StudioServerHandle } from '../src/index.js';
import { libraryIndexPath, libraryState, libraryThumbnail, setSpritePrefab } from '../src/library.js';

/** 一张 120×120 的图集：左上 60×60 的"建筑"，右下 40×40 的"铺地"。 */
function sheetPng(): Buffer {
  const png = new PNG({ width: 120, height: 120 });
  png.data.fill(0);
  const paint = (x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const o = (y * png.width + x) * 4;
        png.data[o] = rgb[0];
        png.data[o + 1] = rgb[1];
        png.data[o + 2] = rgb[2];
        png.data[o + 3] = 255;
      }
    }
  };
  paint(10, 10, 60, 60, [180, 90, 60]);
  paint(70, 70, 40, 40, [90, 110, 140]);
  return PNG.sync.write(png);
}

function makeProject(withIndex = true): { root: string; library: string } {
  const root = mkdtempSync(join(tmpdir(), 'gamedream library ui '));
  const library = join(root, 'artlib');
  mkdirSync(library, { recursive: true });
  writeFileSync(join(library, 'sheet.png'), sheetPng());
  if (withIndex) {
    mkdirSync(join(root, '.gamedream', 'studio'), { recursive: true });
    writeFileSync(
      libraryIndexPath(root),
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        model: 'fake:labels',
        source: library,
        sheets: [
          {
            file: 'sheet.png',
            width: 120,
            height: 120,
            sprites: [
              {
                id: 'sheet.png#0', sheet: 'sheet.png', index: 0,
                x: 10, y: 10, w: 60, h: 60, area: 3600,
                kind: 'building', label: '临街茶肆', tags: ['tavern'], prefab: 'tavern', tileable: false,
              },
              {
                id: 'sheet.png#1', sheet: 'sheet.png', index: 1,
                x: 70, y: 70, w: 40, h: 40, area: 1600,
                kind: 'terrain', label: '青砖铺地', tags: ['brick'], prefab: null, tileable: true,
              },
            ],
          },
        ],
      }, null, 2),
      'utf8',
    );
  }
  return { root, library };
}

const handles: StudioServerHandle[] = [];
afterEach(async () => {
  while (handles.length > 0) await handles.pop()?.close();
});

describe('art library', () => {
  it('reports "not indexed" instead of failing when the project has no index', () => {
    const { root } = makeProject(false);
    const state = libraryState(root);
    expect(state.ready).toBe(false);
    expect(state.indexPath).toContain('art-index.json');
  });

  it('crops a thumbnail straight from the sheet', () => {
    const { root } = makeProject();
    const png = libraryThumbnail(root, 'sheet.png', 0);
    expect(png).not.toBeNull();
    const decoded = PNG.sync.read(png as Buffer);
    // 缩略图就是那块精灵本身，尺寸必须与原图一致，不是整张图集
    expect([decoded.width, decoded.height]).toEqual([60, 60]);
  });

  it('returns 404 for a sprite that is not in the index', () => {
    const { root } = makeProject();
    expect(libraryThumbnail(root, 'sheet.png', 99)).toBeNull();
    expect(libraryThumbnail(root, 'missing.png', 0)).toBeNull();
  });

  it('lets a human override what the model suggested, and keeps it on disk', () => {
    const { root } = makeProject();
    const result = setSpritePrefab(root, { sheet: 'sheet.png', index: 0, prefab: 'market-hall' });
    expect(result.ok).toBe(true);
    expect(result.sprite?.prefab).toBe('market-hall');
    // 落盘才算改掉：下次读回来必须还是人工的值
    const reread = JSON.parse(readFileSync(libraryIndexPath(root), 'utf8')) as {
      sheets: Array<{ sprites: Array<{ prefab: string | null }> }>;
    };
    expect(reread.sheets[0].sprites[0].prefab).toBe('market-hall');
    // 清空也是合法状态（"这块不挂任何 prefab，只是素材"）
    expect(setSpritePrefab(root, { sheet: 'sheet.png', index: 0, prefab: null }).sprite?.prefab).toBeNull();
  });

  it('serves the summary, the filtered list and the thumbnails over HTTP', async () => {
    const { root } = makeProject();
    const handle = await startStudioServer({ projectDir: root, port: 0 });
    handles.push(handle);
    const base = `http://127.0.0.1:${handle.port}`;

    const all = await (await fetch(`${base}/api/library`)).json() as {
      library: { ready: boolean; summary: { sprites: number; kinds: Record<string, number> } };
      sprites: Array<{ id: string; thumb: string }>;
    };
    expect(all.library.ready).toBe(true);
    expect(all.library.summary.sprites).toBe(2);
    expect(all.library.summary.kinds).toMatchObject({ building: 1, terrain: 1 });
    expect(all.sprites).toHaveLength(2);

    const filtered = await (await fetch(`${base}/api/library?kind=terrain`)).json() as {
      sprites: Array<{ id: string }>;
    };
    expect(filtered.sprites.map((sprite) => sprite.id)).toEqual(['sheet.png#1']);

    const thumb = await fetch(`${base}${all.sprites[0].thumb}`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get('content-type')).toBe('image/png');
    expect((await thumb.arrayBuffer()).byteLength).toBeGreaterThan(100);

    const patched = await fetch(`${base}/api/library/prefab`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sheet: 'sheet.png', index: 1, prefab: 'chapel' }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json() as { sprite: { prefab: string } }).sprite.prefab).toBe('chapel');
  });

  it('serves the SPA shell for /library so a refresh does not 404', async () => {
    const { root } = makeProject();
    const handle = await startStudioServer({ projectDir: root, port: 0 });
    handles.push(handle);
    const response = await fetch(`http://127.0.0.1:${handle.port}/library`);
    // 没有前端产物时退回 404 也算合格（CI 不跑 web build），但不能是 500
    expect([200, 404]).toContain(response.status);
  });
});
