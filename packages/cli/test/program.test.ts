import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/program.js';

let directories: string[] = [];

afterEach(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
  directories = [];
});

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'gamedream program '));
  directories.push(directory);
  return directory;
}

async function runProgram(
  args: string[],
): Promise<{ output: string; exitCode: number | undefined }> {
  let output = '';
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(((
    chunk: string | Uint8Array,
  ) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write);
  const previous = process.exitCode;
  process.exitCode = 0;
  try {
    await createProgram().parseAsync(['node', 'dream', ...args]);
    return { output, exitCode: process.exitCode };
  } finally {
    write.mockRestore();
    process.exitCode = previous;
  }
}

describe('develop CLI output and options', () => {
  it('prints one JSON document for a single run', async () => {
    const outDir = join(tempDir(), 'game');
    const { output } = await runProgram([
      'develop',
      'json demo',
      '--out',
      outDir,
      '--provider',
      'fake',
      '--max-steps',
      '1',
      '--json',
    ]);
    const report = JSON.parse(output.trim()) as { outDir: string };
    expect(report.outDir).toBe(outDir);
  }, 30_000);

  it('prints one candidates JSON document', async () => {
    const outDir = join(tempDir(), 'run');
    const { output } = await runProgram([
      'develop',
      'candidate demo',
      '--out',
      outDir,
      '--provider',
      'fake',
      '--max-steps',
      '1',
      '--candidates',
      '2',
      '--json',
    ]);
    const report = JSON.parse(output.trim()) as {
      selected: { report: { outDir: string } };
      candidates: unknown[];
    };
    expect(report.candidates).toHaveLength(2);
    expect(report.selected.report.outDir).toContain('candidate-');
  }, 60_000);

  it('rejects invalid numeric options before creating the project', async () => {
    const outDir = join(tempDir(), 'invalid');
    const steps = await runProgram([
      'develop',
      'invalid demo',
      '--out',
      outDir,
      '--provider',
      'fake',
      '--max-steps',
      'abc',
      '--json',
    ]);
    expect(steps.exitCode).toBe(1);
    expect(steps.output).toContain('--max-steps must be an integer');
    expect(existsSync(join(outDir, '.gamedream', 'session.json'))).toBe(false);

    const cost = await runProgram([
      'develop',
      'invalid demo',
      '--out',
      outDir,
      '--provider',
      'fake',
      '--max-cost',
      'abc',
      '--json',
    ]);
    expect(cost.exitCode).toBe(1);
    expect(cost.output).toContain('--max-cost must be a positive number');
  }, 30_000);

  it('treats option-like prompt text as positional after --', async () => {
    const outDir = join(tempDir(), 'prompt');
    const { output } = await runProgram([
      'develop',
      '--out',
      outDir,
      '--provider',
      'fake',
      '--max-steps',
      '1',
      '--json',
      '--ask-tool',
      'scaffold',
      '--',
      '--yes demo',
    ]);
    const report = JSON.parse(output.trim()) as {
      verify: { gates: { G1: { status: string } } };
    };
    expect(report.verify.gates.G1.status).toBe('fail');
  }, 30_000);
});
