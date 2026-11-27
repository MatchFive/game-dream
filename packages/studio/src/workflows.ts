import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { ComfyWorkflowInfo } from './types.js';

export interface WorkflowNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
}

export interface WorkflowBinding {
  node: string;
  input: string;
}

export interface WorkflowConstant extends WorkflowBinding {
  value: unknown;
}

export interface WorkflowOutput {
  node: string;
  output?: 'images' | 'audio' | 'files';
  extension?: string;
}

export interface WorkflowTransparentPatch {
  promptSuffix?: string;
  nodes?: Record<string, WorkflowNode>;
  output?: WorkflowOutput;
}

export interface WorkflowDescriptor {
  id: string;
  name: string;
  description: string;
  kind: 'image' | 'audio';
  workflow: Record<string, WorkflowNode>;
  bindings: {
    prompt?: WorkflowBinding | WorkflowBinding[];
    seed?: WorkflowBinding | WorkflowBinding[];
    duration?: WorkflowBinding | WorkflowBinding[];
    lyrics?: WorkflowBinding | WorkflowBinding[];
    output: WorkflowOutput;
    transparent?: WorkflowTransparentPatch;
    constants?: WorkflowConstant[];
  };
  source: ComfyWorkflowInfo['source'];
  path?: string;
}

interface LoadedWorkflow {
  info: ComfyWorkflowInfo;
  descriptor?: WorkflowDescriptor;
}

const OUTPUT_TYPES = new Set(['images', 'audio', 'files']);

const LEGACY_TRANSPARENT: WorkflowTransparentPatch = {
  promptSuffix: ', transparent background, alpha channel, isolated subject',
  nodes: {
    studio_bg_model: {
      class_type: 'LoadBackgroundRemovalModel',
      inputs: { bg_removal_name: 'birefnet.safetensors' },
    },
    studio_bg_mask: {
      class_type: 'RemoveBackground',
      inputs: {
        bg_removal_model: ['studio_bg_model', 0],
        image: ['459:457', 0],
      },
    },
    studio_bg_invert: {
      class_type: 'InvertMask',
      inputs: { mask: ['studio_bg_mask', 0] },
    },
    studio_alpha: {
      class_type: 'JoinImageWithAlpha',
      inputs: {
        image: ['459:457', 0],
        alpha: ['studio_bg_invert', 0],
      },
    },
  },
  output: { node: '461', output: 'images', extension: '.png' },
};

const LEGACY_BINDINGS: WorkflowDescriptor['bindings'] = {
  prompt: [
    { node: '459:471', input: 'prompt' },
    { node: '459:474', input: 'on_false' },
  ],
  seed: { node: '459:458', input: 'seed' },
  output: { node: '461', output: 'images', extension: '.png' },
  transparent: LEGACY_TRANSPARENT,
  constants: [{ node: '459:474', input: 'switch', value: false }],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBinding(value: unknown): WorkflowBinding | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.node !== 'string' || !value.node.trim()) return undefined;
  if (typeof value.input !== 'string' || !value.input.trim()) return undefined;
  return { node: value.node.trim(), input: value.input.trim() };
}

function parseBindings(value: unknown): WorkflowBinding | WorkflowBinding[] | undefined {
  if (Array.isArray(value)) {
    const parsed = value.map(parseBinding);
    if (parsed.some((binding) => !binding)) throw new Error('invalid binding array');
    return parsed as WorkflowBinding[];
  }
  return parseBinding(value);
}

function parseOutput(value: unknown): WorkflowOutput {
  if (!isRecord(value)) throw new Error('bindings.output is required');
  if (typeof value.node !== 'string' || !value.node.trim()) {
    throw new Error('bindings.output.node is required');
  }
  const output = typeof value.output === 'string' ? value.output : 'images';
  if (!OUTPUT_TYPES.has(output)) {
    throw new Error(`unsupported output type: ${output}`);
  }
  return {
    node: value.node.trim(),
    output: output as WorkflowOutput['output'],
    ...(typeof value.extension === 'string' && value.extension.startsWith('.')
      ? { extension: value.extension }
      : {}),
  };
}

function parseDescriptor(
  raw: unknown,
  fallbackId: string,
  source: ComfyWorkflowInfo['source'],
  path?: string,
): WorkflowDescriptor {
  if (!isRecord(raw)) throw new Error('workflow descriptor must be an object');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const kind = raw.kind === 'audio' ? 'audio' : raw.kind === 'image' ? 'image' : undefined;
  if (!name) throw new Error('workflow name is required');
  if (!description) throw new Error('workflow description is required');
  if (!kind) throw new Error('workflow kind must be image or audio');
  if (!isRecord(raw.workflow)) throw new Error('workflow graph is required');
  if (!isRecord(raw.bindings)) throw new Error('workflow bindings are required');
  const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]+$/.test(raw.id)
    ? raw.id
    : fallbackId;
  const bindings = raw.bindings;
  const constants = Array.isArray(bindings.constants)
    ? bindings.constants.map((entry) => {
        const binding = parseBinding(entry);
        if (!binding || !isRecord(entry)) throw new Error('invalid binding constant');
        return { ...binding, value: entry.value };
      })
    : undefined;
  const transparentRaw = bindings.transparent;
  let transparent: WorkflowTransparentPatch | undefined;
  if (transparentRaw !== undefined) {
    if (!isRecord(transparentRaw)) throw new Error('bindings.transparent must be an object');
    transparent = {
      ...(typeof transparentRaw.promptSuffix === 'string'
        ? { promptSuffix: transparentRaw.promptSuffix }
        : {}),
      ...(isRecord(transparentRaw.nodes)
        ? { nodes: transparentRaw.nodes as Record<string, WorkflowNode> }
        : {}),
      ...(transparentRaw.output !== undefined
        ? { output: parseOutput(transparentRaw.output) }
        : {}),
    };
  }
  return {
    id,
    name,
    description,
    kind,
    workflow: raw.workflow as Record<string, WorkflowNode>,
    bindings: {
      ...(bindings.prompt !== undefined ? { prompt: parseBindings(bindings.prompt) } : {}),
      ...(bindings.seed !== undefined ? { seed: parseBindings(bindings.seed) } : {}),
      ...(bindings.duration !== undefined
        ? { duration: parseBindings(bindings.duration) }
        : {}),
      ...(bindings.lyrics !== undefined ? { lyrics: parseBindings(bindings.lyrics) } : {}),
      output: parseOutput(bindings.output),
      ...(transparent ? { transparent } : {}),
      ...(constants ? { constants } : {}),
    },
    source,
    ...(path ? { path } : {}),
  };
}

export function parseWorkflowDescriptor(
  raw: unknown,
  fallbackId: string,
  source: ComfyWorkflowInfo['source'] = 'project',
): WorkflowDescriptor {
  return parseDescriptor(raw, fallbackId, source);
}

export function workflowDescriptorFile(descriptor: WorkflowDescriptor): Record<string, unknown> {
  return {
    name: descriptor.name,
    description: descriptor.description,
    kind: descriptor.kind,
    workflow: descriptor.workflow,
    bindings: descriptor.bindings,
  };
}

function readDirectory(
  directory: string,
  source: ComfyWorkflowInfo['source'],
): LoadedWorkflow[] {
  if (!existsSync(directory)) return [];
  const workflows: LoadedWorkflow[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const path = join(directory, entry.name);
    const fallbackId = basename(entry.name, '.json');
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const descriptor = parseDescriptor(raw, fallbackId, source, path);
      workflows.push({
        info: {
          id: descriptor.id,
          name: descriptor.name,
          description: descriptor.description,
          kind: descriptor.kind,
          source,
          valid: true,
        },
        descriptor,
      });
    } catch (error) {
      workflows.push({
        info: {
          id: fallbackId,
          name: fallbackId,
          description: '',
          kind: 'image',
          source,
          valid: false,
          error: (error as Error).message,
        },
      });
    }
  }
  return workflows;
}

function legacyWorkflow(path: string | undefined): LoadedWorkflow | undefined {
  if (!path || !existsSync(path)) return undefined;
  try {
    const workflow = JSON.parse(readFileSync(path, 'utf8')) as Record<string, WorkflowNode>;
    if (!isRecord(workflow)) throw new Error('legacy workflow must be an object');
    const descriptor: WorkflowDescriptor = {
      id: 'legacy-qwen',
      name: 'Qwen Image (legacy single file)',
      description: 'The single COMFYUI_WORKFLOW file from Studio settings.',
      kind: 'image',
      workflow,
      bindings: LEGACY_BINDINGS,
      source: 'legacy',
      path,
    };
    return {
      info: {
        id: descriptor.id,
        name: descriptor.name,
        description: descriptor.description,
        kind: descriptor.kind,
        source: 'legacy',
        valid: true,
      },
      descriptor,
    };
  } catch (error) {
    return {
      info: {
        id: 'legacy-qwen',
        name: 'Qwen Image (legacy single file)',
        description: 'The single COMFYUI_WORKFLOW file from Studio settings.',
        kind: 'image',
        source: 'legacy',
        valid: false,
        error: (error as Error).message,
      },
    };
  }
}

const AUDIO_MODELS = {
  unet: 'minimax_music3_dit_int8_convrot.safetensors',
  clip: 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
  vae: 'minimax_music3_dav.safetensors',
};

function builtinBgm(): WorkflowDescriptor {
  return {
    id: 'builtin-bgm',
    name: 'MiniMax Music 3 BGM',
    description: '30-second background music with optional lyrics.',
    kind: 'audio',
    source: 'builtin',
    workflow: {
      '1': {
        class_type: 'CLIPLoader',
        inputs: { clip_name: AUDIO_MODELS.clip, type: 'minimax', device: 'default' },
      },
      '2': {
        class_type: 'UNETLoader',
        inputs: { unet_name: AUDIO_MODELS.unet, weight_dtype: 'default' },
      },
      '3': {
        class_type: 'VAELoader',
        inputs: { vae_name: AUDIO_MODELS.vae },
      },
      '4': {
        class_type: 'MiniMaxMusic3TextEncode',
        inputs: {
          clip: ['1', 0],
          caption: '',
          lyrics: '',
          seed: 0,
          max_duration: 30,
          cfg_scale: 1.5,
          top_k: 50,
        },
      },
      '5': {
        class_type: 'EmptyMiniMaxMusic3LatentAudio',
        inputs: { seconds: 30, batch_size: 1 },
      },
      '6': {
        class_type: 'ConditioningZeroOut',
        inputs: { conditioning: ['4', 0] },
      },
      '7': {
        class_type: 'KSampler',
        inputs: {
          seed: 0,
          steps: 30,
          cfg: 1.5,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1,
          model: ['2', 0],
          positive: ['4', 0],
          negative: ['6', 0],
          latent_image: ['5', 0],
        },
      },
      '8': {
        class_type: 'VAEDecodeAudio',
        inputs: { samples: ['7', 0], vae: ['3', 0] },
      },
      '9': {
        class_type: 'SaveAudioAdvanced',
        inputs: {
          audio: ['8', 0],
          filename_prefix: 'audio/gamedream_bgm',
          format: 'mp3',
          'format.quality': 'V0',
        },
      },
    },
    bindings: {
      prompt: { node: '4', input: 'caption' },
      seed: [
        { node: '4', input: 'seed' },
        { node: '7', input: 'seed' },
      ],
      duration: [
        { node: '4', input: 'max_duration' },
        { node: '5', input: 'seconds' },
      ],
      lyrics: { node: '4', input: 'lyrics' },
      output: { node: '9', output: 'audio', extension: '.mp3' },
    },
  };
}

export class WorkflowRegistry {
  private readonly dirs: string[];
  private readonly legacyPath?: string;

  constructor(options: { dirs: string[]; legacyWorkflow?: string }) {
    this.dirs = options.dirs.filter(Boolean);
    this.legacyPath = options.legacyWorkflow;
  }

  private load(): LoadedWorkflow[] {
    const loaded: LoadedWorkflow[] = [];
    const seen = new Set<string>();
    for (const [index, directory] of this.dirs.entries()) {
      const source: ComfyWorkflowInfo['source'] = index === 0 ? 'project' : 'workspace';
      for (const item of readDirectory(directory, source)) {
        if (seen.has(item.info.id)) continue;
        seen.add(item.info.id);
        loaded.push(item);
      }
    }
    const legacy = legacyWorkflow(this.legacyPath);
    if (legacy && !seen.has(legacy.info.id)) {
      seen.add(legacy.info.id);
      loaded.push(legacy);
    }
    const bgm = builtinBgm();
    if (!seen.has(bgm.id)) {
      loaded.push({
        info: {
          id: bgm.id,
          name: bgm.name,
          description: bgm.description,
          kind: bgm.kind,
          source: 'builtin',
          valid: true,
        },
        descriptor: bgm,
      });
    }
    return loaded;
  }

  list(): ComfyWorkflowInfo[] {
    return this.load().map((item) => item.info);
  }

  get(id: string): WorkflowDescriptor | undefined {
    return this.load().find((item) => item.descriptor?.id === id)?.descriptor;
  }

  defaultId(kind: 'image' | 'audio'): string | undefined {
    const workflows = this.list().filter((item) => item.valid && item.kind === kind);
    return workflows[0]?.id;
  }

  hasImageWorkflow(): boolean {
    return this.list().some((item) => item.valid && item.kind === 'image');
  }
}
