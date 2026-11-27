import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useProjectsQuery, useSettingsQuery } from '../api/hooks';
import { PathField, PathListField } from '../components/PathPicker';
import { Icon } from '../components/Sprite';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import type { PublicSettings } from '../api/types';

interface FormState {
  provider: 'auto' | 'fake' | 'openai';
  model: string;
  baseUrl: string;
  apiKey: string;
  comfyUrl: string;
  workflow: string;
  workflowsDir: string;
  godotBin: string;
  unityBin: string;
  skillsDirs: string[];
  mcpConfigs: string[];
}

function toForm(settings: PublicSettings): FormState {
  return {
    provider: settings.model.provider,
    model: settings.model.model,
    baseUrl: settings.model.baseUrl,
    apiKey: '',
    comfyUrl: settings.image.url,
    workflow: settings.image.workflow,
    workflowsDir: settings.image.workflowsDir,
    godotBin: settings.engines.godotBin,
    unityBin: settings.engines.unityBin,
    skillsDirs: settings.agent.skillsDirs,
    mcpConfigs: settings.agent.mcpConfigs,
  };
}

export function SettingsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useSettingsQuery();
  const projectsQuery = useProjectsQuery();
  const [form, setForm] = useState<FormState>();
  const [status, setStatus] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectPrompt, setProjectPrompt] = useState('');
  const [importPath, setImportPath] = useState('');

  useEffect(() => {
    if (settingsQuery.data && !form) setForm(toForm(settingsQuery.data.settings));
  }, [settingsQuery.data, form]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!form) return;
    setStatus(t('common.loading'));
    try {
      await api.saveSettings({
        model: {
          provider: form.provider,
          model: form.model,
          baseUrl: form.baseUrl,
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        },
        image: { url: form.comfyUrl, workflow: form.workflow, workflowsDir: form.workflowsDir },
        engines: { godotBin: form.godotBin, unityBin: form.unityBin },
        agent: { skillsDirs: form.skillsDirs, mcpConfigs: form.mcpConfigs },
      });
      await queryClient.invalidateQueries({ queryKey: ['studio'] });
      setStatus(t('settings.saved'));
      toast.push(t('settings.saved'));
    } catch (error) {
      setStatus((error as Error).message);
      toast.push((error as Error).message, 'error');
    }
  }

  async function createProject() {
    if (!projectName.trim() || !projectPrompt.trim()) {
      toast.push(t('settings.needNameAndPrompt'), 'error');
      return;
    }
    try {
      await api.createProject({ name: projectName, prompt: projectPrompt });
      setProjectName('');
      setProjectPrompt('');
      await queryClient.invalidateQueries({ queryKey: ['studio'] });
      toast.push(t('settings.projectCreated'));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  }

  async function openProject(path: string) {
    try {
      await api.openProject(path);
      toast.push(t('settings.projectOpened'));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  }

  if (!form) {
    return (
      <>
        <Topbar crumb={<strong>{t('studio.settings')}</strong>} />
        <main className="settings-main">
          <p className="context-path">{t('common.loading')}…</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar
        crumb={
          <>
            <strong>{t('studio.settings')}</strong>
            <span className="sep">/</span>
            <span>{t('settings.crumbSub')}</span>
          </>
        }
      />
      <main className="settings-main">
        <div className="settings-grid">
          <section className="settings-card">
            <h1>{t('settings.title')}</h1>
            <p>
              {t('settings.introLead')} <code>.gamedream/studio/settings.json</code>
              {t('settings.introTail')}
            </p>

            <h2>{t('settings.sectionModel')}</h2>
            <label className="settings-field">
              <span>Provider</span>
              <select value={form.provider} onChange={(event) => patch('provider', event.target.value as FormState['provider'])}>
                <option value="auto">auto</option>
                <option value="fake">fake</option>
                <option value="openai">openai</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Model</span>
              <input value={form.model} placeholder="gpt-4o-mini" onChange={(event) => patch('model', event.target.value)} />
            </label>
            <label className="settings-field">
              <span>Base URL</span>
              <input value={form.baseUrl} placeholder="https://api.openai.com/v1" onChange={(event) => patch('baseUrl', event.target.value)} />
            </label>
            <label className="settings-field">
              <span>{t('settings.apiKey')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.apiKey}
                placeholder={settingsQuery.data?.settings.model.hasApiKey ? t('settings.apiKeySaved') : 'sk-...'}
                onChange={(event) => patch('apiKey', event.target.value)}
              />
            </label>

            <h2>{t('settings.sectionMedia')}</h2>
            <label className="settings-field">
              <span>ComfyUI URL</span>
              <input value={form.comfyUrl} placeholder="http://127.0.0.1:8188" onChange={(event) => patch('comfyUrl', event.target.value)} />
            </label>
            <PathField
              label={t('settings.legacyWorkflow')}
              kind="file"
              filter="JSON (*.json)|*.json|All files (*.*)|*.*"
              value={form.workflow}
              placeholder="D:/path/workflow.json"
              onChange={(value) => patch('workflow', value)}
            />
            <PathField
              label={t('settings.workflowsDir')}
              kind="folder"
              value={form.workflowsDir}
              placeholder={t('settings.workflowsDirPlaceholder')}
              onChange={(value) => patch('workflowsDir', value)}
            />

            <h2>{t('settings.sectionAgent')}</h2>
            <PathListField
              label={t('settings.skillsRoot')}
              kind="folder"
              addLabel={t('settings.addFolder')}
              values={form.skillsDirs}
              onChange={(values) => patch('skillsDirs', values)}
            />
            <PathListField
              label={t('settings.mcpConfig')}
              kind="file"
              filter="JSON (*.json)|*.json|All files (*.*)|*.*"
              addLabel={t('settings.addFile')}
              values={form.mcpConfigs}
              onChange={(values) => patch('mcpConfigs', values)}
            />

            <h2>{t('settings.sectionEngine')}</h2>
            <PathField
              label={t('settings.godotBin')}
              kind="file"
              filter="Executable (*.exe)|*.exe|All files (*.*)|*.*"
              value={form.godotBin}
              placeholder="D:/godot/Godot.exe"
              onChange={(value) => patch('godotBin', value)}
            />
            <PathField
              label={t('settings.unityBin')}
              kind="folder"
              value={form.unityBin}
              placeholder="D:/unity/6000.6.9f1/Editor"
              onChange={(value) => patch('unityBin', value)}
            />

            <div className="settings-actions">
              <button className="button primary" type="button" onClick={() => void save()}>
                <Icon name="check" /> {t('settings.save')}
              </button>
              <span className="status">{status}</span>
            </div>
          </section>

          <section className="settings-card">
            <h1>{t('settings.sectionProject')}</h1>
            <p>
              {t('settings.workspace')}：<code>{settingsQuery.data?.workspace ?? '—'}</code>
            </p>

            <h2>{t('settings.newProject')}</h2>
            <label className="settings-field">
              <span>{t('settings.dirName')}</span>
              <input value={projectName} placeholder="my-survivor" onChange={(event) => setProjectName(event.target.value)} />
            </label>
            <label className="settings-field">
              <span>{t('settings.prompt')}</span>
              <textarea value={projectPrompt} placeholder={t('settings.promptPlaceholder')} onChange={(event) => setProjectPrompt(event.target.value)} />
            </label>
            <div className="settings-actions">
              <button className="button primary" type="button" onClick={() => void createProject()}>
                {t('settings.create')}
              </button>
            </div>

            <h2>{t('settings.openExisting')}</h2>
            <label className="settings-field">
              <span>{t('settings.projectPath')}</span>
              <input value={importPath} placeholder="D:/projects/my-game" onChange={(event) => setImportPath(event.target.value)} />
            </label>
            <div className="settings-actions">
              <button className="button secondary" type="button" onClick={() => void openProject(importPath)}>
                {t('settings.open')}
              </button>
            </div>

            <div className="project-list">
              {(projectsQuery.data?.projects ?? []).map((project) => (
                <div className="project-row" key={project.path}>
                  <div className="name">
                    <strong>{project.name}</strong>
                    <small>{project.path}</small>
                  </div>
                  <div className="actions">
                    {project.path === projectsQuery.data?.current ? (
                      <span className="current">{t('settings.current')}</span>
                    ) : (
                      <button className="button secondary" type="button" onClick={() => void openProject(project.path)}>
                        {t('common.open')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {(projectsQuery.data?.projects.length ?? 0) === 0 && <p className="context-path">{t('settings.noProjects')}</p>}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
