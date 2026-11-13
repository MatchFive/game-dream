import { readFileSync } from 'node:fs';
import {
  AgentError,
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
  expected_reason?: string;
}

export interface EvalResult {
  prompt: string;
  expectedTemplate: string;
  actualTemplate?: string;
  expectedGenre?: string;
  actualGenre?: string;
  expectedReason?: string;
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
  if (data.length === 0) throw new Error('eval fixtures must not be empty');
  const seen = new Set<string>();
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
    const key = value.prompt.trim().toLowerCase();
    if (seen.has(key)) throw new Error(`duplicate eval prompt at index ${index}`);
    seen.add(key);
    return {
      prompt: value.prompt,
      expected_template: value.expected_template,
      expected_genre:
        typeof value.expected_genre === 'string' ? value.expected_genre : undefined,
      expected_reason:
        typeof value.expected_reason === 'string' ? value.expected_reason : undefined,
    };
  });
}

function errorText(error: unknown): string {
  if (error instanceof AgentError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export async function evalCommand(options: EvalOptions): Promise<EvalReport> {
  const cases = loadEvalCases(options.fixturesPath);
  selectTemplate({ prompt: '', genre: '', templatesDir: options.templatesDir });
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
      const reasonOk =
        !testCase.expected_reason || selection.reason === testCase.expected_reason;
      results.push({
        prompt: testCase.prompt,
        expectedTemplate: testCase.expected_template,
        actualTemplate: selection.templateId,
        expectedGenre: testCase.expected_genre,
        actualGenre: draft.genre.primary,
        expectedReason: testCase.expected_reason,
        reason: selection.reason,
        passed: genreOk && templateOk && reasonOk,
      });
    } catch (error) {
      results.push({
        prompt: testCase.prompt,
        expectedTemplate: testCase.expected_template,
        expectedGenre: testCase.expected_genre,
        expectedReason: testCase.expected_reason,
        passed: false,
        error: errorText(error),
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
