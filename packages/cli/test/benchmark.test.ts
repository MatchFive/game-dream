import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { makeTempDir } from '@gamedream/testing';
import { benchmarkExitCode, loadBenchmarkCases, runBenchmark } from '../src/commands/benchmark.js';
import type { CommandRunner } from '@gamedream/godot';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const fakeGodot: CommandRunner = {
  async run(command, args) {
    if (args[0] === '--version') {
      return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
    }
    return {
      exitCode: 0,
      stdout:
        'GAMEDREAM_BOOT_OK\nINVENTORY_COUNT=1\nGAMEDREAM_MAP_OK\nGAMEDREAM_SPRITE_OK\nGAMEDREAM_AUDIO_OK\nGAMEDREAM_DIALOGUE\nGAMEDREAM_LEVEL_UP\nGAMEDREAM_EQUIPPED\nGAMEDREAM_SKILL_CAST\nGAMEDREAM_LEVEL_2\nGAMEDREAM_BOSS\nGAMEDREAM_BOSS_PHASE\nGAMEDREAM_QUEST_COMPLETE\nGAMEDREAM_COIN\nGAMEDREAM_KILL\nGAMEDREAM_DUNGEON\nGAMEDREAM_WAVE\nGAMEDREAM_PUSH\nGAMEDREAM_SURVIVOR_SPAWN\nGAMEDREAM_SURVIVOR_LEVEL\nGAMEDREAM_VICTORY\nGAMEDREAM_WIN\n',
      stderr: '',
    };
  },
};

describe('case benchmark', () => {
  it('distinguishes playable from fallback', async () => {
    const outDir = join(makeTempDir('gamedream benchmark '), 'cases');
    const report = await runBenchmark({
      casesPath: join(root, 'cases/benchmark.json'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
      providerKind: 'fake',
      env: { GODOT_BIN: 'godot' },
      runner: fakeGodot,
    });
    expect(report.total).toBe(7);
    expect(report.results.find((result) => result.id === 'action-rpg')?.status).toBe('playable');
    expect(report.results.find((result) => result.id === 'platformer')?.status).toBe('playable');
    expect(report.results.find((result) => result.id === 'platformer')?.templateExists).toBe(true);
    expect(report.results.find((result) => result.id === 'shooter')?.status).toBe('playable');
    expect(report.results.find((result) => result.id === 'shooter')?.templateExists).toBe(true);
    expect(report.results.find((result) => result.id === 'roguelike')?.status).toBe('playable');
    expect(report.results.find((result) => result.id === 'roguelike')?.templateExists).toBe(true);
    expect(report.results.find((result) => result.id === 'tower-defense')?.status).toBe('playable');
    expect(report.results.find((result) => result.id === 'tower-defense')?.templateExists).toBe(true);
    expect(report.results.find((result) => result.id === 'puzzle')?.status).toBe('playable');
    expect(report.results.find((result) => result.id === 'puzzle')?.templateExists).toBe(true);
    expect(report.results.find((result) => result.id === 'survivor')?.status).toBe('playable');
    expect(report.results.find((result) => result.id === 'survivor')?.templateExists).toBe(true);
    expect(report.failed).toBe(0);
    expect(benchmarkExitCode(report)).toBe(0);
  });

  it('rejects duplicate or malformed cases', () => {
    const dir = makeTempDir('gamedream benchmark invalid ');
    const duplicate = join(dir, 'duplicate.json');
    writeFileSync(
      duplicate,
      JSON.stringify([
        { id: 'a', prompt: 'x', expected_template: 'rpg-action-m1' },
        { id: 'a', prompt: 'y', expected_template: 'rpg-action-m1' },
      ]),
      'utf8',
    );
    expect(() => loadBenchmarkCases(duplicate)).toThrow(/duplicate/);
  });
});
