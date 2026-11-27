import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleRecord } from '../registry/types.js';
import { copyPath } from '../io/copy-path.js';

export function copyModules(outDir: string, modules: ModuleRecord[]): string[] {
  const targetRoot = join(outDir, 'modules');
  mkdirSync(targetRoot, { recursive: true });
  const ids = new Set(modules.map((module) => module.manifest.id));

  for (const entry of readdirSync(targetRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !ids.has(entry.name)) {
      rmSync(join(targetRoot, entry.name), { recursive: true, force: true });
    }
  }

  const copied: string[] = [];
  for (const module of modules) {
    const target = join(targetRoot, module.manifest.id);
    rmSync(target, { recursive: true, force: true });
    copyPath(module.dir, target);
    copied.push(target);
  }
  return copied;
}
