const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

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

function shortRoot(root) {
  const parts = String(root).split(/[\\/]/);
  return parts.slice(-2).join('/');
}

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function load() {
  try {
    const snapshot = await request('/api/project');
    state.snapshot = snapshot;
    if (!state.selectedRunId) state.selectedRunId = snapshot.build.latestRun?.id ?? null;
    renderAll();
  } catch (error) {
    $('#studioState').textContent = 'Error';
    $('#studioDot').style.background = 'var(--coral)';
    toast(`Could not load project: ${error.message}`);
  }
}

function renderAll() {
  if (!state.snapshot) return;
  const { project, build, assets, comfyui } = state.snapshot;
  $('#projectName').textContent = project.name;
  $('#projectTitle').textContent = project.name;
  $('#projectMeta').textContent = `${build.engine} · ${assets.length} assets`;
  $('#engineLabel').textContent = build.engine;
  $('#assetLabel').textContent = `${assets.length} assets`;
  $('#rootLabel').textContent = shortRoot(project.root);
  $('#previewEngine').textContent = build.engine.toUpperCase();
  $('#runCount').textContent = String(build.runs.length);
  $('#contractState').textContent = build.manifest && build.lockfile ? 'READY' : 'INCOMPLETE';
  $('#contractCopy').innerHTML = build.manifest && build.lockfile
    ? 'Manifest and lockfile are present. Verification reads the manifest marker contract and imports the project.'
    : 'No complete generated build in this directory. Create or compose a project first; the studio still indexes assets and generated images.';
  $('#studioComfy').classList.toggle('online', Boolean(comfyui.online));
  $('#studioComfy').classList.toggle('offline', !comfyui.online);
  $('#studioComfy').innerHTML = `<span class="dot"></span>${comfyui.online ? 'ComfyUI online' : 'ComfyUI offline'}`;
  $('#comfyFoot').textContent = `${comfyui.url || 'ComfyUI'} · ${comfyui.workflowExists ? 'workflow ready' : 'workflow missing'}`;
  $('#studioFoot').textContent = `${project.root} · local server`;
  $('#studioState').textContent = build.latestRun ? (build.latestRun.ok ? 'Verified' : 'Attention') : 'Not verified';
  $('#studioDot').style.background = build.latestRun ? (build.latestRun.ok ? 'var(--lime)' : 'var(--coral)') : 'var(--dim)';
  renderSession();
  renderRuns();
  renderGates();
  renderPreview();
  renderRight();
}

function renderSession() {
  const session = state.snapshot.build.session;
  $('#sessionState').textContent = session ? 'ATTACHED' : 'NONE';
  if (!session) {
    $('#sessionBody').innerHTML = '<div class="studio-section-empty">No active agent session. <code>dream develop</code> writes <code>.gamedream/session.json</code>, which will appear here with its step and generation metadata.</div>';
    return;
  }
  $('#sessionBody').innerHTML = `
    <div class="studio-section-copy">
      <div>Generation <strong>${session.generation ?? 1}</strong> · ${session.eventCount ?? 0} events</div>
      <div>${session.steps ?? 0} steps · ${session.finished ? 'finished' : 'in progress'}</div>
      <div style="margin-top:6px;color:var(--dim)">${escapeHtml(session.path)}</div>
    </div>
  `;
}

function renderRuns() {
  const runs = state.snapshot.build.runs;
  if (runs.length === 0) {
    $('#runList').innerHTML = '<div class="studio-section-empty">No verification runs yet. Run Verify to create a durable run record.</div>';
    return;
  }
  $('#runList').innerHTML = runs.map((run) => {
    const counts = gateCounts(run);
    return `
      <button class="studio-run" type="button" data-run="${run.id}" aria-selected="${run.id === state.selectedRunId ? 'true' : 'false'}">
        <span class="run-main"><span class="run-id">${run.id.slice(0, 8)}</span><span class="run-time">${formatWhen(run.createdAt)}</span></span>
        <span class="run-state ${run.ok ? '' : 'fail'}">${counts.passed}/${counts.total} ${run.ok ? 'PASS' : 'FAIL'}</span>
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
  $('#gateRunLabel').textContent = run ? `RUN ${run.id.slice(0, 8)}` : 'NO RUN';
  $('#gateScore').textContent = String(counts.passed);
  $('#gateTotal').textContent = `/${counts.total}`;
  $('#gateWord').textContent = !run ? 'NOT VERIFIED' : counts.failed > 0 ? 'NEEDS FIX' : counts.passed === counts.total ? 'PLAYABLE' : 'INCOMPLETE';
  $('#gateWord').className = `studio-gate-word ${!run ? 'none' : counts.failed > 0 ? 'fail' : ''}`;
  const labels = {
    G1: 'G1 · Project contract',
    G2: 'G2 · Import & compile',
    G3: 'G3 · Core loop',
    G6: 'G6 · Visual review',
  };
  $('#gateList').innerHTML = names.map((name) => {
    const gate = gates[name] ?? { status: 'skip', message: 'not run' };
    const mark = gate.status === 'pass' ? '✓' : gate.status === 'fail' ? '×' : '·';
    return `
      <div class="studio-gate ${gate.status}">
        <span class="studio-gate-mark">${mark}</span>
        <span><span class="studio-gate-name">${labels[name] ?? name}</span><span class="studio-gate-detail">${escapeHtml(gate.message ?? '')}</span></span>
        <span class="studio-gate-status">${gate.status.toUpperCase()}</span>
      </div>
    `;
  }).join('');
  $('#gateLast').textContent = run
    ? `Last run ${formatWhen(run.createdAt)} · ${run.durationMs}ms · ${run.engine === 'present' ? 'engine present' : 'engine missing'}`
    : 'No verification run recorded.';
  $('#logState').textContent = run ? (run.ok ? 'PASS' : 'FAIL') : 'NOT RUN';
  $('#logOutput').textContent = run?.output ?? 'No verification run yet. Use Verify to spawn `dream verify --path . --json`.';
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
        <strong>Evidence bundle</strong>
        <span style="display:block;margin-bottom:10px">Everything the run can prove from local files.</span>
        <div class="studio-evidence-row"><span>modules.lock.json</span><span class="${build.lockfile ? 'ok' : ''}">${build.lockfile ? 'PRESENT' : 'MISSING'}</span></div>
        <div class="studio-evidence-row"><span>game.manifest.json</span><span class="${build.manifest ? 'ok' : ''}">${build.manifest ? 'PRESENT' : 'MISSING'}</span></div>
        <div class="studio-evidence-row"><span>build screenshot</span><span class="${screenshot ? 'ok' : ''}">${screenshot ? 'CAPTURED' : 'MISSING'}</span></div>
        <div class="studio-evidence-row"><span>verification run</span><span class="${run ? 'ok' : ''}">${run ? run.id.slice(0, 8) : 'NONE'}</span></div>
      </div>
    `;
    $('#previewFile').textContent = 'evidence / local files';
  } else if (screenshot) {
    image.hidden = false;
    empty.hidden = true;
    if (!image.src.includes(screenshot.url)) image.src = `${screenshot.url}&v=${encodeURIComponent(build.latestRun?.id ?? '0')}`;
    $('#previewFile').textContent = screenshot.file;
  } else {
    image.hidden = true;
    empty.hidden = false;
    empty.innerHTML = '<div><strong>No build screenshot yet</strong><span>Run a generated project through `dream verify --visual` to capture a playable frame.</span></div>';
    $('#previewFile').textContent = '—';
  }
  $('#previewStatus').textContent = run ? (run.ok ? 'VERIFIED' : 'FAIL') : 'NO RUN';
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
            <span><span class="studio-asset-name">${escapeHtml(asset.name)}</span><span class="studio-asset-meta">${escapeHtml(asset.kind)} · ${escapeHtml(asset.source)}</span></span>
            <span class="studio-asset-mark">${asset.inBuild ? 'IN' : ''}</span>
          </a>`).join('')}</div>`
      : '<div class="studio-section-empty">No assets indexed for this project.</div>';
    return;
  }
  if (state.right === 'evidence') {
    const run = selectedRun();
    const build = state.snapshot.build;
    body.innerHTML = `
      <div class="studio-evidence-row"><span>manifest</span><span class="${build.manifest ? 'ok' : ''}">${build.manifest ? 'PRESENT' : 'MISSING'}</span></div>
      <div class="studio-evidence-row"><span>lockfile</span><span class="${build.lockfile ? 'ok' : ''}">${build.lockfile ? 'PRESENT' : 'MISSING'}</span></div>
      <div class="studio-evidence-row"><span>screenshot</span><span class="${build.screenshot ? 'ok' : ''}">${build.screenshot ? 'CAPTURED' : 'MISSING'}</span></div>
      <div class="studio-evidence-row"><span>run</span><span class="${run ? 'ok' : ''}">${run ? run.id.slice(0, 8) : 'NONE'}</span></div>
      <div class="studio-evidence-row"><span>duration</span><span>${run ? `${run.durationMs}ms` : '—'}</span></div>
    `;
    return;
  }
  const runs = state.snapshot.build.runs;
  body.innerHTML = runs.length
    ? runs.map((run) => {
      const counts = gateCounts(run);
      return `<button class="studio-run" type="button" data-right-run="${run.id}" style="width:100%"><span class="run-main"><span class="run-id">${run.id.slice(0, 8)}</span><span class="run-time">${formatWhen(run.createdAt)}</span></span><span class="run-state ${run.ok ? '' : 'fail'}">${counts.passed}/${counts.total}</span></button>`;
    }).join('')
    : '<div class="studio-section-empty">No verification runs. Run verification to record the first one.</div>';
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
  $('#logState').textContent = 'RUNNING';
  $('#gateWord').textContent = 'VERIFYING';
  $('#gateWord').className = 'studio-gate-word';
  toast('Verification started.');
  try {
    const result = await request('/api/verify', { method: 'POST', body: JSON.stringify({}) });
    state.selectedRunId = result.run.id;
    toast(result.run.ok ? 'Verification passed.' : 'Verification finished with failures.');
    await load();
  } catch (error) {
    toast(`Verification failed: ${error.message}`);
    $('#logState').textContent = 'ERROR';
    $('#logOutput').textContent = `Verification request failed:\n${error.message}`;
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

load();
