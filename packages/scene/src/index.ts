import { readFileSync } from 'node:fs';
import { buildScene } from './layout.js';
import { kitSchema, parseSceneSpec, type Kit, type SceneSpec } from './schema.js';
import { validateScene, type SceneValidation } from './validate.js';
import { hashKit, TraceRecorder, type SceneTrace } from './trace.js';
import type { SceneLayout } from './schema.js';

export * from './schema.js';
export { builtinKits, findBuiltinKit, villageCnKit, villageEuroKit } from './kits.js';
export { Grid } from './grid.js';
export { createRng, weightedPick } from './rng.js';
export { buildScene, type SceneBuildResult } from './layout.js';
export {
  cliffLines,
  elevationLevel,
  type CliffPlan,
  type CoastPlan,
  type Side,
  type WallPlan,
} from './terrain.js';
export { validateScene, pointInKind, type SceneValidation, type SceneIssue } from './validate.js';
export { renderSceneSvg } from './render.js';
export {
  artPromptFor,
  applyTransparency,
  applyWorkflow,
  detectWorkflow,
  downloadImage,
  generateKitArtwork,
  runComfy,
  trimTransparent,
  TRANSPARENT_SUFFIX,
  type ArtManifest,
  type ArtManifestEntry,
  type ArtWorkflow,
  type ComfyClient,
  type GenerateKitArtworkOptions,
  type WorkflowBinding,
  type WorkflowGraph,
} from './art-gen.js';
export {
  prefabsInUse,
  renderPrefabArtwork,
  writeKitArtwork,
  type KitArtworkManifest,
} from './art.js';
export { SCENE_SYSTEM_PROMPT, runSceneAgent, extractJsonObject, type SceneAgentOptions, type SceneAgentResult, type SceneAttempt } from './agent.js';
export { exportGodotScene, type GodotExportOptions, type GodotExportResult } from './export/godot.js';
export { loadTileSource, describeTileSource } from './export/tile-art.js';
export {
  importTiles,
  bestWindow,
  resample,
  type TilePicks,
  type TilePick,
  type TileImportResult,
} from './export/tiles-import.js';
export {
  readTraces,
  summarize,
  toPreferencePairs,
  toReviewPairs,
  toSftSamples,
  type DatasetStats,
  type IssueCount,
  type PreferencePair,
  type SftSample,
} from './dataset.js';
export {
  appendTrace,
  hashKit,
  hashLayout,
  hashSpec,
  TraceRecorder,
  type SceneTrace,
  type SceneTraceStep,
} from './trace.js';

export function loadKit(path: string): Kit {
  return kitSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export interface BuildSceneResult {
  layout: SceneLayout;
  validation: SceneValidation;
  trace: SceneTrace;
}

/**
 * 一站式构建：求解 → 记录 → 校验 → 产出 trace。
 * agent 每尝试一次就调用一次，trace 累积起来就是数据集。
 */
export function buildSceneWithTrace(
  specInput: unknown,
  kit: Kit,
  options: { origin?: SceneTrace['origin'] } = {},
): BuildSceneResult {
  const spec: SceneSpec = parseSceneSpec(specInput);
  const recorder = new TraceRecorder(spec, { id: kit.id, hash: hashKit(kit) }, options.origin ?? 'solver');
  recorder.step('plan', `kind=${spec.kind}, bounds=${spec.bounds.width}x${spec.bounds.height}, required=${spec.required.join('|') || 'none'}`);

  const { layout, grid } = buildScene(spec, kit);
  recorder.step('layout', `placed ${layout.buildings.length} buildings in ${layout.lots.length} lots`, {
    buildings: layout.buildings.map((building) => building.prefab),
  });

  const spawn = layout.anchors.find((anchor) => anchor.kind === 'spawn');
  const reachable = spawn ? grid.flood(spawn.at[0], spawn.at[1]) : new Set<string>();
  const walkable = (x: number, y: number) => grid.walkable(x, y);
  const validation = validateScene(layout, spec, walkable, reachable);
  recorder.step('validate', validation.pass ? 'gates passed' : `gates failed: ${validation.issues.map((issue) => issue.code).join(', ')}`, {
    metrics: validation.metrics,
  });

  // 道路占比按真实格子统计（roads 折线会重复计算交叉口）
  const total = layout.bounds.width * layout.bounds.height;
  validation.metrics.roadRatio = Number((grid.count('road') / total).toFixed(3));

  return { layout, validation, trace: recorder.finish(layout, validation) };
}
