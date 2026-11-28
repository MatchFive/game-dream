import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  detectWorkflow,
  generateKitArtwork,
  loadKit,
  type ArtManifest,
  type ArtWorkflow,
  type WorkflowBinding,
  type WorkflowGraph,
} from '@gamedream/scene';

export interface SceneArtOptions {
  kitPath: string;
  /** 输出根目录，产物是 <artDir>/<kitId>/<prefab>.png */
  artDir: string;
  /** ComfyUI API 格式的工作流 JSON */
  workflowPath: string;
  comfyUrl?: string;
  only?: string[];
  seed?: number;
  /** 覆盖自动推断的提示词注入点，格式 <node>:<input> */
  promptNodes?: string[];
  outputNode?: string;
  /** 生成带 alpha 的图（默认开） */
  transparent?: boolean;
  pollMs?: number;
  timeoutMs?: number;
  onProgress?: (event: { prefab: string; index: number; total: number; entry?: unknown }) => void;
}

function parseBinding(value: string): WorkflowBinding {
  const index = value.lastIndexOf(':');
  if (index <= 0) throw new Error(`invalid prompt node "${value}", expected <node>:<input>`);
  return { node: value.slice(0, index), input: value.slice(index + 1) };
}

/**
 * 生成一套建筑贴图。
 *
 * 这是项目能力，不是一次性脚本：CLI、项目 agent、Studio 都调用它。
 * 见 docs/boundaries.md —— 美术属于游戏实现，只能由项目侧产出。
 */
export async function sceneArtCommand(options: SceneArtOptions): Promise<ArtManifest> {
  const kitPath = resolve(options.kitPath);
  if (!existsSync(kitPath)) throw new Error(`kit not found: ${kitPath}`);
  const workflowPath = resolve(options.workflowPath);
  if (!existsSync(workflowPath)) throw new Error(`workflow not found: ${workflowPath}`);

  const kit = loadKit(kitPath);
  const graph = JSON.parse(readFileSync(workflowPath, 'utf8')) as WorkflowGraph;

  // 传了 --prompt-node 就用显式绑定，否则按图结构推断（TextGenerate + Switch）
  const detected = detectWorkflow(graph);
  const workflow: ArtWorkflow = {
    graph,
    prompt: options.promptNodes?.length ? options.promptNodes.map(parseBinding) : detected.prompt,
    seed: detected.seed,
    output: options.outputNode ? { node: options.outputNode, field: 'images' } : detected.output,
  };

  return generateKitArtwork({
    kit,
    outDir: resolve(options.artDir),
    workflow,
    client: {
      baseUrl: options.comfyUrl ?? 'http://127.0.0.1:8000',
      pollMs: options.pollMs,
      timeoutMs: options.timeoutMs,
    },
    only: options.only,
    seed: options.seed,
    transparent: options.transparent,
    workflowLabel: workflowPath.split(/[\\/]/).pop() ?? workflowPath,
    onProgress: options.onProgress,
  });
}
