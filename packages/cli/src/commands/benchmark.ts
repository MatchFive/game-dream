import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandRunner } from '@gamedream/godot';
import { createCommand } from './create.js';
import { parseProviderKind } from './create.js';
import type { VerifyReport } from './verify.js';

export interface BenchmarkCase {
  id: string;
  prompt: string;
  expected_genre?: string;
  expected_template: string;
  expected_playable?: boolean;
}

export interface BenchmarkCaseResult {
  id: string;
  prompt: string;
  expectedTemplate: string;
  actualTemplate?: string;
  expectedGenre?: string;
  actualGenre?: string;
  status: 'playable' | 'fallback' | 'unverified' | 'failed';
  templateMatched: boolean;
  templateExists: boolean;
  gates?: VerifyReport;
  modules: string[];
  files: string[];
  notice?: string;
  error?: string;
}

export interface BenchmarkReport {
  provider: string;
  total: number;
  playable: number;
  fallback: number;
  unverified: number;
  failed: number;
  results: BenchmarkCaseResult[];
}

export interface BenchmarkOptions {
  casesPath: string;
  outDir?: string;
  modulesDir: string;
  templatesDir: string;
  providerKind?: 'auto' | 'fake' | 'openai';
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
  keep?: boolean;
}

export function loadBenchmarkCases(path: string): BenchmarkCase[] {
  const data = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('benchmark cases must be a non-empty array');
  }
  const seen = new Set<string>();
  return data.map((value, index) => {
    if (typeof value !== 'object' || value === null) {
      throw new Error(`invalid benchmark case at index ${index}`);
    }
    const entry = value as Record<string, unknown>;
    const id = String(entry.id ?? '');
    const prompt = String(entry.prompt ?? '');
    const expectedTemplate = String(entry.expected_template ?? '');
    if (!id || !prompt || !expectedTemplate) {
      throw new Error(`invalid benchmark case at index ${index}`);
    }
    if (seen.has(id)) throw new Error(`duplicate benchmark case id: ${id}`);
    seen.add(id);
    return {
      id,
      prompt,
      expected_genre:
        typeof entry.expected_genre === 'string' ? entry.expected_genre : undefined,
      expected_template: expectedTemplate,
      expected_playable:
        typeof entry.expected_playable === 'boolean' ? entry.expected_playable : true,
    };
  });
}

function templateIds(templatesDir: string): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(templatesDir)) return ids;
  for (const entry of readdirSync(templatesDir, { withFileTypes: true })) {
    if (entry.isDirectory()) ids.add(entry.name);
  }
  return ids;
}

export function benchmarkExitCode(report: BenchmarkReport): 0 | 1 {
  return report.results.every((result) => result.status === 'playable') ? 0 : 1;
}

export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkReport> {
  const cases = loadBenchmarkCases(options.casesPath);
  const templates = templateIds(options.templatesDir);
  const tempRoot = options.outDir ?? mkdtempSync(join(tmpdir(), 'gamedream-cases-'));
  mkdirSync(tempRoot, { recursive: true });
  const provider = parseProviderKind(options.providerKind ?? 'fake');
  const results: BenchmarkCaseResult[] = [];
  try {
    for (const testCase of cases) {
      const outDir = join(tempRoot, testCase.id);
      try {
        const created = await createCommand({
          prompt: testCase.prompt,
          outDir,
          modulesDir: options.modulesDir,
          templatesDir: options.templatesDir,
          providerKind: provider,
          mode: 'auto',
          env: options.env,
          runner: options.runner,
        });
        const actual = created.result.templateId;
        const expectedExists = templates.has(testCase.expected_template);
        const templateMatched = actual === testCase.expected_template;
        const gates = created.verify?.gates;
        const allPassed =
          gates !== undefined && Object.values(gates).every((gate) => gate.status === 'pass');
        const runtimeUnavailable =
          gates !== undefined && (gates.G2.status === 'skip' || gates.G3.status === 'skip');
        let status: BenchmarkCaseResult['status'];
        if (!templateMatched) {
          status = 'fallback';
        } else if (!allPassed && runtimeUnavailable) {
          status = 'unverified';
        } else if (!allPassed) {
          status = 'failed';
        } else {
          status = 'playable';
        }
        results.push({
          id: testCase.id,
          prompt: testCase.prompt,
          expectedTemplate: testCase.expected_template,
          actualTemplate: actual,
          expectedGenre: testCase.expected_genre,
          actualGenre: created.result.spec?.genre?.primary,
          status,
          templateMatched,
          templateExists: expectedExists,
          gates: created.verify,
          modules: created.result.compose?.order ?? created.result.plannedModules ?? [],
          files: created.result.compose?.files ?? created.result.plannedFiles ?? [],
          notice: created.notice,
        });
      } catch (error) {
        results.push({
          id: testCase.id,
          prompt: testCase.prompt,
          expectedTemplate: testCase.expected_template,
          expectedGenre: testCase.expected_genre,
          status: 'failed',
          templateMatched: false,
          templateExists: templates.has(testCase.expected_template),
          modules: [],
          files: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    if (!options.keep && !options.outDir) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
  const count = (status: BenchmarkCaseResult['status']) =>
    results.filter((result) => result.status === status).length;
  return {
    provider,
    total: results.length,
    playable: count('playable'),
    fallback: count('fallback'),
    unverified: count('unverified'),
    failed: count('failed'),
    results,
  };
}
