const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
import { t, initLocale, applyStatic, formatDate, locale } from '/i18n.js?v=9';

const state = {
  snapshot: null,
  selectedRunId: null,
  view: 'build',
  right: 'runs',
  verifying: false,
  agent: null,
  agentQueue: [],
  agentHistory: [],
  agentBatchId: null,
  agentRunId: null,
  agentPoll: null,
  agentSource: null,
  agentStreamOpened: false,
  agentLastStatus: null,
  agentDiff: null,
  agentPolicy: null,
  agentPolicyTools: [],
  agentPolicyOpen: false,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => el.classList.remove('show'), 3000);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function selectedRun() {
  if (!state.snapshot) return undefined;
  return state.snapshot.build.runs.find((run) => run.id === state.selectedRunId)
    ?? state.snapshot.build.latestRun;
}

function gateNames(run) {
  if (!run) return ['G1', 'G2', 'G3'];
  return Object.keys(run.gates);
}

function gateCounts(run) {
  const gates = run?.gates ?? {};
  const names = gateNames(run);
  return {
    passed: names.filter((name) => gates[name]?.status === 'pass').length,
    total: names.length,
    failed: names.filter((name) => gates[name]?.status === 'fail').length,
  };
}

function translateGateMessage(message) {
  if (locale !== 'zh' || !message) return message;
  if (message.includes('Godot 4.4+ not found')) {
    return '未找到 Godot 4.4+。请设置 GODOT_BIN 为 console 可执行文件，或把 godot 加入 PATH。';
  }
  if (message.includes('modules.lock.json')) return '缺少 modules.lock.json：当前目录还不是完整的生成项目。';
  if (message.startsWith('missing ')) return `缺少验收标记：${message.slice(8)}`;
  if (message.startsWith('exit ')) return `进程退出码：${message.slice(5)}`;
  if (message.includes('timed out')) return '运行超时。';
  return message;
}

function shortRoot(root) {
  const parts = String(root).split(/[\\/]/);
  return parts.slice(-2).join('/');
}

function formatWhen(value) {
  return formatDate(value);
}

function agentStatusLabel(status) {
  return t(`studio.agent${
    status === 'running' ? 'Running'
      : status === 'awaiting-approval' ? 'Awaiting'
        : status === 'queued' ? 'Queued'
          : status === 'budget-exceeded' ? 'BudgetExceeded'
            : status === 'finished' ? 'Finished'
              : status === 'failed' ? 'Failed'
                : status === 'canceled' ? 'Canceled'
                  : 'Idle'
  }`);
}

function selectedAgentRun() {
  return state.agent?.candidates?.find((run) => run.id === state.agentRunId)
    ?? state.agent?.candidates?.[0];
}

function pendingApproval(run) {
  return run?.approvals?.find((approval) => approval.status === 'pending');
}

function agentUsageText(report) {
  const usage = report?.usage;
  if (!usage || !usage.calls) return '';
  const tokens = (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
  const cache = usage.promptTokens
    ? Math.round(((usage.cachedTokens ?? 0) / usage.promptTokens) * 100)
    : 0;
  const text = t('studio.agentUsage', {
    calls: usage.calls,
    tokens,
    cache,
  });
  return usage.costUsd === undefined
    ? text
    : `${text} · ${t('studio.agentCost', { cost: usage.costUsd.toFixed(6) })}`;
}

function agentEventDetails(summary, body) {
  return `<details class="studio-agent-tool"><summary>${summary}</summary><pre>${body}</pre></details>`;
}

function agentPolicyModeLabel(mode) {
  return t(
    mode === 'ask'
      ? 'studio.agentPolicyAsk'
      : mode === 'deny' ? 'studio.agentPolicyDeny' : 'studio.agentPolicyAllow',
  );
}

function agentPolicyOptions(selected) {
  return ['allow', 'ask', 'deny'].map((mode) => (
    `<option value="${mode}"${mode === selected ? ' selected' : ''}>${agentPolicyModeLabel(mode)}</option>`
  )).join('');
}

async function loadAgentPolicy(force = false) {
  if (state.agentPolicy && !force) {
    renderAgentPolicy();
    return;
  }
  try {
    const data = await request('/api/agent/policy');
    state.agentPolicy = data.policy ?? {};
    state.agentPolicyTools = data.availableTools ?? [];
    state.agentPolicySource = data.source ?? '.gamedream/studio/agent-policy.json';
    renderAgentPolicy();
  } catch (error) {
    toast(t('studio.agentPolicyFailed', { message: error.message }));
  }
}

function renderAgentPolicy() {
  const panel = $('#agentPolicyPanel');
  const toggle = $('#agentPolicyToggle');
  toggle.setAttribute('aria-expanded', String(state.agentPolicyOpen));
  if (!state.agentPolicyOpen) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const policy = state.agentPolicy ?? {};
  const tools = [...new Set([
    ...(state.agentPolicyTools ?? []),
    ...Object.keys(policy.tools ?? {}),
  ])].sort();
  const defaultMode = policy.default ?? 'allow';
  const rules = Array.isArray(policy.rules) ? policy.rules : [];
  panel.innerHTML = `
    <div class="studio-agent-policy-source">${escapeHtml(
      t('studio.agentPolicySource', { path: state.agentPolicySource ?? '.gamedream/studio/agent-policy.json' }),
    )}</div>
    <div class="studio-agent-policy-row">
      <span>${escapeHtml(t('studio.agentPolicyDefault'))}</span>
      <select data-agent-policy-default aria-label="${escapeHtml(t('studio.agentPolicyDefault'))}">${agentPolicyOptions(defaultMode)}</select>
    </div>
    ${tools.map((tool) => `
      <div class="studio-agent-policy-row">
        <span>${escapeHtml(tool)}</span>
        <select data-agent-policy-tool="${escapeHtml(tool)}" aria-label="${escapeHtml(tool)}">${agentPolicyOptions(policy.tools?.[tool] ?? defaultMode)}</select>
      </div>
    `).join('')}
    <div class="studio-agent-policy-note">${escapeHtml(t('studio.agentPolicyNote'))}</div>
    <div class="studio-agent-policy-rule-head">${escapeHtml(t('studio.agentPolicyRules'))}</div>
    ${rules.map((rule, index) => `
      <div class="studio-agent-policy-rule">
        <code>${escapeHtml(rule.tool)}${rule.arg ? ` · ${escapeHtml(rule.arg)}${rule.prefix ? ` → ${escapeHtml(rule.prefix)}` : ''}` : ''}</code>
        <span>${escapeHtml(agentPolicyModeLabel(rule.mode))}</span>
        <button type="button" data-policy-rule-delete="${index}" aria-label="${escapeHtml(t('studio.agentPolicyRuleDelete'))}">×</button>
      </div>
    `).join('')}
    <div class="studio-agent-policy-rule-form">
      <select data-policy-rule-tool aria-label="${escapeHtml(t('studio.agentPolicyRuleTool'))}">
        ${tools.map((tool) => `<option value="${escapeHtml(tool)}">${escapeHtml(tool)}</option>`).join('')}
      </select>
      <input data-policy-rule-arg placeholder="${escapeHtml(t('studio.agentPolicyRuleArg'))}" aria-label="${escapeHtml(t('studio.agentPolicyRuleArg'))}">
      <input data-policy-rule-prefix placeholder="${escapeHtml(t('studio.agentPolicyRulePrefix'))}" aria-label="${escapeHtml(t('studio.agentPolicyRulePrefix'))}">
      <select data-policy-rule-mode aria-label="${escapeHtml(t('studio.agentPolicyRuleMode'))}">${agentPolicyOptions('ask')}</select>
      <button class="button secondary" type="button" data-policy-rule-add>${escapeHtml(t('studio.agentPolicyRuleAdd'))}</button>
    </div>
  `;
  $('[data-agent-policy-default]', panel)?.addEventListener('change', (event) => {
    saveAgentPolicy('', event.target.value, true);
  });
  $$('[data-agent-policy-tool]', panel).forEach((select) => {
    select.addEventListener('change', () => {
      saveAgentPolicy(select.dataset.agentPolicyTool, select.value, false);
    });
  });
  $$('[data-policy-rule-delete]', panel).forEach((button) => {
    button.addEventListener('click', () => deleteAgentPolicyRule(Number(button.dataset.policyRuleDelete)));
  });
  $('[data-policy-rule-add]', panel)?.addEventListener('click', () => {
    const tool = $('[data-policy-rule-tool]', panel)?.value;
    const arg = $('[data-policy-rule-arg]', panel)?.value;
    const prefix = $('[data-policy-rule-prefix]', panel)?.value;
    const mode = $('[data-policy-rule-mode]', panel)?.value;
    saveAgentPolicyRule({ tool, arg, prefix, mode });
  });
}

async function toggleAgentPolicy() {
  state.agentPolicyOpen = !state.agentPolicyOpen;
  if (!state.agentPolicyOpen) {
    renderAgentPolicy();
    return;
  }
  await loadAgentPolicy();
}

async function saveAgentPolicy(tool, mode, isDefault) {
  try {
    const data = await request('/api/agent/policy', {
      method: 'POST',
      body: JSON.stringify(isDefault ? { default: true, mode } : { tool, mode }),
    });
    state.agentPolicy = data.policy ?? state.agentPolicy;
    state.agentPolicyTools = data.availableTools ?? state.agentPolicyTools;
    renderAgentPolicy();
    toast(t('studio.agentPolicySaved'));
  } catch (error) {
    toast(t('studio.agentPolicyFailed', { message: error.message }));
    await loadAgentPolicy(true);
  }
}

async function saveAgentPolicyRule({ tool, arg, prefix, mode }) {
  if (!tool) return;
  try {
    const data = await request('/api/agent/policy/rules', {
      method: 'POST',
      body: JSON.stringify({
        tool,
        mode: mode || 'ask',
        arg: arg?.trim() || undefined,
        prefix: prefix || undefined,
      }),
    });
    state.agentPolicy = data.policy ?? state.agentPolicy;
    state.agentPolicyTools = data.availableTools ?? state.agentPolicyTools;
    renderAgentPolicy();
    toast(t('studio.agentPolicyRuleSaved'));
  } catch (error) {
    toast(t('studio.agentPolicyFailed', { message: error.message }));
  }
}

async function deleteAgentPolicyRule(index) {
  try {
    const data = await request(`/api/agent/policy/rules/${index}`, { method: 'DELETE' });
    state.agentPolicy = data.policy ?? state.agentPolicy;
    renderAgentPolicy();
    toast(t('studio.agentPolicyRuleSaved'));
  } catch (error) {
    toast(t('studio.agentPolicyFailed', { message: error.message }));
  }
}

function agentThreadMarkup(run) {
  if (!run?.events?.length) {
    return `<div class="studio-agent-empty">${t(
      run?.status === 'running'
        ? 'studio.agentStarting'
        : run?.status === 'queued' ? 'studio.agentQueuedHint' : 'studio.agentEmpty',
    )}</div>`;
  }
  const items = [];
  let streamed = '';
  let lastStreamed = '';
  for (const event of run.events.slice(-260)) {
    if (event.type === 'assistant/chunk') {
      streamed += String(event.text ?? '');
      continue;
    }
    if (streamed) {
      lastStreamed = streamed;
      items.push(`<div class="studio-agent-msg assistant">${escapeHtml(streamed)}</div>`);
      streamed = '';
    }
    if (event.type === 'run/start') {
      items.push(`<div class="studio-agent-msg user">${escapeHtml(event.prompt ?? '')}</div>`);
      continue;
    }
    if (event.type === 'run/error') {
      items.push(`<div class="studio-agent-msg assistant" style="border-color:rgba(255,138,106,.45)">${escapeHtml(t('studio.agentRunError', { error: String(event.error ?? '') }))}</div>`);
      continue;
    }
    if (event.type === 'run/canceled') {
      items.push(`<div class="studio-agent-progress">${t('studio.agentCanceled')}</div>`);
      continue;
    }
    if (event.type === 'run/end') {
      const report = event.report ?? {};
      const gates = report.verify?.gates ?? {};
      const gateText = Object.entries(gates)
        .map(([name, gate]) => `${name}:${t(`common.${gate?.status === 'pass' ? 'pass' : gate?.status === 'fail' ? 'fail' : 'skip'}`)}`)
        .join(' ');
      const summary = report.budgetExceeded
        ? report.budgetExceeded.kind === 'cost'
          ? t('studio.agentCostStopped', {
              used: report.budgetExceeded.used.toFixed(6),
              limit: report.budgetExceeded.limit.toFixed(6),
            })
          : t('studio.agentBudgetStopped', {
              used: report.budgetExceeded.used,
              limit: report.budgetExceeded.limit,
            })
        : report.finished === false
          ? t('studio.agentRunIncomplete', { steps: report.steps ?? 0 })
          : t('studio.agentRunEnd', {
              steps: report.steps ?? 0,
              actions: (report.actions ?? []).length,
            });
      items.push(
        `<div class="studio-agent-progress">${escapeHtml(summary)}${gateText ? ` · ${escapeHtml(gateText)}` : ''}</div>`,
      );
      if (agentUsageText(report)) {
        items.push(`<div class="studio-agent-step">${escapeHtml(agentUsageText(report))}</div>`);
      }
      continue;
    }
    if (event.type === 'approval/request') {
      items.push(`<div class="studio-agent-progress">${escapeHtml(t('studio.agentApprovalRequest', { tool: String(event.tool ?? '') }))}</div>`);
      continue;
    }
    if (event.type === 'permission/audit') {
      items.push(`<div class="studio-agent-step">${escapeHtml(t('studio.agentAudit', {
        tool: String(event.tool ?? ''),
        mode: String(event.mode ?? ''),
        source: String(event.source ?? ''),
        result: event.allowed === true ? t('common.pass') : t('common.fail'),
      }))}</div>`);
      continue;
    }
    if (event.type === 'approval/decision') {
      const key = event.allowed === true ? 'studio.agentApprovalAllowed' : 'studio.agentApprovalDenied';
      items.push(`<div class="studio-agent-progress">${escapeHtml(t(key, { tool: String(event.tool ?? '') }))}</div>`);
      continue;
    }
    if (event.type === 'tool/start') {
      items.push(agentEventDetails(
        `<span class="agent-tool-name">${escapeHtml(t('studio.agentToolStart', { tool: String(event.tool ?? '') }))}</span>`,
        escapeHtml(JSON.stringify(event.args ?? {}, null, 2).slice(0, 4000)),
      ));
      continue;
    }
    if (event.type === 'tool/end') {
      const ok = event.ok === true;
      items.push(agentEventDetails(
        `${escapeHtml(t('studio.agentToolEnd', { tool: String(event.tool ?? ''), ok: ok ? t('common.pass') : t('common.fail') }))} <span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '×'}</span>`,
        escapeHtml(String(event.output ?? '').slice(0, 8000)),
      ));
      continue;
    }
    if (event.type !== 'session/event') continue;
    const inner = event.event ?? {};
    if (inner.type === 'user/message') {
      const content = String(inner.content ?? '');
      if (content.startsWith('Build this game:') || content.startsWith('Verification is clean.') || content.startsWith('Step budget is almost exhausted.')) continue;
      items.push(`<div class="studio-agent-msg user">${escapeHtml(content)}</div>`);
    } else if (inner.type === 'assistant/message') {
      if (lastStreamed && String(inner.content ?? '').trim() === lastStreamed.trim()) continue;
      items.push(`<div class="studio-agent-msg assistant">${escapeHtml(inner.content ?? '')}</div>`);
    } else if (inner.type === 'assistant/tool_calls') {
      items.push(agentEventDetails(
        `${escapeHtml(String(inner.content ?? 'tool call'))}`,
        escapeHtml(JSON.stringify(inner.calls ?? [], null, 2).slice(0, 4000)),
      ));
    } else if (inner.type === 'step/start') {
      items.push(`<div class="studio-agent-step">${escapeHtml(t('studio.agentStep', { step: inner.step ?? '' }))}</div>`);
    } else if (inner.type === 'turn/end') {
      items.push(`<div class="studio-agent-step">${inner.finished ? t('studio.agentFinished') : t('studio.agentCanceled')}</div>`);
    }
  }
  if (streamed) {
    items.push(`<div class="studio-agent-msg assistant">${escapeHtml(streamed)}</div>`);
  }
  return items.join('') || `<div class="studio-agent-empty">${t('studio.agentEmpty')}</div>`;
}

function renderAgent() {
  const batch = state.agent;
  const stateElement = $('#agentState');
  const status = batch?.status ?? 'idle';
  stateElement.textContent = agentStatusLabel(status);
  stateElement.className = `studio-agent-state ${
    status === 'awaiting-approval' ? 'awaiting'
      : status === 'queued' ? 'queued'
        : status === 'budget-exceeded' ? 'budget'
          : status === 'finished' ? 'finished'
            : status === 'failed' || status === 'canceled' ? 'failed'
              : status === 'running' ? 'running' : ''
  }`;
  $('#agentStart').disabled = false;
  $('#agentCancel').hidden = !(status === 'running' || status === 'awaiting-approval');
  $('#agentRetry').hidden = !batch || !['failed', 'canceled', 'budget-exceeded'].includes(status);
  const history = state.agentHistory ?? [];
  const historyElement = $('#agentHistory');
  historyElement.hidden = history.length === 0;
  historyElement.innerHTML = history.length === 0 ? '' : `
    ${history.slice(0, 8).map((item) => `
      <button type="button" data-agent-history="${escapeHtml(item.id)}" aria-selected="${item.id === state.agentBatchId ? 'true' : 'false'}" title="${escapeHtml(item.prompt)}">
        ${escapeHtml(agentStatusLabel(item.status))} · ${escapeHtml(item.prompt.slice(0, 32))}
      </button>
    `).join('')}
    ${history.some((item) => !['running', 'awaiting-approval', 'queued'].includes(item.status))
      ? `<button type="button" class="studio-history-clear" data-agent-clear-history>${t('studio.agentClearHistory')}</button>`
      : ''}
  `;
  $$('[data-agent-history]', historyElement).forEach((button) => {
    button.addEventListener('click', () => {
      state.agentBatchId = button.dataset.agentHistory;
      state.agentRunId = null;
      renderAgent();
    });
  });
  $('[data-agent-clear-history]', historyElement)?.addEventListener('click', clearAgentHistory);
  const candidateCount = Number($('#agentCandidateCount').value) || 1;
  $('#agentResume').disabled = candidateCount > 1;
  const queued = state.agentQueue ?? [];
  $('#agentQueue').hidden = queued.length === 0;
  $('#agentQueue').innerHTML = queued.map((item, index) => `
    <div class="studio-agent-queue-row">
      <span>${escapeHtml(t('studio.agentQueueItem', {
        position: index + 1,
        prompt: String(item.prompt ?? '').slice(0, 80),
      }))}</span>
      <button type="button" data-agent-queue-cancel="${escapeHtml(item.id)}">${t('studio.agentCancelQueued')}</button>
    </div>
  `).join('');

  if (!batch) {
    $('#agentCandidates').hidden = true;
    $('#agentCandidates').innerHTML = '';
    $('#agentDiff').hidden = true;
    $('#agentThread').innerHTML = `<div class="studio-agent-empty">${t('studio.agentNoSession')}</div>`;
    $('#agentApproval').hidden = true;
    $('#agentMeta').textContent = t('studio.agentIdle');
    return;
  }

  const run = selectedAgentRun();
  if (run && state.agentRunId !== run.id) state.agentRunId = run.id;
  const candidates = batch.candidates ?? [];
  $('#agentCandidates').hidden = candidates.length < 2;
  if (candidates.length > 1) {
    const cards = candidates.map((candidate) => {
      const letter = String.fromCharCode(64 + candidate.index);
      const statusClass = candidate.status === 'finished'
        ? 'ok'
        : candidate.status === 'budget-exceeded'
          ? 'warn'
          : candidate.status === 'failed' ? 'bad' : '';
      const score = candidate.score === undefined ? '—' : candidate.score;
      return `
        <button class="studio-candidate" type="button" data-agent-run="${escapeHtml(candidate.id)}" aria-selected="${candidate.id === run?.id ? 'true' : 'false'}">
          <strong>${letter}${candidate.id === batch.selectedRunId ? ' ✓' : ''}</strong>
          <span class="${statusClass}">${escapeHtml(agentStatusLabel(candidate.status))}</span>
          <span>${escapeHtml(t('studio.agentScore', { score }))}</span>
        </button>
      `;
    }).join('');
    const apply = run?.status === 'finished'
      ? `<div class="studio-agent-candidate-actions">
          <button class="button secondary" type="button" data-agent-diff>${t('studio.agentDiff')}</button>
          <button class="button primary" type="button" data-agent-apply>${t('studio.agentApply')}</button>
          ${batch.lastBackup ? `<button class="button secondary" type="button" data-agent-rollback>${t('studio.agentRollback')}</button>` : ''}
        </div>`
      : batch.lastBackup
        ? `<div class="studio-agent-candidate-actions"><button class="button secondary" type="button" data-agent-rollback>${t('studio.agentRollback')}</button></div>`
        : '';
    $('#agentCandidates').innerHTML = cards + apply;
  } else {
    $('#agentCandidates').innerHTML = '';
  }

  $('#agentThread').innerHTML = agentThreadMarkup(run);
  const thread = $('#agentThread');
  if (thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80) {
    thread.scrollTop = thread.scrollHeight;
  }

  const pending = pendingApproval(run);
  $('#agentApproval').hidden = !pending;
  if (pending) {
    $('#agentApprovalTool').textContent = pending.tool;
    $('#agentApprovalArgs').textContent = JSON.stringify(pending.args ?? {}, null, 2).slice(0, 3000);
  }

  $('#agentMeta').textContent = candidates.length > 1
    ? t('studio.agentMeta', {
        provider: batch.provider,
        skill: batch.skill,
        candidates: candidates.length,
      })
    : t('studio.agentMetaSingle', { provider: batch.provider, skill: batch.skill });
  if (queued.length > 0) {
    $('#agentMeta').textContent += ` · ${t('studio.agentQueue', { count: queued.length })}`;
  }
  if (run) {
    const usage = agentUsageText(run.report);
    if (usage) $('#agentMeta').textContent += ` · ${usage}`;
  }

  $$('[data-agent-run]', $('#agentCandidates')).forEach((button) => {
    button.addEventListener('click', () => {
      state.agentRunId = button.dataset.agentRun;
      state.agentDiff = null;
      renderAgent();
    });
  });
  $('[data-agent-diff]')?.addEventListener('click', () => loadAgentDiff(batch, run));
  $('[data-agent-apply]')?.addEventListener('click', () => applyAgentCandidate(batch, run));
  $('[data-agent-rollback]')?.addEventListener('click', () => rollbackAgent(batch));
  $$('[data-agent-queue-cancel]', $('#agentQueue')).forEach((button) => {
    button.addEventListener('click', () => cancelQueuedBatch(button.dataset.agentQueueCancel));
  });
  renderAgentDiff(run);
}

function renderAgentDiff(run) {
  const panel = $('#agentDiff');
  const diff = state.agentDiff;
  if (!diff || !run || diff.runId !== run.id) {
    panel.hidden = true;
    $('#agentDiffBody').innerHTML = '';
    return;
  }
  const changeCount = diff.counts.added + diff.counts.modified;
  const rows = diff.files
    .filter((file) => file.status !== 'unchanged')
    .slice(0, 120)
    .map((file) => `<div class="studio-agent-diff-row ${file.status}"><span>${file.status === 'added' ? '+' : '~'}</span><code>${escapeHtml(file.path)}</code></div>`)
    .join('');
  panel.hidden = false;
  $('#agentDiffBody').innerHTML = `
    <div class="studio-agent-diff-counts">
      <span class="added">${escapeHtml(t('studio.agentDiffAdded', { count: diff.counts.added }))}</span>
      <span class="modified">${escapeHtml(t('studio.agentDiffModified', { count: diff.counts.modified }))}</span>
      <span>${escapeHtml(t('studio.agentDiffUnchanged', { count: diff.counts.unchanged }))}</span>
    </div>
    ${changeCount === 0 ? `<div class="studio-agent-diff-empty">${t('studio.agentDiffEmpty')}</div>` : `<div class="studio-agent-diff-list">${rows}</div>`}
  `;
}

async function loadAgentDiff(batch, run) {
  if (!batch || !run) return;
  try {
    const result = await request(
      `/api/agent/batches/${encodeURIComponent(batch.id)}/candidates/${encodeURIComponent(run.id)}/diff`,
    );
    state.agentDiff = result.diff;
    renderAgentDiff(run);
  } catch (error) {
    toast(t('studio.agentDiffFailed', { message: error.message }));
  }
}

function scheduleAgentPoll() {
  if (state.agentSource) return;
  clearTimeout(state.agentPoll);
  const status = state.agent?.status;
  if (status === 'running' || status === 'awaiting-approval') {
    state.agentPoll = setTimeout(() => loadAgent(true), 700);
  }
}

async function applyAgentData(data) {
  const previousStatus = state.agentLastStatus;
  state.agentHistory = data.batches ?? [];
  const selected = state.agentBatchId
    ? state.agentHistory.find((item) => item.id === state.agentBatchId)
    : undefined;
  if (!selected) state.agentBatchId = null;
  const batch = selected ?? data.active ?? state.agentHistory[0] ?? null;
  state.agent = batch;
  state.agentQueue = data.queued ?? [];
  state.agentLastStatus = batch?.status ?? null;
  if (batch) {
    if (!batch.candidates?.some((run) => run.id === state.agentRunId)) {
      state.agentRunId = batch.selectedRunId
        ?? batch.candidates.find((run) => run.status === 'finished')?.id
        ?? batch.candidates[0]?.id
        ?? null;
    }
  } else {
    state.agentRunId = null;
  }
  renderAgent();
  scheduleAgentPoll();
  if (
    batch
    && previousStatus
    && previousStatus !== batch.status
    && batch.status === 'finished'
    && batch.candidates.length === 1
  ) {
    await load();
  }
}

function connectAgentStream() {
  if (typeof EventSource === 'undefined') {
    loadAgent(true);
    return;
  }
  const source = new EventSource('/api/agent/events');
  state.agentSource = source;
  source.onopen = () => {
    state.agentStreamOpened = true;
    clearTimeout(state.agentPoll);
  };
  source.addEventListener('snapshot', (event) => {
    try {
      applyAgentData(JSON.parse(event.data));
    } catch {
      // Ignore a malformed frame; the next snapshot replaces it.
    }
  });
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      state.agentSource = null;
      source.close();
      loadAgent(true);
    } else if (!state.agentStreamOpened) {
      state.agentSource = null;
      source.close();
      loadAgent(true);
    }
  };
}

async function loadAgent(quiet = false) {
  try {
    const data = await request('/api/agent');
    await applyAgentData(data);
  } catch (error) {
    if (!quiet) toast(t('studio.agentApi', { message: error.message }));
    $('#agentState').textContent = t('studio.agentFailed');
    $('#agentState').className = 'studio-agent-state failed';
  }
}

async function startAgent() {
  const prompt = $('#agentPrompt').value.trim();
  if (!prompt) {
    toast(t('studio.agentPromptPlaceholder'));
    $('#agentPrompt').focus();
    return;
  }
  const candidates = Number($('#agentCandidateCount').value) || 1;
  const maxSteps = Math.max(1, Math.min(48, Number($('#agentMaxSteps').value) || 12));
  const maxTokensValue = Number($('#agentMaxTokens').value);
  const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0
    ? Math.trunc(maxTokensValue)
    : undefined;
  const maxCostValue = Number($('#agentMaxCost').value);
  const maxCostUsd = Number.isFinite(maxCostValue) && maxCostValue > 0
    ? maxCostValue
    : undefined;
  $('#agentStart').disabled = true;
  try {
    await request('/api/agent/start', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        candidates,
        maxSteps,
        maxTokens,
        maxCostUsd,
        resume: candidates === 1 && $('#agentResume').checked,
        provider: 'auto',
      }),
    });
    state.agentRunId = null;
    state.agentBatchId = null;
    toast(t('studio.agentStarted'));
    await loadAgent();
  } catch (error) {
    toast(t('studio.agentStartFailed', { message: error.message }));
    renderAgent();
  }
}

async function decideAgentApproval(allowed, remember = false) {
  const batch = state.agent;
  const run = selectedAgentRun();
  const approval = pendingApproval(run);
  if (!batch || !run || !approval) return;
  $('#agentAllow').disabled = true;
  $('#agentAllowAlways').disabled = true;
  $('#agentDeny').disabled = true;
  try {
    await request(
      `/api/agent/batches/${encodeURIComponent(batch.id)}/runs/${encodeURIComponent(run.id)}/approval`,
      {
        method: 'POST',
        body: JSON.stringify({ approvalId: approval.id, allowed }),
      },
    );
    if (allowed && remember) {
      try {
        const policy = await request('/api/agent/policy', {
          method: 'POST',
          body: JSON.stringify({ tool: approval.tool, mode: 'allow' }),
        });
        toast(t('studio.agentPolicySaved', { tool: approval.tool, mode: 'allow' }));
        renderAgent();
        return;
      } catch (error) {
        toast(t('studio.agentPolicyFailed', { message: error.message }));
      }
    }
    await loadAgent(true);
  } catch (error) {
    toast(t('studio.agentApprovalFailed', { message: error.message }));
  } finally {
    $('#agentAllow').disabled = false;
    $('#agentAllowAlways').disabled = false;
    $('#agentDeny').disabled = false;
  }
}

async function retryAgent() {
  if (!state.agent) return;
  try {
    await request(`/api/agent/batches/${encodeURIComponent(state.agent.id)}/retry`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    state.agentBatchId = null;
    state.agentRunId = null;
    toast(t('studio.agentRetryStarted'));
    await loadAgent(true);
  } catch (error) {
    toast(t('studio.agentStartFailed', { message: error.message }));
  }
}

async function clearAgentHistory() {
  try {
    await request('/api/agent/batches/clear', { method: 'DELETE' });
    state.agentBatchId = null;
    toast(t('studio.agentHistoryCleared'));
    await loadAgent(true);
  } catch (error) {
    toast(t('studio.agentStartFailed', { message: error.message }));
  }
}

async function cancelAgent() {
  if (!state.agent) return;
  try {
    await request(`/api/agent/batches/${encodeURIComponent(state.agent.id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await loadAgent(true);
  } catch (error) {
    toast(t('studio.agentCancelFailed', { message: error.message }));
  }
}

async function cancelQueuedBatch(batchId) {
  if (!batchId) return;
  try {
    await request(`/api/agent/batches/${encodeURIComponent(batchId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    toast(t('studio.agentQueueCanceled'));
    await loadAgent(true);
  } catch (error) {
    toast(t('studio.agentCancelFailed', { message: error.message }));
  }
}

async function applyAgentCandidate(batch, run) {
  if (!batch || !run) return;
  const name = String.fromCharCode(64 + run.index);
  if (!window.confirm(t('studio.agentApplyConfirm', { name }))) return;
  try {
    const result = await request(`/api/agent/batches/${encodeURIComponent(batch.id)}/apply`, {
      method: 'POST',
      body: JSON.stringify({ runId: run.id }),
    });
    state.agentDiff = null;
    const backup = result.batch?.lastBackup;
    toast(`${t('studio.agentApplied', { name })}${backup ? ` ${t('studio.agentBackupCreated')}` : ''}`);
    await load();
    await loadAgent(true);
  } catch (error) {
    toast(t('studio.agentApplyFailed', { message: error.message }));
  }
}

async function rollbackAgent(batch) {
  if (!batch?.lastBackup) return;
  if (!window.confirm(t('studio.agentRollbackConfirm'))) return;
  try {
    await request(`/api/agent/batches/${encodeURIComponent(batch.id)}/rollback`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    state.agentDiff = null;
    toast(t('studio.agentRolledBack'));
    await load();
    await loadAgent(true);
  } catch (error) {
    toast(t('studio.agentRollbackFailed', { message: error.message }));
  }
}

async function load() {
  try {
    const snapshot = await request('/api/project');
    state.snapshot = snapshot;
    if (!state.selectedRunId) state.selectedRunId = snapshot.build.latestRun?.id ?? null;
    renderAll();
  } catch (error) {
    $('#studioState').textContent = t('common.error');
    $('#studioDot').style.background = 'var(--coral)';
    toast(t('assets.loadFailed', { message: error.message }));
  }
}

function renderAll() {
  if (!state.snapshot) return;
  const { project, build, assets, comfyui } = state.snapshot;
  document.title = t('studio.title');
  $('#projectName').textContent = project.name;
  $('#projectTitle').textContent = project.name;
  $('#projectMeta').textContent = t('studio.projectMeta', {
    engine: build.engine === 'unknown' ? t('studio.unknownEngine') : build.engine,
    count: assets.length,
  });
  $('#engineLabel').textContent = build.engine === 'unknown' ? t('studio.unknownEngine') : build.engine;
  $('#assetLabel').textContent = t('common.assetCount', { count: assets.length });
  $('#rootLabel').textContent = shortRoot(project.root);
  $('#previewEngine').textContent = build.engine === 'unknown' ? t('studio.unknownEngine') : build.engine.toUpperCase();
  $('#runCount').textContent = t('studio.runCount', { count: build.runs.length });
  $('#contractState').textContent = build.manifest && build.lockfile ? t('studio.ready') : t('studio.incomplete');
  $('#contractCopy').textContent = build.manifest && build.lockfile
    ? t('studio.contractReady')
    : t('studio.contractIncomplete');
  $('#studioComfy').classList.toggle('online', Boolean(comfyui.online));
  $('#studioComfy').classList.toggle('offline', !comfyui.online);
  $('#studioComfy').innerHTML = `<span class="dot"></span>${comfyui.online ? t('assets.comfyOnline') : t('assets.comfyOffline')}`;
  $('#comfyFoot').textContent = `${comfyui.url || 'ComfyUI'} · ${comfyui.workflowExists ? t('assets.workflowReady') : t('assets.workflowMissing')}`;
  $('#studioFoot').textContent = `${project.root} · ${t('studio.localServer')}`;
  $('#studioState').textContent = build.latestRun ? (build.latestRun.ok ? t('studio.verified') : t('studio.attention')) : t('studio.notVerifiedStatus');
  $('#studioDot').style.background = build.latestRun ? (build.latestRun.ok ? 'var(--lime)' : 'var(--coral)') : 'var(--dim)';
  renderSession();
  renderRuns();
  renderGates();
  renderPreview();
  renderRight();
}

function renderSession() {
  const session = state.snapshot.build.session;
  $('#sessionState').textContent = session ? t('studio.sessionAttached') : t('studio.sessionNoneState');
  if (!session) {
    $('#sessionBody').innerHTML = `<div class="studio-section-empty">${t('studio.sessionNone')}</div>`;
    return;
  }
  $('#sessionBody').innerHTML = `
    <div class="studio-section-copy">
      <div>${t('studio.generation', { value: session.generation ?? 1 })} · ${t('studio.events', { count: session.eventCount ?? 0 })}</div>
      <div>${t('studio.steps', { count: session.steps ?? 0 })} · ${session.finished ? t('studio.finished') : t('studio.inProgress')}</div>
      <div style="margin-top:6px;color:var(--dim)">${escapeHtml(session.path)}</div>
    </div>
  `;
}

function renderRuns() {
  const runs = state.snapshot.build.runs;
  if (runs.length === 0) {
    $('#runList').innerHTML = `<div class="studio-section-empty">${t('studio.noRuns')}</div>`;
    return;
  }
  $('#runList').innerHTML = runs.map((run) => {
    const counts = gateCounts(run);
    return `
      <button class="studio-run" type="button" data-run="${run.id}" aria-selected="${run.id === state.selectedRunId ? 'true' : 'false'}">
        <span class="run-main"><span class="run-id">${run.id.slice(0, 8)}</span><span class="run-time">${formatWhen(run.createdAt)}</span></span>
        <span class="run-state ${run.ok ? '' : 'fail'}">${counts.passed}/${counts.total} ${run.ok ? t('common.pass') : t('common.fail')}</span>
      </button>
    `;
  }).join('');
  $$('[data-run]', $('#runList')).forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedRunId = button.dataset.run;
      renderRuns();
      renderGates();
      renderPreview();
      renderRight();
    });
  });
}

function renderGates() {
  const run = selectedRun();
  const counts = gateCounts(run);
  const names = gateNames(run);
  const gates = run?.gates ?? {};
  $('#gateRunLabel').textContent = run ? `RUN ${run.id.slice(0, 8)}` : t('studio.noRun');
  $('#gateScore').textContent = String(counts.passed);
  $('#gateTotal').textContent = `/${counts.total}`;
  $('#gateWord').textContent = !run ? t('studio.notVerified') : counts.failed > 0 ? t('studio.needsFix') : counts.passed === counts.total ? t('studio.playable') : t('studio.incompleteState');
  $('#gateWord').className = `studio-gate-word ${!run ? 'none' : counts.failed > 0 ? 'fail' : ''}`;
  const labels = {
    G1: t('studio.gateG1'),
    G2: t('studio.gateG2'),
    G3: t('studio.gateG3'),
    G6: t('studio.gateG6'),
  };
  $('#gateList').innerHTML = names.map((name) => {
    const gate = gates[name] ?? { status: 'skip', message: t('common.notRun') };
    const mark = gate.status === 'pass' ? '✓' : gate.status === 'fail' ? '×' : '·';
    return `
      <div class="studio-gate ${gate.status}">
        <span class="studio-gate-mark">${mark}</span>
        <span><span class="studio-gate-name">${labels[name] ?? name}</span><span class="studio-gate-detail">${escapeHtml(translateGateMessage(gate.message ?? ''))}</span></span>
        <span class="studio-gate-status">${gate.status === 'pass' ? t('common.pass') : gate.status === 'fail' ? t('common.fail') : t('common.skip')}</span>
      </div>
    `;
  }).join('');
  $('#gateLast').textContent = run
    ? t('studio.lastRun', {
        when: formatWhen(run.createdAt),
        duration: run.durationMs,
        engine: run.engine === 'present' ? t('studio.enginePresent') : t('studio.engineMissing'),
      })
    : t('studio.noRunRecorded');
  $('#logState').textContent = run ? (run.ok ? t('common.pass') : t('common.fail')) : t('common.notRun');
  $('#logOutput').textContent = run?.output ?? t('studio.noVerifyLog');
}

function renderPreview() {
  const build = state.snapshot.build;
  const screenshot = build.screenshot;
  const run = selectedRun();
  const frame = $('.preview-frame');
  const image = $('#previewImage');
  const empty = $('#previewEmpty');
  if (state.view === 'evidence') {
    image.hidden = true;
    empty.hidden = false;
    empty.innerHTML = `
      <div style="text-align:start;max-width:440px">
        <strong>${t('studio.evidenceBundle')}</strong>
        <span style="display:block;margin-bottom:10px">${t('studio.evidenceCopy')}</span>
        <div class="studio-evidence-row"><span>modules.lock.json</span><span class="${build.lockfile ? 'ok' : ''}">${build.lockfile ? t('common.present') : t('common.missing')}</span></div>
        <div class="studio-evidence-row"><span>game.manifest.json</span><span class="${build.manifest ? 'ok' : ''}">${build.manifest ? t('common.present') : t('common.missing')}</span></div>
        <div class="studio-evidence-row"><span>${t('studio.screenshot')}</span><span class="${screenshot ? 'ok' : ''}">${screenshot ? t('common.captured') : t('common.missing')}</span></div>
        <div class="studio-evidence-row"><span>${t('studio.run')}</span><span class="${run ? 'ok' : ''}">${run ? run.id.slice(0, 8) : t('common.none')}</span></div>
      </div>
    `;
    $('#previewFile').textContent = t('studio.evidenceLocal');
  } else if (screenshot) {
    image.hidden = false;
    empty.hidden = true;
    if (!image.src.includes(screenshot.url)) image.src = `${screenshot.url}&v=${encodeURIComponent(build.latestRun?.id ?? '0')}`;
    $('#previewFile').textContent = screenshot.file;
  } else {
    image.hidden = true;
    empty.hidden = false;
    empty.innerHTML = `<div><strong>${t('studio.noScreenshot')}</strong><span>${t('studio.noScreenshotHint')}</span></div>`;
    $('#previewFile').textContent = '—';
  }
  $('#previewStatus').textContent = run ? (run.ok ? t('studio.verified') : t('common.fail')) : t('studio.noRun');
  $('#previewStatus').className = run ? (run.ok ? 'good' : 'bad') : '';
}

function renderRight() {
  const body = $('#rightBody');
  if (state.right === 'assets') {
    const assets = state.snapshot.assets;
    body.innerHTML = assets.length
      ? `<div class="studio-asset-list">${assets.map((asset) => `
          <a class="studio-asset" href="/assets?focus=${encodeURIComponent(asset.id)}" style="text-decoration:none">
            <span class="studio-asset-thumb">${asset.kind === 'audio' ? '<svg class="icon" style="color:var(--lime)"><use href="#i-wave"></use></svg>' : `<img src="${escapeHtml(asset.url)}" alt="" loading="lazy">`}</span>
            <span><span class="studio-asset-name">${escapeHtml(asset.name)}</span><span class="studio-asset-meta">${t('assets.assetKind', { kind: t(`common.${asset.kind}`), source: t(`common.${asset.source}`) })}</span></span>
            <span class="studio-asset-mark">${asset.inBuild ? 'IN' : ''}</span>
          </a>`).join('')}</div>`
      : `<div class="studio-section-empty">${t('assets.emptyFilter')}</div>`;
    return;
  }
  if (state.right === 'evidence') {
    const run = selectedRun();
    const build = state.snapshot.build;
    body.innerHTML = `
      <div class="studio-evidence-row"><span>${t('studio.manifest')}</span><span class="${build.manifest ? 'ok' : ''}">${build.manifest ? t('common.present') : t('common.missing')}</span></div>
      <div class="studio-evidence-row"><span>${t('studio.lockfile')}</span><span class="${build.lockfile ? 'ok' : ''}">${build.lockfile ? t('common.present') : t('common.missing')}</span></div>
      <div class="studio-evidence-row"><span>${t('studio.screenshot')}</span><span class="${build.screenshot ? 'ok' : ''}">${build.screenshot ? t('common.captured') : t('common.missing')}</span></div>
      <div class="studio-evidence-row"><span>${t('studio.run')}</span><span class="${run ? 'ok' : ''}">${run ? run.id.slice(0, 8) : t('common.none')}</span></div>
      <div class="studio-evidence-row"><span>${t('studio.duration')}</span><span>${run ? `${run.durationMs}ms` : '—'}</span></div>
    `;
    return;
  }
  const runs = state.snapshot.build.runs;
  body.innerHTML = runs.length
    ? runs.map((run) => {
      const counts = gateCounts(run);
      return `<button class="studio-run" type="button" data-right-run="${run.id}" style="width:100%"><span class="run-main"><span class="run-id">${run.id.slice(0, 8)}</span><span class="run-time">${formatWhen(run.createdAt)}</span></span><span class="run-state ${run.ok ? '' : 'fail'}">${counts.passed}/${counts.total}</span></button>`;
    }).join('')
    : `<div class="studio-section-empty">${t('studio.noRuns')}</div>`;
  $$('[data-right-run]', body).forEach((button) => button.addEventListener('click', () => {
    state.selectedRunId = button.dataset.rightRun;
    renderAll();
  }));
}

async function startPlaytest() {
  try {
    const result = await request('/api/playtest/start', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (result.mode === 'iframe') {
      const frame = $('#playFrame');
      frame.hidden = false;
      frame.src = result.url;
      $('#playControls').hidden = false;
      toast(t('studio.playStarted'));
    } else {
      toast(result.message ?? t('studio.playExternal'));
    }
  } catch (error) {
    toast(t('studio.playFailed', { message: error.message }));
  }
}

async function stopPlaytest() {
  try {
    await request('/api/playtest/stop', { method: 'POST', body: JSON.stringify({}) });
  } catch {
    // The iframe has no server process to stop; local shutdown is best effort.
  }
  const frame = $('#playFrame');
  frame.src = 'about:blank';
  frame.hidden = true;
  $('#playControls').hidden = true;
}

async function verify() {
  if (state.verifying) return;
  state.verifying = true;
  const buttons = [$('#verifyBtn'), $('#verifyTop')];
  buttons.forEach((button) => { button.disabled = true; });
  $('#logState').textContent = t('studio.verifying');
  $('#gateWord').textContent = t('studio.verifying');
  $('#gateWord').className = 'studio-gate-word';
  toast(t('studio.verificationStarted'));
  try {
    const result = await request('/api/verify', { method: 'POST', body: JSON.stringify({}) });
    state.selectedRunId = result.run.id;
    toast(result.run.ok ? t('studio.verificationPassed') : t('studio.verificationFinishedFailures'));
    await load();
  } catch (error) {
    toast(t('studio.verificationFailed', { message: error.message }));
    $('#logState').textContent = t('common.error');
    $('#logOutput').textContent = `${t('studio.verificationFailed', { message: error.message })}\n${error.message}`;
  } finally {
    state.verifying = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

$('#verifyBtn').addEventListener('click', verify);
$('#verifyTop').addEventListener('click', verify);
$('#refreshBtn').addEventListener('click', () => {
  load();
  loadAgent(true);
});
$('#refreshPreview').addEventListener('click', load);
$('#playBtn').addEventListener('click', startPlaytest);
$('#playClose').addEventListener('click', stopPlaytest);
$('#agentStart').addEventListener('click', startAgent);
$('#agentCancel').addEventListener('click', cancelAgent);
$('#agentRetry').addEventListener('click', retryAgent);
$('#agentPolicyToggle').addEventListener('click', toggleAgentPolicy);
$('#agentAllow').addEventListener('click', () => decideAgentApproval(true));
$('#agentAllowAlways').addEventListener('click', () => decideAgentApproval(true, true));
$('#agentDeny').addEventListener('click', () => decideAgentApproval(false));
$('#agentCandidateCount').addEventListener('change', renderAgent);
$('#agentDiffClose').addEventListener('click', () => {
  state.agentDiff = null;
  renderAgentDiff(selectedAgentRun());
});
$('#studioGatesToggle').addEventListener('click', () => $('#studioRight').classList.toggle('open'));
$$('.studio-tab').forEach((tab) => tab.addEventListener('click', () => {
  state.view = tab.dataset.view;
  $$('.studio-tab').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
  renderPreview();
}));
$$('.studio-right-tab').forEach((tab) => tab.addEventListener('click', () => {
  state.right = tab.dataset.right;
  $$('.studio-right-tab').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
  renderRight();
}));
$$('.studio-mobile-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.body.dataset.screen = tab.dataset.screen;
  $$('.studio-mobile-tab').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
}));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') $('#studioRight').classList.remove('open');
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 1180) $('#studioRight').classList.remove('open');
});

initLocale();
document.title = t('studio.title');
window.addEventListener('localechange', () => {
  document.title = t('studio.title');
  renderAgentPolicy();
  if (state.snapshot) renderAll();
  renderAgent();
});

load();
connectAgentStream();
window.addEventListener('beforeunload', () => state.agentSource?.close());
