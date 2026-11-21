#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startStudioServer } from '../packages/studio/dist/index.js';

const root = mkdtempSync(join(tmpdir(), 'gamedream-agent-smoke-'));
const cliEntry = resolve('packages/cli/dist/index.js');
const studio = await startStudioServer({
  projectDir: root,
  port: 0,
  cliEntry,
  comfyui: { url: 'http://127.0.0.1:1', workflow: resolve('missing-workflow.json') },
});

function eventTypes(run) {
  return [...new Set((run?.events ?? []).map((event) => event.type))].sort();
}

async function readBatch(batchId) {
  const response = await fetch(`${studio.url}/api/agent`);
  const body = await response.json();
  const batch = (body.batches ?? []).find((entry) => entry.id === batchId);
  if (!batch) throw new Error(`batch disappeared: ${batchId}`);
  return batch;
}

async function waitFor(batchId, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let batch;
  while (Date.now() < deadline) {
    batch = await readBatch(batchId);
    if (predicate(batch)) return batch;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`timed out waiting for agent batch ${batchId}; last status ${batch?.status}`);
}

try {
  const started = await fetch(`${studio.url}/api/agent/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Build a playable survivor slice',
      provider: 'fake',
      candidates: 1,
    }),
  });
  const startBody = await started.json();
  if (started.status !== 202 || !startBody.batch?.id) {
    throw new Error(`agent start failed ${started.status}: ${JSON.stringify(startBody)}`);
  }
  const batchId = startBody.batch.id;
  const runId = startBody.batch.candidates[0].id;
  console.log(`AGENT_BATCH=${batchId}`);
  console.log(`AGENT_RUN=${runId}`);

  const awaiting = await waitFor(
    batchId,
    (batch) => batch.status === 'awaiting-approval' || batch.status === 'failed',
    60_000,
  );
  console.log(`AGENT_APPROVAL_STATUS=${awaiting.status}`);
  const pending = awaiting.candidates[0].approvals.find((entry) => entry.status === 'pending');
  console.log(`AGENT_TOOL_COUNT=${awaiting.candidates[0].events.filter((event) => event.type === 'tool/start').length}`);
  console.log(`AGENT_EVENT_TYPES=${eventTypes(awaiting.candidates[0]).join(',')}`);
  if (awaiting.status !== 'awaiting-approval' || !pending) {
    throw new Error(`expected a pending approval, got ${awaiting.status}`);
  }
  console.log(`AGENT_APPROVAL_TOOL=${pending.tool}`);

  const decided = await fetch(
    `${studio.url}/api/agent/batches/${batchId}/runs/${runId}/approval`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: pending.id, allowed: true }),
    },
  );
  if (!decided.ok) throw new Error(`approval request failed ${decided.status}`);

  const finished = await waitFor(
    batchId,
    (batch) => batch.status === 'finished' || batch.status === 'failed',
    120_000,
  );
  const run = finished.candidates[0];
  const types = eventTypes(run);
  console.log(`AGENT_FINAL_STATUS=${finished.status}`);
  console.log(`AGENT_REPORT_FINISHED=${run.report?.finished === true}`);
  console.log(`AGENT_REPORT_STEPS=${run.report?.steps ?? 0}`);
  console.log(`AGENT_SCORE=${run.score ?? ''}`);
  console.log(`AGENT_FINAL_EVENT_TYPES=${types.join(',')}`);

  const required = [
    'run/start',
    'session/event',
    'tool/start',
    'approval/request',
    'approval/decision',
    'tool/end',
    'run/end',
  ];
  const missing = required.filter((type) => !types.includes(type));
  if (missing.length > 0) throw new Error(`missing events: ${missing.join(', ')}`);
  console.log('AGENT_APPROVAL_FLOW_OK=1');
  console.log('AGENT_SMOKE_EXIT=0');
} catch (error) {
  console.error(`AGENT_SMOKE_ERROR=${error.message}`);
  process.exitCode = 1;
} finally {
  await studio.close();
  rmSync(root, { recursive: true, force: true });
}
