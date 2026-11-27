// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentBatch, AgentSnapshots } from '../api/types';

const approve = vi.fn();
const savePolicyTool = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    approve: (...args: unknown[]) => approve(...args),
    savePolicyTool: (...args: unknown[]) => savePolicyTool(...args),
    startAgent: vi.fn(),
    clearBatches: vi.fn(),
    cancelBatch: vi.fn(),
    applyCandidate: vi.fn(),
    rollbackBatch: vi.fn(),
    candidateDiff: vi.fn(),
    policy: vi.fn(),
  },
}));

const { AgentPanel } = await import('./AgentPanel');
const { I18nProvider } = await import('../i18n');
const { ToastProvider } = await import('./Toast');

function batchWithApproval(): AgentBatch {
  return {
    id: 'batch-1',
    prompt: 'build the survivor slice',
    provider: 'fake',
    skill: 'survivor-demo',
    createdAt: '2026-11-27T00:00:00.000Z',
    status: 'running',
    candidates: [
      {
        id: 'run-1',
        index: 0,
        count: 1,
        outDir: 'dist/out',
        eventsFile: 'events.jsonl',
        approvalDir: 'approvals',
        startedAt: '2026-11-27T00:00:00.000Z',
        status: 'waiting',
        events: [],
        approvals: [
          {
            id: 'approval-1',
            tool: 'write_file',
            args: { path: 'game/player.gd' },
            createdAt: '2026-11-27T00:00:01.000Z',
            status: 'pending',
          },
        ],
      },
    ],
  } as unknown as AgentBatch;
}

function snapshot(batch: AgentBatch): AgentSnapshots {
  return { active: batch, queued: [], batches: [batch] } as unknown as AgentSnapshots;
}

function renderPanel(batch = batchWithApproval()) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <AgentPanel snapshot={snapshot(batch)} connected onChanged={() => undefined} />
      </ToastProvider>
    </I18nProvider>,
  );
}

// 没有开启 vitest globals 时 RTL 不会自动清理，多个用例的 DOM 会叠加
afterEach(cleanup);

beforeEach(() => {
  approve.mockReset().mockResolvedValue({ id: 'approval-1', status: 'allowed' });
  savePolicyTool.mockReset().mockResolvedValue({ source: 'project', policy: { tools: {} } });
});

describe('agent approval panel', () => {
  it('shows the pending tool and its arguments', () => {
    renderPanel();
    expect(screen.getByText('write_file')).toBeTruthy();
    expect(screen.getByText(/game\/player\.gd/)).toBeTruthy();
  });

  it('approves a single call with the pending ids', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^允许$/ }));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect(approve).toHaveBeenCalledWith('batch-1', 'run-1', 'approval-1', true);
    expect(savePolicyTool).not.toHaveBeenCalled();
  });

  it('remembers the tool when the user chooses always allow', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^始终允许$/ }));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    // "始终允许" 必须落一条 allow 规则，而不只是这一次批准
    expect(savePolicyTool).toHaveBeenCalledWith('write_file', 'allow');
    expect(approve).toHaveBeenCalledWith('batch-1', 'run-1', 'approval-1', true);
  });

  it('denies with allowed=false', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^拒绝$/ }));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect(approve).toHaveBeenCalledWith('batch-1', 'run-1', 'approval-1', false);
  });
});
