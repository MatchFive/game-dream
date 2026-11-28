import { existsSync, readFileSync } from 'node:fs';
import type { SceneSpec } from './schema.js';
import { hashSpec, type SceneTrace } from './trace.js';

export interface IssueCount {
  code: string;
  count: number;
}

export interface DatasetStats {
  total: number;
  passed: number;
  failed: number;
  byOrigin: Record<string, number>;
  issues: IssueCount[];
  /** 需求里"这份 format 表达不了"的东西，按文本聚类（城墙 / 海岸 / 等高线…） */
  unmet: IssueCount[];
  /** 有 unmet 声明的样本数 */
  withUnmet: number;
  kits: Array<{ id: string; count: number }>;
  reviews: Record<string, number>;
  /** 带原始需求的样本数 —— 只有这些能当 SFT 的 input */
  withPrompt: number;
  /** 同 spec+kit+seed 是否稳定复现同一个 layoutHash */
  determinism: { groups: number; stable: number; conflicts: string[] };
  avgBuildings: number;
  avgDensity: number;
}

export interface SftSample {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  meta: { traceId: string; specId: string; kitId: string };
}

export interface PreferencePair {
  prompt: string;
  chosen: SceneSpec;
  rejected: SceneSpec;
  reason: string[];
  meta: { chosenTrace: string; rejectedTrace: string };
}

/** 逐行读 JSONL；坏行跳过并计数，不让一条脏数据毁掉整个数据集。 */
export function readTraces(file: string): { traces: SceneTrace[]; skipped: number } {
  if (!existsSync(file)) return { traces: [], skipped: 0 };
  const traces: SceneTrace[] = [];
  let skipped = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as SceneTrace;
      if (parsed && typeof parsed.id === 'string' && parsed.spec) traces.push(parsed);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { traces, skipped };
}

export function summarize(traces: SceneTrace[]): DatasetStats {
  const byOrigin: Record<string, number> = {};
  const issueCounts = new Map<string, number>();
  const unmetCounts = new Map<string, number>();
  let withUnmet = 0;
  const kitCounts = new Map<string, number>();
  const reviews: Record<string, number> = { good: 0, acceptable: 0, bad: 0, none: 0 };
  const groups = new Map<string, Set<string>>();
  let passed = 0;
  let withPrompt = 0;
  let buildingSum = 0;
  let densitySum = 0;

  for (const trace of traces) {
    byOrigin[trace.origin] = (byOrigin[trace.origin] ?? 0) + 1;
    if (trace.validation?.pass) passed += 1;
    for (const issue of trace.validation?.issues ?? []) {
      issueCounts.set(issue.code, (issueCounts.get(issue.code) ?? 0) + 1);
    }
    // unmet 是模型自己声明的"做不到"，聚类后就是"这套 format 最缺什么"的排行榜
    const unmet = trace.spec?.unmet ?? [];
    if (unmet.length > 0) withUnmet += 1;
    for (const item of unmet) {
      const key = item.trim().toLowerCase();
      if (key) unmetCounts.set(key, (unmetCounts.get(key) ?? 0) + 1);
    }
    kitCounts.set(trace.kit?.id ?? 'unknown', (kitCounts.get(trace.kit?.id ?? 'unknown') ?? 0) + 1);
    const verdict = trace.review?.verdict ?? 'none';
    reviews[verdict] = (reviews[verdict] ?? 0) + 1;
    if (trace.prompt) withPrompt += 1;
    buildingSum += trace.output?.buildings ?? 0;
    densitySum += trace.validation?.metrics?.density ?? 0;

    // 必须用完整 spec 指纹：同 id、同 seed 但 required 不同就是不同输入
    const key = `${hashSpec(trace.spec)}|${trace.kit?.hash ?? ''}`;
    const hashes = groups.get(key) ?? new Set<string>();
    hashes.add(trace.output?.layoutHash ?? 'unknown');
    groups.set(key, hashes);
  }

  const conflicts = [...groups.entries()]
    .filter(([, hashes]) => hashes.size > 1)
    .map(([key]) => key);

  return {
    total: traces.length,
    passed,
    failed: traces.length - passed,
    byOrigin,
    issues: [...issueCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    unmet: [...unmetCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    withUnmet,
    kits: [...kitCounts.entries()].map(([id, count]) => ({ id, count })),
    reviews,
    withPrompt,
    determinism: { groups: groups.size, stable: groups.size - conflicts.length, conflicts },
    avgBuildings: traces.length ? Number((buildingSum / traces.length).toFixed(2)) : 0,
    avgDensity: traces.length ? Number((densitySum / traces.length).toFixed(3)) : 0,
  };
}

function kitLine(trace: SceneTrace): string {
  return `Kit: ${trace.kit.id}`;
}

/**
 * SFT 样本：prompt → SceneSpec。
 * 只取"模型视角成功 + 有原始需求"的样本；布局本身由求解器算，不需要模型学。
 */
export function toSftSamples(traces: SceneTrace[], systemPrompt: string): SftSample[] {
  return traces
    .filter(
      (trace) =>
        trace.origin === 'agent'
        && trace.prompt
        && trace.spec.id !== 'invalid'
        // 只学"过闸门"的答案：失败样本是 badcase，进偏好对而不是 SFT
        && trace.validation?.pass === true,
    )
    .map((trace) => ({
      messages: [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: `${trace.prompt}\n\n${kitLine(trace)}` },
        { role: 'assistant' as const, content: JSON.stringify(trace.spec) },
      ],
      meta: { traceId: trace.id, specId: trace.spec.id, kitId: trace.kit.id },
    }));
}

/**
 * 偏好对：同一句需求下，过一个、挂一个。
 * chosen 是过闸门的 spec，rejected 是被闸门挡下的 spec，reason 是失败类别。
 */
export function toPreferencePairs(traces: SceneTrace[]): PreferencePair[] {
  const byPrompt = new Map<string, SceneTrace[]>();
  for (const trace of traces) {
    if (trace.origin !== 'agent' || !trace.prompt) continue;
    if (trace.spec.id === 'invalid') continue;
    const list = byPrompt.get(trace.prompt) ?? [];
    list.push(trace);
    byPrompt.set(trace.prompt, list);
  }

  const pairs: PreferencePair[] = [];
  for (const [prompt, list] of byPrompt) {
    const good = list.filter((trace) => trace.validation?.pass);
    const bad = list.filter((trace) => !trace.validation?.pass);
    for (const chosen of good) {
      for (const rejected of bad) {
        pairs.push({
          prompt,
          chosen: chosen.spec,
          rejected: rejected.spec,
          reason: rejected.validation.issues.map((issue) => issue.code),
          meta: { chosenTrace: chosen.id, rejectedTrace: rejected.id },
        });
      }
    }
  }
  return pairs;
}

/** 人类评审也能反过来当偏好信号：good 胜过 bad（同 prompt 时）。 */
export function toReviewPairs(traces: SceneTrace[]): PreferencePair[] {
  const byPrompt = new Map<string, SceneTrace[]>();
  for (const trace of traces) {
    if (!trace.prompt || !trace.review) continue;
    const list = byPrompt.get(trace.prompt) ?? [];
    list.push(trace);
    byPrompt.set(trace.prompt, list);
  }
  const pairs: PreferencePair[] = [];
  for (const [prompt, list] of byPrompt) {
    const good = list.filter((trace) => trace.review?.verdict === 'good');
    const bad = list.filter((trace) => trace.review?.verdict === 'bad');
    for (const chosen of good) {
      for (const rejected of bad) {
        pairs.push({
          prompt,
          chosen: chosen.spec,
          rejected: rejected.spec,
          reason: ['human-review'],
          meta: { chosenTrace: chosen.id, rejectedTrace: rejected.id },
        });
      }
    }
  }
  return pairs;
}
