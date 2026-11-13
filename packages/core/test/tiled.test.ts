import { describe, expect, it } from 'vitest';
import {
  fromTiledMap,
  parseGameMap,
  renderTilesetPng,
  toTiledMap,
} from '../src/index.js';

const map = parseGameMap({
  id: 'test',
  tile_size: 16,
  tileset: { floor: '2f5d3a', wall: '1b3324' },
  rows: ['###', '#.#', '###'],
});

describe('Tiled interop', () => {
  it('exports gids, dimensions, colors, and tileset metadata', () => {
    const tiled = toTiledMap(map, { image: 'test-tiles.png' });
    expect(tiled.width).toBe(3);
    expect(tiled.height).toBe(3);
    expect(tiled.tilewidth).toBe(16);
    expect(tiled.layers[0].data).toEqual([2, 2, 2, 2, 1, 2, 2, 2, 2]);
    expect(tiled.tilesets[0]).toMatchObject({
      firstgid: 1,
      image: 'test-tiles.png',
      columns: 2,
      tilecount: 2,
    });
    expect(tiled.properties).toContainEqual({
      name: 'gamedream_floor',
      type: 'color',
      value: '#2f5d3a',
    });
  });

  it('round-trips id, size, colors, and rows', () => {
    const imported = fromTiledMap(toTiledMap(map));
    expect(imported).toEqual(map);
  });

  it('imports empty gids as floor and selects a named layer', () => {
    const tiled = toTiledMap(map);
    tiled.layers[0].data = [0, 0, 0, 0, 2, 0, 0, 0, 0];
    const imported = fromTiledMap(tiled, { id: 'empty' });
    expect(imported.rows).toEqual(['...', '.#.', '...']);
    expect(imported.id).toBe('empty');
  });

  it('rejects unsupported orientation, dimensions, data, and gids', () => {
    const tiled = toTiledMap(map);
    expect(() => fromTiledMap({ ...tiled, orientation: 'hexagonal' })).toThrow(
      /orientation/,
    );
    expect(() => fromTiledMap({ ...tiled, infinite: true })).toThrow(/infinite/);
    expect(() =>
      fromTiledMap({
        ...tiled,
        layers: [{ ...tiled.layers[0], data: [1, 2] }],
      }),
    ).toThrow(/data length/);
    expect(() =>
      fromTiledMap({
        ...tiled,
        layers: [{ ...tiled.layers[0], data: [1, 2, 3, 4, 9, 6, 7, 8, 9] }],
      }),
    ).toThrow(/gid/);
  });

  it('rejects ragged and invalid internal rows', () => {
    expect(() =>
      toTiledMap(parseGameMap({ ...map, rows: ['###', '##'] })),
    ).toThrow(/equal width/);
    expect(() =>
      toTiledMap(parseGameMap({ ...map, rows: ['###', '#x#', '###'] })),
    ).toThrow(/invalid map tile/);
  });

  it('renders a valid 2-tile PNG', () => {
    const png = renderTilesetPng(map);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(png.readUInt32BE(16)).toBe(32);
    expect(png.readUInt32BE(20)).toBe(16);
    expect(png.length).toBeGreaterThan(50);
  });
});
