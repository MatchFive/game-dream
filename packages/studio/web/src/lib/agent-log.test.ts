import { describe, expect, it } from 'vitest';
import { agentLogEntries, agentLogLines, agentStatusText } from './agent-log';
import type { AssetAgentRun } from '../api/types';

const t = (key: string) => key;

function run(events: AssetAgentRun['events'], extra: Partial<AssetAgentRun> = {}): AssetAgentRun {
  return {
    id: 'run-1',
    prompt: 'slimes',
    status: 'running',
    createdAt: '2026-11-27T00:00:00.000Z',
    events,
    ...extra,
  };
}

describe('asset agent log rendering', () => {
  it('renders tool starts and results with outcome markers', () => {
    const lines = agentLogLines(
      run([
        { seq: 1, at: '', type: 'tool/start', tool: 'workflow.list' },
        { seq: 2, at: '', type: 'tool/end', tool: 'workflow.list', ok: true, output: 'qwen\n' },
        { seq: 3, at: '', type: 'tool/end', tool: 'image.generate', ok: false, error: 'boom' },
      ]),
      t,
    );
    expect(lines).toEqual(['→ workflow.list', '✓ workflow.list qwen', '✗ image.generate']);
  });

  it('collapses whitespace and truncates long tool output', () => {
    const noisy = 'line one\n\n   line two\t\tend';
    expect(
      agentLogLines(run([{ seq: 1, at: '', type: 'tool/end', tool: 'scan', ok: true, output: noisy }]), t)[0],
    ).toBe('✓ scan line one line two end');

    const huge = 'x'.repeat(1200);
    const line = agentLogLines(run([{ seq: 1, at: '', type: 'tool/end', tool: 'scan', ok: true, output: huge }]), t)[0];
    expect(line.length).toBeLessThan(720);
  });

  it('keeps assistant chunks verbatim', () => {
    const entries = agentLogEntries(run([{ seq: 1, at: '', type: 'assistant/chunk', output: 'thinking' }]), t);
    expect(entries).toEqual([{ kind: 'assistant', text: 'thinking' }]);
  });

  it('separates success and failure results', () => {
    const ok = agentLogEntries(run([{ seq: 1, at: '', type: 'asset/end', ok: true }]), t);
    expect(ok).toEqual([{ kind: 'result', ok: true, text: 'assets.agentFinished' }]);

    const failed = agentLogEntries(
      run([{ seq: 1, at: '', type: 'asset/end', ok: false, error: 'comfy down' }]),
      t,
    );
    expect(failed[0].text).toBe('assets.agentFailed: comfy down');
  });

  it('ignores unknown event types instead of printing empty lines', () => {
    expect(agentLogLines(run([{ seq: 1, at: '', type: 'mystery' }]), t)).toEqual([]);
  });

  it('returns an empty log for a missing run', () => {
    expect(agentLogLines(undefined, t)).toEqual([]);
    expect(agentLogEntries(undefined, t)).toEqual([]);
  });
});

describe('asset agent status line', () => {
  it('covers every run status', () => {
    expect(agentStatusText(undefined, t)).toBe('assets.agentEmpty');
    expect(agentStatusText(run([], { status: 'running' }), t)).toBe('assets.agentRunning');
    expect(agentStatusText(run([], { status: 'finished' }), t)).toBe('assets.agentFinished');
    expect(agentStatusText(run([], { status: 'canceled' }), t)).toBe('assets.agentStopped');
  });

  it('attaches the failure reason when the run errors', () => {
    expect(agentStatusText(run([], { status: 'failed', error: 'no model' }), t)).toBe(
      'assets.agentFailed: no model',
    );
    expect(agentStatusText(run([], { status: 'failed' }), t)).toBe('assets.agentFailed');
  });
});
