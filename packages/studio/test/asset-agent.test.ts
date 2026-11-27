import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeProvider } from '@gamedream/agent';
import { makeTempDir } from '@gamedream/testing';
import { AssetAgentManager } from '../src/asset-agent.js';
import type { ComfyWorkflowRunner } from '../src/comfyui.js';
import type { StudioSettings } from '../src/settings.js';

function settings(): StudioSettings {
  return {
    model: { provider: 'fake', model: 'fake', baseUrl: '', apiKey: '' },
    image: { url: 'http://127.0.0.1:1', workflow: '', workflowsDir: '' },
    engines: { godotBin: '', unityBin: '' },
  };
}

function fakeRunner(): ComfyWorkflowRunner {
  return {
    listWorkflows: () => [{
      id: 'image',
      name: 'Image',
      description: 'Test image workflow',
      kind: 'image',
      source: 'project',
      valid: true,
    }],
    startBatch: () => [{
      id: 'job-1',
      status: 'queued',
      prompt: 'x',
      transparent: false,
      seed: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 'queued',
      assetId: 'asset-1',
    }],
    getJob: () => ({
      id: 'job-1',
      status: 'done',
      prompt: 'x',
      transparent: false,
      seed: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 'ready',
      assetId: 'asset-1',
    }),
  } as unknown as ComfyWorkflowRunner;
}

async function waitFinished(manager: AssetAgentManager, id: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = manager.get(id);
    if (run && run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return manager.get(id);
}

describe('asset agent', () => {
  it('lists workflows, generates a batch, and finishes with events', async () => {
    const root = makeTempDir('gamedream asset agent ');
    const manager = new AssetAgentManager({
      root,
      getRunner: fakeRunner,
      getSettings: settings,
      workflowsDir: join(root, '.gamedream', 'studio', 'workflows'),
      generatedDir: join(root, '.gamedream', 'studio', 'generated'),
      providerFactory: () => new FakeProvider({
        responses: [
          JSON.stringify({ tool: 'list_workflows', args: {} }),
          JSON.stringify({
            tool: 'generate_batch',
            args: { items: [{ prompt: 'hero' }, { prompt: 'slime' }] },
          }),
          JSON.stringify({ tool: 'finish', args: { summary: 'two assets' } }),
        ],
      }),
    });
    const started = manager.start('make two assets');
    const run = await waitFinished(manager, started.id);
    expect(run?.status).toBe('finished');
    expect(run?.events.some((event) => event.type === 'tool/end' && event.tool === 'list_workflows')).toBe(true);
    const generateEvents = run?.events.filter(
      (event) => event.type === 'tool/end' && event.tool === 'generate_batch',
    ) ?? [];
    expect(generateEvents).toHaveLength(1);
    expect(generateEvents[0]?.ok).toBe(true);
    expect(run?.events.some((event) => event.type === 'asset/end')).toBe(true);
  });

  it('saves a validated workflow descriptor into the project directory', async () => {
    const root = makeTempDir('gamedream asset workflow ');
    const workflowsDir = join(root, '.gamedream', 'studio', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });
    const manager = new AssetAgentManager({
      root,
      getRunner: fakeRunner,
      getSettings: settings,
      workflowsDir,
      generatedDir: join(root, '.gamedream', 'studio', 'generated'),
      providerFactory: () => new FakeProvider({
        responses: [
          JSON.stringify({
            tool: 'save_workflow',
            args: {
              name: 'My Flow',
              description: 'A custom flow',
              kind: 'image',
              workflow: {
                '1': { class_type: 'TextEncode', inputs: { prompt: '' } },
                '2': { class_type: 'SaveImage', inputs: { images: [] } },
              },
              bindings: {
                prompt: { node: '1', input: 'prompt' },
                output: { node: '2', output: 'images' },
              },
            },
          }),
          JSON.stringify({ tool: 'finish', args: {} }),
        ],
      }),
    });
    const started = manager.start('add a workflow');
    const run = await waitFinished(manager, started.id);
    expect(run?.status).toBe('finished');
    const file = join(workflowsDir, 'my-flow.json');
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      name: 'My Flow',
      kind: 'image',
    });
  });
});
