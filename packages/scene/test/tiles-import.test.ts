import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { importTiles, bestWindow, resample } from '../src/export/tiles-import.js';
import { villageCnKit, villageEuroKit, findBuiltinKit } from '../src/kits.js';
import { loadTileSource } from '../src/export/tile-art.js';
import { renderTileAtlas } from '../src/export/tiles.js';
import { parseSceneSpec, buildScene } from '../src/index.js';

/** 造一张 96×96 的单元：上半纯色 A、下半纯色 B（和 A2 图块的结构一样）。 */
function twoTone(): PNG {
  const png = new PNG({ width: 96, height: 96 });
  for (let y = 0; y < 96; y += 1) {
    for (let x = 0; x < 96; x += 1) {
      const o = (y * 96 + x) * 4;
      const top = y < 48;
      png.data[o] = top ? 240 : 40;
      png.data[o + 1] = top ? 240 : 90;
      png.data[o + 2] = top ? 240 : 40;
      png.data[o + 3] = 255;
    }
  }
  return png;
}

function writeSheet(dir: string, name: string, png: PNG): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), PNG.sync.write(png));
}

describe('tile import', () => {
  it('honours the at-hint instead of grabbing the flattest half', () => {
    const png = twoTone();
    const box = { x: 0, y: 0, w: 96, h: 96 };
    // 不给提示：上下两块都很平，谁赢取决于接缝打分，不能假设
    const bottom = bestWindow(png, box, 32, { at: [24, 72], radius: 14 });
    const top = bestWindow(png, box, 32, { at: [24, 20], radius: 14 });
    // 给了提示就必须落在指定半边——A2 单元上半是 autotile 四角、下半才是本体纹理
    expect(bottom.y).toBeGreaterThanOrEqual(48);
    expect(top.y).toBeLessThan(48);
  });

  it('downsamples without inventing colours', () => {
    const png = twoTone();
    const tile = resample(png, { x: 0, y: 48, w: 96, h: 96 - 48 }, 32);
    expect(tile.width).toBe(32);
    expect(tile.height).toBe(32);
    // 下半是纯色，缩完必须还是那个颜色（平均采样不该糊出新颜色）
    expect(tile.data[0]).toBe(40);
    expect(tile.data[1]).toBe(90);
    expect(tile.data[2]).toBe(40);
  });

  it('writes the layout the exporter reads, and clears stale variants', () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream tiles import '));
    const library = join(root, 'library');
    writeSheet(library, 'sheet.png', twoTone());
    const artDir = join(root, 'art');

    const result = importTiles({
      source: library,
      artDir,
      picks: {
        cellSize: 96,
        kitId: 'village-cn',
        terrain: { ground: [{ file: 'sheet.png', cell: [0, 0], at: [24, 72], radius: 14 }] },
        props: { tree: { file: 'sheet.png', rect: [0, 48, 40, 40] } },
      },
    });
    expect(result.terrains).toEqual(['ground']);
    expect(result.props).toEqual(['tree']);

    // 导出器按同名约定读回来
    const source = loadTileSource(artDir, 'village-cn');
    expect(source.terrain?.ground).toHaveLength(1);
    expect(source.props?.tree?.width).toBe(40);

    // 换一张表重跑：上一版的变体不能留着当"额外瓦片"
    writeFileSync(join(artDir, 'village-cn', 'tiles', 'ground-9.png'), PNG.sync.write(twoTone()));
    importTiles({
      source: library,
      artDir,
      picks: { cellSize: 96, kitId: 'village-cn', terrain: { ground: [{ file: 'sheet.png', cell: [0, 0], at: [24, 72], radius: 14 }] } },
    });
    const after = loadTileSource(artDir, 'village-cn');
    expect(after.terrain?.ground).toHaveLength(1);
  });

  it('uses imported tiles in the atlas instead of generated colour blocks', () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream tiles atlas '));
    const library = join(root, 'library');
    writeSheet(library, 'sheet.png', twoTone());
    const artDir = join(root, 'art');
    importTiles({
      source: library,
      artDir,
      picks: {
        cellSize: 96,
        kitId: 'village-cn',
        terrain: { ground: [{ file: 'sheet.png', cell: [0, 0], at: [24, 72], radius: 14 }] },
      },
    });

    const spec = parseSceneSpec({
      id: 'tiles', name: 'tiles', kind: 'village', kitId: 'village-cn', seed: 3,
      tileSize: 32, bounds: { width: 48, height: 44 }, required: ['tavern'], water: 'none',
    });
    const { layout } = buildScene(spec, villageCnKit);
    const source = loadTileSource(artDir, 'village-cn');
    const atlas = renderTileAtlas(layout, source);

    // 导入的地形只有一个变体（程序生成是三个），atlas 布局必须跟着变
    expect(atlas.variants.ground).toBe(1);
    // 第一格就是素材里的深棕色（40,90,40），不是 palette 的土黄
    const decoded = PNG.sync.read(atlas.png);
    expect([decoded.data[0], decoded.data[1], decoded.data[2]]).toEqual([40, 90, 40]);
  });
});

describe('builtin kits', () => {
  it('ships a chinese kit that reuses the euro geometry', () => {
    expect(findBuiltinKit('village-cn')).toBe(villageCnKit);
    expect(villageCnKit.prefabs.map((prefab) => prefab.id)).toEqual(villageEuroKit.prefabs.map((prefab) => prefab.id));
    expect(villageCnKit.style).toBe('chinese-ancient');
    // 换的是画风与配色，不是建筑角色——酒馆还是酒馆
    expect(villageCnKit.palette.ground).not.toBe(villageEuroKit.palette.ground);
  });
});
