import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contactSheet,
  cropSprite,
  decodePngImage,
  encodePngImage,
  sliceSheet,
  type Png,
  type Sprite,
} from './slice-sheet.js';
import {
  DEFAULT_BATCH,
  labelPrompt,
  LABEL_SYSTEM_PROMPT,
  parseLabelResponse,
  type ImageDescriber,
  type SpriteLabel,
} from './describe.js';

export interface IndexedSprite extends Sprite, SpriteLabel {
  /** `<sheet>#<index>`：索引里的稳定主键，也是别人引用这块素材的方式 */
  id: string;
  sheet: string;
}

export interface SheetIndex {
  file: string;
  width: number;
  height: number;
  sprites: IndexedSprite[];
}

export interface ArtIndex {
  version: 1;
  createdAt: string;
  /** 建索引用的模型名，换模型要能看出来 */
  model: string;
  source: string;
  sheets: SheetIndex[];
}

export interface BuildIndexOptions {
  source: string;
  /** 只处理这些文件名（不传就全扫） */
  files?: string[];
  /** 最多处理多少张图集 */
  limit?: number;
  /** 每次问模型多少个精灵 */
  batch?: number;
  describer: ImageDescriber;
  /** 允许模型建议的 prefab id（来自 kit） */
  prefabs?: string[];
  onProgress?: (event: { sheet: string; done: number; total: number; batch: number; batches: number }) => void;
}

/**
 * 切图 + 让视觉模型认每一块，落成可查询的索引。
 *
 * 为什么会话要分批：一张图集切出来几十上百个精灵，全塞进一次请求，
 * 模型会开始漏编号（回答的 index 和图上印的对不上）。16 个一批是实测比较稳的量。
 * 编号必须由**拼版图上印的数字**决定，不能靠"第几个"，否则模型数错一个后面全错位。
 */
export async function buildArtIndex(options: BuildIndexOptions): Promise<ArtIndex> {
  if (!existsSync(options.source)) throw new Error(`art library not found: ${options.source}`);
  const batchSize = options.batch ?? DEFAULT_BATCH;
  const prefabs = options.prefabs ?? [];
  const all = readdirSync(options.source).filter((file) => file.endsWith('.png')).sort();
  const files = (options.files && options.files.length > 0 ? options.files : all)
    .slice(0, options.limit ?? all.length);

  const sheets: SheetIndex[] = [];
  for (const file of files) {
    const png = decodePngImage(readFileSync(join(options.source, file)));
    const sprites = sliceSheet(png);
    const labelled: IndexedSprite[] = [];
    const batches = Math.ceil(sprites.length / batchSize);
    for (let start = 0; start < sprites.length; start += batchSize) {
      const chunk = sprites.slice(start, start + batchSize);
      const labels = await labelChunk(png, file, chunk, prefabs, options.describer);
      const byIndex = new Map(labels.map((label) => [label.index, label]));
      for (const sprite of chunk) {
        const label = byIndex.get(sprite.index);
        labelled.push({
          ...sprite,
          id: `${file}#${sprite.index}`,
          sheet: file,
          kind: label?.kind ?? 'unknown',
          label: label?.label ?? '',
          tags: label?.tags ?? [],
          prefab: label?.prefab ?? null,
          tileable: label?.tileable ?? false,
        });
      }
      options.onProgress?.({
        sheet: file,
        done: Math.min(sprites.length, start + batchSize),
        total: sprites.length,
        batch: Math.floor(start / batchSize) + 1,
        batches,
      });
    }
    sheets.push({ file, width: png.width, height: png.height, sprites: labelled });
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    model: options.describer.name,
    source: options.source,
    sheets,
  };
}

/**
 * 认一批精灵，解析不出来就对半拆再问。
 *
 * 模型偶尔会把整段回复花在"思考"上、正文为空（finish_reason=length），
 * 这时候一次请求里塞的精灵越多越容易翻车。对半拆是代价最小的兜底：
 * 4 个还解析不出来就说明不是批次大小的问题，直接报错并把原始回复带出去。
 */
async function labelChunk(
  png: Png,
  file: string,
  chunk: Sprite[],
  prefabs: string[],
  describer: ImageDescriber,
): Promise<SpriteLabel[]> {
  const sheetPng = contactSheet(png, chunk, { cols: 4, cell: 168 });
  const response = await describer.describe({
    imageBase64: encodePngImage(sheetPng).toString('base64'),
    system: LABEL_SYSTEM_PROMPT,
    user: labelPrompt({ sheetName: file, indices: chunk.map((sprite) => sprite.index), prefabs }),
  });
  try {
    const labels = parseLabelResponse(response);
    // 模型偶尔会漏掉几个编号，缺的留给下一轮（kind=unknown），不编造
    return labels.filter((label) => chunk.some((sprite) => sprite.index === label.index));
  } catch (error) {
    if (chunk.length > 4) {
      const half = Math.ceil(chunk.length / 2);
      return [
        ...(await labelChunk(png, file, chunk.slice(0, half), prefabs, describer)),
        ...(await labelChunk(png, file, chunk.slice(half), prefabs, describer)),
      ];
    }
    throw new Error(
      `${file} index ${chunk.map((sprite) => sprite.index).join(',')}: ${(error as Error).message}; raw=${response.slice(0, 200)}`,
    );
  }
}

export interface ArtQuery {
  kind?: string;
  /** 命中 label 或 tags 就算 */
  text?: string;
  prefab?: string;
  sheet?: string;
  /** 只要可平铺的地形 */
  tileable?: boolean;
  limit?: number;
}

/** 查询：设计器/agent 说"要一个客栈"，拿到的就是能直接用的那块图。 */
export function findSprites(index: ArtIndex, query: ArtQuery = {}): IndexedSprite[] {
  const text = query.text?.toLowerCase().trim();
  const out: IndexedSprite[] = [];
  for (const sheet of index.sheets) {
    if (query.sheet && sheet.file !== query.sheet) continue;
    for (const sprite of sheet.sprites) {
      if (query.kind && sprite.kind !== query.kind) continue;
      if (query.prefab && sprite.prefab !== query.prefab) continue;
      if (query.tileable !== undefined && sprite.tileable !== query.tileable) continue;
      if (text) {
        const haystack = `${sprite.label} ${sprite.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(text)) continue;
      }
      out.push(sprite);
    }
  }
  // 大的优先：同样叫"酒馆"，200px 的那张比 40px 的碎片更有用
  out.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  return query.limit ? out.slice(0, query.limit) : out;
}

export function indexStats(index: ArtIndex): {
  sheets: number;
  sprites: number;
  byKind: Record<string, number>;
  prefabs: Record<string, number>;
  labelled: number;
} {
  const byKind: Record<string, number> = {};
  const prefabs: Record<string, number> = {};
  let sprites = 0;
  let labelled = 0;
  for (const sheet of index.sheets) {
    for (const sprite of sheet.sprites) {
      sprites += 1;
      byKind[sprite.kind] = (byKind[sprite.kind] ?? 0) + 1;
      if (sprite.label) labelled += 1;
      if (sprite.prefab) prefabs[sprite.prefab] = (prefabs[sprite.prefab] ?? 0) + 1;
    }
  }
  return { sheets: index.sheets.length, sprites, byKind, prefabs, labelled };
}

export interface PrefabArtPick {
  prefab: string;
  sprite: IndexedSprite;
  /** 同一 prefab 的其他候选，导出时可以用来做变体 */
  alternatives: IndexedSprite[];
}

/**
 * 从索引里给每个 prefab 挑一张立绘。
 *
 * 三条规则，都好解释：
 * 1. 只认 `kind=building` 且模型把它归到该 prefab 的；
 * 2. 形态优先——素材里 96×96 的方正小楼不该拿去当 9 格宽的联排长屋，
 *    用宽高比的距离（对数域）当主排序；
 * 3. 形态接近的里面取面积最大的（细节最多），再按 id 保证确定性。
 *
 * 一个都挑不到就留空：**不拿"最像"的凑**，缺美术一眼能看出来，配错要浪费一整轮。
 */
export function pickPrefabArt(
  index: ArtIndex,
  prefabs: Array<{ id: string; aspect: number }>,
): PrefabArtPick[] {
  const picks: PrefabArtPick[] = [];
  for (const prefab of prefabs) {
    const candidates = findSprites(index, { kind: 'building', prefab: prefab.id })
      .filter((sprite) => sprite.w >= 48 && sprite.h >= 48);
    if (candidates.length === 0) continue;
    const shapeDistance = (sprite: IndexedSprite) =>
      Math.abs(Math.log((sprite.w / sprite.h) / prefab.aspect));
    const sorted = [...candidates].sort((a, b) => {
      const shape = shapeDistance(a) - shapeDistance(b);
      // 形态差 10% 以内就当同档，再比面积
      if (Math.abs(shape) > 0.1) return shape;
      const area = b.w * b.h - a.w * a.h;
      if (area !== 0) return area;
      return a.id < b.id ? -1 : 1;
    });
    picks.push({ prefab: prefab.id, sprite: sorted[0], alternatives: sorted.slice(1, 4) });
  }
  return picks;
}

/** 按 pick 结果把立绘写进 `<artDir>/<kitId>/<prefab>.png`（导出器按这个名字读）。 */
export function writePrefabArt(options: {
  index: ArtIndex;
  source: string;
  artDir: string;
  kitId: string;
  picks: PrefabArtPick[];
}): string[] {
  const dir = join(options.artDir, options.kitId);
  mkdirSync(dir, { recursive: true });
  const cache = new Map<string, Png>();
  const written: string[] = [];
  for (const pick of options.picks) {
    if (!cache.has(pick.sprite.sheet)) {
      cache.set(pick.sprite.sheet, decodePngImage(readFileSync(join(options.source, pick.sprite.sheet))));
    }
    const sheet = cache.get(pick.sprite.sheet) as Png;
    const cropped = cropSprite(sheet, pick.sprite);
    const file = join(dir, `${pick.prefab}.png`);
    writeFileSync(file, encodePngImage(cropped));
    written.push(file);
  }
  return written;
}

export function writeIndex(file: string, index: ArtIndex): string {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return file;
}

export function readIndex(file: string): ArtIndex {
  if (!existsSync(file)) throw new Error(`art index not found: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8')) as ArtIndex;
}
