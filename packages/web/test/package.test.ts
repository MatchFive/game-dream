import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import {
  composeWebProject,
  packageWebProject,
  verifyWebProject,
} from '../src/index.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const templatesDir = join(root, 'templates/web-m0');

describe('web package', () => {
  it('packages managed files and assets, excludes screenshots, and verifies', () => {
    const project = join(makeTempDir('gamedream web package source '), 'web game');
    composeWebProject({
      outDir: project,
      templatesDir,
      contentDir: join(root, 'templates/rpg-action-m1/content'),
      modulesDir: join(root, 'modules'),
      name: 'packaged',
    });
    writeFileSync(join(project, 'screenshot.png'), 'not part of release');
    mkdirSync(join(project, 'profile'), { recursive: true });
    writeFileSync(join(project, 'profile', 'cache'), 'nope');

    const out = join(makeTempDir('gamedream web package out '), 'release');
    const result = packageWebProject({ projectDir: project, outDir: out });
    expect(result.name).toBe('packaged');
    expect(result.entry).toBe('index.html');
    expect(result.files.some((file) => file.path === 'assets/system.player/player.svg')).toBe(true);
    expect(result.files.every((file) => file.sha256.length === 64)).toBe(true);
    expect(result.files.map((file) => file.path)).toEqual(
      [...result.files.map((file) => file.path)].sort(),
    );
    expect(existsSync(join(out, 'screenshot.png'))).toBe(false);
    expect(existsSync(join(out, 'profile'))).toBe(false);
    const deployment = JSON.parse(readFileSync(join(out, 'deployment.json'), 'utf8'));
    expect(deployment.entry).toBe('index.html');
    expect(deployment.bytes).toBe(result.bytes);
    expect(deployment.files).toEqual(result.files);
    expect(verifyWebProject({ projectDir: out, frames: 900 }).passed).toBe(true);
  });

  it('requires force to overwrite and rejects incomplete projects', () => {
    const project = join(makeTempDir('gamedream web package guard '), 'web game');
    composeWebProject({ outDir: project, templatesDir });
    const out = join(makeTempDir('gamedream web package guard out '), 'release');
    packageWebProject({ projectDir: project, outDir: out });
    expect(() => packageWebProject({ projectDir: project, outDir: out })).toThrow(/pass --force/);
    expect(() => packageWebProject({ projectDir: project, outDir: out, force: true })).not.toThrow();

    unlinkSync(join(project, 'vendor/phaser.min.js'));
    expect(() => packageWebProject({ projectDir: project, outDir: join(out, '../missing') })).toThrow(
      /vendor\/phaser.min.js/,
    );
  });

  it('rejects output inside project assets or containing the project', () => {
    const project = join(makeTempDir('gamedream web package nested '), 'web game');
    composeWebProject({
      outDir: project,
      templatesDir,
      contentDir: join(root, 'templates/rpg-action-m1/content'),
      modulesDir: join(root, 'modules'),
    });
    expect(() =>
      packageWebProject({ projectDir: project, outDir: join(project, 'assets/release') }),
    ).toThrow(/inside the project assets/);
    expect(() =>
      packageWebProject({ projectDir: project, outDir: join(project, '..') }),
    ).toThrow(/contain the project/);
  });
});
