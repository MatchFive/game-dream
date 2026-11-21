import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import type { CommandRunner } from '@gamedream/godot';
import type { ModelProvider } from '@gamedream/agent';
import {
  developCandidates,
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

  it('generates and selects among candidates', async () => {
    const developmentCase = loadDevelopmentCase(
      join(root, 'cases/development/survivor-demo.json'),
    );
    const outDir = join(makeTempDir('gamedream candidates '), 'run');
    const report = await developCandidates({
      prompt: developmentCase.prompt,
      outDir,
      skillsDir: join(root, 'skills'),
      skill: developmentCase.skill,
      providerKind: 'fake',
      env: { GODOT_BIN: 'godot' },
      runner: fakeGodot,
      maxSteps: 4,
      candidates: 2,
    });
    expect(report.candidates).toHaveLength(2);
    expect(report.selected.score).toBeGreaterThanOrEqual(report.candidates[1].score);
    expect(report.selected.report.finished).toBe(true);
    expect(existsSync(report.selected.report.sessionPath)).toBe(true);
  }, 30_000);

  it('streams structured events and resolves Studio approvals', async () => {
    const developmentCase = loadDevelopmentCase(
      join(root, 'cases/development/survivor-demo.json'),
    );
    const outDir = join(makeTempDir('gamedream events '), 'survivor-demo');
    const eventsFile = join(outDir, 'events.jsonl');
    const approvalDir = join(outDir, 'approvals');
    const running = developCommand({
      prompt: developmentCase.prompt,
      outDir,
      skillsDir: join(root, 'skills'),
      skill: developmentCase.skill,
      providerKind: 'fake',
      env: { GODOT_BIN: 'godot' },
      runner: fakeGodot,
      maxSteps: 4,
      eventsFile,
      approvalDir,
      runId: 'events-test',
      askTools: ['scaffold'],
    });
    let requestFile = '';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (existsSync(approvalDir)) {
        const name = readdirSync(approvalDir).find((entry) => entry.endsWith('.request.json'));
        if (name) {
          requestFile = join(approvalDir, name);
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(requestFile).not.toBe('');
    const request = JSON.parse(readFileSync(requestFile, 'utf8')) as { id: string };
    writeFileSync(
      join(approvalDir, `${request.id}.decision.json`),
      JSON.stringify({ allowed: true }),
      'utf8',
    );
    const report = await running;
    expect(report.finished).toBe(true);
    const events = readFileSync(eventsFile, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { type: string });
    const types = events.map((event) => event.type);
    expect(types).toContain('run/start');
    expect(types).toContain('approval/request');
    expect(types).toContain('approval/decision');
    expect(types).toContain('tool/start');
    expect(types).toContain('tool/end');
    expect(types).toContain('session/event');
    expect(types).toContain('run/end');
  }, 30_000);

  it('stops a development run when the token budget is exceeded', async () => {
    const developmentCase = loadDevelopmentCase(
      join(root, 'cases/development/survivor-demo.json'),
    );
    const outDir = join(makeTempDir('gamedream budget '), 'survivor-demo');
    const eventsFile = join(outDir, 'events.jsonl');
    const provider: ModelProvider = {
      name: 'budget-test',
      async complete() {
        throw new Error('legacy complete should not be used');
      },
      async completeChatWithUsage() {
        return {
          content: '',
          toolCalls: [{ id: 'call_1', name: 'scaffold', arguments: '{}' }],
          usage: { promptTokens: 2, completionTokens: 0, cachedTokens: 0 },
        };
      },
    };
    const report = await developCommand({
      prompt: developmentCase.prompt,
      outDir,
      skillsDir: join(root, 'skills'),
      skill: developmentCase.skill,
      provider,
      providerKind: 'fake',
      env: { GODOT_BIN: 'godot' },
      runner: fakeGodot,
      maxSteps: 4,
      maxTokens: 1,
      eventsFile,
    });
    expect(report.finished).toBe(false);
    expect(report.budgetExceeded).toEqual({
      kind: 'total-tokens',
      limit: 1,
      used: 2,
    });
    const types = readFileSync(eventsFile, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => (JSON.parse(line) as { type: string }).type);
    expect(types).toContain('run/budget');
  }, 30_000);
});
