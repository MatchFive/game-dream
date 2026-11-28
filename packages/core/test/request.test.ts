import { describe, expect, it } from 'vitest';
import { parseRequest, requestPrompt, requestLine } from '../src/request.js';

const base = {
  schema: 1,
  id: 'boss-room',
  title: 'Boss 房间',
  prompt: '在 survivor 模板里加入 60 秒后出现的 boss 房间',
  acceptance: ['headless 跑到 60 秒后打印 SURVIVOR_BOSS=1'],
  constraints: ['不要修改 CLI 代码'],
  createdBy: 'coding-agent',
  createdAt: '2026-11-28T08:00:00.000Z',
  status: 'open',
};

describe('game request', () => {
  it('accepts a well formed request', () => {
    const request = parseRequest(base);
    expect(request.id).toBe('boss-room');
    expect(request.acceptance).toHaveLength(1);
    expect(request.runId).toBeNull();
  });

  it('rejects requests that cannot be verified', () => {
    // "加个功能"这种需求没有验收价值
    expect(() => parseRequest({ ...base, prompt: '加个功能' })).toThrow(/at least 10 characters/);
    expect(() => parseRequest({ ...base, title: '  ' })).toThrow(/title is required/);
    expect(() => parseRequest({ ...base, createdBy: '' })).toThrow(/createdBy/);
  });

  it('rejects unsafe ids and unknown schemas', () => {
    expect(() => parseRequest({ ...base, id: '../escape' })).toThrow(/slug/);
    expect(() => parseRequest({ ...base, id: 'Boss Room' })).toThrow(/slug/);
    expect(() => parseRequest({ ...base, schema: 2 })).toThrow(/schema must be 1/);
  });

  it('requires a run id before a request can be done', () => {
    // 没有运行记录就无法追溯"这版是谁做的"
    expect(() => parseRequest({ ...base, status: 'done' })).toThrow(/runId is required/);
    expect(parseRequest({ ...base, status: 'done', runId: 'boss-room' }).runId).toBe('boss-room');
  });

  it('rejects unknown statuses and non-string acceptance lists', () => {
    expect(() => parseRequest({ ...base, status: 'finished' })).toThrow(/status must be one of/);
    expect(() => parseRequest({ ...base, acceptance: [1, 2] })).toThrow(/array of strings/);
  });

  it('folds acceptance and constraints into the agent prompt', () => {
    const prompt = requestPrompt(parseRequest(base));
    expect(prompt).toContain('在 survivor 模板里加入 60 秒后出现的 boss 房间');
    expect(prompt).toContain('验收标准');
    expect(prompt).toContain('SURVIVOR_BOSS=1');
    expect(prompt).toContain('硬约束');
    expect(prompt).toContain('不要修改 CLI 代码');
  });

  it('prints one line per request for listing', () => {
    const line = requestLine(parseRequest(base));
    expect(line).toContain('boss-room');
    expect(line).toContain('open');
  });
});
