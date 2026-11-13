import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import type { CommandRunner } from '@gamedream/godot';
import {
  developCommand,
  loadDevelopmentCase,
} from '../src/commands/develop.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const fakeGodot: CommandRunner = {
  async run(_command, args) {
    if (args[0] === '--version') {
      return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
    }
    return {
      exitCode: 0,
      stdout:
        'GAMEDREAM_BOOT_OK\nGAMEDREAM_SURVIVOR_SPAWN\nGAMEDREAM_SURVIVOR_LEVEL\nGAMEDREAM_UPGRADE\nGAMEDREAM_BOSS\nGAMEDREAM_BOSS_PHASE\nGAMEDREAM_WIN\n',
      stderr: '',
    };
  },
};

describe('development case', () => {
  it('loads a case and develops a project through tools', async () => {
    const developmentCase = loadDevelopmentCase(
      join(root, 'cases/development/survivor-demo.json'),
    );
    const outDir = join(makeTempDir('gamedream develop '), 'survivor-demo');
    const report = await developCommand({
      prompt: developmentCase.prompt,
      outDir,
      skillsDir: join(root, 'skills'),
      skill: developmentCase.skill,
      providerKind: 'fake',
      env: { GODOT_BIN: 'godot' },
      runner: fakeGodot,
      maxSteps: 4,
    });
    expect(report.finished).toBe(true);
    expect(report.actions).toEqual(['scaffold', 'verify', 'finish']);
    expect(report.verify.gates.G1.status).toBe('pass');
    expect(report.verify.gates.G2.status).toBe('pass');
    expect(report.verify.gates.G3.status).toBe('pass');
    expect(existsSync(join(outDir, 'game/_generated/main.tscn'))).toBe(true);
    expect(existsSync(join(outDir, 'gamedream.yaml'))).toBe(true);
  }, 30_000);
});
