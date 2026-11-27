import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AgentLoop,
  AgentSession,
  FakeProvider,
  createProvider,
  type HarnessTool,
  type HarnessToolResult,
  type ModelProvider,
} from '@gamedream/agent';
import { createAnimationAtlas } from './animation-atlas.js';
import { scanAssets, setInBuild, syncBuildAssets } from './assets.js';
import { ComfyWorkflowRunner } from './comfyui.js';
import { studioEnv, type StudioSettings } from './settings.js';
import type { ComfyJob } from './types.js';
import { parseWorkflowDescriptor, workflowDescriptorFile } from './workflows.js';

export type AssetAgentStatus = 'running' | 'finished' | 'failed' | 'canceled';

export interface AssetAgentEvent {
  seq: number;
  at: string;
  type: string;
  tool?: string;
  ok?: boolean;
  output?: string;
  data?: unknown;
  error?: string;
}

export interface AssetAgentRun {
  id: string;
  prompt: string;
  status: AssetAgentStatus;
  createdAt: string;
  finishedAt?: string;
  events: AssetAgentEvent[];
  result?: Record<string, unknown>;
  error?: string;
}

interface AssetAgentOptions {
  root: string;
  getRunner: () => ComfyWorkflowRunner;
  getSettings: () => StudioSettings;
  workflowsDir: string;
  generatedDir: string;
  maxSteps?: number;
  providerFactory?: () => ModelProvider;
}

interface AssetContext {
  root: string;
  runner: ComfyWorkflowRunner;
  workflowsDir: string;
  generatedDir: string;
}

const SLEEP = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function waitForJob(
  runner: ComfyWorkflowRunner,
  id: string,
  timeoutMs = 180_000,
): Promise<ReturnType<ComfyWorkflowRunner['getJob']>> {
  return (async () => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const job = runner.getJob(id);
      if (job?.status === 'done' || job?.status === 'error') return job;
      await SLEEP(500);
    }
    return runner.getJob(id);
  })();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'workflow';
}

function assetProvider(settings: StudioSettings): ModelProvider {
  if (settings.model.provider === 'fake') return new FakeProvider();
  if (!settings.model.apiKey) {
    throw new Error('Asset Agent requires a configured model API key.');
  }
  return createProvider({
    kind: settings.model.provider === 'openai' ? 'openai' : 'auto',
    env: studioEnv(settings),
  });
}

function systemPrompt(): string {
  return [
    'You are the GameDream asset agent.',
    'You create game assets in the current project through ComfyUI workflows and Studio tools.',
    'Start with list_workflows and list_assets. Reuse existing assets instead of duplicating them.',
    'Use generate_asset for one asset or generate_batch for several distinct assets.',
    'Use pack_atlas for animation frames and stage_asset when an asset should enter the build.',
    'Use save_workflow when a new ComfyUI workflow descriptor is needed; then list_workflows again.',
    'Call finish only when the requested assets exist and are indexed.',
    'Tools:',
    '- list_workflows {}',
    '- list_assets {}',
    '- generate_asset {prompt, kind, count, transparent, workflowId, duration, lyrics}',
    '- generate_batch {items:[{prompt, kind, count, transparent, workflowId, duration, lyrics}]}',
    '- pack_atlas {assetIds, name, fps, loop}',
    '- stage_asset {assetIds, value}',
    '- save_workflow {name, description, kind, workflow, bindings, id}',
    '- finish {summary}',
  ].join('\n');
}

export class AssetAgentManager {
  private readonly runs = new Map<string, AssetAgentRun>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly options: AssetAgentOptions;

  constructor(options: AssetAgentOptions) {
    this.options = options;
    this.load();
  }

  private directory(id: string): string {
    return join(this.options.root, '.gamedream', 'studio', 'asset-agent', id);
  }

  private load(): void {
    const root = join(this.options.root, '.gamedream', 'studio', 'asset-agent');
    if (!existsSync(root)) return;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = join(root, entry.name, 'run.json');
      if (!existsSync(file)) continue;
      try {
        const run = JSON.parse(readFileSync(file, 'utf8')) as AssetAgentRun;
        if (run.status === 'running') {
          run.status = 'failed';
          run.error = 'Studio restarted before the asset agent finished.';
          run.finishedAt = new Date().toISOString();
        }
        run.events = this.readEvents(run.id);
        this.runs.set(run.id, run);
      } catch {
        // Ignore malformed history.
      }
    }
  }

  private readEvents(id: string): AssetAgentEvent[] {
    const file = join(this.directory(id), 'events.jsonl');
    if (!existsSync(file)) return [];
    const events: AssetAgentEvent[] = [];
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as AssetAgentEvent);
      } catch {
        // A partial final line is expected while the agent is writing.
      }
    }
    return events;
  }

  private persist(run: AssetAgentRun): void {
    mkdirSync(this.directory(run.id), { recursive: true });
    writeFileSync(
      join(this.directory(run.id), 'run.json'),
      `${JSON.stringify({ ...run, events: undefined }, null, 2)}\n`,
      'utf8',
    );
  }

  private emit(run: AssetAgentRun, event: Omit<AssetAgentEvent, 'seq' | 'at'>): void {
    const entry: AssetAgentEvent = {
      seq: run.events.length + 1,
      at: new Date().toISOString(),
      ...event,
    };
    run.events.push(entry);
    mkdirSync(this.directory(run.id), { recursive: true });
    appendFileSync(
      join(this.directory(run.id), 'events.jsonl'),
      `${JSON.stringify(entry)}\n`,
      'utf8',
    );
  }

  list(): AssetAgentRun[] {
    return [...this.runs.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  get(id: string): AssetAgentRun | undefined {
    return this.runs.get(id);
  }

  cancel(id: string): AssetAgentRun {
    const run = this.runs.get(id);
    if (!run) throw new Error('asset agent run not found');
    if (run.status === 'running') {
      this.controllers.get(id)?.abort();
      run.status = 'canceled';
      run.finishedAt = new Date().toISOString();
      this.emit(run, { type: 'asset/end', ok: false, error: 'canceled' });
      this.persist(run);
    }
    return run;
  }

  start(prompt: string): AssetAgentRun {
    const value = prompt.trim();
    if (!value) throw new Error('prompt is required');
    if (value.length > 6000) throw new Error('prompt is limited to 6000 characters');
    if (!this.options.providerFactory) assetProvider(this.options.getSettings());
    const run: AssetAgentRun = {
      id: `asset-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`,
      prompt: value,
      status: 'running',
      createdAt: new Date().toISOString(),
      events: [],
    };
    this.runs.set(run.id, run);
    this.persist(run);
    this.emit(run, { type: 'asset/start', output: value });
    void this.run(run);
    return run;
  }

  private provider(): ModelProvider {
    if (this.options.providerFactory) return this.options.providerFactory();
    return assetProvider(this.options.getSettings());
  }

  private tools(): HarnessTool<AssetContext>[] {
    const raw: Array<{
      name: string;
      description: string;
      execute: (args: Record<string, unknown>, context: AssetContext) => Promise<HarnessToolResult>;
    }> = [
      {
        name: 'list_workflows',
        description: 'List available ComfyUI workflows with kind and description.',
        async execute(_args, context) {
          return {
            ok: true,
            output: JSON.stringify(context.runner.listWorkflows(), null, 2),
          };
        },
      },
      {
        name: 'list_assets',
        description: 'List project assets by id, name, kind, file, and build selection.',
        async execute(_args, context) {
          const assets = scanAssets(context.root).map((asset) => ({
            id: asset.id,
            name: asset.name,
            kind: asset.kind,
            file: asset.file,
            inBuild: asset.inBuild,
          }));
          return { ok: true, output: JSON.stringify(assets, null, 2) };
        },
      },
      {
        name: 'generate_asset',
        description: 'Generate one image or audio asset through a ComfyUI workflow.',
        execute: async (args, context) => this.generateOne(args, context),
      },
      {
        name: 'generate_batch',
        description: 'Generate several distinct assets in one call.',
        execute: async (args, context) => {
          const items = Array.isArray(args.items) ? args.items.slice(0, 12) : [];
          if (items.length === 0) return { ok: false, output: 'items must be a non-empty array' };
          const results: unknown[] = [];
          let ok = true;
          for (const item of items) {
            const value = typeof item === 'string'
              ? { prompt: item }
              : typeof item === 'object' && item !== null
                ? (item as Record<string, unknown>)
                : { prompt: '' };
            const result = await this.generateOne(value, context);
            ok = ok && result.ok;
            results.push(result.data ?? result.output);
          }
          return { ok, output: JSON.stringify(results, null, 2), data: results };
        },
      },
      {
        name: 'pack_atlas',
        description: 'Pack image asset frames into a transparent animation atlas.',
        async execute(args, context) {
          const assetIds = Array.isArray(args.assetIds)
            ? args.assetIds.filter((id): id is string => typeof id === 'string')
            : [];
          const atlas = createAnimationAtlas(context.root, {
            assetIds,
            name: typeof args.name === 'string' ? args.name : undefined,
            fps: typeof args.fps === 'number' ? args.fps : undefined,
            loop: typeof args.loop === 'boolean' ? args.loop : undefined,
          });
          return { ok: true, output: JSON.stringify(atlas, null, 2), data: atlas };
        },
      },
      {
        name: 'stage_asset',
        description: 'Add or remove assets from the build selection and sync build assets.',
        async execute(args, context) {
          const assetIds = Array.isArray(args.assetIds)
            ? args.assetIds.filter((id): id is string => typeof id === 'string')
            : typeof args.assetId === 'string'
              ? [args.assetId]
              : [];
          if (assetIds.length === 0) return { ok: false, output: 'assetIds are required' };
          const value = args.value !== false;
          let canvas: ReturnType<typeof setInBuild> | undefined;
          for (const id of assetIds) canvas = setInBuild(context.root, id, value);
          syncBuildAssets(context.root);
          return { ok: true, output: JSON.stringify(canvas, null, 2), data: canvas };
        },
      },
      {
        name: 'save_workflow',
        description: 'Save a validated ComfyUI workflow descriptor into the project workflows directory.',
        async execute(args, context) {
          const fallbackId = typeof args.id === 'string' && /^[A-Za-z0-9_-]+$/.test(args.id)
            ? args.id
            : slug(typeof args.name === 'string' ? args.name : 'workflow');
          const descriptor = parseWorkflowDescriptor(args, fallbackId, 'project');
          mkdirSync(context.workflowsDir, { recursive: true });
          const file = join(context.workflowsDir, `${descriptor.id}.json`);
          writeFileSync(
            file,
            `${JSON.stringify(workflowDescriptorFile(descriptor), null, 2)}\n`,
            'utf8',
          );
          return {
            ok: true,
            output: `Saved workflow ${descriptor.id} to ${file}`,
            data: { id: descriptor.id, file },
          };
        },
      },
      {
        name: 'finish',
        description: 'Finish after the requested assets are generated and indexed.',
        async execute(args) {
          return { ok: true, output: String(args.summary ?? 'finished') };
        },
      },
    ];
    return raw.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
      execute: async (args, context) => tool.execute(args, context),
    }));
  }

  private async generateOne(
    args: Record<string, unknown>,
    context: AssetContext,
  ): Promise<HarnessToolResult> {
    const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
    if (!prompt) return { ok: false, output: 'prompt is required' };
    const kind = args.kind === 'audio' ? 'audio' : 'image';
    const workflowId = typeof args.workflowId === 'string' ? args.workflowId : undefined;
    if (kind === 'audio') {
      const duration = typeof args.duration === 'number' ? args.duration : 30;
      const lyrics = typeof args.lyrics === 'string' ? args.lyrics : '';
      let job: ComfyJob;
      try {
        job = context.runner.startAudio(prompt, duration, lyrics, workflowId);
      } catch (error) {
        return { ok: false, output: (error as Error).message };
      }
      const done = await waitForJob(context.runner, job.id);
      const ok = done?.status === 'done';
      return {
        ok,
        output: JSON.stringify(done ?? null, null, 2),
        data: { jobs: [done], assetIds: done?.assetId ? [done.assetId] : [] },
      };
    }
    const count = typeof args.count === 'number' ? Math.max(1, Math.min(4, Math.trunc(args.count))) : 1;
    let jobs;
    try {
      jobs = context.runner.startBatch(prompt, args.transparent === true, count, workflowId);
    } catch (error) {
      return { ok: false, output: (error as Error).message };
    }
    const done = await Promise.all(jobs.map((job) => waitForJob(context.runner, job.id)));
    const complete = done.filter((job) => job?.status === 'done');
    return {
      ok: complete.length === done.length,
      output: JSON.stringify(done, null, 2),
      data: {
        jobs: done,
        assetIds: complete.map((job) => job?.assetId).filter(Boolean),
      },
    };
  }

  private async run(run: AssetAgentRun): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    try {
      const runner = this.options.getRunner();
      const settings = this.options.getSettings();
      const provider = this.provider();
      const context: AssetContext = {
        root: this.options.root,
        runner,
        workflowsDir: this.options.workflowsDir,
        generatedDir: this.options.generatedDir,
      };
      const session = new AgentSession(
        systemPrompt(),
        `Create assets for this request:\n${run.prompt}\n\nProject: ${this.options.root}`,
      );
      const loop = new AgentLoop<AssetContext>({
        system: systemPrompt(),
        initialUser: `Create assets for this request:\n${run.prompt}\n\nProject: ${this.options.root}`,
        provider,
        tools: this.tools().map((tool) => ({
          ...tool,
          execute: async (args, toolContext) => {
            this.emit(run, { type: 'tool/start', tool: tool.name });
            try {
              const result = await tool.execute(args, toolContext);
              this.emit(run, {
                type: 'tool/end',
                tool: tool.name,
                ok: result.ok,
                output: result.output.slice(0, 8000),
                data: result.data,
              });
              return result;
            } catch (error) {
              this.emit(run, {
                type: 'tool/end',
                tool: tool.name,
                ok: false,
                error: (error as Error).message,
              });
              throw error;
            }
          },
        })),
        context,
        maxSteps: this.options.maxSteps ?? 16,
        session,
        signal: controller.signal,
        nativeTools: Boolean(provider.completeChatWithUsage),
        canFinish: () => ({ ok: true }),
        onChunk: (chunk) => this.emit(run, { type: 'assistant/chunk', output: chunk }),
      });
      const result = await loop.run();
      run.status = result.finished ? 'finished' : 'failed';
      run.finishedAt = new Date().toISOString();
      run.result = {
        finished: result.finished,
        steps: result.steps,
        actions: result.actions,
        usage: result.usage,
        provider: settings.model.provider,
      };
      this.emit(run, { type: 'asset/end', ok: result.finished, data: run.result });
    } catch (error) {
      run.status = controller.signal.aborted ? 'canceled' : 'failed';
      run.error = (error as Error).message;
      run.finishedAt = new Date().toISOString();
      this.emit(run, { type: 'asset/end', ok: false, error: run.error });
    } finally {
      this.controllers.delete(run.id);
      this.persist(run);
    }
  }
}
