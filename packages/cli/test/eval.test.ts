import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { writeFileSync } from 'node:fs';
import { FakeProvider, type ModelProvider } from '@gamedream/agent';
import { evalCommand, evalExitCode, loadEvalCases } from '../src/commands/eval.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('evalCommand', () => {
  it('passes all 21 fixture prompts with the fake provider', async () => {
    const report = await evalCommand({
      fixturesPath: join(root, 'fixtures/eval/prompts.json'),
      templatesDir: join(root, 'templates'),
      providerKind: 'fake',
    });
    expect(report.total).toBe(21);
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(21);
    expect(evalExitCode(report)).toBe(0);
  });

  it('defaults to the fake provider without a key', async () => {
    const report = await evalCommand({
      fixturesPath: join(root, 'fixtures/eval/prompts.json'),
      templatesDir: join(root, 'templates'),
      env: {},
    });
    expect(report.provider).toBe('fake');
    expect(report.total).toBe(21);
  });

  it('isolates provider failures per case and continues', async () => {
    const dir = makeTempDir('gamedream eval ');
    const fixture = join(dir, 'prompts.json');
    writeFileSync(
      fixture,
      JSON.stringify([
        { prompt: '做一个 RPG', expected_template: 'rpg-action-m1' },
        { prompt: '做一个有背包的 RPG', expected_template: 'rpg-action-m1' },
        { prompt: '做一个有 Boss 的 RPG', expected_template: 'rpg-action-m1' },
      ]),
      'utf8',
    );
    const fallback = new FakeProvider();
    let calls = 0;
    const provider: ModelProvider = {
      name: 'flaky',
      async complete(request) {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return fallback.complete(request);
      },
    };
    const report = await evalCommand({
      fixturesPath: fixture,
      templatesDir: join(root, 'templates'),
      provider,
    });
    expect(report.total).toBe(3);
    expect(report.failed).toBe(1);
    expect(report.passed).toBe(2);
    expect(report.results[0].error).toContain('boom');
    expect(report.results[1].passed).toBe(true);
    expect(evalExitCode(report)).toBe(2);
  });

  it('rejects empty, duplicate, and missing-template cases', async () => {
    const dir = makeTempDir('gamedream eval invalid ');
    const empty = join(dir, 'empty.json');
    writeFileSync(empty, '[]', 'utf8');
    expect(() => loadEvalCases(empty)).toThrow(/must not be empty/);

    const duplicate = join(dir, 'duplicate.json');
    writeFileSync(
      duplicate,
      JSON.stringify([
        { prompt: '做一个 RPG', expected_template: 'rpg-action-m1' },
        { prompt: '做一个 RPG', expected_template: 'rpg-action-m1' },
      ]),
      'utf8',
    );
    expect(() => loadEvalCases(duplicate)).toThrow(/duplicate/);

    await expect(
      evalCommand({
        fixturesPath: join(root, 'fixtures/eval/prompts.json'),
        templatesDir: join(dir, 'missing-templates'),
        providerKind: 'fake',
      }),
    ).rejects.toMatchObject({ code: 'NO_TEMPLATES' });
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
