import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '@gamedream/testing';
import { ComfyWorkflowRunner } from '../src/comfyui.js';
import { WorkflowRegistry } from '../src/workflows.js';

function imageDescriptor(name: string) {
  return {
    name,
    description: `${name} description`,
    kind: 'image',
    workflow: {
      '1': { class_type: 'TextEncode', inputs: { prompt: '' } },
      '2': { class_type: 'SaveImage', inputs: { seed: 0, images: [] } },
    },
    bindings: {
      prompt: { node: '1', input: 'prompt' },
      seed: { node: '2', input: 'seed' },
      output: { node: '2', output: 'images', extension: '.png' },
    },
  };
}

describe('ComfyUI workflow registry', () => {
  it('loads descriptors, reports invalid files, and prefers project overrides', () => {
    const root = makeTempDir('gamedream workflows ');
    const project = join(root, 'project');
    const workspace = join(root, 'workspace');
    mkdirSync(project, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(project, 'hero.json'), JSON.stringify(imageDescriptor('Project Hero')));
    writeFileSync(join(workspace, 'hero.json'), JSON.stringify(imageDescriptor('Workspace Hero')));
    writeFileSync(join(workspace, 'broken.json'), JSON.stringify({ name: 'Broken' }), 'utf8');

    const registry = new WorkflowRegistry({ dirs: [project, workspace] });
    const list = registry.list();
    expect(list.find((workflow) => workflow.id === 'hero')).toMatchObject({
      name: 'Project Hero',
      source: 'project',
      valid: true,
    });
    expect(list.find((workflow) => workflow.id === 'broken')).toMatchObject({
      valid: false,
      source: 'workspace',
    });
    expect(registry.get('hero')?.name).toBe('Project Hero');
    expect(registry.defaultId('image')).toBe('hero');
    expect(registry.defaultId('audio')).toBe('builtin-bgm');
    expect(registry.hasImageWorkflow()).toBe(true);
  });

  it('keeps the legacy single-file workflow as a fallback', () => {
    const root = makeTempDir('gamedream legacy workflow ');
    const legacyPath = join(root, 'legacy.json');
    writeFileSync(
      legacyPath,
      JSON.stringify({ '459:471': { class_type: 'Text', inputs: {} } }),
      'utf8',
    );
    const registry = new WorkflowRegistry({ dirs: [], legacyWorkflow: legacyPath });
    expect(registry.list().find((workflow) => workflow.id === 'legacy-qwen')).toMatchObject({
      source: 'legacy',
      valid: true,
    });
    expect(registry.get('legacy-qwen')?.bindings.transparent?.promptSuffix).toContain(
      'transparent',
    );
  });

  it('runs batch and audio jobs through a selected descriptor', () => {
    const root = makeTempDir('gamedream workflow runner ');
    const workflows = join(root, 'workflows');
    mkdirSync(workflows, { recursive: true });
    writeFileSync(join(workflows, 'image.json'), JSON.stringify(imageDescriptor('Image')), 'utf8');
    const runner = new ComfyWorkflowRunner(
      'http://127.0.0.1:1',
      new WorkflowRegistry({ dirs: [workflows] }),
      join(root, 'generated'),
      root,
      10,
    );
    const jobs = runner.startBatch('a sprite', true, 2, 'image');
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.workflowId === 'image' && job.kind === 'image')).toBe(true);
    expect(runner.startAnimation('walk', false, 9, 'image')).toHaveLength(4);
    const audio = runner.startAudio('battle theme', 20, 'la la', 'builtin-bgm');
    expect(audio).toMatchObject({ workflowId: 'builtin-bgm', kind: 'audio', duration: 20 });
    expect(runner.listWorkflows().some((workflow) => workflow.kind === 'audio')).toBe(true);
  });
});
