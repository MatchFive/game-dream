const $ = (selector) => document.querySelector(selector);
let toastTimer;

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
    ? '已保存；留空保持不变'
    : 'sk-...';
  $('#comfyUrl').value = settings.image.url;
  $('#comfyWorkflow').value = settings.image.workflow;
  $('#godotBin').value = settings.engines.godotBin;
  $('#unityBin').value = settings.engines.unityBin;
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
        },
        engines: {
          godotBin: $('#godotBin').value,
          unityBin: $('#unityBin').value,
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

async function openProject(path) {
  const tab = window.open('', '_blank');
  try {
    const data = await request('/api/projects/open', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
    if (tab) tab.location.href = data.url;
    else toast(`项目已打开：${data.url}`);
  } catch (error) {
    if (tab) tab.close();
    toast(`打开失败：${error.message}`);
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

$('#settingsForm').addEventListener('submit', saveSettings);
$('#projectForm').addEventListener('submit', createProject);
void loadSettings();
void loadProjects();
