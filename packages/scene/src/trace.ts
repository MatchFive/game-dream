import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SceneLayout, SceneSpec } from './schema.js';
import type { SceneValidation } from './validate.js';

/**
 * 一次场景构建的完整记录。
 * 目的不只是调试：它同时是数据集样本（输入 → 决策 → 产物 → 质量标签），
 * 以及 badcase 分析的原始材料（哪一步、哪个指标失败了）。
 */
export interface SceneTrace {
  schema: 1;
  id: string;
  createdAt: string;
  /** 构建来源：agent / solver / manual */
  origin: 'agent' | 'solver' | 'manual';
  /** 人的原始需求（agent 路径才有）；SFT 样本的 input 靠它 */
  prompt?: string;
  spec: SceneSpec;
  kit: { id: string; hash: string };
  steps: SceneTraceStep[];
  validation: SceneValidation;
  output: {
    layoutHash: string;
    buildings: number;
    props: number;
    lots: number;
  };
  durationMs: number;
  /** 人工评审结果，后补；badcase 分析依赖它 */
  review?: { score?: number; verdict?: 'good' | 'acceptable' | 'bad'; notes?: string };
}

export interface SceneTraceStep {
  at: string;
  phase: 'plan' | 'layout' | 'decorate' | 'validate' | 'export' | 'revise';
  summary: string;
  data?: Record<string, unknown>;
}

/** 布局的稳定指纹：用于判断"同输入是否复现同一场景"。 */
export function hashLayout(layout: SceneLayout): string {
  const canonical = JSON.stringify(layout, Object.keys(layout).sort());
  return createHash('sha1').update(canonical).digest('hex');
}

export function hashSpec(spec: SceneSpec): string {
  return createHash('sha1').update(JSON.stringify(spec, Object.keys(spec).sort())).digest('hex');
}

/** 建筑套件指纹：换了 kit 内容，同 spec 也不该被当成同一份数据。 */
export function hashKit(kit: { id: string; prefabs: unknown[] }): string {
  return createHash('sha1').update(JSON.stringify(kit, Object.keys(kit).sort())).digest('hex').slice(0, 16);
}

export class TraceRecorder {
  private readonly steps: SceneTraceStep[] = [];
  private readonly startedAt = Date.now();
  private readonly id: string;
  private readonly createdAt = new Date().toISOString();

  constructor(
    private readonly spec: SceneSpec,
    private readonly kit: { id: string; hash: string },
    private readonly origin: SceneTrace['origin'] = 'solver',
    private readonly prompt?: string,
  ) {
    this.id = `scene-${this.createdAt.replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
  }

  step(phase: SceneTraceStep['phase'], summary: string, data?: Record<string, unknown>): void {
    this.steps.push({ at: new Date().toISOString(), phase, summary, data });
  }

  finish(layout: SceneLayout, validation: SceneValidation): SceneTrace {
    return {
      schema: 1,
      id: this.id,
      createdAt: this.createdAt,
      origin: this.origin,
      prompt: this.prompt,
      spec: this.spec,
      kit: this.kit,
      steps: this.steps,
      validation,
      output: {
        layoutHash: hashLayout(layout),
        buildings: layout.buildings.length,
        props: layout.props.length,
        lots: layout.lots.length,
      },
      durationMs: Date.now() - this.startedAt,
    };
  }
}

/** 追加一行 JSONL。数据集就是靠这个文件累积起来的。 */
export function appendTrace(file: string, trace: SceneTrace): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(trace)}\n`, 'utf8');
}
