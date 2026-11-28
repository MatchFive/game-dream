import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestList, requestNew, requestSet, requestShow } from '../src/commands/request.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'gamedream requests '));

describe('request channel', () => {
  it('writes a request file the project agent can consume', () => {
    const dir = tmp();
    const { file, request } = requestNew({
      dir,
      title: 'Boss 房间',
      prompt: '在 survivor 模板里加入 60 秒后出现的 boss 房间',
      acceptance: ['headless 跑到 60 秒后打印 SURVIVOR_BOSS=1'],
      constraints: ['不要修改 CLI 代码'],
    });

    expect(request.id).toBe('boss');
    expect(request.status).toBe('open');
    expect(request.createdBy).toBe('coding-agent');

    const written = JSON.parse(readFileSync(file, 'utf8'));
    expect(written.schema).toBe(1);
    expect(written.prompt).toContain('boss');
    expect(requestList(dir)).toHaveLength(1);
  });

  it('refuses duplicate ids instead of overwriting someone else\'s request', () => {
    const dir = tmp();
    requestNew({ dir, id: 'boss-room', title: 'Boss', prompt: '在模板里加一个 boss 房间并打印标记' });
    expect(() => requestNew({ dir, id: 'boss-room', title: 'Boss 2', prompt: '另一个需求，也要打印标记' }))
      .toThrow(/already exists/);
  });

  it('walks open -> running -> done and keeps the run id', () => {
    const dir = tmp();
    requestNew({ dir, id: 'boss-room', title: 'Boss', prompt: '在模板里加一个 boss 房间并打印标记' });

    expect(requestSet(dir, 'boss-room', { status: 'running', runId: 'boss-room' }).status).toBe('running');
    const done = requestSet(dir, 'boss-room', { status: 'done' });
    expect(done.status).toBe('done');
    expect(done.runId).toBe('boss-room');
  });

  it('refuses to mark a request done when it was never run', () => {
    const dir = tmp();
    requestNew({ dir, id: 'fresh', title: 'Fresh', prompt: '一个从来没有跑过的需求，直接标完成' });
    // 没有 runId 的 done 等于"我说我做完了"，这正是规则要拦住的情况
    expect(() => requestSet(dir, 'fresh', { status: 'done' })).toThrow(/runId is required/);
  });

  it('reports missing requests instead of returning undefined', () => {
    const dir = tmp();
    expect(() => requestShow(dir, 'nope')).toThrow(/not found/);
  });
});
