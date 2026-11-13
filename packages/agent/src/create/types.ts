import type { ComposeResult, GameSpec } from '@gamedream/core';
import type { ModelProvider } from '../types.js';

export type CreateMode = 'auto' | 'dry-run';

export interface CreateOptions {
  prompt: string;
  outDir: string;
  modulesDir: string;
  templatesDir: string;
  provider: ModelProvider;
  mode: CreateMode;
}

export interface CreateResult {
  spec: GameSpec;
  templateId: string;
  reason: string;
  outDir: string;
  provider: string;
  compose?: ComposeResult;
  plannedModules?: string[];
  plannedFiles?: string[];
}
