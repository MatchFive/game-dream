import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeProject } from '@gamedream/core';
import { makeTempDir } from '@gamedream/testing';
import { packageGodotProject } from '../src/package.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

async function compose() {
  const project = join(makeTempDir('gamedream godot package '), 'game');
  await composeProject({
    specPath: join(root, 'fixtures/specs/minimal.yaml'),
    outDir: project,
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
  });
  return project;
}

describe('Godot package', () => {
  it('copies the source project and excludes generated/screenshot artifacts', async () => {
    const project = await compose();
    mkdirSync(join(project, '.godot/imported'), { recursive: true });
    mkdirSync(join(project, 'build'), { recursive: true });
    mkdirSync(join(project, 'screenshots'), { recursive: true });
    writeFileSync(join(project, '.godot/imported/cache'), 'cache');
    writeFileSync(join(project, 'build/game.exe'), 'binary');
    writeFileSync(join(project, 'screenshots/shot.png'), 'png');
    writeFileSync(join(project, 'project.godot.bak'), 'bak');

    const out = join(makeTempDir('gamedream godot package out '), 'release');
    const result = packageGodotProject({ projectDir: project, outDir: out });
    expect(result.entry).toBe('project.godot');
    expect(existsSync(join(out, 'project.godot'))).toBe(true);
    expect(existsSync(join(out, 'export_presets.cfg'))).toBe(true);
    expect(existsSync(join(out, 'modules.lock.json'))).toBe(true);
    expect(existsSync(join(out, '.godot'))).toBe(false);
    expect(existsSync(join(out, 'build'))).toBe(false);
    expect(existsSync(join(out, 'screenshots'))).toBe(false);
    expect(existsSync(join(out, 'project.godot.bak'))).toBe(false);
    expect(result.files.some((file) => file.path === 'game/game.manifest.json')).toBe(true);
    expect(result.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256))).toBe(true);
    const release = JSON.parse(readFileSync(join(out, 'release.json'), 'utf8'));
    expect(release.files).toEqual(result.files);
  });

  it('refuses non-empty output and keeps the old package on failure', async () => {
    const project = await compose();
    const out = join(makeTempDir('gamedream godot package guard '), 'release');
    packageGodotProject({ projectDir: project, outDir: out });
    expect(() => packageGodotProject({ projectDir: project, outDir: out })).toThrow(/pass --force/);
    writeFileSync(join(project, 'release.json'), 'source release file');
    packageGodotProject({ projectDir: project, outDir: out, force: true });
    expect(existsSync(join(out, 'release.json'))).toBe(true);
    expect(existsSync(join(out, 'project.godot'))).toBe(true);
  });
});
