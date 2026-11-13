import type { GameMap } from '../schemas/map.js';

interface TiledProperty {
  name: string;
  type: 'string' | 'color';
  value: string;
}

interface TiledLayer {
  type: 'tilelayer';
  name: string;
  width: number;
  height: number;
  data: number[];
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
}

interface TiledTileset {
  firstgid: number;
  name: string;
  image: string;
  imagewidth: number;
  imageheight: number;
  columns: number;
  tilecount: number;
  tilewidth: number;
  tileheight: number;
  margin: number;
  spacing: number;
}

export interface TiledMap {
  type: 'map';
  version: string;
  tiledversion: string;
  orientation: 'orthogonal';
  renderorder: 'right-down';
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite: false;
  nextlayerid: number;
  nextobjectid: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  properties: TiledProperty[];
}

export interface ImportOptions {
  id?: string;
  floor?: string;
  wall?: string;
  layer?: string;
}

function normalizeColor(value: string): string {
  const hex = value.replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`invalid color: ${value} (expected 6-digit hex color)`);
  }
  return hex.toLowerCase();
}

function tiledColor(value: string): string {
  return `#${normalizeColor(value)}`;
}

export function toTiledMap(
  map: GameMap,
  options: { image?: string } = {},
): TiledMap {
  const width = map.rows[0]?.length ?? 0;
  const height = map.rows.length;
  if (width === 0 || height === 0) throw new Error('map has no rows');
  if (map.rows.some((row) => row.length !== width)) {
    throw new Error('map rows must have equal width');
  }
  const data: number[] = [];
  for (const row of map.rows) {
    for (const char of row) {
      if (char === '#') data.push(2);
      else if (char === '.') data.push(1);
      else throw new Error(`invalid map tile: ${char}`);
    }
  }
  const size = map.tile_size;
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width,
    height,
    tilewidth: size,
    tileheight: size,
    infinite: false,
    nextlayerid: 2,
    nextobjectid: 1,
    layers: [
      {
        type: 'tilelayer',
        name: 'Ground',
        width,
        height,
        data,
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: map.id,
        image: options.image ?? `${map.id}-tiles.png`,
        imagewidth: size * 2,
        imageheight: size,
        columns: 2,
        tilecount: 2,
        tilewidth: size,
        tileheight: size,
        margin: 0,
        spacing: 0,
      },
    ],
    properties: [
      { name: 'gamedream_id', type: 'string', value: map.id },
      { name: 'gamedream_floor', type: 'color', value: tiledColor(map.tileset.floor) },
      { name: 'gamedream_wall', type: 'color', value: tiledColor(map.tileset.wall) },
    ],
  };
}

function propertyValue(properties: unknown, name: string): string | undefined {
  if (!Array.isArray(properties)) return undefined;
  const found = properties.find(
    (property) =>
      typeof property === 'object' &&
      property !== null &&
      (property as { name?: unknown }).name === name,
  ) as { value?: unknown } | undefined;
  return typeof found?.value === 'string' ? found.value : undefined;
}

export function fromTiledMap(input: unknown, options: ImportOptions = {}): GameMap {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Tiled map must be an object');
  }
  const map = input as Partial<TiledMap> & { type?: string };
  if (map.type !== 'map') throw new Error('not a Tiled map');
  if (map.orientation !== 'orthogonal') {
    throw new Error(`unsupported orientation: ${String(map.orientation)}`);
  }
  if (map.infinite) throw new Error('infinite maps are not supported');
  const width = Number(map.width);
  const height = Number(map.height);
  const tileWidth = Number(map.tilewidth);
  const tileHeight = Number(map.tileheight);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('map has invalid dimensions');
  }
  if (!Number.isInteger(tileWidth) || tileWidth <= 0 || tileWidth !== tileHeight) {
    throw new Error('map has invalid tile size');
  }
  const tilesets = Array.isArray(map.tilesets) ? map.tilesets : [];
  const tileset = tilesets[0];
  if (
    !tileset ||
    Number(tileset.firstgid) !== 1 ||
    Number(tileset.tilecount) < 2
  ) {
    throw new Error(
      'unsupported tileset: expected the 2-tile GameDream sheet with firstgid 1',
    );
  }
  const layerName = options.layer ?? 'Ground';
  const layers = Array.isArray(map.layers) ? map.layers : [];
  const tileLayers = layers.filter((candidate) => candidate.type === 'tilelayer');
  const exact = tileLayers.find((candidate) => candidate.name === layerName);
  const layer = options.layer ? exact : exact ?? tileLayers[0];
  if (!layer) {
    throw new Error(
      `no tile layer named "${layerName}" (found: ${tileLayers.map((candidate) => candidate.name).join(', ') || 'none'})`,
    );
  }
  if (layer.width !== width || layer.height !== height) {
    throw new Error('layer dimensions do not match the map');
  }
  const encoded = layer as { encoding?: unknown; compression?: unknown };
  if (
    typeof layer.data === 'string' ||
    (encoded.encoding !== undefined && encoded.encoding !== 'csv') ||
    encoded.compression !== undefined
  ) {
    throw new Error(
      'unsupported tile layer encoding: re-save the .tmj with CSV (uncompressed) tile layers',
    );
  }
  if (!Array.isArray(layer.data) || layer.data.length !== width * height) {
    throw new Error('tile layer data length does not match width*height');
  }
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let row = '';
    for (let x = 0; x < width; x += 1) {
      const gid = layer.data[y * width + x];
      if (gid === 0 || gid === 1) row += '.';
      else if (gid === 2) row += '#';
      else throw new Error(`unsupported gid: ${String(gid)}`);
    }
    rows.push(row);
  }
  const id = options.id ?? propertyValue(map.properties, 'gamedream_id') ?? 'map';
  const floor = normalizeColor(
    options.floor ?? propertyValue(map.properties, 'gamedream_floor') ?? '2f5d3a',
  );
  const wall = normalizeColor(
    options.wall ?? propertyValue(map.properties, 'gamedream_wall') ?? '1b3324',
  );
  return { id, tile_size: tileWidth, tileset: { floor, wall }, rows };
}
