import { readFileSync } from 'node:fs';
import {
  createProvider,
  draftGameSpec,
  selectTemplate,
  type ModelProvider,
  type ProviderKind,
} from '@gamedream/agent';

export interface EvalCase {
  prompt: string;
  expected_template: string;
  expected_genre?: string;
}

export interface EvalResult {
  prompt: string;
  expectedTemplate: string;
  actualTemplate?: string;
  expectedGenre?: string;
  actualGenre?: string;
  reason?: string;
  passed: boolean;
  error?: string;
}

export interface EvalReport {
  provider: string;
  total: number;
  passed: number;
  failed: number;
  results: EvalResult[];
}

export interface EvalOptions {
  fixturesPath: string;
  templatesDir: string;
  providerKind?: ProviderKind;
  provider?: ModelProvider;
  env?: NodeJS.ProcessEnv;
}

export function loadEvalCases(path: string): EvalCase[] {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data)) throw new Error('eval fixtures must be an array');
  return data.map((entry, index) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as EvalCase).prompt !== 'string' ||
      typeof (entry as EvalCase).expected_template !== 'string'
    ) {
      throw new Error(`invalid eval case at index ${index}`);
    }
    const value = entry as EvalCase;
    return {
      prompt: value.prompt,
      expected_template: value.expected_template,
      expected_genre:
        typeof value.expected_genre === 'string' ? value.expected_genre : undefined,
    };
  });
}

export async function evalCommand(options: EvalOptions): Promise<EvalReport> {
  const cases = loadEvalCases(options.fixturesPath);
  const provider =
    options.provider ??
    createProvider({
      kind: options.providerKind ?? 'fake',
      env: options.env,
    });
  const results: EvalResult[] = [];

  for (const testCase of cases) {
    try {
      const draft = await draftGameSpec({
        prompt: testCase.prompt,
        provider,
      });
      const selection = selectTemplate({
        prompt: testCase.prompt,
        genre: draft.genre.primary,
        templatesDir: options.templatesDir,
      });
      const genreOk =
        !testCase.expected_genre || draft.genre.primary === testCase.expected_genre;
      const templateOk = selection.templateId === testCase.expected_template;
      results.push({
        prompt: testCase.prompt,
        expectedTemplate: testCase.expected_template,
        actualTemplate: selection.templateId,
        expectedGenre: testCase.expected_genre,
        actualGenre: draft.genre.primary,
        reason: selection.reason,
        passed: genreOk && templateOk,
      });
    } catch (error) {
      results.push({
        prompt: testCase.prompt,
        expectedTemplate: testCase.expected_template,
        expectedGenre: testCase.expected_genre,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const passed = results.filter((result) => result.passed).length;
  return {
    provider: provider.name,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function evalExitCode(report: EvalReport): 0 | 2 {
  return report.failed === 0 ? 0 : 2;
}
