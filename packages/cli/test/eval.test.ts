import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { writeFileSync } from 'node:fs';
import type { ModelProvider } from '@gamedream/agent';
import { evalCommand, evalExitCode, loadEvalCases } from '../src/commands/eval.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('evalCommand', () => {
  it('passes all 20 fixture prompts with the fake provider', async () => {
    const report = await evalCommand({
      fixturesPath: join(root, 'fixtures/eval/prompts.json'),
      templatesDir: join(root, 'templates'),
      providerKind: 'fake',
    });
    expect(report.total).toBe(20);
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(20);
    expect(evalExitCode(report)).toBe(0);
  });

  it('isolates provider failures per case', async () => {
    const dir = makeTempDir('gamedream eval ');
    const fixture = join(dir, 'prompts.json');
    writeFileSync(
      fixture,
      JSON.stringify([
        { prompt: '做一个 RPG', expected_template: 'rpg-action-m1' },
      ]),
      'utf8',
    );
    const provider: ModelProvider = {
      name: 'broken',
      async complete() {
        throw new Error('boom');
      },
    };
    const report = await evalCommand({
      fixturesPath: fixture,
      templatesDir: join(root, 'templates'),
      provider,
    });
    expect(report.failed).toBe(1);
    expect(report.results[0].error).toContain('boom');
    expect(evalExitCode(report)).toBe(2);
  });

  it('reports template mismatches', async () => {
    const dir = makeTempDir('gamedream eval mismatch ');
    const fixture = join(dir, 'prompts.json');
    writeFileSync(
      fixture,
      JSON.stringify([
        { prompt: '做一个 RPG', expected_template: 'rpg-action-m0' },
      ]),
      'utf8',
    );
    const report = await evalCommand({
      fixturesPath: fixture,
      templatesDir: join(root, 'templates'),
      providerKind: 'fake',
    });
    expect(report.failed).toBe(1);
    expect(report.results[0].actualTemplate).toBe('rpg-action-m1');
  });

  it('rejects malformed fixtures', () => {
    const dir = makeTempDir('gamedream eval bad ');
    const fixture = join(dir, 'prompts.json');
    writeFileSync(fixture, JSON.stringify([{ prompt: 'x' }]), 'utf8');
    expect(() => loadEvalCases(fixture)).toThrow(/invalid eval case/);
  });
});
