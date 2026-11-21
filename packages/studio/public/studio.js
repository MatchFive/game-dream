const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
import { t, initLocale, applyStatic, formatDate, locale } from '/i18n.js?v=1';

const state = {
  snapshot: null,
  selectedRunId: null,
  view: 'build',
  right: 'runs',
  verifying: false,
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
$('#refreshBtn').addEventListener('click', load);
$('#refreshPreview').addEventListener('click', load);
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
  if (state.snapshot) renderAll();
});

load();
