import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import type { AgentBatch, AgentDiff, AgentRun } from '@gamedream/studio';
import type { AgentEvent, AgentSnapshots, PolicyPayload } from '../api/types';
import { Icon } from './Sprite';
import { useToast } from './Toast';

interface AgentPanelProps {
  snapshot?: AgentSnapshots;
  connected: boolean;
  onChanged: () => void;
}

const MODES = ['allow', 'ask', 'deny'] as const;

function statusKey(status: string | undefined): string {
  switch (status) {
    case 'running':
      return 'studio.agentRunning';
    case 'awaiting-approval':
      return 'studio.agentAwaiting';
    case 'queued':
      return 'studio.agentQueued';
    case 'finished':
      return 'studio.agentFinished';
    case 'failed':
      return 'studio.agentFailed';
    case 'budget-exceeded':
      return 'studio.agentBudgetExceeded';
    case 'canceled':
      return 'studio.agentCanceled';
    default:
      return 'studio.agentIdle';
  }
}

function bestRun(batch: AgentBatch | undefined): AgentRun | undefined {
  if (!batch) return undefined;
  if (batch.selectedRunId) {
    const selected = batch.candidates.find((run) => run.id === batch.selectedRunId);
    if (selected) return selected;
  }
  return [...batch.candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
}

function eventText(event: AgentEvent, t: (key: string, vars?: Record<string, string | number>) => string): string | null {
  switch (event.type) {
    case 'run/start':
      return t('studio.agentStarting');
    case 'tool/start':
      return t('studio.agentToolStart', { tool: String(event.tool ?? '') });
    case 'tool/end':
      return t('studio.agentToolEnd', {
        tool: String(event.tool ?? ''),
        status: event.ok === false ? '✕' : '✓',
      });
    case 'run/error':
      return `${t('studio.agentRunError')}: ${String(event.error ?? '')}`;
    default:
      return null;
  }
}

export function AgentPanel({ snapshot, connected, onChanged }: AgentPanelProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [selectedBatchId, setSelectedBatchId] = useState<string>();
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [showPolicy, setShowPolicy] = useState(false);
  const [policy, setPolicy] = useState<PolicyPayload>();
  const [diff, setDiff] = useState<AgentDiff>();
  const [busy, setBusy] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [candidates, setCandidates] = useState(1);
  const [maxSteps, setMaxSteps] = useState(12);
  const [maxTokens, setMaxTokens] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [resume, setResume] = useState(false);

  const batches = snapshot?.batches ?? [];
  const batch =
    batches.find((item) => item.id === selectedBatchId) ?? snapshot?.active ?? batches[0];
  const run = batch?.candidates.find((item) => item.id === selectedRunId) ?? bestRun(batch);
  const pending = run?.approvals.find((approval) => approval.status === 'pending');
  const queued = snapshot?.queued ?? [];

  useEffect(() => {
    if (!showPolicy || policy) return;
    void api
      .policy()
      .then(setPolicy)
      .catch((error: Error) => toast.push(error.message, 'error'));
  }, [showPolicy, policy, toast]);

  const messages = useMemo(() => {
    const items: Array<{ key: string; kind: 'user' | 'assistant' | 'meta' | 'error'; text: string }> = [];
    for (const event of run?.events ?? []) {
      if (event.type === 'session/event') {
        const inner = event.event as { type?: string; content?: string } | undefined;
        if (inner?.type === 'assistant/message' && inner.content) {
          items.push({ key: `${run?.id}-${event.seq}`, kind: 'assistant', text: inner.content });
        }
        continue;
      }
      const text = eventText(event, t);
      if (text) {
        items.push({
          key: `${run?.id}-${event.seq}`,
          kind: event.type === 'run/error' ? 'error' : 'meta',
          text,
        });
      }
    }
    return items;
  }, [run, t]);

  async function runAction(action: () => Promise<unknown>, errorKey?: string) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (error) {
      toast.push(errorKey ? t(errorKey) : (error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    const text = prompt.trim();
    if (!text) {
      toast.push(t('studio.agentPromptPlaceholder'), 'error');
      return;
    }
    await runAction(async () => {
      await api.startAgent({
        prompt: text,
        candidates,
        maxSteps,
        maxTokens: maxTokens ? Number(maxTokens) : undefined,
        maxCostUsd: maxCost ? Number(maxCost) : undefined,
        resume,
      });
      setPrompt('');
      toast.push(t('studio.agentStarted'));
    }, 'studio.agentStartFailed');
  }

  async function loadDiff(batchId: string, runId: string) {
    await runAction(async () => {
      const result = await api.candidateDiff(batchId, runId);
      setDiff(result.diff as AgentDiff);
    });
  }

  return (
    <section className="studio-agent agent-shell" aria-label={t('studio.agent')}>
      <div className="studio-agent-head">
        <span className="eyebrow">{t('studio.agent')}</span>
        <div className="studio-agent-head-actions">
          <span className={`studio-agent-state ${run?.status ?? 'idle'}`}>
            {connected ? '' : '⚠ '}
            {t(statusKey(run?.status ?? batch?.status))}
          </span>
          <button
            className="studio-agent-policy-toggle"
            type="button"
            onClick={() => setShowPolicy((value) => !value)}
            aria-expanded={showPolicy}
          >
            {t('studio.agentPolicy')}
          </button>
        </div>
      </div>

      {showPolicy && (
        <div className="studio-agent-policy">
          {policy ? (
            <>
              <div className="studio-agent-policy-source">
                {t('studio.agentPolicySource')}: {policy.source}
              </div>
              <div className="studio-agent-policy-row">
                <span>{t('studio.agentPolicyDefault')}</span>
                <select
                  value={policy.policy.default ?? 'ask'}
                  onChange={(event) =>
                    void runAction(async () => {
                      setPolicy(await api.savePolicyDefault(event.target.value as 'allow'));
                    }, 'studio.agentPolicyFailed')
                  }
                >
                  {MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`studio.agentPolicy${mode[0].toUpperCase()}${mode.slice(1)}`)}
                    </option>
                  ))}
                </select>
              </div>
              {policy.availableTools.map((tool) => (
                <div className="studio-agent-policy-row" key={tool}>
                  <span>{tool}</span>
                  <select
                    value={policy.policy.tools?.[tool] ?? 'inherit'}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === 'inherit') return;
                      void runAction(async () => {
                        setPolicy(await api.savePolicyTool(tool, value as 'allow'));
                      }, 'studio.agentPolicyFailed');
                    }}
                  >
                    <option value="inherit">—</option>
                    {MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`studio.agentPolicy${mode[0].toUpperCase()}${mode.slice(1)}`)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {(policy.policy.rules?.length ?? 0) > 0 && (
                <>
                  <div className="studio-agent-policy-rule-head">{t('studio.agentPolicyRules')}</div>
                  {policy.policy.rules?.map((rule, index) => (
                    <div className="studio-agent-policy-rule" key={`${rule.tool}-${index}`}>
                      <code>
                        {rule.tool}
                        {rule.arg ? ` ${rule.arg}=${rule.prefix ?? ''}` : ''}
                      </code>
                      <span>{rule.mode}</span>
                      <button
                        type="button"
                        aria-label={t('studio.agentPolicyRuleDelete')}
                        onClick={() =>
                          void runAction(async () => {
                            setPolicy(await api.deletePolicyRule(index));
                          }, 'studio.agentPolicyFailed')
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </>
              )}
              <div className="studio-agent-policy-note">{t('studio.agentPolicyNote')}</div>
            </>
          ) : (
            <div className="studio-agent-policy-note">{t('common.loading')}…</div>
          )}
        </div>
      )}

      {batches.length > 1 && (
        <div className="studio-agent-history">
          {batches.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-selected={item.id === batch?.id}
              onClick={() => {
                setSelectedBatchId(item.id);
                setSelectedRunId(undefined);
                setDiff(undefined);
              }}
            >
              {item.candidates[0]?.report?.outDir?.split(/[\\/]/).pop() ?? item.id.slice(0, 6)}
            </button>
          ))}
          <button
            className="studio-history-clear"
            type="button"
            onClick={() => void runAction(() => api.clearBatches(), 'studio.agentHistoryCleared')}
          >
            {t('studio.agentClearHistory')}
          </button>
        </div>
      )}

      {queued.length > 0 && (
        <div className="studio-agent-queue">
          {queued.map((item, index) => (
            <div className="studio-agent-queue-row" key={item.id}>
              <span>
                {index + 1}. {t('studio.agentQueued')}
              </span>
              <button
                type="button"
                onClick={() => void runAction(() => api.cancelBatch(item.id), 'studio.agentCancelFailed')}
              >
                {t('studio.agentCancelQueued')}
              </button>
            </div>
          ))}
        </div>
      )}

      {(batch?.candidates.length ?? 0) > 1 && (
        <div className="studio-agent-candidates">
          {batch?.candidates.map((candidate) => (
            <button
              className="studio-candidate"
              key={candidate.id}
              type="button"
              aria-selected={candidate.id === run?.id}
              onClick={() => {
                setSelectedRunId(candidate.id);
                setDiff(undefined);
              }}
            >
              <strong>
                {batch.candidates.indexOf(candidate) + 1} · {t('studio.agentScore')} {candidate.score ?? 0}
              </strong>
              <span>{candidate.status}</span>
            </button>
          ))}
          <div className="studio-agent-candidate-actions">
            <button
              className="button secondary"
              type="button"
              disabled={!run || !batch || run.status !== 'finished'}
              onClick={() =>
                batch && run && void runAction(() => api.applyCandidate(batch.id, run.id), 'studio.agentApplyFailed')
              }
            >
              {t('studio.agentApply')}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!batch}
              onClick={() => batch && void runAction(() => api.rollbackBatch(batch.id), 'studio.agentRollbackFailed')}
            >
              {t('studio.agentRollback')}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!batch || !run}
              onClick={() => batch && run && void loadDiff(batch.id, run.id)}
            >
              {t('studio.agentDiff')}
            </button>
          </div>
        </div>
      )}

      {diff && (
        <div className="studio-agent-diff">
          <div className="studio-agent-diff-head">
            <span>{t('studio.agentDiff')}</span>
            <button className="icon-btn" type="button" onClick={() => setDiff(undefined)} aria-label={t('common.close')}>
              <Icon name="x" />
            </button>
          </div>
          <div className="studio-agent-diff-counts">
            <span className="added">+{diff.counts.added}</span>
            <span className="modified">~{diff.counts.modified}</span>
            <span>= {diff.counts.unchanged}</span>
          </div>
          <div className="studio-agent-diff-list">
            {diff.files.length === 0 && <div className="studio-agent-diff-empty">{t('studio.agentDiffEmpty')}</div>}
            {diff.files.slice(0, 40).map((file) => (
              <div className={`studio-agent-diff-row ${file.status}`} key={file.path}>
                <span>{file.status === 'added' ? '+' : file.status === 'modified' ? '~' : '='}</span>
                <code>{file.path}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="studio-agent-thread">
        {messages.length === 0 ? (
          <div className="studio-agent-empty">{t('studio.agentNoSession')}</div>
        ) : (
          messages.map((item) =>
            item.kind === 'assistant' ? (
              <div className="studio-agent-msg assistant" key={item.key}>
                {item.text}
              </div>
            ) : item.kind === 'error' ? (
              <div className="studio-agent-msg" key={item.key} style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}>
                {item.text}
              </div>
            ) : (
              <div className="studio-agent-step" key={item.key}>
                {item.text}
              </div>
            ),
          )
        )}
      </div>

      {pending && batch && run && (
        <div className="studio-approval">
          <div className="studio-approval-head">
            <span>{t('studio.agentApproval')}</span>
            <strong>{pending.tool}</strong>
          </div>
          <pre>{JSON.stringify(pending.args, null, 2)}</pre>
          <div className="studio-approval-actions">
            <button
              className="button primary"
              type="button"
              disabled={busy}
              onClick={() => void runAction(() => api.approve(batch.id, run.id, pending.id, true), 'studio.agentApprovalFailed')}
            >
              {t('studio.agentAllow')}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => void runAction(() => api.approve(batch.id, run.id, pending.id, true), 'studio.agentApprovalFailed')}
            >
              {t('studio.agentAllowAlways')}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => void runAction(() => api.approve(batch.id, run.id, pending.id, false), 'studio.agentApprovalFailed')}
            >
              {t('studio.agentDeny')}
            </button>
          </div>
        </div>
      )}

      <div className="studio-agent-compose">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('studio.agentPromptPlaceholder')}
          aria-label={t('studio.agentPrompt')}
          rows={2}
        />
        <div className="studio-agent-options">
          <label className="studio-check">
            <input type="checkbox" checked={resume} onChange={(event) => setResume(event.target.checked)} />{' '}
            <span>{t('studio.agentResume')}</span>
          </label>
          <label className="studio-agent-count">
            <span>{t('studio.agentCandidates')}</span>
            <select value={candidates} onChange={(event) => setCandidates(Number(event.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className="studio-agent-count">
            <span>{t('studio.agentMaxSteps')}</span>
            <input
              type="number"
              min={1}
              max={48}
              value={maxSteps}
              onChange={(event) => setMaxSteps(Number(event.target.value))}
            />
          </label>
          <label className="studio-agent-count">
            <span>{t('studio.agentTokenBudget')}</span>
            <input
              type="number"
              min={0}
              step={1000}
              placeholder="∞"
              value={maxTokens}
              onChange={(event) => setMaxTokens(event.target.value)}
            />
          </label>
          <label className="studio-agent-count">
            <span>{t('studio.agentCostBudget')}</span>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="∞"
              value={maxCost}
              onChange={(event) => setMaxCost(event.target.value)}
            />
          </label>
          {run?.status === 'running' || run?.status === 'awaiting-approval' ? (
            <button
              className="button secondary"
              type="button"
              disabled={busy || !batch}
              onClick={() => batch && void runAction(() => api.cancelBatch(batch.id))}
            >
              {t('studio.agentStop')}
            </button>
          ) : (
            <button className="button primary" type="button" disabled={busy} onClick={() => void start()}>
              <Icon name="play" /> {t('studio.agentStart')}
            </button>
          )}
        </div>
        <div className="studio-agent-foot">
          <span>
            {batch?.candidates.length ?? 0} / {t('studio.agentCandidates')}
            {run?.report?.usage?.costUsd !== undefined ? ` · $${run.report.usage.costUsd.toFixed(3)}` : ''}
          </span>
          {run && (run.status === 'failed' || run.status === 'canceled' || run.status === 'budget-exceeded') && batch && (
            <button
              className="button secondary"
              type="button"
              onClick={() => void runAction(() => api.retryBatch(batch.id), 'studio.agentRetryStarted')}
            >
              {t('studio.agentRetry')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
