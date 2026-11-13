import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { createProject } from '../src/create/create-project.js';
import { FakeProvider } from '../src/provider/fake-provider.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function options(outDir = join(makeTempDir('gamedream create '), 'my game')) {
  return {
    prompt: '做一个俯视角动作 RPG，有背包和 1 个敌人',
    outDir,
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
    provider: new FakeProvider(),
    mode: 'auto' as const,
  };
}

describe('createProject', () => {
  it('writes gamedream.yaml and composes the fixture project', async () => {
    const opts = options();
    const result = await createProject(opts);
    expect(result.templateId).toBe('rpg-action-m1');
    expect(result.provider).toBe('fake');
    expect(existsSync(join(opts.outDir, 'gamedream.yaml'))).toBe(true);
    expect(existsSync(join(opts.outDir, 'project.godot'))).toBe(true);
    expect(existsSync(join(opts.outDir, 'modules.lock.json'))).toBe(true);
    const spec = readFileSync(join(opts.outDir, 'gamedream.yaml'), 'utf8');
    expect(spec).toContain('template: rpg-action-m1');
  });

  it('writes nothing in dry-run mode', async () => {
    const opts = { ...options(), mode: 'dry-run' as const };
    mkdirSync(opts.outDir, { recursive: true });
    const marker = join(opts.outDir, 'marker.txt');
    writeFileSync(marker, 'keep', 'utf8');
    const result = await createProject(opts);
    expect(result.plannedModules).toContain('core.events');
    expect(result.plannedFiles).toContain('project.godot');
    expect(readFileSync(marker, 'utf8')).toBe('keep');
    expect(existsSync(join(opts.outDir, 'gamedream.yaml'))).toBe(false);
    expect(existsSync(join(opts.outDir, 'project.godot'))).toBe(false);
    expect(existsSync(join(opts.outDir, 'modules'))).toBe(false);
  });

  it('preserves user files on a second create', async () => {
    const opts = options();
    await createProject(opts);
    const userFile = join(opts.outDir, 'game/content/items/keep.json');
    mkdirSync(join(opts.outDir, 'game/content/items'), { recursive: true });
    writeFileSync(userFile, '{"id":"keep"}\n', 'utf8');
    await createProject(opts);
    expect(readFileSync(userFile, 'utf8')).toBe('{"id":"keep"}\n');
  });

  it('backs up a changed gamedream.yaml on re-create', async () => {
    const opts = options();
    await createProject(opts);
    const specPath = join(opts.outDir, 'gamedream.yaml');
    writeFileSync(specPath, `${readFileSync(specPath, 'utf8')}# user edit\n`, 'utf8');
    await createProject(opts);
    expect(readFileSync(`${specPath}.bak`, 'utf8')).toContain('# user edit');
  });
});
