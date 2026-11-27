import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import type { ModelProvider } from '@gamedream/agent';
import type { CommandRunner } from '@gamedream/godot';
import { developCommand } from '../src/commands/develop.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

// 找不到引擎的 runner：--version 直接失败
const noGodot: CommandRunner = {
  async run() {
    return { exitCode: 127, stdout: '', stderr: 'godot: command not found' };
  },
};

function countingProvider(): { provider: ModelProvider; calls: () => number } {
  let calls = 0;
  return {
    provider: {
      name: 'counting',
      async complete() {
        calls += 1;
        throw new Error('provider must not be called when the engine is missing');
      },
    } as unknown as ModelProvider,
    calls: () => calls,
  };
}

describe('develop engine preflight', () => {
  it('fails before the first model step when an existing Godot project has no engine', async () => {
    const outDir = join(makeTempDir('gamedream engine gate '), 'game');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'project.godot'), 'config_version=5\n', 'utf8');
    const counting = countingProvider();

    await expect(
      developCommand({
        prompt: 'continue the game',
        outDir,
        skillsDir: join(root, 'skills'),
        skill: 'gdscript',
        providerKind: 'auto',
        provider: counting.provider,
        env: {},
        runner: noGodot,
        maxSteps: 4,
      }),
    ).rejects.toThrow(/Godot 4\.4\+ not found/);

    expect(counting.calls()).toBe(0);
  });

  it('allows the run when the caller opts out of the preflight', async () => {
    const outDir = join(makeTempDir('gamedream engine bypass '), 'game');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'project.godot'), 'config_version=5\n', 'utf8');

    // 没有引擎也允许进入工具流程：用于纯工具/沙箱场景
    const report = await developCommand({
      prompt: 'dry run',
      outDir,
      skillsDir: join(root, 'skills'),
      skill: 'gdscript',
      providerKind: 'fake',
      env: {},
      runner: noGodot,
      maxSteps: 1,
      allowMissingEngine: true,
    });
    expect(report.actions.length).toBeGreaterThanOrEqual(0);
  });
});
