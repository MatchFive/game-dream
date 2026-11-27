import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeCommand } from '../src/commands/compose.js';
import { exitCodeFor, verifyCommand } from '../src/commands/verify.js';
import type { CommandRunner } from '@gamedream/godot';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const CRASH = 3221225477;

async function composeProject(): Promise<string> {
  const outDir = join(makeTempDir('gamedream verify crash '), 'game');
  await composeCommand({
    specPath: join(root, 'fixtures/specs/m0.yaml'),
    outDir,
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
  });
  return outDir;
}

type RunResult = { exitCode: number; stdout: string; stderr: string };

function runnerWith(handler: (args: string[]) => RunResult): CommandRunner {
  return {
    async run(_command, args) {
      if (args[0] === '--version') {
        return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
      }
      return handler(args);
    },
  };
}

const BOOT_OK = { exitCode: 0, stdout: 'GAMEDREAM_BOOT_OK\nGAMEDREAM_WIN\n', stderr: '' };

describe('verify transient Godot crashes', () => {
  it('retries a Windows import crash once instead of failing G2', async () => {
    let imports = 0;
    const runner = runnerWith((args) => {
      if (args.includes('--import')) {
        imports += 1;
        return imports === 1
          ? { exitCode: CRASH, stdout: '', stderr: '' }
          : { exitCode: 0, stdout: '', stderr: '' };
      }
      return BOOT_OK;
    });
    const report = await verifyCommand({
      projectDir: await composeProject(),
      env: { GODOT_BIN: 'godot' },
      runner,
      sleep: async () => undefined,
    });
    expect(imports).toBe(2);
    expect(report.gates.G2.status).toBe('pass');
    expect(report.gates.G3.status).toBe('pass');
  });

  it('retries a crash during the headless run instead of failing G3', async () => {
    let runs = 0;
    const runner = runnerWith((args) => {
      if (args.includes('--import')) return { exitCode: 0, stdout: '', stderr: '' };
      runs += 1;
      return runs === 1 ? { exitCode: CRASH, stdout: '', stderr: '' } : BOOT_OK;
    });
    const report = await verifyCommand({
      projectDir: await composeProject(),
      env: { GODOT_BIN: 'godot' },
      runner,
      sleep: async () => undefined,
    });
    expect(runs).toBe(2);
    expect(report.gates.G3.status).toBe('pass');
  });

  it('classifies a persistent import crash as an environment error', async () => {
    let imports = 0;
    const delays: number[] = [];
    const runner = runnerWith((args) => {
      if (args.includes('--import')) {
        imports += 1;
        return { exitCode: CRASH, stdout: '', stderr: '' };
      }
      return BOOT_OK;
    });
    const report = await verifyCommand({
      projectDir: await composeProject(),
      env: { GODOT_BIN: 'godot' },
      runner,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    // 1 次初始 + 2 次重试，退避递增
    expect(imports).toBe(3);
    expect(delays).toEqual([300, 900]);
    expect(report.gates.G2.status).toBe('error');
    expect(report.gates.G2.attempts).toBe(3);
    expect(report.gates.G2.message).toMatch(/environment problem, not a project failure/);
    expect(report.gates.G3.status).toBe('skip');
    expect(exitCodeFor(report)).toBe(4);
  });

  it('classifies a persistent run crash as an environment error', async () => {
    let runs = 0;
    const runner = runnerWith((args) => {
      if (args.includes('--import')) return { exitCode: 0, stdout: '', stderr: '' };
      runs += 1;
      return { exitCode: CRASH, stdout: '', stderr: '' };
    });
    const report = await verifyCommand({
      projectDir: await composeProject(),
      env: { GODOT_BIN: 'godot' },
      runner,
      sleep: async () => undefined,
    });
    expect(runs).toBe(3);
    expect(report.gates.G2.status).toBe('pass');
    expect(report.gates.G3.status).toBe('error');
    expect(report.gates.G3.attempts).toBe(3);
    expect(exitCodeFor(report)).toBe(4);
  });

  it('still reports ordinary script errors as G3 failures', async () => {
    const runner = runnerWith((args) => {
      if (args.includes('--import')) return { exitCode: 0, stdout: '', stderr: '' };
      return { exitCode: 0, stdout: 'SCRIPT ERROR: cannot call method on null\n', stderr: '' };
    });
    const report = await verifyCommand({
      projectDir: await composeProject(),
      env: { GODOT_BIN: 'godot' },
      runner,
      sleep: async () => undefined,
    });
    expect(report.gates.G3.status).toBe('fail');
    expect(exitCodeFor(report)).toBe(2);
  });
});
