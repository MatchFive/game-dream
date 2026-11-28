import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cropSprite,
  decodePngImage,
  encodePngImage,
  findSprites,
  indexStats,
  readIndex,
  type ArtIndex,
  type ArtQuery,
  type IndexedSprite,
} from '@gamedream/scene';

/**
 * 素材库索引在项目里的位置。
 *
 * 与场景库同理：它是项目资产的一部分（`.gamedream` 是本地缓存，可重建），
 * 不塞进 game/ 是因为它指向的图集还在项目外的素材库里。
 */
export function libraryIndexPath(root: string): string {
  return join(root, '.gamedream', 'studio', 'art-index.json');
}

export interface LibrarySummary {
  model: string;
  createdAt: string;
  source: string;
  sheets: number;
  sprites: number;
  kinds: Record<string, number>;
  prefabs: Record<string, number>;
  tileable: number;
}

export interface LibraryState {
  ready: boolean;
  indexPath: string;
  /** 索引指向的素材库是否还在（换机器/移盘会失效） */
  sourceExists: boolean;
  summary?: LibrarySummary;
}

export function loadLibrary(root: string): ArtIndex | null {
  const file = libraryIndexPath(root);
  if (!existsSync(file)) return null;
  return readIndex(file);
}

export function libraryState(root: string): LibraryState {
  const file = libraryIndexPath(root);
  const index = loadLibrary(root);
  if (!index) return { ready: false, indexPath: file, sourceExists: false };
  const stats = indexStats(index);
  return {
    ready: true,
    indexPath: file,
    sourceExists: existsSync(index.source),
    summary: {
      model: index.model,
      createdAt: index.createdAt,
      source: index.source,
      sheets: stats.sheets,
      sprites: stats.sprites,
      kinds: stats.byKind,
      prefabs: stats.prefabs,
      tileable: index.sheets.reduce(
        (sum, sheet) => sum + sheet.sprites.filter((sprite) => sprite.tileable).length,
        0,
      ),
    },
  };
}

/** 给前端用的精灵视图：不带像素数据，只带能被浏览器取的缩略图地址。 */
export interface LibrarySpriteView {
  id: string;
  sheet: string;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
  label: string;
  tags: string[];
  prefab: string | null;
  tileable: boolean;
  thumb: string;
}

export interface LibraryQuery extends ArtQuery {
  /** 只列这些 prefab（逗号分隔） */
  prefabs?: string;
}

export function librarySprites(root: string, query: LibraryQuery = {}): LibrarySpriteView[] {
  const index = loadLibrary(root);
  if (!index) return [];
  const sprites = findSprites(index, {
    kind: query.kind,
    text: query.text,
    prefab: query.prefab,
    sheet: query.sheet,
    tileable: query.tileable,
    limit: query.limit,
  });
  return sprites.map(toView);
}

function toView(sprite: IndexedSprite): LibrarySpriteView {
  return {
    id: sprite.id,
    sheet: sprite.sheet,
    index: sprite.index,
    x: sprite.x,
    y: sprite.y,
    w: sprite.w,
    h: sprite.h,
    kind: sprite.kind,
    label: sprite.label,
    tags: sprite.tags,
    prefab: sprite.prefab,
    tileable: sprite.tileable,
    thumb: `/api/library/thumb/${encodeURIComponent(sprite.sheet)}/${sprite.index}.png`,
  };
}

/**
 * 现场裁一张缩略图。
 *
 * 不预生成缩略图：索引本来就知道每块的坐标，裁一次不到 1ms；预生成几千张小图
 * 反而要处理失效与清理。缓存交给浏览器（ETag 用 id + 尺寸）。
 */
export function libraryThumbnail(root: string, sheet: string, index: number): Buffer | null {
  const art = loadLibrary(root);
  if (!art) return null;
  const entry = art.sheets.find((item) => item.file === sheet);
  if (!entry) return null;
  const sprite = entry.sprites.find((item) => item.index === index);
  if (!sprite) return null;
  const full = join(art.source, sheet);
  if (!existsSync(full)) return null;
  const png = decodePngImage(readFileSync(full));
  return encodePngImage(cropSprite(png, sprite));
}

/**
 * 人工修正模型给的 prefab 建议。
 *
 * 模型会把 15 块都建议成 `market-hall`（它就认识那一个词），策划看一眼就知道哪块该是客栈。
 * 这一步必须能改，否则索引只能读、不能纠。
 */
export function setSpritePrefab(
  root: string,
  input: { sheet: string; index: number; prefab: string | null },
): { ok: boolean; sprite?: LibrarySpriteView } {
  const file = libraryIndexPath(root);
  const index = loadLibrary(root);
  if (!index) return { ok: false };
  const sheet = index.sheets.find((item) => item.file === input.sheet);
  const sprite = sheet?.sprites.find((item) => item.index === input.index);
  if (!sprite) return { ok: false };
  sprite.prefab = input.prefab;
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return { ok: true, sprite: toView(sprite) };
}
