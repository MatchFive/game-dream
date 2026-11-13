import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import {
  LocalRegistry,
  composeProject,
  loadTemplate,
  parseGameSpec,
  resolveModules,
} from '@gamedream/core';
import { draftGameSpec } from '../intake/draft-game-spec.js';
import { selectTemplate } from '../classify/select-template.js';
import type { CreateOptions, CreateResult } from './types.js';

export async function createProject(options: CreateOptions): Promise<CreateResult> {
  const draft = await draftGameSpec({ prompt: options.prompt, provider: options.provider });
  const selection = selectTemplate({
    prompt: options.prompt,
    genre: draft.genre.primary,
    templatesDir: options.templatesDir,
  });
  const spec = parseGameSpec({
    ...draft,
    genre: { ...draft.genre, template: selection.templateId },
  });

  if (options.mode === 'dry-run') {
    const registry = new LocalRegistry(options.modulesDir);
    const template = loadTemplate(
      join(options.templatesDir, selection.templateId, 'template.yaml'),
    );
    const resolution = resolveModules({
      spec,
      template,
      registry,
      engine: spec.project.engine,
      engineVersion: spec.project.godot_version,
    });
    return {
      spec,
      templateId: selection.templateId,
      reason: selection.reason,
      outDir: options.outDir,
      provider: options.provider.name,
      plannedModules: resolution.order,
    };
  }

  mkdirSync(options.outDir, { recursive: true });
  const specPath = join(options.outDir, 'gamedream.yaml');
  writeFileSync(specPath, stringify(spec), 'utf8');

  const compose = await composeProject({
    specPath,
    outDir: options.outDir,
    modulesDir: options.modulesDir,
    templatesDir: options.templatesDir,
  });

  return {
    spec,
    templateId: selection.templateId,
    reason: selection.reason,
    outDir: options.outDir,
    provider: options.provider.name,
    compose,
  };
}
