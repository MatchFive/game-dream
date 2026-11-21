import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { assetIdFor } from './assets.js';
import type { ComfyJob, ComfyUiConfig } from './types.js';

interface WorkflowNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
}

interface HistoryEntry {
  outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }>;
}

const IMAGE_OUTPUT_NODE = '461';
const SOURCE_IMAGE_NODE = '459:457';
const PROMPT_NODE = '459:471';
const SWITCH_NODE = '459:474';
const SAMPLER_NODE = '459:458';

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

  start(prompt: string, transparent: boolean, variant?: number, batchSize?: number): ComfyJob {
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
