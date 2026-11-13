import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { parseModuleManifest } from '../schemas/module-manifest.js';
import type { ModuleRecord, ModuleRegistry } from './types.js';

export class LocalRegistry implements ModuleRegistry {
  private readonly records = new Map<string, ModuleRecord>();

  constructor(modulesDir: string) {
    if (!existsSync(modulesDir)) return;
    for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(modulesDir, entry.name, 'module.yaml');
      if (!existsSync(manifestPath)) continue;
      const manifest = parseModuleManifest(parse(readFileSync(manifestPath, 'utf8')));
      this.records.set(manifest.id, { manifest, dir: join(modulesDir, entry.name) });
    }
  }

  get(id: string): ModuleRecord | null {
    return this.records.get(id) ?? null;
  }

  list(): ModuleRecord[] {
    return [...this.records.values()];
  }
}
