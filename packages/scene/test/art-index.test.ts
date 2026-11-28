import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import {
  buildArtIndex,
  findSprites,
  indexStats,
  pickPrefabArt,
  readIndex,
  writeIndex,
  type ArtIndex,
} from '../src/art/index-db.js';
import { contactSheet, decodePngImage, encodePngImage, sliceSheet } from '../src/art/slice-sheet.js';
import type { ImageDescriber } from '../src/art/describe.js';

/** 造一张 200×100 的"图集"：左边 60×60 的块、右边 60×40 的块，中间透明。 */
function twoSprites(): PNG {
  const png = new PNG({ width: 200, height: 100 });
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
  paint(10, 10, 60, 60, [200, 80, 60]);
  paint(120, 30, 60, 40, [60, 120, 200]);
  return png;
}

describe('slice sheet', () => {
  it('finds each sprite and numbers them in reading order', () => {
    const png = decodePngImage(PNG.sync.write(twoSprites()));
    const sprites = sliceSheet(png, { minSide: 12, minArea: 120 });
    expect(sprites).toHaveLength(2);
    expect(sprites[0]).toMatchObject({ x: 10, y: 10, w: 60, h: 60, index: 0 });
    expect(sprites[1]).toMatchObject({ x: 120, y: 30, w: 60, h: 40, index: 1 });
  });

  it('draws readable numbers into the contact sheet', () => {
    const png = decodePngImage(PNG.sync.write(twoSprites()));
    const sprites = sliceSheet(png);
    const sheet = contactSheet(png, sprites, { cols: 2, cell: 120 });
    expect(sheet.width).toBe(240);
    // 编号是深色像素：左上角必须出现比背景暗的像素，否则模型读不到号
    const dark = (x: number, y: number) => sheet.data[(y * sheet.width + x) * 4] < 120;
    let found = false;
    for (let y = 4; y < 20 && !found; y += 1) {
      for (let x = 4; x < 20 && !found; x += 1) found = dark(x, y);
    }
    expect(found).toBe(true);
  });
});

/** 假视觉模型：按编号返回固定分类，验的是流程而不是模型。 */
class FakeDescriber implements ImageDescriber {
  readonly name = 'fake:labels';
  calls: number[][] = [];
  async describe(request: { user: string }): Promise<string> {
    const indices = [...request.user.matchAll(/(\d+)/g)].map((match) => Number(match[1]));
    this.calls.push(indices);
    return JSON.stringify({
      sprites: indices.map((index) => ({
        index,
        kind: index === 1 ? 'prop' : 'building',
        label: index === 1 ? '货摊' : '临街茶肆',
        tags: index === 1 ? ['stall'] : ['tea', 'shop'],
        prefab: index === 1 ? null : 'tavern',
        tileable: false,
      })),
    });
  }
}

describe('art index', () => {
  it('labels every sprite, batches the calls and stays queryable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream art index '));
    const library = join(root, 'library');
    mkdirSync(library, { recursive: true });
    writeFileSync(join(library, 'sheet.png'), PNG.sync.write(twoSprites()));
    const describer = new FakeDescriber();

    const index = await buildArtIndex({ source: library, describer, batch: 8 });
    expect(index.sheets).toHaveLength(1);
    expect(index.sheets[0].sprites).toHaveLength(2);
    expect(index.model).toBe('fake:labels');

    const stats = indexStats(index);
    expect(stats.sprites).toBe(2);
    expect(stats.labelled).toBe(2);
    expect(stats.byKind).toMatchObject({ building: 1, prop: 1 });

    // 按语义查：设计器说"要茶肆"，拿到的就是那一块
    expect(findSprites(index, { text: '茶肆' }).map((sprite) => sprite.id)).toEqual(['sheet.png#0']);
    expect(findSprites(index, { kind: 'prop' })).toHaveLength(1);
    expect(findSprites(index, { prefab: 'tavern' })).toHaveLength(1);
  });

  it('round-trips through a file so other tools can read it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream art index file '));
    const library = join(root, 'library');
    mkdirSync(library, { recursive: true });
    writeFileSync(join(library, 'sheet.png'), PNG.sync.write(twoSprites()));
    const index = await buildArtIndex({ source: library, describer: new FakeDescriber() });
    const file = writeIndex(join(root, 'index.json'), index);
    expect(readFileSync(file, 'utf8')).toContain('"kind": "building"');
    expect(readIndex(file).sheets[0].sprites[0].label).toBe('临街茶肆');
  });

  it('prefers a shape that fits the prefab instead of the biggest sprite', async () => {
    const wide = {
      id: 'a#1', sheet: 'a', index: 1, x: 0, y: 0, w: 160, h: 60, area: 9600,
      kind: 'building' as const, label: '长排铺面', tags: [], prefab: 'house-long', tileable: false,
    };
    const square = {
      id: 'a#2', sheet: 'a', index: 2, x: 0, y: 0, w: 120, h: 120, area: 14400,
      kind: 'building' as const, label: '方正小楼', tags: [], prefab: 'house-long', tileable: false,
    };
    const index: ArtIndex = {
      version: 1,
      createdAt: new Date().toISOString(),
      model: 'fake',
      source: 'nowhere',
      sheets: [{ file: 'a', width: 200, height: 200, sprites: [wide, square] }],
    };
    // house-long 期望宽高比 ~1.7；面积上方形更大，但形态差太多，不该被选中
    const picks = pickPrefabArt(index, [{ id: 'house-long', aspect: 1.73 }]);
    expect(picks).toHaveLength(1);
    expect(picks[0].sprite.id).toBe('a#1');
    expect(picks[0].alternatives.map((sprite) => sprite.id)).toEqual(['a#2']);
  });

  it('leaves a prefab empty instead of borrowing a wrong building', async () => {
    const only = {
      id: 'a#1', sheet: 'a', index: 1, x: 0, y: 0, w: 96, h: 96, area: 9216,
      kind: 'building' as const, label: '小楼', tags: [], prefab: 'house-small', tileable: false,
    };
    const index: ArtIndex = {
      version: 1,
      createdAt: new Date().toISOString(),
      model: 'fake',
      source: 'nowhere',
      sheets: [{ file: 'a', width: 96, height: 96, sprites: [only] }],
    };
    const picks = pickPrefabArt(index, [{ id: 'house-small', aspect: 1.1 }, { id: 'chapel', aspect: 0.95 }]);
    // 缺美术比配错美术好发现：chapel 没有候选就必须空着
    expect(picks.map((pick) => pick.prefab)).toEqual(['house-small']);
  });

  it('encodes and decodes the same picture', () => {
    const png = twoSprites();
    const round = decodePngImage(encodePngImage(decodePngImage(PNG.sync.write(png))));
    expect(round.width).toBe(200);
    expect(round.data.length).toBe(200 * 100 * 4);
  });
});
