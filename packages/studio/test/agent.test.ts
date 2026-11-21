import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AgentManager } from '../src/agent.js';
import { startStudioServer, type StudioServerHandle } from '../src/server.js';

let studio: StudioServerHandle | undefined;

function fakeAgent(root: string): string {
  const script = join(root, 'fake-agent.mjs');
  writeFileSync(
    script,
    `import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const arg = (name, fallback) => {
  const index = process.argv.indexOf('--' + name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const eventsFile = arg('events-file');
const approvalDir = arg('approval-dir');
const runId = arg('run-id');
const outDir = arg('out');
const resume = process.argv.includes('--resume');
const maxTokens = arg('max-tokens');
const maxCost = arg('max-cost');
let seq = Number(arg('event-seq-start', '0')) || 0;
const write = (event) => appendFileSync(eventsFile, JSON.stringify({ seq: ++seq, at: new Date().toISOString(), runId, ...event }) + '\\n', 'utf8');
write({ type: 'run/start', prompt: 'fixture' });
if (maxCost) {
  const limit = Number(maxCost);
  write({ type: 'run/budget', kind: 'cost', limit, used: limit + 0.01 });
  write({ type: 'run/end', report: { finished: false, steps: 1, actions: [], missingMarkers: [], budgetExceeded: { kind: 'cost', limit, used: limit + 0.01 }, usage: { calls: 1, promptTokens: 100, completionTokens: 10, cachedTokens: 0, costUsd: limit + 0.01 }, verify: { gates: { G1: { status: 'fail' }, G2: { status: 'skip' }, G3: { status: 'skip' } } } } });
  process.exit(0);
}
if (maxTokens) {
  write({ type: 'run/budget', kind: 'total-tokens', limit: Number(maxTokens), used: Number(maxTokens) + 1 });
  write({ type: 'run/end', report: { finished: false, steps: 1, actions: [], missingMarkers: [], budgetExceeded: { kind: 'total-tokens', limit: Number(maxTokens), used: Number(maxTokens) + 1 }, usage: { calls: 1, promptTokens: Number(maxTokens) + 1, completionTokens: 0, cachedTokens: 0 }, verify: { gates: { G1: { status: 'fail' }, G2: { status: 'skip' }, G3: { status: 'skip' } } } } });
  process.exit(0);
}
if (resume) {
  write({ type: 'session/event', event: { type: 'assistant/message', content: 'fixture resumed' } });
  write({ type: 'run/end', report: { finished: true, steps: 1, actions: ['finish'], missingMarkers: [], verify: { gates: { G1: { status: 'pass' }, G2: { status: 'pass' }, G3: { status: 'pass' } } } } });
  process.exit(0);
}
write({ type: 'approval/request', id: 'approval-1', tool: 'scaffold', args: { outDir } });
if (approvalDir) {
  const decision = join(approvalDir, 'approval-1.decision.json');
  const deadline = Date.now() + 5000;
  while (!existsSync(decision) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const value = existsSync(decision) ? JSON.parse(readFileSync(decision, 'utf8')) : { allowed: false };
  write({ type: 'approval/decision', id: 'approval-1', tool: 'scaffold', allowed: value.allowed === true });
  if (value.allowed !== true) {
    write({ type: 'run/error', error: 'approval denied' });
    process.exit(1);
  }
}
if (outDir) {
  mkdirSync(join(outDir, 'game'), { recursive: true });
  writeFileSync(join(outDir, 'game', 'fixture.txt'), 'fixture', 'utf8');
}
write({ type: 'session/event', event: { type: 'assistant/message', content: 'fixture finished' } });
write({ type: 'run/end', report: { finished: true, steps: 1, actions: ['finish'], missingMarkers: [], verify: { gates: { G1: { status: 'pass' }, G2: { status: 'pass' }, G3: { status: 'pass' } } } } });
`,
    'utf8',
  );
  return script;
}

async function getAgent(url: string): Promise<{
  active?: { id: string; status: string; candidates: Array<{
    id: string; status: string; score?: number; error?: string; report?: { usage?: { costUsd?: number } }; approvals: Array<{ id: string; status: string }>;
    events: Array<{ type: string }>;
  }> };
  batches: Array<{ id: string; status: string; candidates: Array<{ id: string; status: string; score?: number; error?: string; report?: { usage?: { costUsd?: number } }; approvals: Array<{ id: string; status: string }>; events: Array<{ type: string }> }> }>;
  queued?: Array<{ id: string; status: string }>;
}> {
  const response = await fetch(`${url}/api/agent`);
  return response.json() as Promise<never>;
}

afterEach(async () => {
  if (studio) await studio.close();
  studio = undefined;
});

it('streams approval and completion for a Studio agent run', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-'));
  const cliEntry = fakeAgent(root);
  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  const started = await fetch(`${studio.url}/api/agent/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'fixture goal', candidates: 1 }),
  });
  expect(started.status).toBe(202);

  let data = await getAgent(studio.url);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.active?.status === 'awaiting-approval') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(data.active?.status).toBe('awaiting-approval');
  const run = data.active?.candidates[0];
  expect(run?.approvals[0]?.status).toBe('pending');
  expect(run?.events.some((event) => event.type === 'approval/request')).toBe(true);

  const approval = await fetch(
    `${studio.url}/api/agent/batches/${data.active?.id}/runs/${run?.id}/approval`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: 'approval-1', allowed: true }),
    },
  );
  expect(approval.status).toBe(200);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    data = await getAgent(studio.url);
    const candidate = data.batches[0]?.candidates[0];
    if (candidate?.status === 'finished') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(data.batches[0]?.status).toBe('finished');
  expect(data.batches[0]?.candidates[0]?.score).toBeGreaterThan(1000);
});

it('runs candidates and applies the selected candidate', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-candidates-'));
  const cliEntry = fakeAgent(root);
  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  const started = await fetch(`${studio.url}/api/agent/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'candidate goal', candidates: 2 }),
  });
  expect(started.status).toBe(202);
  let data = await getAgent(studio.url);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.active?.status === 'awaiting-approval') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(data.active?.candidates).toHaveLength(2);
  for (const candidate of data.active?.candidates ?? []) {
    await fetch(
      `${studio.url}/api/agent/batches/${data.active?.id}/runs/${candidate.id}/approval`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId: 'approval-1', allowed: true }),
      },
    );
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.batches[0]?.candidates.every((candidate) => candidate.status === 'finished')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const batch = data.batches[0];
  expect(batch?.candidates).toHaveLength(2);
  const selected = batch?.candidates[1];
  mkdirSync(join(root, 'game'), { recursive: true });
  writeFileSync(join(root, 'game', 'fixture.txt'), 'old', 'utf8');
  const diffResponse = await fetch(
    `${studio.url}/api/agent/batches/${batch?.id}/candidates/${selected?.id}/diff`,
  );
  expect(diffResponse.status).toBe(200);
  const diff = (await diffResponse.json()) as {
    diff: { counts: { added: number; modified: number }; files: Array<{ path: string; status: string }> };
  };
  expect(diff.diff.counts.modified).toBeGreaterThan(0);
  expect(diff.diff.files.find((file) => file.path === 'game/fixture.txt')?.status).toBe('modified');

  const apply = await fetch(`${studio.url}/api/agent/batches/${batch?.id}/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId: selected?.id }),
  });
  expect(apply.status).toBe(200);
  const applied = (await apply.json()) as { batch: { lastBackup?: { entries: string[] } } };
  expect(applied.batch.lastBackup?.entries).toContain('game');
  expect(readFileSync(join(root, 'game', 'fixture.txt'), 'utf8')).toBe('fixture');

  const rollback = await fetch(`${studio.url}/api/agent/batches/${batch?.id}/rollback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  expect(rollback.status).toBe(200);
  expect(readFileSync(join(root, 'game', 'fixture.txt'), 'utf8')).toBe('old');
});

it('persists an always-allow approval policy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-policy-'));
  const cliEntry = fakeAgent(root);
  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  const saved = await fetch(`${studio.url}/api/agent/policy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'scaffold', mode: 'allow' }),
  });
  expect(saved.status).toBe(200);
  const policy = (await saved.json()) as { policy: { tools: Record<string, string> } };
  expect(policy.policy.tools.scaffold).toBe('allow');
  const policyFile = join(root, '.gamedream', 'studio', 'agent-policy.json');
  expect(existsSync(policyFile)).toBe(true);
  expect(JSON.parse(readFileSync(policyFile, 'utf8')).tools.scaffold).toBe('allow');

  const fetched = await fetch(`${studio.url}/api/agent/policy`).then((response) => response.json()) as {
    policy: { default?: string; tools: Record<string, string> };
    availableTools: string[];
    source: string;
  };
  expect(fetched.policy.tools.scaffold).toBe('allow');
  expect(fetched.availableTools).toContain('write_file');
  expect(fetched.source).toBe('.gamedream/studio/agent-policy.json');

  const defaulted = await fetch(`${studio.url}/api/agent/policy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ default: true, mode: 'deny' }),
  });
  expect(defaulted.status).toBe(200);
  const withDefault = (await defaulted.json()) as {
    policy: { default: string; tools: Record<string, string> };
  };
  expect(withDefault.policy.default).toBe('deny');
  expect(withDefault.policy.tools.scaffold).toBe('allow');
  expect(JSON.parse(readFileSync(policyFile, 'utf8')).default).toBe('deny');

  const ruled = await fetch(`${studio.url}/api/agent/policy/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tool: 'write_file',
      mode: 'allow',
      arg: 'path',
      prefix: 'src/',
      reason: 'source tree',
    }),
  });
  expect(ruled.status).toBe(200);
  const withRule = (await ruled.json()) as {
    policy: { rules: Array<{ tool: string; arg?: string; prefix?: string; mode: string }> };
  };
  expect(withRule.policy.rules[0]).toMatchObject({
    tool: 'write_file',
    arg: 'path',
    prefix: 'src/',
    mode: 'allow',
  });
  expect(JSON.parse(readFileSync(policyFile, 'utf8')).rules).toHaveLength(1);
  const removed = await fetch(`${studio.url}/api/agent/policy/rules/0`, { method: 'DELETE' });
  expect(removed.status).toBe(200);
  expect((await removed.json() as { policy: { rules: unknown[] } }).policy.rules).toEqual([]);
});

it('pushes agent snapshots over SSE', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-sse-'));
  const cliEntry = fakeAgent(root);
  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  const controller = new AbortController();
  const response = await fetch(`${studio.url}/api/agent/events`, {
    signal: controller.signal,
  });
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  const decoder = new TextDecoder();
  let buffer = '';
  const nextFrame = async (): Promise<Record<string, unknown>> => {
    const deadline = Date.now() + 5000;
    while (!buffer.includes('\n\n') && Date.now() < deadline) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
    }
    const boundary = buffer.indexOf('\n\n');
    if (boundary < 0) throw new Error(`SSE frame timeout: ${buffer}`);
    const frame = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    const data = frame.split(/\r?\n/).find((line) => line.startsWith('data: '));
    if (!data) throw new Error(`SSE frame has no data: ${frame}`);
    expect(frame).toMatch(/^id: \d+/m);
    expect(frame).toContain('retry: 1500');
    return JSON.parse(data.slice(6)) as Record<string, unknown>;
  };

  const initial = await nextFrame();
  expect(Array.isArray(initial.batches)).toBe(true);

  const started = await fetch(`${studio.url}/api/agent/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'SSE fixture', candidates: 1 }),
  });
  expect(started.status).toBe(202);
  const pushed = await nextFrame() as {
    active?: { status: string; candidates: Array<{ id: string }> };
  };
  expect(pushed.active?.candidates).toHaveLength(1);

  await reader?.cancel();
  controller.abort();
});

it('marks a run stopped by the cost budget', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-cost-'));
  const cliEntry = fakeAgent(root);
  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  const started = await fetch(`${studio.url}/api/agent/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'cost fixture', candidates: 1, maxCostUsd: 0.01 }),
  });
  expect(started.status).toBe(202);

  let data = await getAgent(studio.url);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.batches[0]?.status === 'budget-exceeded') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const batch = data.batches[0];
  expect(batch?.status).toBe('budget-exceeded');
  expect(batch?.candidates[0]?.error).toContain('cost budget exceeded');
  expect(batch?.candidates[0]?.report?.usage?.costUsd).toBeCloseTo(0.02);
});

it('marks a run stopped by the token budget', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-budget-'));
  const cliEntry = fakeAgent(root);
  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  const started = await fetch(`${studio.url}/api/agent/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'budget fixture', candidates: 1, maxTokens: 100 }),
  });
  expect(started.status).toBe(202);

  let data = await getAgent(studio.url);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.batches[0]?.status === 'budget-exceeded') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const batch = data.batches[0];
  expect(batch?.status).toBe('budget-exceeded');
  expect(batch?.candidates[0]?.status).toBe('budget-exceeded');
  expect(batch?.candidates[0]?.events.some((event) => event.type === 'run/budget')).toBe(true);
  const deleted = await fetch(`${studio.url}/api/agent/batches/${batch?.id}`, {
    method: 'DELETE',
  });
  expect(deleted.status).toBe(200);
  data = await getAgent(studio.url);
  expect(data.batches.some((item) => item.id === batch?.id)).toBe(false);
  expect(existsSync(join(root, '.gamedream', 'studio', 'agent', batch?.id ?? ''))).toBe(false);
});

it('retries a terminal batch into a linked new generation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-retry-'));
  const cliEntry = fakeAgent(root);
  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  const started = await fetch(`${studio.url}/api/agent/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'retry fixture', candidates: 1, maxCostUsd: 0.01 }),
  });
  expect(started.status).toBe(202);
  let data = await getAgent(studio.url);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.batches[0]?.status === 'budget-exceeded') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const previous = data.batches[0];
  expect(previous?.status).toBe('budget-exceeded');
  const retried = await fetch(`${studio.url}/api/agent/batches/${previous?.id}/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  expect(retried.status).toBe(202);
  const payload = (await retried.json()) as {
    batch: { id: string; retryOf?: string; prompt: string; status: string };
  };
  expect(payload.batch.retryOf).toBe(previous?.id);
  expect(payload.batch.prompt).toBe('retry fixture');
  expect(payload.batch.id).not.toBe(previous?.id);
  data = await getAgent(studio.url);
  expect(data.batches.some((item) => item.id === previous?.id)).toBe(true);
  expect(data.batches.some((item) => item.id === payload.batch.id)).toBe(true);
});

it('queues batches, cancels a queued batch, and starts the next one', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-queue-'));
  const cliEntry = fakeAgent(root);
  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  const start = (prompt: string) => fetch(`${studio?.url}/api/agent/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, candidates: 1 }),
  });

  expect((await start('first queued fixture')).status).toBe(202);
  let data = await getAgent(studio.url);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.active?.status === 'awaiting-approval') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const first = data.active;
  expect(first?.status).toBe('awaiting-approval');

  expect((await start('second queued fixture')).status).toBe(202);
  data = await getAgent(studio.url);
  expect(data.active?.id).toBe(first?.id);
  expect(data.queued).toHaveLength(1);
  expect(data.queued?.[0]?.status).toBe('queued');
  const second = data.queued?.[0];

  await fetch(`${studio.url}/api/agent/batches/${second?.id}/cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  data = await getAgent(studio.url);
  expect(data.queued).toHaveLength(0);
  expect(data.active?.id).toBe(first?.id);

  expect((await start('third queued fixture')).status).toBe(202);
  data = await getAgent(studio.url);
  expect(data.queued).toHaveLength(1);
  const third = data.queued?.[0];

  await fetch(`${studio.url}/api/agent/batches/${first?.id}/cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.active?.id === third?.id && data.active.status === 'awaiting-approval') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(data.active?.id).toBe(third?.id);
  expect(data.active?.status).toBe('awaiting-approval');
  await fetch(
    `${studio.url}/api/agent/batches/${third?.id}/runs/${data.active?.candidates[0]?.id}/approval`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: 'approval-1', allowed: true }),
    },
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    data = await getAgent(studio.url);
    const batch = data.batches.find((item) => item.id === third?.id);
    if (batch?.status === 'finished') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(data.batches.find((item) => item.id === first?.id)?.status).toBe('canceled');
  expect(data.batches.find((item) => item.id === second?.id)?.status).toBe('canceled');
  expect(data.batches.find((item) => item.id === third?.id)?.status).toBe('finished');
}, 30_000);

it('reaps a persisted stale agent process after restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-reap-'));
  const runId = 'agent-stale-1';
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', runId], {
    stdio: 'ignore',
    windowsHide: true,
  });
  const pid = child.pid as number;
  const batchId = 'agent-stale';
  const batchRoot = join(root, '.gamedream', 'studio', 'agent', batchId);
  mkdirSync(batchRoot, { recursive: true });
  const eventsFile = join(batchRoot, 'events.jsonl');
  writeFileSync(eventsFile, '', 'utf8');
  const now = new Date().toISOString();
  writeFileSync(join(batchRoot, 'batch.json'), JSON.stringify({
    id: batchId,
    prompt: 'stale fixture',
    provider: 'fake',
    skill: 'survivor-demo',
    createdAt: now,
    status: 'running',
    candidates: [{
      id: runId,
      index: 1,
      count: 1,
      outDir: root,
      eventsFile,
      approvalDir: join(batchRoot, 'approvals'),
      startedAt: now,
      status: 'running',
      events: [],
      approvals: [],
      pid,
    }],
  }), 'utf8');
  const manager = new AgentManager({ root });
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        process.kill(pid, 0);
      } catch {
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    expect(() => process.kill(pid, 0)).toThrow();
    const persisted = JSON.parse(readFileSync(join(batchRoot, 'batch.json'), 'utf8')) as {
      candidates: Array<{ pid?: number }>;
    };
    expect(persisted.candidates[0]?.pid).toBeUndefined();
    expect(readFileSync(eventsFile, 'utf8')).toContain('run/reaped');
  } finally {
    manager.close();
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already reaped.
    }
  }
});

it('does not kill a reused pid whose command line does not match', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-reap-safe-'));
  const runId = 'agent-not-this-process';
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  const pid = child.pid as number;
  const batchId = 'agent-stale-other';
  const batchRoot = join(root, '.gamedream', 'studio', 'agent', batchId);
  mkdirSync(batchRoot, { recursive: true });
  const eventsFile = join(batchRoot, 'events.jsonl');
  writeFileSync(eventsFile, '', 'utf8');
  const now = new Date().toISOString();
  writeFileSync(join(batchRoot, 'batch.json'), JSON.stringify({
    id: batchId,
    prompt: 'safe fixture',
    provider: 'fake',
    skill: 'survivor-demo',
    createdAt: now,
    status: 'running',
    candidates: [{
      id: runId,
      index: 1,
      count: 1,
      outDir: root,
      eventsFile,
      approvalDir: join(batchRoot, 'approvals'),
      startedAt: now,
      status: 'running',
      events: [],
      approvals: [],
      pid,
    }],
  }), 'utf8');
  const manager = new AgentManager({ root });
  try {
    expect(() => process.kill(pid, 0)).not.toThrow();
    expect(readFileSync(eventsFile, 'utf8')).toContain('"verified":false');
  } finally {
    manager.close();
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already exited.
    }
  }
});

it('resumes an interrupted run after a Studio restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedream-studio-agent-resume-'));
  const cliEntry = fakeAgent(root);
  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  const started = await fetch(`${studio.url}/api/agent/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'resume fixture', candidates: 1 }),
  });
  expect(started.status).toBe(202);
  let data = await getAgent(studio.url);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.active?.status === 'awaiting-approval') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(data.active?.status).toBe('awaiting-approval');
  await studio.close();
  studio = undefined;

  studio = await startStudioServer({ projectDir: root, port: 0, cliEntry });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    data = await getAgent(studio.url);
    if (data.batches[0]?.status === 'finished') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(data.batches[0]?.status).toBe('finished');
  expect(data.batches[0]?.candidates[0]?.approvals.every((item) => item.status !== 'pending')).toBe(true);
  expect(data.batches[0]?.candidates[0]?.events.some((event) => event.type === 'run/end')).toBe(true);
  expect(data.batches[0]?.candidates[0]?.events.some((event) => event.type === 'approval/decision')).toBe(true);
});
