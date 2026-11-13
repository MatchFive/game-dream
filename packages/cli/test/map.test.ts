import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from '@gamedream/testing';
import { parseGameMap } from '@gamedream/core';
import { mapExportCommand, mapImportCommand } from '../src/commands/map.js';

describe('map CLI', () => {
  it('exports a .tmj plus PNG and imports it back', () => {
    const dir = makeTempDir('gamedream tiled ');
    const mapPath = join(dir, 'map.json');
    const tmjPath = join(dir, 'out', 'clearing.tmj');
    const backPath = join(dir, 'back.json');
    writeFileSync(
      mapPath,
      JSON.stringify({
        id: 'clearing',
        tile_size: 32,
        tileset: { floor: '2f5d3a', wall: '1b3324' },
        rows: ['###', '#.#', '###'],
      }),
      'utf8',
    );

    const exported = mapExportCommand({ mapPath, outPath: tmjPath });
    expect(exported.pngPath).toBe(join(dir, 'out', 'clearing.png'));
    expect(readFileSync(exported.pngPath).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(JSON.parse(readFileSync(tmjPath, 'utf8')).layers[0].data).toEqual([
      2, 2, 2, 2, 1, 2, 2, 2, 2,
    ]);

    const imported = mapImportCommand({ tmjPath, outPath: backPath });
    expect(imported.map).toEqual(
      parseGameMap(JSON.parse(readFileSync(backPath, 'utf8'))),
    );
    expect(imported.map).toEqual(exported.map);
  });

  it('applies import overrides', () => {
    const dir = makeTempDir('gamedream tiled overrides ');
    const mapPath = join(dir, 'map.json');
    const tmjPath = join(dir, 'map.tmj');
    writeFileSync(
      mapPath,
      JSON.stringify({
        id: 'old',
        tile_size: 16,
        tileset: { floor: '111111', wall: '222222' },
        rows: ['..', '..'],
      }),
      'utf8',
    );
    mapExportCommand({ mapPath, outPath: tmjPath });
    const imported = mapImportCommand({
      tmjPath,
      outPath: join(dir, 'back.json'),
      id: 'new',
      floor: 'abcdef',
      wall: '123456',
    });
    expect(imported.map.id).toBe('new');
    expect(imported.map.tileset).toEqual({ floor: 'abcdef', wall: '123456' });
  });
});
