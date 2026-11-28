import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scenesDir, type StoredScene } from './scenes.js';

/**
 * badcase 看板的数据层。
 *
 * 调提示词和求解器时最缺的不是"失败率"，是"失败长什么样"：同一个 issue 反复出现多少次、
 * 模型反复说哪几件事做不到、被判 bad 的样本集中在哪一类。这些只有把场景按失败原因
 * 聚起来才看得出来。
 *
 * 场景存在 `.gamedream/studio/scenes/*.json`，一个场景一个文件，不依赖 trace 流——
 * trace 是追加写的流水，这里的场景才是"当前这一版"的真相。
 */

export type InsightKind = 'issue' | 'unmet';

export interface InsightSample {
  id: string;
  name: string;
  createdAt: string;
  buildings: number;
  pass: boolean;
  verdict?: 'good' | 'acceptable' | 'bad';
  /** 这个样本命中的原始措辞（unmet 是模型自由文本，同一件事会有多种说法） */
  raw: string[];
}

export interface InsightCluster {
  kind: InsightKind;
  key: string;
  count: number;
  /** 其中人工判过 bad 的数量：聚类里最值得先看的那几条 */
  bad: number;
  /** 归一化之前的原话，用来判断"这是不是同一件事" */
  variants: string[];
  samples: InsightSample[];
}

export interface InsightTotals {
  scenes: number;
  pass: number;
  fail: number;
  withUnmet: number;
  reviewed: number;
}

export interface SceneInsights {
  totals: InsightTotals;
  issues: InsightCluster[];
  unmet: InsightCluster[];
}

/**
 * 把 unmet 里的元注释剥掉再聚类。
 *
 * 模型的写法是"perimeter walls (no wall support)"这种——括号里是它自己的解释，
 * 括号外才是需求本身。"城墙"和"城墙（不支持墙体）"必须落进同一簇，
 * 但"walled city"和"perimeter walls"不合并：它们确实是两件事。
 */
export function normalizeUnmet(text: string): string {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;，；、]+|[\s,;，；、]+$/g, '')
    .toLowerCase();
}

function readStored(root: string): StoredScene[] {
  const dir = scenesDir(root);
  if (!existsSync(dir)) return [];
  const scenes: StoredScene[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'traces.jsonl') continue;
    try {
      scenes.push(JSON.parse(readFileSync(join(dir, file), 'utf8')) as StoredScene);
    } catch {
      // 坏文件跳过：一个手改坏了的 json 不该让整个看板空掉
    }
  }
  return scenes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function sampleOf(scene: StoredScene, raw: string[]): InsightSample {
  return {
    id: scene.id,
    name: scene.name,
    createdAt: scene.createdAt,
    buildings: scene.layout.buildings.length,
    pass: scene.validation.pass,
    verdict: scene.review?.verdict,
    raw,
  };
}

/** 把"场景 × 一组键"收成聚类，按出现次数降序；同频时把有 bad 的排前面。 */
function cluster(
  kind: InsightKind,
  entries: Array<{ scene: StoredScene; key: string; raw: string }>,
): InsightCluster[] {
  const byKey = new Map<string, { samples: Map<string, InsightSample>; variants: Set<string> }>();
  for (const entry of entries) {
    if (!entry.key) continue;
    const bucket = byKey.get(entry.key) ?? { samples: new Map<string, InsightSample>(), variants: new Set<string>() };
    bucket.variants.add(entry.raw);
    const existing = bucket.samples.get(entry.scene.id);
    if (existing) {
      if (!existing.raw.includes(entry.raw)) existing.raw.push(entry.raw);
    } else {
      bucket.samples.set(entry.scene.id, sampleOf(entry.scene, [entry.raw]));
    }
    byKey.set(entry.key, bucket);
  }
  const clusters: InsightCluster[] = [];
  for (const [key, bucket] of byKey) {
    const samples = [...bucket.samples.values()];
    clusters.push({
      kind,
      key,
      count: samples.length,
      bad: samples.filter((sample) => sample.verdict === 'bad').length,
      variants: [...bucket.variants].sort(),
      samples,
    });
  }
  return clusters.sort((a, b) => b.count - a.count || b.bad - a.bad || a.key.localeCompare(b.key));
}

export function sceneInsights(root: string): SceneInsights {
  const scenes = readStored(root);
  const issueEntries: Array<{ scene: StoredScene; key: string; raw: string }> = [];
  const unmetEntries: Array<{ scene: StoredScene; key: string; raw: string }> = [];

  for (const scene of scenes) {
    // 同一个 issue code 在一份布局里只记一次（detail 可能是多栋楼的列表）
    const codes = new Set(scene.validation.issues.map((issue) => issue.code));
    for (const code of codes) issueEntries.push({ scene, key: code, raw: code });
    for (const phrase of scene.spec?.unmet ?? []) {
      const key = normalizeUnmet(phrase);
      if (key) unmetEntries.push({ scene, key, raw: phrase });
    }
  }

  return {
    totals: {
      scenes: scenes.length,
      pass: scenes.filter((scene) => scene.validation.pass).length,
      fail: scenes.filter((scene) => !scene.validation.pass).length,
      withUnmet: scenes.filter((scene) => (scene.spec?.unmet ?? []).length > 0).length,
      reviewed: scenes.filter((scene) => Boolean(scene.review)).length,
    },
    issues: cluster('issue', issueEntries),
    unmet: cluster('unmet', unmetEntries),
  };
}

export interface BadcaseExport {
  file: string;
  count: number;
  kind: InsightKind;
  key: string;
}

/** 导出某一簇的样本行（一行一个场景，含 spec/闸门/评审），直接喂给训练或手工分析。 */
export function exportBadcase(
  root: string,
  filter: { kind: InsightKind; key: string },
): BadcaseExport {
  const insights = sceneInsights(root);
  const list = filter.kind === 'issue' ? insights.issues : insights.unmet;
  const target = list.find((item) => item.key === filter.key);
  const scenes = readStored(root);
  const matched: StoredScene[] = [];
  if (target) {
    const ids = new Set(target.samples.map((sample) => sample.id));
    for (const scene of scenes) {
      if (ids.has(scene.id)) matched.push(scene);
    }
  }

  const dir = join(root, '.gamedream', 'studio', 'dataset');
  mkdirSync(dir, { recursive: true });
  const slug = filter.key.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'all';
  const file = join(dir, `badcase-${filter.kind}-${slug}.jsonl`);
  const lines = matched.map((scene) => JSON.stringify({
    id: scene.id,
    name: scene.name,
    createdAt: scene.createdAt,
    spec: scene.spec,
    prompt: undefined,
    issues: scene.validation.issues,
    metrics: scene.validation.metrics,
    pass: scene.validation.pass,
    review: scene.review,
    traceId: scene.traceId,
    // 布局只留结构，不落整份：样本文件是给训练和人工看的，不是备份
    buildings: scene.layout.buildings.map((building) => ({
      prefab: building.prefab,
      rect: building.rect,
      floors: building.floors,
      band: building.band,
      typology: building.typology,
      elevation: building.elevation,
    })),
  }));
  writeFileSync(file, lines.length > 0 ? `${lines.join('\n')}\n` : '', 'utf8');
  return { file, count: matched.length, kind: filter.kind, key: filter.key };
}
