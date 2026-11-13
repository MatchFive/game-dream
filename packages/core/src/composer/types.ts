import type { Lockfile } from '../schemas/lockfile.js';
import type { ModuleRecord } from '../registry/types.js';

export interface ComposeOptions {
  specPath: string;
  outDir: string;
  modulesDir: string;
  templatesDir: string;
}

export interface ComposeResult {
  outDir: string;
  order: string[];
  modules: ModuleRecord[];
  lockfile: Lockfile;
  files: string[];
}
