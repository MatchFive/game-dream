import { initLocale, t } from '/i18n.js?v=11';

initLocale();

const $ = (selector) => document.querySelector(selector);
let toastTimer;
const pathLists = { skills: [], mcp: [] };

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 3000);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function setSettings(settings) {
  $('#modelProvider').value = settings.model.provider;
  $('#modelName').value = settings.model.model;
  $('#modelBaseUrl').value = settings.model.baseUrl;
  $('#modelApiKey').value = '';
  $('#modelApiKey').placeholder = settings.model.hasApiKey
    ? t('settings.apiKeySaved')
    : 'sk-...';
  $('#comfyUrl').value = settings.image.url;
  $('#comfyWorkflow').value = settings.image.workflow;
  $('#comfyWorkflowsDir').value = settings.image.workflowsDir ?? '';
  $('#godotBin').value = settings.engines.godotBin;
  $('#unityBin').value = settings.engines.unityBin;
  pathLists.skills = [...(settings.agent?.skillsDirs ?? [])];
  pathLists.mcp = [...(settings.agent?.mcpConfigs ?? [])];
  renderPathLists();
}

function renderPathList(key) {
  const target = key === 'skills' ? $('#agentSkillsList') : $('#agentMcpList');
  if (!target) return;
  const empty = key === 'skills' ? '还没有额外 skills 目录' : '还没有额外 MCP 配置';
  target.innerHTML = pathLists[key].length
    ? pathLists[key].map((path, index) => `
        <div class="path-row">
          <span title="${escapeHtml(path)}">${escapeHtml(path)}</span>
          <button type="button" data-remove-list="${key}" data-index="${index}" aria-label="删除 ${escapeHtml(path)}">×</button>
        </div>
      `).join('')
    : `<div class="path-empty">${empty}</div>`;
}

function renderPathLists() {
  renderPathList('skills');
  renderPathList('mcp');
}

async function choosePath(button) {
  const data = await request('/api/dialog', {
    method: 'POST',
    body: JSON.stringify({
      kind: button.dataset.kind === 'folder' ? 'folder' : 'file',
      title: button.dataset.title ?? '选择路径',
      filter: button.dataset.filter ?? '',
    }),
  });
  return typeof data.path === 'string' ? data.path : '';
}

function pickerError(error) {
  const message = String(error?.message ?? error);
  if (/unknown.*api|404/i.test(message)) {
    return 'Studio 服务版本过旧，请停止后重新运行 start.cmd（必要时加 --build）。';
  }
  return `无法打开选择器：${message}`;
}

async function pickIntoInput(button) {
  const input = document.getElementById(button.dataset.pickInput);
  if (!input) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '选择中…';
  try {
    const path = await choosePath(button);
    if (path) input.value = path;
  } catch (error) {
    toast(pickerError(error));
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function pickIntoList(button) {
  const key = button.dataset.pickList;
  if (!pathLists[key]) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '选择中…';
  try {
    const path = await choosePath(button);
    if (path && !pathLists[key].includes(path)) pathLists[key].push(path);
    renderPathList(key);
  } catch (error) {
    toast(pickerError(error));
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function loadSettings() {
  try {
    const data = await request('/api/settings');
    setSettings(data.settings);
    $('#workspacePath').textContent = data.workspace;
    $('#settingsStatus').textContent = '已加载';
  } catch (error) {
    $('#settingsStatus').textContent = error.message;
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const apiKey = $('#modelApiKey').value;
  try {
    const data = await request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        model: {
          provider: $('#modelProvider').value,
          model: $('#modelName').value,
          baseUrl: $('#modelBaseUrl').value,
          ...(apiKey ? { apiKey } : {}),
        },
        image: {
          url: $('#comfyUrl').value,
          workflow: $('#comfyWorkflow').value,
          workflowsDir: $('#comfyWorkflowsDir').value,
        },
        engines: {
          godotBin: $('#godotBin').value,
          unityBin: $('#unityBin').value,
        },
        agent: {
          skillsDirs: pathLists.skills,
          mcpConfigs: pathLists.mcp,
        },
      }),
    });
    setSettings(data.settings);
    $('#settingsStatus').textContent = '已保存并应用';
    toast('设置已保存');
  } catch (error) {
    $('#settingsStatus').textContent = error.message;
    toast(`保存失败：${error.message}`);
  }
}

function projectRow(project, current) {
  const isCurrent = project.path === current;
  return `
    <div class="project-row">
      <div class="name">
        <strong>${escapeHtml(project.name)}</strong>
        <small>${escapeHtml(project.engine)} · ${escapeHtml(project.path)}</small>
      </div>
      <div class="actions">
        ${isCurrent ? '<span class="current">CURRENT</span>' : `<button class="button secondary" type="button" data-open="${escapeHtml(project.path)}">打开</button>`}
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadProjects() {
  try {
    const data = await request('/api/projects');
    $('#workspacePath').textContent = data.workspace;
    $('#projectList').innerHTML = data.projects.length
      ? data.projects.map((project) => projectRow(project, data.current)).join('')
      : '<div class="settings-field"><span>这个 workspace 还没有项目</span></div>';
    document.querySelectorAll('[data-open]').forEach((button) => {
      button.addEventListener('click', () => openProject(button.dataset.open));
    });
  } catch (error) {
    $('#projectList').textContent = error.message;
  }
}

const RECENT_KEY = 'gamedream.recentProjects';

function recentProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((path) => typeof path === 'string') : [];
  } catch {
    return [];
  }
}

function rememberProject(path) {
  const next = [path, ...recentProjects().filter((entry) => entry !== path)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private-mode storage failures should not block opening the project.
  }
  renderRecentProjects();
}

function renderRecentProjects() {
  const recent = recentProjects();
  $('#recentProjects').innerHTML = recent.length
    ? recent.map((path) => `
      <div class="project-row">
        <div class="name"><strong>${escapeHtml(path.split(/[\\/]/).pop() || path)}</strong><small>${escapeHtml(path)}</small></div>
        <div class="actions"><button class="button secondary" type="button" data-open="${escapeHtml(path)}">打开</button></div>
      </div>
    `).join('')
    : '<div class="settings-field"><span>最近打开的项目会显示在这里</span></div>';
  document.querySelectorAll('#recentProjects [data-open]').forEach((button) => {
    button.addEventListener('click', async () => {
      const url = await openProject(button.dataset.open);
      if (url) rememberProject(button.dataset.open);
    });
  });
}

async function openProject(path) {
  const tab = window.open('', '_blank');
  try {
    const data = await request('/api/projects/open', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
    if (tab) tab.location.href = data.url;
    else toast(`项目已打开：${data.url}`);
    rememberProject(path);
    return data.url;
  } catch (error) {
    if (tab) tab.close();
    toast(`打开失败：${error.message}`);
    return undefined;
  }
}

async function importProject() {
  const path = $('#importPath').value.trim();
  if (!path) {
    $('#importStatus').textContent = '请输入项目路径';
    return;
  }
  $('#importStatus').textContent = '打开中…';
  const url = await openProject(path);
  if (url) {
    $('#importStatus').textContent = '已打开';
    $('#importPath').value = '';
  } else {
    $('#importStatus').textContent = '打开失败';
  }
}

async function createProject(event) {
  event.preventDefault();
  const button = $('#projectCreate');
  button.disabled = true;
  $('#projectStatus').textContent = '创建中…';
  try {
    const data = await request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: $('#projectName').value,
        prompt: $('#projectPrompt').value,
      }),
    });
    $('#projectStatus').textContent = '创建完成';
    $('#projectName').value = '';
    $('#projectPrompt').value = '';
    toast('项目已创建');
    await loadProjects();
    if (data.project?.path) await openProject(data.project.path);
  } catch (error) {
    $('#projectStatus').textContent = error.message;
    toast(`创建失败：${error.message}`);
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('[data-pick-input]').forEach((button) => {
  button.addEventListener('click', () => pickIntoInput(button));
});
document.querySelectorAll('[data-pick-list]').forEach((button) => {
  button.addEventListener('click', () => pickIntoList(button));
});
document.addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove-list]');
  if (!remove) return;
  const key = remove.dataset.removeList;
  const index = Number(remove.dataset.index);
  if (!pathLists[key] || !Number.isInteger(index)) return;
  pathLists[key].splice(index, 1);
  renderPathList(key);
});
$('#settingsForm').addEventListener('submit', saveSettings);
$('#projectForm').addEventListener('submit', createProject);
$('#importOpen').addEventListener('click', importProject);
void loadSettings();
void loadProjects();
renderRecentProjects();
