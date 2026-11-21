import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
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
let seq = Number(arg('event-seq-start', '0')) || 0;
const write = (event) => appendFileSync(eventsFile, JSON.stringify({ seq: ++seq, at: new Date().toISOString(), runId, ...event }) + '\\n', 'utf8');
write({ type: 'run/start', prompt: 'fixture' });
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
    id: string; status: string; score?: number; approvals: Array<{ id: string; status: string }>;
    events: Array<{ type: string }>;
  }> };
  batches: Array<{ id: string; status: string; candidates: Array<{ id: string; status: string; score?: number; approvals: Array<{ id: string; status: string }>; events: Array<{ type: string }> }> }>;
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
  const apply = await fetch(`${studio.url}/api/agent/batches/${batch?.id}/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId: selected?.id }),
  });
  expect(apply.status).toBe(200);
  expect(readFileSync(join(root, 'game', 'fixture.txt'), 'utf8')).toBe('fixture');
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
