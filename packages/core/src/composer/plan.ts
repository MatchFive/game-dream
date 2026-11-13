import { join } from 'node:path';
import type { GameSpec } from '../schemas/game-spec.js';
import type { TemplateManifest } from '../schemas/template.js';
import { LocalRegistry } from '../registry/local-registry.js';
import { resolveModules, type Resolution } from '../resolver/resolve-modules.js';
import { loadGameSpec } from '../spec/load-game-spec.js';
import { loadTemplate } from '../spec/load-template.js';
import type { ComposeOptions } from './types.js';

export const PLANNED_FILES = [
  'project.godot',
  'modules.lock.json',
  'game/_generated/game.gd',
  'game/_generated/input_map.gd',
  'game/_generated/main.gd',
  'game/_generated/main.tscn',
  'game/game.manifest.json',
];

export interface CompositionPlan {
  template: TemplateManifest;
  resolution: Resolution;
  plannedFiles: string[];
}

export function planComposition(input: {
  spec: GameSpec;
  modulesDir: string;
  templatesDir: string;
}): CompositionPlan {
  const template = loadTemplate(
    join(input.templatesDir, input.spec.genre.template, 'template.yaml'),
  );
  const registry = new LocalRegistry(input.modulesDir);
  const resolution = resolveModules({
    spec: input.spec,
    template,
    registry,
    engine: input.spec.project.engine,
    engineVersion: input.spec.project.godot_version,
  });
  return { template, resolution, plannedFiles: [...PLANNED_FILES] };
}

export function planProject(options: ComposeOptions): CompositionPlan & { spec: GameSpec } {
  const spec = loadGameSpec(options.specPath);
  return {
    spec,
    ...planComposition({
      spec,
      modulesDir: options.modulesDir,
      templatesDir: options.templatesDir,
    }),
  };
}
