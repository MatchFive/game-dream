import type { ModelProvider } from '@gamedream/agent';
import { buildScene } from './layout.js';
import { sceneSpecSchema, type Kit, type SceneLayout, type SceneSpec } from './schema.js';
import { validateScene, type SceneValidation } from './validate.js';
import { appendTrace, hashKit, TraceRecorder, type SceneTrace } from './trace.js';

export interface SceneAttempt {
  index: number;
  spec: SceneSpec;
  layout: SceneLayout;
  validation: SceneValidation;
  /** 模型这一轮的原始输出，便于事后归因 */
  raw: string;
}

export interface SceneAgentResult {
  layout: SceneLayout;
  validation: SceneValidation;
  attempts: SceneAttempt[];
  traces: SceneTrace[];
  /** 是否在给定尝试次数内通过闸门 */
  finished: boolean;
  /** 最后一次失败的原因（finished 为 false 时才有意义） */
  failure?: string;
}

export interface SceneAgentOptions {
  prompt: string;
  kit: Kit;
  provider: ModelProvider;
  seed?: number;
  /** 总尝试次数，默认 3（初稿 + 最多 2 次修正） */
  maxAttempts?: number;
  /** 额外的硬约束，会拼进提示词（例如"必须靠水"） */
  constraints?: string[];
  /** 每次尝试后回调，便于 CLI 实时输出 */
  onAttempt?: (attempt: SceneAttempt, trace: SceneTrace) => void;
  /** 传了就每次尝试追加一行 JSONL */
  traceFile?: string;
}

export const SCENE_SYSTEM_PROMPT = `You design settlement layouts for a 2D game.
Return exactly one JSON object, no prose, no code fences. Schema:
{
  "id": string (lowercase, hyphenated),
  "name": string,
  "kind": "village" | "town" | "city" | "camp",
  "kitId": string (must equal the provided kit id),
  "seed": integer 0..2000000000,
  "tileSize": integer 8..128,
  "bounds": { "width": integer 40..200, "height": integer 36..180 },
  "required": string[] (prefab ids from the kit, at most 4),
  "decor": number 0..1,
  "water": "none" | "pond" | "river",
  "unmet": string[],
  "notes": string (optional)
}
Rules:
- Only use prefab ids that exist in the kit.
- A camp is small (bounds under 60x52) with 1 required prefab; a city is 140x110 or larger.
- Put water only when the prompt mentions water, a river, a lake, or a coast.
- Keep decor between 0.3 and 0.7 for villages and towns.
- "unmet" lists every part of the request this format CANNOT express. The solver
  only knows: buildings from the kit, a cross road, optional river/pond, a square.
  It has no walls, no coast, no cliffs, no elevation, no springs, no districts.
  So "城墙内" -> unmet: ["walled city (no wall support)"]; "沿海崖顶" ->
  unmet: ["coast", "cliffs"]; "半山腰梯田沿等高线" -> unmet: ["elevation bands"].
  Never silently map such a request onto the nearest feature: say what is missing.
  Use [] when nothing is missing. Keep each entry under 60 characters.`;

function kitBrief(kit: Kit): string {
  const prefabs = kit.prefabs
    .map((prefab) => `- ${prefab.id} (${prefab.role}${prefab.mainRoad ? ', must face a main road' : ''})`)
    .join('\n');
  return `Kit id: ${kit.id}\nStyle: ${kit.style}\nPrefabs:\n${prefabs}`;
}

/** 模型常把 JSON 包在 ```json 里，或前后带解释；这里取第一个平衡的 {...}。 */
export function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseSpec(raw: string, kit: Kit, fallbackSeed: number): SceneSpec {
  const json = extractJsonObject(raw);
  if (!json) throw new Error('no JSON object in the model output');
  const parsed = JSON.parse(json) as Record<string, unknown>;
  // 模型偶尔给整数当字符串、或漏字段；这里补默认值再交给 zod 严格校验
  const candidate = {
    tileSize: 32,
    seed: fallbackSeed,
    decor: 0.45,
    water: 'none',
    required: [],
    ...parsed,
    kitId: kit.id,
  };
  const result = sceneSpecSchema.safeParse(candidate);
  if (!result.success) {
    // zod 的原始错误是几百行 JSON，压成一行人能读的摘要
    const summary = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`spec rejected by schema (${summary})`);
  }
  return result.data;
}

function validationFeedback(validation: SceneValidation, spec: SceneSpec, kit: Kit): string {
  const lines = [
    `The previous attempt failed these gates: ${validation.issues.map((issue) => `${issue.code} (${issue.detail})`).join('; ')}`,
    `Previous spec: ${JSON.stringify({ bounds: spec.bounds, required: spec.required, water: spec.water, decor: spec.decor, kind: spec.kind })}`,
    `Metrics: ${JSON.stringify(validation.metrics)}`,
    'Return a corrected spec as one JSON object. Keep every prefab id valid for this kit.',
    kitBrief(kit),
  ];
  return lines.join('\n');
}

/**
 * 让模型写 SceneSpec，求解器出几何，闸门判质量；不过关就把 issue 喂回模型重试。
 * 每次尝试都留一条 trace（origin=agent），带指标与失败原因 —— 这就是数据集。
 */
export async function runSceneAgent(options: SceneAgentOptions): Promise<SceneAgentResult> {
  const kit = options.kit;
  const seed = options.seed ?? 20261128;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const attempts: SceneAttempt[] = [];
  const traces: SceneTrace[] = [];
  const extra = options.constraints?.length ? `\nHard constraints:\n- ${options.constraints.join('\n- ')}` : '';

  let feedback = '';
  let failure: string | undefined;
  let last: { layout: SceneLayout; validation: SceneValidation } | undefined;

  for (let index = 0; index < maxAttempts; index += 1) {
    const recorder = new TraceRecorder(
      {
        id: 'pending',
        name: 'pending',
        kind: 'village',
        kitId: kit.id,
        seed,
        tileSize: 32,
        bounds: { width: 0, height: 0 },
        required: [],
        decor: 0,
        water: 'none',
        unmet: [],
      } as SceneSpec,
      { id: kit.id, hash: hashKit(kit) },
      'agent',
      options.prompt,
    );
    let raw = '';
    let spec: SceneSpec;
    try {
      raw = await options.provider.complete({
        system: SCENE_SYSTEM_PROMPT,
        user: [
          `Player-facing request:\n${options.prompt}`,
          kitBrief(kit),
          feedback ? `Correction request:\n${feedback}` : '',
          extra,
          'Return the JSON object now.',
        ].filter(Boolean).join('\n\n'),
        temperature: 0.3,
      });
      recorder.step('plan', `model returned ${raw.length} chars`);
      spec = parseSpec(raw, kit, seed + index);
    } catch (error) {
      failure = (error as Error).message;
      recorder.step('plan', `spec rejected: ${failure}`);
      // 解析失败也记一条，badcase 里能看到模型吐了什么
      const brokenTrace = recorder.finish(
        { id: 'invalid', name: 'invalid', kind: 'village', kitId: kit.id, style: kit.style, seed, tileSize: 32, bounds: { width: 0, height: 0 }, palette: kit.palette, roads: [], lots: [], buildings: [], props: [], anchors: [] },
        { pass: false, metrics: {}, issues: [] },
      );
      traces.push(brokenTrace);
      const rejected: SceneAttempt = {
        index,
        spec: { id: 'invalid' } as SceneSpec,
        layout: { id: 'invalid' } as SceneLayout,
        validation: { pass: false, metrics: {}, issues: [] },
        raw,
      };
      attempts.push(rejected);
      options.onAttempt?.(rejected, brokenTrace);
      if (options.traceFile) appendTrace(options.traceFile, brokenTrace);
      feedback = `Your previous output could not be parsed as a SceneSpec (${failure}). Return valid JSON only.`;
      continue;
    }

    const { layout, grid } = buildScene(spec, kit);
    recorder.step('layout', `placed ${layout.buildings.length} buildings`, { buildings: layout.buildings.length });
    const spawn = layout.anchors.find((anchor) => anchor.kind === 'spawn');
    const reachable = spawn ? grid.flood(spawn.at[0], spawn.at[1]) : new Set<string>();
    const validation = validateScene(layout, spec, (x, y) => grid.walkable(x, y), reachable);
    const total = layout.bounds.width * layout.bounds.height || 1;
    validation.metrics.roadRatio = Number((grid.count('road') / total).toFixed(3));
    recorder.step(
      'validate',
      validation.pass ? 'gates passed' : `gates failed: ${validation.issues.map((issue) => issue.code).join(', ')}`,
      { metrics: validation.metrics },
    );

    const trace = recorder.finish(layout, validation);
    trace.spec = spec;
    traces.push(trace);
    last = { layout, validation };
    const attempt: SceneAttempt = { index, spec, layout, validation, raw };
    attempts.push(attempt);
    options.onAttempt?.(attempt, trace);
    if (options.traceFile) appendTrace(options.traceFile, trace);

    if (validation.pass) {
      return { layout, validation, attempts, traces, finished: true };
    }
    failure = validation.issues.map((issue) => issue.code).join(', ');
    feedback = validationFeedback(validation, spec, kit);
  }

  // 全部尝试都没产出可解析的布局时，返回一个形状完整的空布局，
  // 避免调用方在读 layout.buildings 时炸掉
  const emptyLayout: SceneLayout = {
    id: 'none',
    name: 'unsolved',
    kind: 'village',
    kitId: kit.id,
    style: kit.style,
    seed,
    tileSize: 32,
    bounds: { width: 0, height: 0 },
    palette: kit.palette,
    roads: [],
    lots: [],
    buildings: [],
    props: [],
    anchors: [],
  };

  return {
    layout: last?.layout ?? emptyLayout,
    validation: last?.validation ?? { pass: false, metrics: {}, issues: [] },
    attempts,
    traces,
    finished: false,
    failure,
  };
}
