import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  fromTiledMap,
  parseGameMap,
  renderTilesetPng,
  toTiledMap,
  type GameMap,
} from '@gamedream/core';

export interface MapExportOptions {
  mapPath: string;
  outPath: string;
  force?: boolean;
}

function ensureWritable(path: string, force: boolean | undefined): void {
  if (existsSync(path) && !force) {
    throw new Error(`refusing to overwrite ${path}; pass --force`);
  }
}

export function mapExportCommand(options: MapExportOptions): {
  outPath: string;
  pngPath: string;
  map: GameMap;
} {
  const map = parseGameMap(JSON.parse(readFileSync(options.mapPath, 'utf8')));
  const image = `${basename(options.outPath).replace(/\.tmj$/i, '')}.png`;
  const tiled = toTiledMap(map, { image });
  const png = renderTilesetPng(map);
  const pngPath = join(dirname(options.outPath), image);
  ensureWritable(options.outPath, options.force);
  ensureWritable(pngPath, options.force);
  mkdirSync(dirname(options.outPath), { recursive: true });
  writeFileSync(options.outPath, `${JSON.stringify(tiled, null, 2)}\n`, 'utf8');
  writeFileSync(pngPath, png);
  return { outPath: options.outPath, pngPath, map };
}

export interface MapImportOptions {
  tmjPath: string;
  outPath: string;
  id?: string;
  floor?: string;
  wall?: string;
  layer?: string;
  force?: boolean;
}

export function mapImportCommand(options: MapImportOptions): {
  outPath: string;
  map: GameMap;
} {
  const tiled = JSON.parse(readFileSync(options.tmjPath, 'utf8'));
  const map = parseGameMap(
    fromTiledMap(tiled, {
      id: options.id,
      floor: options.floor,
      wall: options.wall,
      layer: options.layer,
    }),
  );
  ensureWritable(options.outPath, options.force);
  mkdirSync(dirname(options.outPath), { recursive: true });
  writeFileSync(options.outPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  return { outPath: options.outPath, map };
}
