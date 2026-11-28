import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPromptFile, sceneBatchCommand } from '../src/commands/scene-batch.js';

const kitPath = fileURLToPath(new URL('../../scene/kits/village-euro.json', import.meta.url));

describe('scene batch', () => {
  it('reads one prompt per line and skips comments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedream batch prompts '));
    const file = join(dir, 'p.txt');
    writeFileSync(file, '# 注释\n\n河边的小渔村，要有酒馆和教堂\n  \n山脚下的贸易小镇\n', 'utf8');
    expect(readPromptFile(file)).toEqual(['河边的小渔村，要有酒馆和教堂', '山脚下的贸易小镇']);
  });

  it('fails when the prompt file is missing instead of running zero prompts', () => {
    expect(() => readPromptFile(join(tmpdir(), 'nope.txt'))).toThrow(/not found/);
  });

  it('records a trace per prompt and reports stats', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedream batch run '));
    const prompts = join(dir, 'prompts.txt');
    writeFileSync(prompts, '河边的小渔村，要有酒馆和教堂\n山脚下的贸易小镇，集市是必需\n', 'utf8');

    const outcome = await sceneBatchCommand({
      promptsPath: prompts,
      outDir: join(dir, 'out'),
      kitPath,
      provider: 'fake',
      // 用假 provider 只验管道：真模型样本不该进单元测试
    });

    expect(outcome.results).toHaveLength(2);
    expect(outcome.stats.total).toBeGreaterThanOrEqual(2);
    expect(outcome.stats.withPrompt).toBeGreaterThanOrEqual(2);

    const traces = readFileSync(outcome.traceFile, 'utf8').trim().split('\n');
    expect(traces.length).toBeGreaterThanOrEqual(2);
    const stats = JSON.parse(readFileSync(join(dir, 'out', 'stats.json'), 'utf8'));
    expect(stats.provider).toBeTruthy();
    expect(stats.stats.total).toBeGreaterThanOrEqual(2);
  });

  it('honours --limit so a run can be costed before going wide', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedream batch limit '));
    const prompts = join(dir, 'prompts.txt');
    writeFileSync(prompts, '一号需求：河边渔村\n二号需求：山地小镇\n三号需求：湖畔营地\n', 'utf8');

    const outcome = await sceneBatchCommand({
      promptsPath: prompts,
      outDir: join(dir, 'out'),
      kitPath,
      provider: 'fake',
      limit: 1,
    });
    expect(outcome.results).toHaveLength(1);
  });
});
