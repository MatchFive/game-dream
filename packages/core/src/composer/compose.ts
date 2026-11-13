import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LocalRegistry } from '../registry/local-registry.js';
import { resolveModules } from '../resolver/resolve-modules.js';
import { loadGameSpec } from '../spec/load-game-spec.js';
import { loadTemplate } from '../spec/load-template.js';
import type { Lockfile } from '../schemas/lockfile.js';
import type { ComposeOptions, ComposeResult } from './types.js';
import { hashDirectory } from './file-hash.js';
import { copyModules } from './copy-modules.js';
import { writeLockfile } from './write-lockfile.js';

export async function composeProject(options: ComposeOptions): Promise<ComposeResult> {
  const spec = loadGameSpec(options.specPath);
  const template = loadTemplate(resolveTemplatePath(options, spec.genre.template));
  mkdirSync(options.outDir, { recursive: true });
  const registry = new LocalRegistry(options.modulesDir);
  const resolution = resolveModules({
    spec,
    template,
    registry,
    engine: spec.project.engine,
  });

  copyModules(options.outDir, resolution.modules);

  const lockfile: Lockfile = {
    version: 1,
    modules: resolution.modules.map((module) => ({
      id: module.manifest.id,
      version: module.manifest.version,
      source: 'local',
      hash: hashDirectory(module.dir),
    })),
  };
  const lockfilePath = writeLockfile(options.outDir, lockfile);

  return {
    outDir: options.outDir,
    order: resolution.order,
    modules: resolution.modules,
    lockfile,
    files: [lockfilePath],
  };
}

function resolveTemplatePath(options: ComposeOptions, templateId: string): string {
  return join(options.templatesDir, templateId, 'template.yaml');
}
