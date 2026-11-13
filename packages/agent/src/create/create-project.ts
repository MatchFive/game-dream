import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { composeProject, parseGameSpec, planComposition } from '@gamedream/core';
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
    const plan = planComposition({
      spec,
      modulesDir: options.modulesDir,
      templatesDir: options.templatesDir,
    });
    return {
      spec,
      templateId: selection.templateId,
      reason: selection.reason,
      outDir: options.outDir,
      provider: options.provider.name,
      plannedModules: plan.resolution.order,
      plannedFiles: plan.plannedFiles,
    };
  }

  mkdirSync(options.outDir, { recursive: true });
  const specPath = join(options.outDir, 'gamedream.yaml');
  const nextSpec = stringify(spec);
  if (existsSync(specPath)) {
    const previous = readFileSync(specPath, 'utf8');
    if (previous !== nextSpec) {
      writeFileSync(`${specPath}.bak`, previous, 'utf8');
    }
  }
  writeFileSync(specPath, nextSpec, 'utf8');

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
