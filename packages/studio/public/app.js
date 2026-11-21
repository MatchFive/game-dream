const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  project: { name: 'Project', root: '' },
  assets: [],
  canvas: { nodes: [], inBuild: [] },
  comfyui: { url: '', workflow: '', workflowExists: false, online: false },
  selectedId: null,
  filter: 'all',
  search: '',
  scale: window.innerWidth < 760 ? 0.46 : 0.78,
  panX: 0,
  panY: window.innerWidth < 760 ? 45 : 0,
  tool: 'select',
  generating: false,
  audio: null,
};

let saveTimer;
let jobTimer;
const canvas = $('#canvas');
const world = $('#world');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatBytes(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function assetById(id) {
  return state.assets.find((asset) => asset.id === id);
}

function nodeById(id) {
  return state.canvas.nodes.find((node) => node.id === id);
}

function assetNodeFor(assetId) {
  return state.canvas.nodes.find(
    (node) =>
      (node.kind === 'asset' || node.kind === 'build') && node.assetId === assetId,
  );
}

function setSaveState(text, error = false) {
  $('#saveState').textContent = text;
  $('#saveDot').style.background = error ? 'var(--coral)' : 'var(--lime)';
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => element.classList.remove('show'), 3000);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

async function load() {
  setSaveState('Loading');
  try {
    const data = await request('/api/state');
    state.project = data.project;
    state.assets = data.assets;
    state.comfyui = data.comfyui;
    state.canvas = {
      nodes: Array.isArray(data.canvas.nodes) ? data.canvas.nodes : [],
      inBuild: Array.isArray(data.canvas.inBuild) ? data.canvas.inBuild : [],
    };
    syncBuildFlags();
    if (state.canvas.nodes.length === 0) {
      state.canvas.nodes = defaultNodes();
      await saveNow();
    } else {
      state.canvas.nodes = pruneNodes(state.canvas.nodes);
    }
    if (!state.selectedId || !nodeById(state.selectedId)) {
      state.selectedId = state.canvas.nodes.find((node) => {
        const asset = node.assetId ? assetById(node.assetId) : undefined;
        return node.kind === 'asset' && asset?.kind === 'concept';
      })?.id
        ?? state.canvas.nodes.find((node) => node.kind === 'group')?.id
        ?? state.canvas.nodes.find((node) => node.kind === 'build')?.id
        ?? state.canvas.nodes.find((node) => node.kind === 'brief')?.id
        ?? state.canvas.nodes[0]?.id
        ?? null;
    }
    renderAll();
    setSaveState('Saved');
    updateComfyStatus();
    const focusId = new URLSearchParams(window.location.search).get('focus');
    if (focusId && assetById(focusId)) {
      setTimeout(() => activateAsset(focusId), 80);
    }
  } catch (error) {
    setSaveState('Error', true);
    toast(`Could not load studio: ${error.message}`);
    state.assets = [];
    state.canvas = { nodes: [], inBuild: [] };
    renderAll();
  }
}

function syncBuildFlags() {
  const selected = new Set(state.canvas.inBuild);
  for (const asset of state.assets) asset.inBuild = selected.has(asset.id);
}

function defaultNodes() {
  const nodes = [{ id: 'brief', kind: 'brief', x: 34, y: 70, width: 286 }];
  const concepts = state.assets.filter((asset) => asset.kind === 'concept');
  const sprites = state.assets.filter((asset) => asset.kind === 'sprite');
  const screenshots = state.assets.filter((asset) => asset.kind === 'screenshot');
  const audio = state.assets.find((asset) => asset.kind === 'audio');
  const preferredSprites = ['player', 'crawler', 'brute', 'boss'];
  const orderedSprites = [...sprites].sort((left, right) => {
    const leftIndex = preferredSprites.indexOf(left.name.toLowerCase());
    const rightIndex = preferredSprites.indexOf(right.name.toLowerCase());
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex)
      || left.name.localeCompare(right.name);
  });

  concepts.slice(0, 2).forEach((asset, index) => {
    nodes.push({
      id: `asset-${asset.id}`,
      kind: 'asset',
      assetId: asset.id,
      x: 358,
      y: 26 + index * 370,
      width: 306,
    });
  });
  if (sprites.length > 0) {
    nodes.push({
      id: 'group-sprites',
      kind: 'group',
      assetIds: orderedSprites.slice(0, 4).map((asset) => asset.id),
      x: 706,
      y: 32,
      width: 332,
    });
  }
  if (audio) {
    nodes.push({
      id: `asset-${audio.id}`,
      kind: 'asset',
      assetId: audio.id,
      x: 34,
      y: 252,
      width: 286,
    });
  }
  if (screenshots.length > 0) {
    nodes.push({
      id: `build-${screenshots[0].id}`,
      kind: 'build',
      assetId: screenshots[0].id,
      x: 34,
      y: 500,
      width: 404,
    });
  }
  if (state.assets.length === 0) {
    nodes.push({ id: 'empty', kind: 'asset', empty: true, x: 358, y: 100, width: 300 });
  }
  return nodes;
}

function pruneNodes(nodes) {
  return nodes.filter((node) => {
    if (node.empty || node.kind === 'brief') return true;
    if (node.kind === 'group') {
      node.assetIds = (node.assetIds ?? []).filter((id) => assetById(id));
      return node.assetIds.length > 0;
    }
    return Boolean(node.assetId && assetById(node.assetId));
  });
}

async function saveNow() {
  clearTimeout(saveTimer);
  const nodes = state.canvas.nodes.filter((node) => !node.generating);
  try {
    const result = await request('/api/canvas', {
      method: 'PUT',
      body: JSON.stringify({ nodes, inBuild: state.canvas.inBuild }),
    });
    state.canvas.inBuild = result.canvas.inBuild;
    setSaveState('Saved');
  } catch (error) {
    setSaveState('Save failed', true);
    toast(`Canvas save failed: ${error.message}`);
  }
}

function scheduleSave() {
  setSaveState('Saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function renderAll() {
  $('#projectName').textContent = state.project.name;
  $('#projectLabel').textContent = state.project.name.toUpperCase();
  $('#assetCount').textContent = `${state.assets.length} asset${state.assets.length === 1 ? '' : 's'}`;
  updateComfyStatus();
  renderLibrary();
  renderCanvas();
  renderInspector();
  renderMinimap();
  applyView();
}

function updateComfyStatus() {
  const health = state.comfyui;
  const element = $('#comfyState');
  element.classList.toggle('online', Boolean(health.online));
  element.classList.toggle('offline', !health.online);
  element.innerHTML = `<span class="dot"></span>${health.online ? 'ComfyUI online' : 'ComfyUI offline'}`;
  $('#libraryEndpoint').textContent = health.url || 'ComfyUI';
  $('#libraryWorkflow').textContent = health.workflowExists
    ? (health.online ? 'Workflow ready' : 'Workflow found · ComfyUI offline')
    : 'Workflow missing';
  $('#dockRefs').textContent = health.online ? 'COMFYUI · LOCAL' : 'COMFYUI · OFFLINE';
}

function thumbFor(asset) {
  if (!asset) return '';
  if (asset.kind === 'audio') {
    return '<span class="asset-thumb" aria-hidden="true"><svg class="icon" style="width:17px;height:17px;color:var(--lime)"><use href="#i-wave"></use></svg></span>';
  }
  return `<span class="asset-thumb"><img src="${escapeHtml(asset.url)}" alt="" loading="lazy"></span>`;
}

function renderLibrary() {
  const list = $('#libraryList');
  const query = state.search.trim().toLowerCase();
  const assets = state.assets.filter((asset) => {
    const typeOk = state.filter === 'all' || asset.kind === state.filter;
    const haystack = `${asset.name} ${asset.file} ${asset.prompt ?? ''}`.toLowerCase();
    return typeOk && (!query || haystack.includes(query));
  });
  list.innerHTML = assets.map((asset) => {
    const active = state.selectedId && (
      assetNodeFor(asset.id)?.id === state.selectedId ||
      (nodeById(state.selectedId)?.assetId === asset.id) ||
      (nodeById(state.selectedId)?.assetIds ?? []).includes(asset.id)
    );
    return `
      <button class="asset-item${active ? ' selected' : ''}" type="button" data-asset="${asset.id}" data-type="${asset.kind}">
        ${thumbFor(asset)}
        <span>
          <span class="asset-item-name">${escapeHtml(asset.name)}</span>
          <span class="asset-item-meta">${escapeHtml(asset.kind)} · ${escapeHtml(asset.source)} · ${formatBytes(asset.bytes)}</span>
        </span>
        <span class="asset-item-mark">${asset.inBuild ? '<span class="dot"></span>IN' : ''}</span>
      </button>
    `;
  }).join('');
  $('#libraryCount').textContent = `${assets.length} ITEM${assets.length === 1 ? '' : 'S'}`;
  $('#libraryEmpty').hidden = assets.length > 0;
  $('#collectionLabel').textContent = `IN BUILD / ${state.canvas.inBuild.length}`;
  $$('.filter').forEach((filter) => {
    filter.setAttribute('aria-pressed', String(filter.dataset.filter === state.filter));
  });
  $$('.asset-item', list).forEach((item) => {
    item.addEventListener('click', () => activateAsset(item.dataset.asset));
  });
}

function activateAsset(assetId) {
  const asset = assetById(assetId);
  if (!asset) return;
  const existing = assetNodeFor(assetId);
  if (existing) {
    state.selectedId = existing.id;
    focusNode(existing.id);
    renderLibrary();
    renderInspector();
    return;
  }
  const node = {
    id: `asset-${asset.id}`,
    kind: 'asset',
    assetId: asset.id,
    x: 380 + Math.random() * 140,
    y: 120 + Math.random() * 180,
    width: asset.kind === 'audio' ? 286 : 306,
  };
  state.canvas.nodes.push(node);
  state.selectedId = node.id;
  renderCanvas();
  renderLibrary();
  renderInspector();
  renderMinimap();
  focusNode(node.id);
  scheduleSave();
}

function nodeHead(label, badge = '', badgeClass = '') {
  return `<div class="node-head"><span class="left"><span class="node-type">${escapeHtml(label)}</span>${badge ? `<span class="badge ${badgeClass}">${escapeHtml(badge)}</span>` : ''}</span><button class="menu" type="button" data-menu aria-label="Asset options"><svg class="icon"><use href="#i-more"></use></svg></button></div>`;
}

function waveformBars(count = 16) {
  return Array.from({ length: count }, (_, index) => `<span style="height:${8 + ((index * 13) % 28)}px"></span>`).join('');
}

function nodeMarkup(node) {
  if (node.empty) {
    return `${nodeHead('EMPTY')}<div class="node-body"><div class="node-title">No assets yet</div><div class="node-sub">Generate an asset from the prompt bar, or add files under assets/.</div></div>`;
  }
  if (node.kind === 'brief') {
    return `${nodeHead('BRIEF', state.project.name.toUpperCase())}<div class="brief-node"><p class="quote">“${escapeHtml(state.project.name)}：把角色、构建截图、BGM 和变体放在同一张画布上，先从可玩的构建开始。”</p><div class="tags"><span class="mini-tag">asset canvas</span><span class="mini-tag">local project</span><span class="mini-tag">verified build</span></div></div>`;
  }
  if (node.kind === 'group') {
    const assets = (node.assetIds ?? []).map(assetById).filter(Boolean);
    const allInBuild = assets.length > 0 && assets.every((asset) => asset.inBuild);
    return `${nodeHead('SPRITE SET', allInBuild ? 'IN BUILD' : 'SET')}
      <div class="sprite-board">${assets.map((asset) => `<div class="sprite-pair"><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)} sprite"><span>${escapeHtml(asset.name)}</span></div>`).join('')}</div>
      <div class="node-body"><div class="node-title">Sprite set / ${assets.length}</div><div class="node-sub">RGBA · project assets</div></div>
      <div class="node-foot"><span class="node-tag">${allInBuild ? 'IN BUILD' : 'SET'}</span><button class="button secondary" type="button" data-use-group>Manage</button></div>`;
  }
  if (node.generating) {
    return `${nodeHead('GENERATING', 'JOB')}<div class="node-media"><div class="shimmer"></div></div><div class="node-body"><div class="node-title">Generating asset…</div><div class="node-sub">${escapeHtml(node.progress ?? 'ComfyUI')}</div></div>`;
  }
  if (node.error) {
    return `${nodeHead('GENERATION', 'ERROR', 'coral')}<div class="node-media">${escapeHtml(node.error)}</div><div class="node-body"><div class="node-title">Generation failed</div><div class="node-sub">Check the ComfyUI status, then retry.</div></div>`;
  }
  const asset = assetById(node.assetId);
  if (!asset) return '';
  if (asset.kind === 'audio') {
    return `${nodeHead('AUDIO', 'LOOP')}<div class="audio-node"><div class="waveform" aria-label="Audio waveform">${waveformBars(20)}</div><div class="node-title">${escapeHtml(asset.name)}</div><div class="node-sub">${formatBytes(asset.bytes)} · ${escapeHtml(asset.source)}</div></div><div class="node-foot"><span class="node-tag">AUDIO</span><button class="button secondary" type="button" data-audio="${asset.id}">Preview</button></div>`;
  }
  if (node.kind === 'build') {
    return `${nodeHead('GAME BUILD', 'PLAYABLE')}<div class="node-media node-game"><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}"></div><div class="node-body"><div class="node-title">${escapeHtml(asset.name)}</div><div class="node-sub">${escapeHtml(asset.file)}</div></div><div class="node-foot"><span class="node-tag">LINKED ASSET</span><a class="button secondary" href="${escapeHtml(asset.url)}" target="_blank" rel="noreferrer">Open</a></div>`;
  }
  return `${nodeHead(asset.kind.toUpperCase(), asset.inBuild ? 'IN BUILD' : '')}<div class="node-media node-art"><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}"></div><div class="node-body"><div class="node-title">${escapeHtml(asset.name)}</div><div class="node-sub">${escapeHtml(asset.source)} · ${formatBytes(asset.bytes)}</div></div><div class="node-foot"><span class="node-tag">${asset.inBuild ? 'IN BUILD' : 'ASSET'}</span><button class="button secondary" type="button" data-use="${asset.id}">${asset.inBuild ? 'Remove' : 'Use in build'}</button></div>`;
}

function renderCanvas() {
  $$('.node', world).forEach((node) => node.remove());
  for (const node of state.canvas.nodes) {
    const element = document.createElement('article');
    element.className = `node node-${node.kind}${node.id === state.selectedId ? ' selected' : ''}${node.generating ? ' node-generating' : ''}${node.error ? ' node-error' : ''}`;
    element.id = `node-${node.id}`;
    element.dataset.nodeId = node.id;
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    element.style.width = `${node.width}px`;
    element.innerHTML = nodeMarkup(node);
    world.appendChild(element);
    bindNode(element, node);
  }
  renderWires();
}

function bindNode(element, node) {
  element.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a')) return;
    event.stopPropagation();
    selectNode(node.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = node.x;
    const startTop = node.y;
    element.classList.add('dragging');
    element.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      node.x = Math.round(startLeft + (moveEvent.clientX - startX) / state.scale);
      node.y = Math.round(startTop + (moveEvent.clientY - startY) / state.scale);
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
      renderWires();
      renderMinimap();
    };
    const up = () => {
      element.classList.remove('dragging');
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      scheduleSave();
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
  });
  element.addEventListener('click', () => selectNode(node.id));
  $$('[data-use]', element).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleUse([button.dataset.use]);
    });
  });
  $$('[data-use-group]', element).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleUse(node.assetIds ?? []);
    });
  });
  $$('[data-audio]', element).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      previewAudio(button.dataset.audio);
    });
  });
  $$('[data-menu]', element).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toast('Asset actions are available in the inspector.');
    });
  });
}

function renderWires() {
  const svg = $('#wires');
  svg.setAttribute('viewBox', '0 0 1200 860');
  const edges = [];
  const brief = state.canvas.nodes.find((node) => node.kind === 'brief');
  const concepts = state.canvas.nodes.filter((node) => {
    const asset = node.assetId ? assetById(node.assetId) : undefined;
    return node.kind === 'asset' && asset?.kind === 'concept';
  });
  const group = state.canvas.nodes.find((node) => node.kind === 'group');
  const build = state.canvas.nodes.find((node) => node.kind === 'build');
  if (brief) {
    for (const concept of concepts.slice(0, 2)) edges.push([brief, concept]);
  }
  if (concepts[0] && group) edges.push([concepts[0], group]);
  if (group && build) edges.push([group, build]);
  svg.innerHTML = '';
  for (const [from, to] of edges) {
    const fromElement = $(`#node-${from.id}`);
    const toElement = $(`#node-${to.id}`);
    if (!fromElement || !toElement) continue;
    const sx = from.x + from.width;
    const sy = from.y + fromElement.offsetHeight / 2;
    const tx = to.x;
    const ty = to.y + toElement.offsetHeight / 2;
    const middle = (sx + tx) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${sx} ${sy} C ${middle} ${sy}, ${middle} ${ty}, ${tx} ${ty}`);
    svg.appendChild(path);
  }
}

function renderMinimap() {
  const map = $('#mapWorld');
  $$('.mini-node', map).forEach((node) => node.remove());
  const width = 1200;
  const height = 860;
  const mapWidth = 148;
  const mapHeight = 71;
  for (const node of state.canvas.nodes) {
    const element = $(`#node-${node.id}`);
    const mini = document.createElement('div');
    mini.className = `mini-node${node.kind === 'build' ? ' game' : ''}`;
    mini.style.left = `${(node.x / width) * mapWidth}px`;
    mini.style.top = `${(node.y / height) * mapHeight}px`;
    mini.style.width = `${Math.max(3, (node.width / width) * mapWidth)}px`;
    mini.style.height = `${Math.max(3, ((element?.offsetHeight ?? 100) / height) * mapHeight)}px`;
    map.insertBefore(mini, $('#miniViewport'));
  }
  const viewport = $('#miniViewport');
  viewport.style.left = `${Math.max(0, -state.panX / state.scale / 7)}px`;
  viewport.style.top = `${Math.max(0, -state.panY / state.scale / 10)}px`;
  viewport.style.width = `${Math.min(mapWidth - 4, canvas.clientWidth / state.scale / 8.1)}px`;
  viewport.style.height = `${Math.min(mapHeight - 4, canvas.clientHeight / state.scale / 12)}px`;
}

function selectNode(id) {
  state.selectedId = id;
  $$('.node', world).forEach((node) => node.classList.toggle('selected', node.dataset.nodeId === id));
  renderLibrary();
  renderInspector();
}

function focusNode(id) {
  const node = state.canvas.nodes.find((entry) => entry.id === id);
  if (!node) return;
  selectNode(id);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  state.panX = width / 2 - (node.x + node.width / 2) * state.scale;
  state.panY = height / 2 - (node.y + 130) * state.scale;
  applyView();
}

function applyView() {
  world.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
  $('#zoomReadout').textContent = `${Math.round(state.scale * 100)}%`;
  $('#mapZoom').textContent = `${Math.round(state.scale * 100)}%`;
  $('#canvasGrid').style.setProperty('--grid', `${24 * state.scale}px`);
  $('#canvasGrid').style.setProperty('--gx', `${state.panX}px`);
  $('#canvasGrid').style.setProperty('--gy', `${state.panY}px`);
  renderMinimap();
}

function fitCanvas() {
  state.scale = window.innerWidth < 760 ? 0.46 : 0.78;
  state.panX = 0;
  state.panY = window.innerWidth < 760 ? 45 : 0;
  applyView();
}

function renderInspector() {
  const node = nodeById(state.selectedId);
  const body = $('#inspectorBody');
  if (!node) {
    body.innerHTML = '<div class="inspector-empty"><strong>NO SELECTION</strong>Select an asset on the canvas or in the library to inspect it.</div>';
    return;
  }
  if (node.kind === 'brief') {
    body.innerHTML = `
      <div class="inspect-preview brief-preview"><span class="preview-badge">BRIEF</span><div style="padding:22px 18px;color:#dbe2d1;font-size:12px;line-height:1.65">“${escapeHtml(state.project.name)}：把角色、构建截图、BGM 和变体放在同一张画布上，先从可玩的构建开始。”</div></div>
      <h2 class="inspect-name">Creative brief</h2>
      <div class="inspect-sub">${escapeHtml(state.project.root)}</div>
      <div class="inspect-tags"><span class="tag good">PROJECT</span><span class="tag">asset canvas</span></div>
      <div class="meta-grid">
        <div class="meta-cell"><div class="k">PROJECT</div><div class="v">${escapeHtml(state.project.name)}</div></div>
        <div class="meta-cell"><div class="k">ASSETS</div><div class="v">${state.assets.length}</div></div>
        <div class="meta-cell"><div class="k">IN BUILD</div><div class="v">${state.canvas.inBuild.length}</div></div>
        <div class="meta-cell"><div class="k">COMFYUI</div><div class="v">${state.comfyui.online ? 'online' : 'offline'}</div></div>
      </div>
      <div class="section-label"><span>NEXT</span><span>LOCAL</span></div>
      <div class="prompt-box" style="min-height:64px;color:var(--muted)">Type a prompt in the bottom bar to create a game-ready asset. Every generated image is saved to .gamedream/studio/generated and appears in the library.</div>
      <div class="inspect-actions"><button class="button primary full" type="button" data-focus-prompt>Open generation prompt</button></div>
    `;
    $('[data-focus-prompt]', body)?.addEventListener('click', () => $('#promptInput').focus());
    return;
  }
  if (node.kind === 'group') {
    const assets = (node.assetIds ?? []).map(assetById).filter(Boolean);
    body.innerHTML = `
      <div class="inspect-preview sprites-preview"><span class="preview-badge">SPRITE SET</span>${assets.map((asset) => `<div class="sprite-pair"><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}"><span>${escapeHtml(asset.name)}</span></div>`).join('')}</div>
      <h2 class="inspect-name">Sprite set</h2>
      <div class="inspect-sub">${assets.length} sprites · project assets</div>
      <div class="inspect-tags"><span class="tag good">IN BUILD</span><span class="tag">RGBA</span><span class="tag">sprite</span></div>
      <div class="meta-grid">
        <div class="meta-cell"><div class="k">TYPE</div><div class="v">Sprite set</div></div>
        <div class="meta-cell"><div class="k">COUNT</div><div class="v">${assets.length}</div></div>
        <div class="meta-cell"><div class="k">SOURCE</div><div class="v">project modules</div></div>
        <div class="meta-cell"><div class="k">IN BUILD</div><div class="v">${assets.filter((asset) => asset.inBuild).length}/${assets.length}</div></div>
      </div>
      <div class="inspect-actions"><button class="button primary full" type="button" data-use-set>${assets.every((asset) => asset.inBuild) ? 'Remove set from build' : 'Use set in build'}</button></div>
    `;
    $('[data-use-set]', body)?.addEventListener('click', () => toggleUse(node.assetIds ?? []));
    return;
  }
  if (node.generating) {
    body.innerHTML = `
      <div class="inspect-preview audio-preview"><span class="preview-badge">GENERATING</span><div class="shimmer" style="width:96px;height:96px"></div></div>
      <h2 class="inspect-name">Generating asset</h2>
      <div class="inspect-sub">ComfyUI job · local workflow</div>
      <div class="job-progress">${escapeHtml(node.progress ?? 'Queued')}</div>
      <div class="inspect-actions"><button class="button secondary full" type="button" data-focus-selected>Focus canvas</button></div>
    `;
    $('[data-focus-selected]', body)?.addEventListener('click', () => focusNode(node.id));
    return;
  }
  if (node.error) {
    body.innerHTML = `
      <div class="inspect-preview audio-preview"><span class="preview-badge" style="color:var(--coral)">GENERATION FAILED</span><div style="padding:20px;color:var(--coral);font:9px/1.5 var(--mono)">${escapeHtml(node.error)}</div></div>
      <h2 class="inspect-name">Generation failed</h2>
      <div class="inspect-sub">The asset was not saved.</div>
      <div class="inspect-actions"><button class="button secondary full" type="button" data-retry>Edit prompt and retry</button></div>
    `;
    $('[data-retry]', body)?.addEventListener('click', () => $('#promptInput').focus());
    return;
  }
  const asset = assetById(node.assetId);
  if (!asset) {
    body.innerHTML = '<div class="inspector-empty"><strong>MISSING ASSET</strong>This canvas node points to a file that is no longer present.</div>';
    return;
  }
  const preview = asset.kind === 'audio'
    ? `<div class="inspect-preview audio-preview"><span class="preview-badge">AUDIO</span><div class="waveform">${waveformBars(18)}</div></div>`
    : `<div class="inspect-preview"><span class="preview-badge">${asset.kind.toUpperCase()}</span><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name)}"></div>`;
  const prompt = asset.prompt ?? (asset.source === 'generated' ? 'Prompt metadata missing.' : 'No prompt metadata for this imported asset.');
  body.innerHTML = `
    ${preview}
    <h2 class="inspect-name">${escapeHtml(asset.name)}</h2>
    <div class="inspect-sub">${escapeHtml(asset.file)}</div>
    <div class="inspect-tags">${asset.inBuild ? '<span class="tag good">IN BUILD</span>' : ''}<span class="tag">${escapeHtml(asset.kind)}</span><span class="tag">${escapeHtml(asset.source)}</span></div>
    <div class="meta-grid">
      <div class="meta-cell"><div class="k">TYPE</div><div class="v">${escapeHtml(asset.kind)}</div></div>
      <div class="meta-cell"><div class="k">SIZE</div><div class="v">${formatBytes(asset.bytes)}</div></div>
      <div class="meta-cell"><div class="k">SOURCE</div><div class="v">${escapeHtml(asset.source)}</div></div>
      <div class="meta-cell"><div class="k">SEED</div><div class="v">${escapeHtml(asset.seed ?? '—')}</div></div>
      <div class="meta-cell"><div class="k">FILE</div><div class="v">${escapeHtml(asset.file.split('/').pop())}</div></div>
      <div class="meta-cell"><div class="k">MODEL</div><div class="v">${asset.source === 'generated' ? 'Qwen / ComfyUI' : 'project'}</div></div>
    </div>
    <div class="section-label"><span>PROMPT</span><span>READ-ONLY</span></div>
    <textarea class="prompt-box" readonly aria-label="Asset prompt">${escapeHtml(prompt)}</textarea>
    <div class="inspect-actions">
      <button class="button primary full" type="button" data-use-selected>${asset.inBuild ? 'Remove from build' : 'Use in build'}</button>
      <a class="button secondary" href="${escapeHtml(asset.url)}" download>Download</a>
      ${asset.kind === 'audio' ? '<button class="button secondary" type="button" data-audio-inspector>Preview</button>' : '<button class="button secondary" type="button" data-focus-selected>Focus</button>'}
    </div>
  `;
  $('[data-use-selected]', body)?.addEventListener('click', () => toggleUse([asset.id]));
  $('[data-audio-inspector]', body)?.addEventListener('click', () => previewAudio(asset.id));
  $('[data-focus-selected]', body)?.addEventListener('click', () => focusNode(node.id));
}

function renderAssetState() {
  renderLibrary();
  renderCanvas();
  renderInspector();
}

async function toggleUse(assetIds) {
  if (assetIds.length === 0) return;
  const desired = !assetIds.every((id) => assetById(id)?.inBuild);
  try {
    let canvas = state.canvas;
    for (const id of assetIds) {
      const result = await request(`/api/assets/${id}/use`, {
        method: 'POST',
        body: JSON.stringify({ value: desired }),
      });
      canvas = result.canvas;
    }
    state.canvas.inBuild = canvas.inBuild;
    syncBuildFlags();
    renderAssetState();
    setSaveState('Saved');
    toast(desired ? 'Asset marked for the build.' : 'Asset removed from the build.');
  } catch (error) {
    toast(`Could not update build selection: ${error.message}`);
  }
}

function previewAudio(assetId) {
  const asset = assetById(assetId);
  if (!asset) return;
  if (state.audio) {
    state.audio.pause();
    state.audio = null;
  }
  const audio = new Audio(asset.url);
  state.audio = audio;
  audio.play().then(() => toast(`Playing ${asset.name}`)).catch(() => toast('Audio preview is unavailable.'));
}

function setGenerating(active, message = '') {
  state.generating = active;
  const button = $('#generateBtn');
  button.disabled = active;
  button.innerHTML = active ? 'Generating…' : 'Generate <span aria-hidden="true">↵</span>';
  $('#queueLabel').textContent = active ? message || 'COMFYUI · QUEUED' : 'LOCAL SANDBOX';
}

async function generateAsset() {
  if (state.generating) return;
  const prompt = $('#promptInput').value.trim();
  if (!prompt) {
    toast('Describe the asset before generating.');
    $('#promptInput').focus();
    return;
  }
  const transparent = $('#transparentChip').classList.contains('accent');
  const jobNode = {
    id: `job-${Date.now()}`,
    kind: 'asset',
    x: 390,
    y: 390,
    width: 286,
    generating: true,
    progress: 'Submitting…',
    prompt,
  };
  state.canvas.nodes.push(jobNode);
  state.selectedId = jobNode.id;
  renderCanvas();
  renderLibrary();
  renderInspector();
  focusNode(jobNode.id);
  setGenerating(true, 'COMFYUI · SUBMITTING');
  try {
    const result = await request('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, transparent }),
    });
    await pollJob(jobNode, result.job.id);
  } catch (error) {
    jobNode.generating = false;
    jobNode.error = error.message;
    renderCanvas();
    renderInspector();
    setGenerating(false);
    toast(`Generation failed: ${error.message}`);
  }
}

async function pollJob(node, jobId) {
  while (true) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
    let job;
    try {
      const result = await request(`/api/jobs/${jobId}`);
      job = result.job;
    } catch (error) {
      node.generating = false;
      node.error = error.message;
      renderCanvas();
      renderInspector();
      setGenerating(false);
      toast(`Job polling failed: ${error.message}`);
      return;
    }
    node.progress = job.progress;
    $('#queueLabel').textContent = `COMFYUI · ${job.progress.toUpperCase()}`;
    renderCanvas();
    renderInspector();
    if (job.status === 'done') {
      const data = await request('/api/state');
      state.assets = data.assets;
      state.comfyui = data.comfyui;
      state.canvas.inBuild = data.canvas.inBuild;
      syncBuildFlags();
      const asset = job.assetId ? assetById(job.assetId) : undefined;
      node.generating = false;
      node.error = undefined;
      if (asset) {
        node.assetId = asset.id;
        node.kind = 'asset';
        node.progress = 'ready';
        node.prompt = asset.prompt ?? node.prompt;
      } else {
        node.error = 'Generated image was saved but could not be indexed.';
      }
      setGenerating(false);
      renderAssetState();
      renderMinimap();
      if (asset) {
        state.selectedId = node.id;
        focusNode(node.id);
        toast(`Generated ${asset.name}.`);
      } else {
        toast('Generation finished, but the asset index was not updated.');
      }
      scheduleSave();
      return;
    }
    if (job.status === 'error') {
      node.generating = false;
      node.error = job.error ?? 'ComfyUI generation failed.';
      setGenerating(false);
      renderAssetState();
      toast(node.error);
      return;
    }
  }
}

$('#assetSearch').addEventListener('input', (event) => {
  state.search = event.target.value;
  renderLibrary();
});
$('#uploadBtn').addEventListener('click', () => $('#uploadInput').click());
$('#uploadInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) {
    toast('Asset is larger than the 12 MB upload limit.');
    return;
  }
  try {
    const data = await new Promise((resolveRead, rejectRead) => {
      const reader = new FileReader();
      reader.onload = () => resolveRead(String(reader.result ?? ''));
      reader.onerror = () => rejectRead(reader.error ?? new Error('could not read file'));
      reader.readAsDataURL(file);
    });
    const result = await request('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, data }),
    });
    await load();
    const uploaded = state.assets.find((asset) => asset.file === result.file);
    if (uploaded) activateAsset(uploaded.id);
    toast(`Imported ${file.name}.`);
  } catch (error) {
    toast(`Import failed: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});
$$('.filter').forEach((filter) => filter.addEventListener('click', () => {
  state.filter = filter.dataset.filter;
  renderLibrary();
}));
$('#refreshBtn').addEventListener('click', () => {
  if (state.generating) {
    toast('A generation job is still running.');
    return;
  }
  load();
});
$('#focusGenerate').addEventListener('click', () => {
  $('#promptInput').focus();
  if (window.innerWidth <= 760) setScreen('canvas');
});
$('#generateBtn').addEventListener('click', generateAsset);
$('#promptInput').addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    generateAsset();
  }
});
$('#transparentChip').addEventListener('click', () => {
  $('#transparentChip').classList.toggle('accent');
});
$('#modelChip').addEventListener('click', () => toast('Generation uses the configured local ComfyUI workflow.'));
$('#countChip').addEventListener('click', () => toast('This workflow returns one image per job. Generate again for another variant.'));
$('#refChip').addEventListener('click', () => toast('The project asset library is the reference context for this canvas.'));

$$('[data-tool]').forEach((button) => button.addEventListener('click', () => {
  state.tool = button.dataset.tool;
  $$('[data-tool]').forEach((tool) => tool.setAttribute('aria-pressed', String(tool === button)));
  canvas.classList.toggle('hand', state.tool === 'hand');
}));
$$('[data-zoom]').forEach((button) => button.addEventListener('click', () => {
  const old = state.scale;
  const rect = canvas.getBoundingClientRect();
  state.scale = Math.min(1.6, Math.max(0.35, state.scale + (button.dataset.zoom === 'in' ? 0.1 : -0.1)));
  const mx = rect.width / 2;
  const my = rect.height / 2;
  state.panX = mx - ((mx - state.panX) / old) * state.scale;
  state.panY = my - ((my - state.panY) / old) * state.scale;
  applyView();
}));
$('#fitBtn').addEventListener('click', fitCanvas);
$('#gridBtn').addEventListener('click', () => {
  const active = $('#gridBtn').getAttribute('aria-pressed') === 'true';
  $('#gridBtn').setAttribute('aria-pressed', String(!active));
  $('#canvasGrid').style.display = active ? 'none' : 'block';
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.node, .canvas-toolbar, .prompt-dock, .minimap')) return;
  if (state.tool !== 'hand' && event.button !== 1 && event.pointerType !== 'touch') return;
  event.preventDefault();
  canvas.classList.add('panning');
  canvas.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  const startY = event.clientY;
  const startPanX = state.panX;
  const startPanY = state.panY;
  const move = (moveEvent) => {
    state.panX = startPanX + moveEvent.clientX - startX;
    state.panY = startPanY + moveEvent.clientY - startY;
    applyView();
  };
  const up = () => {
    canvas.classList.remove('panning');
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const old = state.scale;
    state.scale = Math.min(1.6, Math.max(0.35, state.scale * (event.deltaY < 0 ? 1.08 : 0.92)));
    state.panX = mx - ((mx - state.panX) / old) * state.scale;
    state.panY = my - ((my - state.panY) / old) * state.scale;
  } else {
    state.panX -= event.deltaX;
    state.panY -= event.deltaY;
  }
  applyView();
}, { passive: false });

$('#inspectorClose').addEventListener('click', () => {
  $('#inspector').classList.remove('open');
  $('#drawerScrim').classList.remove('open');
  if (window.innerWidth <= 760) setScreen('canvas');
});
$('#inspectorToggle').addEventListener('click', () => {
  const open = $('#inspector').classList.toggle('open');
  $('#drawerScrim').classList.toggle('open', open);
});
$('#libraryToggle').addEventListener('click', () => {
  const open = $('#library').classList.toggle('open');
  $('#drawerScrim').classList.toggle('open', open);
});
$('#drawerScrim').addEventListener('click', closeDrawers);

function closeDrawers() {
  $('#inspector').classList.remove('open');
  $('#library').classList.remove('open');
  $('#drawerScrim').classList.remove('open');
}

function setScreen(screen) {
  document.body.dataset.screen = screen;
  $$('.mobile-tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.screen === screen)));
  closeDrawers();
}

$$('.mobile-tab').forEach((tab) => tab.addEventListener('click', () => setScreen(tab.dataset.screen)));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDrawers();
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (event.key.toLowerCase() === 'v') $('[data-tool="select"]').click();
  if (event.key.toLowerCase() === 'h') $('[data-tool="hand"]').click();
  if (event.key.toLowerCase() === 'f') fitCanvas();
});

window.addEventListener('resize', applyView);
applyView();
load();
