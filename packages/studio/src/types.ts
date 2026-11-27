export type StudioAssetKind = 'concept' | 'sprite' | 'screenshot' | 'audio';
export type StudioAssetSource = 'project' | 'module' | 'evidence' | 'generated';

export interface StudioAsset {
  id: string;
  name: string;
  file: string;
  url: string;
  kind: StudioAssetKind;
  mime: string;
  bytes: number;
  source: StudioAssetSource;
  prompt?: string;
  seed?: string;
  inBuild: boolean;
}

export type CanvasNodeKind = 'brief' | 'asset' | 'group' | 'build' | 'animation';

export interface CanvasNode {
  id: string;
  kind: CanvasNodeKind;
  x: number;
  y: number;
  width: number;
  assetId?: string;
  assetIds?: string[];
  title?: string;
}

export interface CanvasState {
  nodes: CanvasNode[];
  inBuild: string[];
  updatedAt?: string;
}

export interface StudioProject {
  name: string;
  root: string;
}

export interface ComfyUiConfig {
  url: string;
  workflow: string;
  workflowsDir?: string;
}

export interface ComfyWorkflowInfo {
  id: string;
  name: string;
  description: string;
  kind: 'image' | 'audio';
  source: 'project' | 'workspace' | 'legacy' | 'builtin';
  valid: boolean;
  error?: string;
}

export interface StudioState {
  project: StudioProject;
  assets: StudioAsset[];
  canvas: CanvasState;
  comfyui: {
    url: string;
    workflow: string;
    workflowExists: boolean;
    workflows?: ComfyWorkflowInfo[];
    defaultWorkflow?: string;
    defaultAudio?: string;
    online: boolean;
  };
}

export type ComfyJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface ComfyJob {
  id: string;
  status: ComfyJobStatus;
  prompt: string;
  transparent: boolean;
  seed: number;
  createdAt: string;
  updatedAt: string;
  progress: string;
  assetId?: string;
  error?: string;
  variant?: number;
  batchSize?: number;
  animationId?: string;
  frameIndex?: number;
  frameCount?: number;
  kind?: 'image' | 'audio';
  duration?: number;
  workflowId?: string;
}
