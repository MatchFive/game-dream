import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from '@gamedream/testing';
import { exportProject } from '../src/export-project.js';
import type { CommandRunner } from '../src/runner.js';

const godot = { bin: 'godot', version: '4.4.1.stable.official', major: 4, minor: 4 };

function projectWithPreset(): string {
  const project = makeTempDir('gamedream export project ');
  writeFileSync(join(project, 'export_presets.cfg'), '[preset.0]\nname="Windows Desktop"\n', 'utf8');
  return project;
}

describe('Godot export', () => {
  it('invokes --export-release with preset and output', async () => {
    const project = projectWithPreset();
    const out = join(project, 'build/game.exe');
    const calls: string[][] = [];
    const runner: CommandRunner = {
      async run(_command, args) {
        calls.push(args);
        mkdirSync(join(project, 'build'), { recursive: true });
        writeFileSync(out, 'binary');
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };
    const result = await exportProject({
      projectDir: project,
      godot,
      preset: 'Windows Desktop',
      outPath: out,
      runner,
    });
    expect(calls[0]).toEqual([
      '--headless',
      '--path',
      project,
      '--export-release',
      'Windows Desktop',
      out,
    ]);
    expect(result.outputExists).toBe(true);
    expect(result.missingTemplates).toBe(false);
  });

  it('classifies missing export templates and rejects unknown presets', async () => {
    const project = projectWithPreset();
    const runner: CommandRunner = {
      async run() {
        return { exitCode: 1, stdout: '', stderr: 'Export template not found' };
      },
    };
    const result = await exportProject({
      projectDir: project,
      godot,
      preset: 'Windows Desktop',
      outPath: join(project, 'build/game.exe'),
      runner,
    });
    expect(result.missingTemplates).toBe(true);

    const localized: CommandRunner = {
      async run() {
        return { exitCode: 1, stdout: '', stderr: '指定路径不存在导出模板' };
      },
    };
    expect(
      (
        await exportProject({
          projectDir: project,
          godot,
          preset: 'Windows Desktop',
          outPath: join(project, 'build/game.exe'),
          runner: localized,
        })
      ).missingTemplates,
    ).toBe(true);
    await expect(
      exportProject({
        projectDir: project,
        godot,
        preset: 'Missing',
        outPath: join(project, 'build/game.exe'),
        runner,
      }),
    ).rejects.toThrow(/preset not found/);
  });
});
