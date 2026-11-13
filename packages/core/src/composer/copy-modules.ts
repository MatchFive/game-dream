import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleRecord } from '../registry/types.js';

export function copyModules(outDir: string, modules: ModuleRecord[]): string[] {
  const targetRoot = join(outDir, 'modules');
  mkdirSync(targetRoot, { recursive: true });
  const copied: string[] = [];
  for (const module of modules) {
    const target = join(targetRoot, module.manifest.id);
    if (!existsSync(target)) {
      cpSync(module.dir, target, { recursive: true });
      copied.push(target);
    }
  }
  return copied;
}
