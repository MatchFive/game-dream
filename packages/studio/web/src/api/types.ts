import type {
  AgentBatch,
  AgentEvent,
  CanvasNode,
  CanvasState,
  ComfyJob,
  StudioAsset,
  StudioState,
} from '@gamedream/studio';

export type {
  AgentBatch,
  AgentEvent,
  CanvasNode,
  CanvasState,
  ComfyJob,
  StudioAsset,
  StudioState,
};

export interface GateSnapshot {
  status: 'pass' | 'fail' | 'skip' | string;
  detail?: string;
  metrics?: Record<string, number>;
}

export interface VerifyRun {
  id: string;
  createdAt: string;
  durationMs: number;
  engine: 'present' | 'missing';
  gates: Record<string, GateSnapshot>;
  ok: boolean;
  output?: string;
}

export interface SessionSummary {
  steps?: number;
  generation?: number;
  finished?: boolean;
  updatedAt?: string;
  eventCount?: number;
  path: string;
}

export interface ProjectBuild {
  engine: 'godot' | 'unity' | 'web' | 'unknown';
  manifest: boolean;
  lockfile: boolean;
  screenshot?: { file: string; url: string };
  runs: VerifyRun[];
  latestRun?: VerifyRun;
  session?: SessionSummary;
}

export interface ProjectSnapshot {
  project: { name: string; root: string };
  assets: StudioAsset[];
  canvas: CanvasState;
  build: ProjectBuild;
  comfyui: {
    url: string;
    workflow: string;
    workflowExists: boolean;
    online: boolean;
  };
}

export interface AgentSnapshots {
  active?: AgentBatch;
  batches: AgentBatch[];
  queued?: Array<{ id: string; status: string }>;
}

export interface PublicSettings {
  model: {
    provider: 'auto' | 'fake' | 'openai';
    model: string;
    baseUrl: string;
    hasApiKey: boolean;
  };
  image: { url: string; workflow: string; workflowsDir: string };
  engines: { godotBin: string; unityBin: string };
  agent: { skillsDirs: string[]; mcpConfigs: string[] };
}

export interface SettingsPayload {
  settings: PublicSettings;
  workspace: string;
}

export interface ProjectRecord {
  name: string;
  path: string;
  current?: boolean;
  engine?: string;
}

export interface ProjectsPayload {
  workspace: string;
  current: string;
  projects: ProjectRecord[];
}

export interface WorkflowInfo {
  id: string;
  name: string;
  description: string;
  kind: 'image' | 'audio';
  source: string;
  valid: boolean;
  error?: string;
}

export interface AssetAgentEvent {
  seq: number;
  at: string;
  type: string;
  tool?: string;
  ok?: boolean;
  output?: string;
  data?: unknown;
  error?: string;
}

export interface AssetAgentRun {
  id: string;
  prompt: string;
  status: 'running' | 'finished' | 'failed' | 'canceled';
  createdAt: string;
  finishedAt?: string;
  events: AssetAgentEvent[];
  result?: Record<string, unknown>;
  error?: string;
}

export interface PolicyRule {
  tool: string;
  mode: 'allow' | 'ask' | 'deny';
  arg?: string;
  prefix?: string;
  reason?: string;
}

export interface PolicyPayload {
  policy: {
    default?: 'allow' | 'ask' | 'deny';
    tools?: Record<string, 'allow' | 'ask' | 'deny'>;
    rules?: PolicyRule[];
  };
  availableTools: string[];
  source: string;
}

export interface SceneReview {
  verdict: 'good' | 'acceptable' | 'bad';
  score?: number;
  notes?: string;
  at: string;
}

export interface SceneSummary {
  id: string;
  name: string;
  createdAt: string;
  buildings: number;
  pass: boolean;
  issues: string[];
  attempts: number;
  review?: SceneReview;
}

export interface StoredScene {
  id: string;
  name: string;
  createdAt: string;
  spec: Record<string, unknown>;
  layout: {
    buildings: Array<{ id: string; prefab: string; rect: { x: number; y: number; w: number; h: number } }>;
    props: Array<{ id: string; type: string }>;
    lots: Array<{ id: string; kind: string }>;
    anchors: Array<{ id: string; kind: string }>;
    bounds: { width: number; height: number };
  };
  validation: { pass: boolean; metrics: Record<string, number>; issues: Array<{ code: string; detail: string }> };
  svg: string;
  traceId: string;
  attempts: number;
  review?: SceneReview;
}
