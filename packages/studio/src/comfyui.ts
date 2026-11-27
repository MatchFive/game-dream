import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { assetIdFor } from './assets.js';
import type { ComfyJob, ComfyUiConfig } from './types.js';
import {
  WorkflowRegistry,
  type WorkflowBinding,
  type WorkflowDescriptor,
  type WorkflowNode,
} from './workflows.js';

interface HistoryEntry {
  outputs?: Record<string, {
    images?: Array<{ filename: string; subfolder?: string; type?: string }>;
    audio?: Array<{ filename: string; subfolder?: string; type?: string }>;
    files?: Array<{ filename: string; subfolder?: string; type?: string }>;
  }>;
}

const IMAGE_OUTPUT_NODE = '461';
const SOURCE_IMAGE_NODE = '459:457';
const PROMPT_NODE = '459:471';
const SWITCH_NODE = '459:474';
const SAMPLER_NODE = '459:458';
const AUDIO_MODELS = {
  unet: 'minimax_music3_dit_int8_convrot.safetensors',
  clip: 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
  vae: 'minimax_music3_dav.safetensors',
};

function generatedName(prompt: string): string {
  const words = prompt
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 4)
    .join(' ');
  return words ? words.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Generated asset';
}

export class ComfyRunner {
  private readonly jobs = new Map<string, ComfyJob>();
  private healthCache: { at: number; value: boolean } | undefined;

  constructor(
    private readonly config: ComfyUiConfig,
    private readonly generatedDir: string,
    private readonly root: string,
  ) {}

  async health(force = false): Promise<boolean> {
    if (!force && this.healthCache && Date.now() - this.healthCache.at < 15_000) {
      return this.healthCache.value;
    }
    let value = false;
    try {
      const response = await fetch(`${this.config.url.replace(/\/$/, '')}/system_stats`, {
        signal: AbortSignal.timeout(2500),
      });
      value = response.ok;
    } catch {
      value = false;
    }
    this.healthCache = { at: Date.now(), value };
    return value;
  }

  workflowExists(): boolean {
    return existsSync(this.config.workflow);
  }

  start(
    prompt: string,
    transparent: boolean,
    variant?: number,
    batchSize?: number,
    animation?: { id: string; index: number; count: number },
  ): ComfyJob {
    const now = new Date().toISOString();
    const job: ComfyJob = {
      id: randomUUID(),
      status: 'queued',
      prompt,
      transparent,
      seed: Math.floor(Math.random() * 2_147_483_647),
      createdAt: now,
      updatedAt: now,
      progress: 'queued',
      variant,
      batchSize,
      animationId: animation?.id,
      frameIndex: animation?.index,
      frameCount: animation?.count,
    };
    this.jobs.set(job.id, job);
    void this.run(job);
    return { ...job };
  }

  startBatch(prompt: string, transparent: boolean, count: number): ComfyJob[] {
    const requested = Number.isFinite(count) ? Math.trunc(count) : 1;
    const safeCount = Math.max(1, Math.min(4, requested));
    return Array.from({ length: safeCount }, (_, index) =>
      this.start(prompt, transparent, index + 1, safeCount),
    );
  }

  startAnimation(prompt: string, transparent: boolean, frames: number): ComfyJob[] {
    const requested = Number.isFinite(frames) ? Math.trunc(frames) : 2;
    const safeFrames = Math.max(2, Math.min(4, requested));
    const id = `animation-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    return Array.from({ length: safeFrames }, (_, index) =>
      this.start(prompt, transparent, index + 1, safeFrames, {
        id,
        index: index + 1,
        count: safeFrames,
      }),
    );
  }

  getJob(id: string): ComfyJob | undefined {
    const job = this.jobs.get(id);
    return job ? { ...job } : undefined;
  }

  private update(job: ComfyJob, patch: Partial<ComfyJob>): void {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }

  private async run(job: ComfyJob): Promise<void> {
    try {
      if (!this.workflowExists()) {
        throw new Error(`ComfyUI workflow not found: ${this.config.workflow}`);
      }
      const workflow = JSON.parse(readFileSync(this.config.workflow, 'utf8')) as Record<string, WorkflowNode>;
      const promptNode = workflow[PROMPT_NODE];
      const switchNode = workflow[SWITCH_NODE];
      const sampler = workflow[SAMPLER_NODE];
      if (!promptNode?.inputs || !switchNode?.inputs || !sampler?.inputs) {
        throw new Error('workflow does not contain the expected Qwen image nodes');
      }
      const finalPrompt = job.transparent
        ? `${job.prompt}, transparent background, alpha channel, isolated subject`
        : job.prompt;
      promptNode.inputs.prompt = finalPrompt;
      switchNode.inputs.on_false = finalPrompt;
      switchNode.inputs.switch = false;
      sampler.inputs.seed = job.seed;

      if (job.transparent) {
        workflow['studio_bg_model'] = {
          class_type: 'LoadBackgroundRemovalModel',
          inputs: { bg_removal_name: 'birefnet.safetensors' },
        };
        workflow['studio_bg_mask'] = {
          class_type: 'RemoveBackground',
          inputs: {
            bg_removal_model: ['studio_bg_model', 0],
            image: [SOURCE_IMAGE_NODE, 0],
          },
        };
        workflow['studio_bg_invert'] = {
          class_type: 'InvertMask',
          inputs: { mask: ['studio_bg_mask', 0] },
        };
        workflow['studio_alpha'] = {
          class_type: 'JoinImageWithAlpha',
          inputs: {
            image: [SOURCE_IMAGE_NODE, 0],
            alpha: ['studio_bg_invert', 0],
          },
        };
        const saveNode = workflow[IMAGE_OUTPUT_NODE];
        if (!saveNode?.inputs) throw new Error('workflow does not contain the SaveImageAdvanced node');
        saveNode.inputs.images = ['studio_alpha', 0];
      }

      this.update(job, { status: 'running', progress: 'submitting to ComfyUI' });
      const submit = await fetch(`${this.config.url.replace(/\/$/, '')}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: `gamedream-studio-${job.id}` }),
      });
      const submitted = (await submit.json().catch(() => ({}))) as { prompt_id?: string; error?: unknown };
      if (!submit.ok || !submitted.prompt_id) {
        throw new Error(
          `ComfyUI submit failed ${submit.status}: ${JSON.stringify(submitted).slice(0, 1000)}`,
        );
      }
      this.update(job, { progress: 'queued in ComfyUI' });

      let image: { filename: string; subfolder?: string; type?: string } | undefined;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
        const response = await fetch(
          `${this.config.url.replace(/\/$/, '')}/history/${submitted.prompt_id}`,
        );
        if (!response.ok) continue;
        const history = (await response.json()) as Record<string, HistoryEntry>;
        image = history[submitted.prompt_id]?.outputs?.[IMAGE_OUTPUT_NODE]?.images?.[0];
        if (image) break;
        this.update(job, { progress: `rendering · ${Math.floor((attempt + 1) * 2)}s` });
      }
      if (!image) throw new Error('ComfyUI generation timed out');

      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder ?? '',
        type: image.type ?? 'output',
      });
      const imageResponse = await fetch(`${this.config.url.replace(/\/$/, '')}/view?${query}`);
      if (!imageResponse.ok) throw new Error(`ComfyUI image download failed ${imageResponse.status}`);
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      mkdirSync(this.generatedDir, { recursive: true });
      const file = join(this.generatedDir, `${job.id}.png`);
      writeFileSync(file, bytes);
      const name = generatedName(job.prompt);
      const displayName = job.batchSize && job.batchSize > 1
        ? `${name} ${job.variant ?? 1}`
        : name;
      writeFileSync(
        join(this.generatedDir, `${job.id}.json`),
        `${JSON.stringify(
          {
            name: displayName,
            prompt: job.prompt,
            seed: job.seed,
            transparent: job.transparent,
            variant: job.variant,
            batchSize: job.batchSize,
            animationId: job.animationId,
            frameIndex: job.frameIndex,
            frameCount: job.frameCount,
            file: basename(file),
            source: image.filename,
            createdAt: job.createdAt,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );

      const relativeFile = relative(this.root, file).split('\\').join('/');
      this.update(job, {
        status: 'done',
        progress: 'ready',
        assetId: assetIdFor(relativeFile),
      });
    } catch (error) {
      this.update(job, {
        status: 'error',
        progress: 'failed',
        error: (error as Error).message,
      });
    }
  }
}

function bindingsOf(
  value: WorkflowBinding | WorkflowBinding[] | undefined,
): WorkflowBinding[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function setBinding(
  workflow: Record<string, WorkflowNode>,
  binding: WorkflowBinding,
  value: unknown,
): void {
  const node = workflow[binding.node];
  if (!node) throw new Error(`workflow node not found: ${binding.node}`);
  node.inputs = { ...(node.inputs ?? {}), [binding.input]: value };
}

export class ComfyWorkflowRunner {
  private readonly jobs = new Map<string, ComfyJob>();
  private healthCache: { at: number; value: boolean } | undefined;

  constructor(
    private readonly url: string,
    private readonly registry: WorkflowRegistry,
    private readonly generatedDir: string,
    private readonly root: string,
    private readonly pollIntervalMs = 2000,
  ) {}

  async health(force = false): Promise<boolean> {
    if (!force && this.healthCache && Date.now() - this.healthCache.at < 15_000) {
      return this.healthCache.value;
    }
    let value = false;
    try {
      const response = await fetch(`${this.url.replace(/\/$/, '')}/system_stats`, {
        signal: AbortSignal.timeout(2500),
      });
      value = response.ok;
    } catch {
      value = false;
    }
    this.healthCache = { at: Date.now(), value };
    return value;
  }

  listWorkflows() {
    return this.registry.list();
  }

  defaultWorkflow(kind: 'image' | 'audio'): string | undefined {
    return this.registry.defaultId(kind);
  }

  workflowExists(): boolean {
    return this.registry.hasImageWorkflow();
  }

  start(input: {
    prompt: string;
    transparent: boolean;
    workflowId?: string;
    duration?: number;
    lyrics?: string;
    variant?: number;
    batchSize?: number;
    animation?: { id: string; index: number; count: number };
  }): ComfyJob {
    const workflowId = input.workflowId ?? this.registry.defaultId('image');
    if (!workflowId) throw new Error('no ComfyUI workflow is available');
    const descriptor = this.registry.get(workflowId);
    if (!descriptor) throw new Error(`ComfyUI workflow not found: ${workflowId}`);
    const now = new Date().toISOString();
    const job: ComfyJob = {
      id: randomUUID(),
      status: 'queued',
      prompt: input.prompt,
      transparent: input.transparent,
      seed: Math.floor(Math.random() * 2_147_483_647),
      createdAt: now,
      updatedAt: now,
      progress: 'queued',
      variant: input.variant,
      batchSize: input.batchSize,
      animationId: input.animation?.id,
      frameIndex: input.animation?.index,
      frameCount: input.animation?.count,
      kind: descriptor.kind,
      duration: input.duration,
      workflowId: descriptor.id,
    };
    this.jobs.set(job.id, job);
    void this.run(job, descriptor, input.lyrics ?? '');
    return { ...job };
  }

  startBatch(prompt: string, transparent: boolean, count: number, workflowId?: string): ComfyJob[] {
    const requested = Number.isFinite(count) ? Math.trunc(count) : 1;
    const safeCount = Math.max(1, Math.min(4, requested));
    return Array.from({ length: safeCount }, (_, index) =>
      this.start({
        prompt,
        transparent,
        workflowId,
        variant: index + 1,
        batchSize: safeCount,
      }),
    );
  }

  startAnimation(
    prompt: string,
    transparent: boolean,
    frames: number,
    workflowId?: string,
  ): ComfyJob[] {
    const requested = Number.isFinite(frames) ? Math.trunc(frames) : 2;
    const safeFrames = Math.max(2, Math.min(4, requested));
    const id = `animation-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    return Array.from({ length: safeFrames }, (_, index) =>
      this.start({
        prompt,
        transparent,
        workflowId,
        variant: index + 1,
        batchSize: safeFrames,
        animation: { id, index: index + 1, count: safeFrames },
      }),
    );
  }

  startAudio(
    prompt: string,
    duration = 30,
    lyrics = '',
    workflowId?: string,
  ): ComfyJob {
    const selected = workflowId ?? this.registry.defaultId('audio');
    if (!selected) throw new Error('no ComfyUI audio workflow is available');
    const descriptor = this.registry.get(selected);
    if (!descriptor) throw new Error(`ComfyUI workflow not found: ${selected}`);
    if (descriptor.kind !== 'audio') {
      throw new Error(`ComfyUI workflow ${selected} is not an audio workflow`);
    }
    const safeDuration = Math.max(10, Math.min(60, Math.trunc(duration || 30)));
    return this.start({
      prompt,
      transparent: false,
      workflowId: selected,
      duration: safeDuration,
      lyrics,
    });
  }

  getJob(id: string): ComfyJob | undefined {
    const job = this.jobs.get(id);
    return job ? { ...job } : undefined;
  }

  private update(job: ComfyJob, patch: Partial<ComfyJob>): void {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }

  private async run(
    job: ComfyJob,
    descriptor: WorkflowDescriptor,
    lyrics: string,
  ): Promise<void> {
    try {
      const workflow = structuredClone(descriptor.workflow);
      const transparent = descriptor.bindings.transparent;
      let finalPrompt = job.prompt;
      if (job.transparent && descriptor.kind === 'image') {
        finalPrompt += transparent?.promptSuffix
          ?? ', transparent background, alpha channel, isolated subject';
      }
      for (const binding of bindingsOf(descriptor.bindings.prompt)) {
        setBinding(workflow, binding, finalPrompt);
      }
      for (const binding of bindingsOf(descriptor.bindings.seed)) {
        setBinding(workflow, binding, job.seed);
      }
      for (const binding of bindingsOf(descriptor.bindings.duration)) {
        setBinding(workflow, binding, job.duration ?? 30);
      }
      for (const binding of bindingsOf(descriptor.bindings.lyrics)) {
        setBinding(workflow, binding, lyrics);
      }
      for (const constant of descriptor.bindings.constants ?? []) {
        setBinding(workflow, constant, constant.value);
      }
      let output = descriptor.bindings.output;
      if (job.transparent && transparent) {
        Object.assign(workflow, transparent.nodes ?? {});
        if (transparent.output) output = transparent.output;
      }
      const outputType = output.output
        ?? (descriptor.kind === 'audio' ? 'audio' : 'images');

      this.update(job, { status: 'running', progress: 'submitting to ComfyUI' });
      const submit = await fetch(`${this.url.replace(/\/$/, '')}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: workflow,
          client_id: `gamedream-workflow-${job.id}`,
        }),
      });
      const submitted = (await submit.json().catch(() => ({}))) as {
        prompt_id?: string;
        error?: unknown;
      };
      if (!submit.ok || !submitted.prompt_id) {
        throw new Error(
          `ComfyUI submit failed ${submit.status}: ${JSON.stringify(submitted).slice(0, 1000)}`,
        );
      }
      this.update(job, { progress: 'queued in ComfyUI' });

      let outputFile: { filename: string; subfolder?: string; type?: string } | undefined;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        await new Promise((resolveWait) => setTimeout(resolveWait, this.pollIntervalMs));
        const response = await fetch(
          `${this.url.replace(/\/$/, '')}/history/${submitted.prompt_id}`,
        );
        if (!response.ok) continue;
        const history = (await response.json()) as Record<string, HistoryEntry>;
        const outputs = history[submitted.prompt_id]?.outputs ?? {};
        const nodeOutput = outputs[output.node];
        outputFile = nodeOutput?.[outputType]?.[0]
          ?? nodeOutput?.files?.[0]
          ?? nodeOutput?.images?.[0]
          ?? nodeOutput?.audio?.[0];
        if (outputFile?.filename) break;
        this.update(job, { progress: `rendering · ${Math.floor((attempt + 1) * 2)}s` });
      }
      if (!outputFile?.filename) throw new Error('ComfyUI generation timed out');

      const query = new URLSearchParams({
        filename: outputFile.filename,
        subfolder: outputFile.subfolder ?? '',
        type: outputFile.type ?? 'output',
      });
      const response = await fetch(`${this.url.replace(/\/$/, '')}/view?${query}`);
      if (!response.ok) throw new Error(`ComfyUI download failed ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const extension = output.extension ?? (descriptor.kind === 'audio' ? '.mp3' : '.png');
      mkdirSync(this.generatedDir, { recursive: true });
      const file = join(this.generatedDir, `${job.id}${extension}`);
      writeFileSync(file, bytes);
      const name = generatedName(job.prompt);
      const displayName = job.batchSize && job.batchSize > 1
        ? `${name} ${job.variant ?? 1}`
        : name;
      writeFileSync(
        join(this.generatedDir, `${job.id}.json`),
        `${JSON.stringify({
          name: displayName,
          prompt: job.prompt,
          seed: job.seed,
          transparent: job.transparent,
          variant: job.variant,
          batchSize: job.batchSize,
          animationId: job.animationId,
          frameIndex: job.frameIndex,
          frameCount: job.frameCount,
          kind: descriptor.kind,
          duration: job.duration,
          workflowId: descriptor.id,
          workflowName: descriptor.name,
          file: basename(file),
          source: outputFile.filename,
          createdAt: job.createdAt,
        }, null, 2)}\n`,
        'utf8',
      );
      const relativeFile = relative(this.root, file).split('\\').join('/');
      this.update(job, {
        status: 'done',
        progress: 'ready',
        assetId: assetIdFor(relativeFile),
      });
    } catch (error) {
      this.update(job, {
        status: 'error',
        progress: 'failed',
        error: (error as Error).message,
      });
    }
  }
}

export class ComfyAudioRunner {
  private readonly jobs = new Map<string, ComfyJob>();

  constructor(
    private readonly url: string,
    private readonly generatedDir: string,
    private readonly root: string,
    private readonly pollIntervalMs = 2000,
  ) {}

  start(prompt: string, duration = 30, lyrics = ''): ComfyJob {
    const now = new Date().toISOString();
    const safeDuration = Math.max(10, Math.min(60, Math.trunc(duration || 30)));
    const job: ComfyJob = {
      id: randomUUID(),
      status: 'queued',
      prompt,
      transparent: false,
      seed: Math.floor(Math.random() * 2_147_483_647),
      createdAt: now,
      updatedAt: now,
      progress: 'queued',
      kind: 'audio',
      duration: safeDuration,
    };
    this.jobs.set(job.id, job);
    void this.run(job, lyrics);
    return { ...job };
  }

  getJob(id: string): ComfyJob | undefined {
    const job = this.jobs.get(id);
    return job ? { ...job } : undefined;
  }

  private update(job: ComfyJob, patch: Partial<ComfyJob>): void {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }

  private workflow(job: ComfyJob, lyrics: string): Record<string, WorkflowNode> {
    return {
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
          caption: job.prompt,
          lyrics,
          seed: job.seed,
          max_duration: job.duration,
          cfg_scale: 1.5,
          top_k: 50,
        },
      },
      '5': {
        class_type: 'EmptyMiniMaxMusic3LatentAudio',
        inputs: { seconds: job.duration, batch_size: 1 },
      },
      '6': {
        class_type: 'ConditioningZeroOut',
        inputs: { conditioning: ['4', 0] },
      },
      '7': {
        class_type: 'KSampler',
        inputs: {
          seed: job.seed,
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
    };
  }

  private async run(job: ComfyJob, lyrics: string): Promise<void> {
    try {
      this.update(job, { status: 'running', progress: 'submitting to ComfyUI' });
      const submit = await fetch(`${this.url.replace(/\/$/, '')}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: this.workflow(job, lyrics),
          client_id: `gamedream-audio-${job.id}`,
        }),
      });
      const submitted = (await submit.json().catch(() => ({}))) as {
        prompt_id?: string;
        error?: unknown;
      };
      if (!submit.ok || !submitted.prompt_id) {
        throw new Error(
          `ComfyUI audio submit failed ${submit.status}: ${JSON.stringify(submitted).slice(0, 1000)}`,
        );
      }
      this.update(job, { progress: 'queued in ComfyUI' });

      let audio: { filename: string; subfolder?: string; type?: string } | undefined;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        await new Promise((resolveWait) => setTimeout(resolveWait, this.pollIntervalMs));
        const response = await fetch(
          `${this.url.replace(/\/$/, '')}/history/${submitted.prompt_id}`,
        );
        if (!response.ok) continue;
        const history = (await response.json()) as Record<string, HistoryEntry>;
        const outputs = history[submitted.prompt_id]?.outputs ?? {};
        for (const value of Object.values(outputs)) {
          const candidate = value.audio?.[0] ?? value.files?.[0] ?? value.images?.[0];
          if (candidate?.filename) {
            audio = candidate;
            break;
          }
        }
        if (audio) break;
        this.update(job, { progress: `rendering · ${Math.floor((attempt + 1) * 2)}s` });
      }
      if (!audio) throw new Error('ComfyUI audio generation timed out');

      const query = new URLSearchParams({
        filename: audio.filename,
        subfolder: audio.subfolder ?? '',
        type: audio.type ?? 'output',
      });
      const response = await fetch(`${this.url.replace(/\/$/, '')}/view?${query}`);
      if (!response.ok) throw new Error(`ComfyUI audio download failed ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      mkdirSync(this.generatedDir, { recursive: true });
      const file = join(this.generatedDir, `${job.id}.mp3`);
      writeFileSync(file, bytes);
      writeFileSync(
        join(this.generatedDir, `${job.id}.json`),
        `${JSON.stringify({
          name: generatedName(job.prompt),
          prompt: job.prompt,
          seed: job.seed,
          duration: job.duration,
          lyrics,
          kind: 'audio',
          file: basename(file),
          source: audio.filename,
          createdAt: job.createdAt,
        }, null, 2)}\n`,
        'utf8',
      );
      const relativeFile = relative(this.root, file).split('\\').join('/');
      this.update(job, {
        status: 'done',
        progress: 'ready',
        assetId: assetIdFor(relativeFile),
      });
    } catch (error) {
      this.update(job, {
        status: 'error',
        progress: 'failed',
        error: (error as Error).message,
      });
    }
  }
}
