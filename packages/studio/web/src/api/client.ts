import type {
  AgentBatch,
  AgentSnapshots,
  AssetAgentRun,
  ComfyJob,
  PolicyPayload,
  PolicyRule,
  ProjectSnapshot,
  ProjectsPayload,
  SettingsPayload,
  StudioState,
  VerifyRun,
  WorkflowInfo,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const api = {
  state: () => request<StudioState>('/api/state'),
  project: () => request<ProjectSnapshot>('/api/project'),
  verify: (visual = false) => post<{ run: VerifyRun }>('/api/verify', { visual }),

  settings: () => request<SettingsPayload>('/api/settings'),
  saveSettings: (body: Record<string, unknown>) =>
    post<SettingsPayload>('/api/settings', body),
  projects: () => request<ProjectsPayload>('/api/projects'),
  createProject: (body: { name: string; prompt: string }) =>
    post<{ project: ProjectsPayload['projects'][number] }>('/api/projects', body),
  openProject: (path: string) => post<unknown>('/api/projects/open', { path }),

  agent: () => request<AgentSnapshots>('/api/agent'),
  startAgent: (body: {
    prompt: string;
    candidates?: number;
    maxSteps?: number;
    maxTokens?: number;
    maxCostUsd?: number;
    resume?: boolean;
  }) => post<{ batch: AgentBatch }>('/api/agent/start', body),
  cancelBatch: (batchId: string) => post<unknown>(`/api/agent/batches/${batchId}/cancel`),
  retryBatch: (batchId: string) => post<{ batch: AgentBatch }>(`/api/agent/batches/${batchId}/retry`),
  deleteBatch: (batchId: string) =>
    request<unknown>(`/api/agent/batches/${batchId}`, { method: 'DELETE' }),
  clearBatches: () => request<unknown>('/api/agent/batches/clear', { method: 'DELETE' }),
  candidateDiff: (batchId: string, runId: string) =>
    request<{ diff: unknown }>(`/api/agent/batches/${batchId}/candidates/${runId}/diff`),
  applyCandidate: (batchId: string, runId: string) =>
    post<{ batch: AgentBatch }>(`/api/agent/batches/${batchId}/apply`, { runId }),
  rollbackBatch: (batchId: string) =>
    post<{ batch: AgentBatch }>(`/api/agent/batches/${batchId}/rollback`),
  approve: (batchId: string, runId: string, approvalId: string, allowed: boolean) =>
    post<unknown>(`/api/agent/batches/${batchId}/runs/${runId}/approval`, {
      approvalId,
      allowed,
    }),

  policy: () => request<PolicyPayload>('/api/agent/policy'),
  savePolicyTool: (tool: string, mode: PolicyRule['mode']) =>
    post<PolicyPayload>('/api/agent/policy', { tool, mode }),
  savePolicyDefault: (mode: PolicyRule['mode']) =>
    post<PolicyPayload>('/api/agent/policy', { default: true, mode }),
  addPolicyRule: (rule: PolicyRule) => post<PolicyPayload>('/api/agent/policy/rules', rule),
  deletePolicyRule: (index: number) =>
    request<PolicyPayload>(`/api/agent/policy/rules/${index}`, { method: 'DELETE' }),

  workflows: () =>
    request<{ workflows: WorkflowInfo[]; defaultImage?: string; defaultAudio?: string }>(
      '/api/workflows',
    ),
  choosePath: (body: { kind: 'file' | 'folder'; title?: string; filter?: string }) =>
    post<{ path: string | null }>('/api/dialog', body),
  job: (id: string) => request<{ job: ComfyJob }>(`/api/jobs/${id}`),
  generate: (body: Record<string, unknown>) =>
    post<{ job: ComfyJob }>('/api/generate', body),

  assetRaw: (id: string) => `/api/assets/${id}/raw`,
  renameAsset: (id: string, name: string) =>
    post<unknown>(`/api/assets/${id}/rename`, { name }),
  assetAgentList: () => request<{ runs: AssetAgentRun[] }>('/api/asset-agent'),
  assetAgentStart: (prompt: string) =>
    post<{ run: AssetAgentRun }>('/api/asset-agent/start', { prompt }),
  assetAgentGet: (id: string) => request<{ run: AssetAgentRun }>(`/api/asset-agent/${id}`),
  assetAgentCancel: (id: string) =>
    post<{ run: AssetAgentRun }>(`/api/asset-agent/${id}/cancel`),
  useAsset: (id: string, inBuild: boolean) =>
    post<unknown>(`/api/assets/${id}/use`, { inBuild }),
  upload: (name: string, data: string) => post<unknown>('/api/upload', { name, data }),
  saveCanvas: (canvas: { nodes: unknown[]; inBuild: string[] }) =>
    request<unknown>('/api/canvas', { method: 'PUT', body: JSON.stringify(canvas) }),

  playtestCapabilities: () =>
    request<{ web: boolean; godot: boolean }>('/api/playtest/capabilities'),
  startPlaytest: () => post<{ url?: string; mode?: string }>('/api/playtest/start'),
  stopPlaytest: () => post<unknown>('/api/playtest/stop'),
  visualReview: () => post<{ ok: boolean; detail?: string }>('/api/playtest/visual'),
};
