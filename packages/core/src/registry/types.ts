import type { ModuleManifest } from '../schemas/module-manifest.js';

export interface ModuleRecord {
  manifest: ModuleManifest;
  dir: string;
}

export interface ModuleRegistry {
  get(id: string, range?: string): ModuleRecord | null;
  list(): ModuleRecord[];
}
