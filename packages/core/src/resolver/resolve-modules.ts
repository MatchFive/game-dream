import { satisfies } from 'semver';
import { ResolutionError } from '../errors.js';
import type { GameSpec } from '../schemas/game-spec.js';
import type { TemplateManifest } from '../schemas/template.js';
import type { ModuleRecord, ModuleRegistry } from '../registry/types.js';
import { topologicalSort } from './graph.js';

export interface Resolution {
  modules: ModuleRecord[];
  order: string[];
}

export interface ResolveInput {
  spec: GameSpec;
  template: TemplateManifest;
  registry: ModuleRegistry;
  engine: GameSpec['project']['engine'];
}

export function resolveModules(input: ResolveInput): Resolution {
  const { template, registry, engine } = input;
  const byId = new Map<string, ModuleRecord>();
  const edges = new Map<string, string[]>();

  function add(id: string, range: string | undefined, requiredBy: string | undefined): void {
    const existing = registry.get(id, range);
    if (!existing) {
      const code = requiredBy ? 'MISSING_DEPENDENCY' : 'MISSING_MODULE';
      throw new ResolutionError(code, `module not found: ${id}`, {
        module: id,
        requiredBy: requiredBy ?? 'template',
      });
    }
    if (range && !satisfies(existing.manifest.version, range)) {
      throw new ResolutionError(
        'VERSION_MISMATCH',
        `module ${id}@${existing.manifest.version} does not satisfy ${range}`,
        { module: id, range },
      );
    }
    if (existing.manifest.engine !== engine) {
      throw new ResolutionError(
        'ENGINE_MISMATCH',
        `module ${id} targets ${existing.manifest.engine}, expected ${engine}`,
        { module: id, engine },
      );
    }
    if (byId.has(id)) return;
    byId.set(id, existing);
    edges.set(id, []);
    for (const [dep, depRange] of Object.entries(existing.manifest.depends)) {
      edges.get(id)!.push(dep);
      add(dep, depRange, id);
    }
  }

  for (const id of template.modules.required) add(id, undefined, undefined);

  for (const record of byId.values()) {
    for (const conflict of record.manifest.conflicts) {
      if (byId.has(conflict)) {
        throw new ResolutionError(
          'CONFLICT',
          `module ${record.manifest.id} conflicts with ${conflict}`,
          { module: record.manifest.id, conflict },
        );
      }
    }
  }

  let order: string[];
  try {
    order = topologicalSort([...byId.keys()], edges);
  } catch (error) {
    throw new ResolutionError('CYCLE', (error as Error).message);
  }

  return { modules: order.map((id) => byId.get(id)!), order };
}
