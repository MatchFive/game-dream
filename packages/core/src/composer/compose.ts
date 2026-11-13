import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planProject } from './plan.js';
import type { Lockfile } from '../schemas/lockfile.js';
import type { ComposeOptions, ComposeResult } from './types.js';
import { hashDirectory } from './file-hash.js';
import { copyModules } from './copy-modules.js';
import { copyTemplateContent } from './copy-template-content.js';
import { writeLockfile } from './write-lockfile.js';
import { generateGameScript } from './generate-game-script.js';
import { generateProjectGodot } from './generate-project-godot.js';
import { generateInputMap } from './generate-input-map.js';
import { generateMainScene } from './generate-main-scene.js';
import { generateMainScript } from './generate-main-script.js';
import { generateSaveSections } from './generate-save-sections.js';
import { mergeProjectGodot } from './merge-project-godot.js';
import { writeGameManifest } from './write-game-manifest.js';

export async function composeProject(options: ComposeOptions): Promise<ComposeResult> {
  const { spec, resolution, template } = planProject(options);
  mkdirSync(options.outDir, { recursive: true });
  copyTemplateContent(
    join(options.templatesDir, spec.genre.template),
    options.outDir,
  );

  copyModules(options.outDir, resolution.modules);

  const lockfile: Lockfile = {
    version: 1,
    modules: resolution.modules.map((module) => ({
      id: module.manifest.id,
      version: module.manifest.version,
      source: 'local',
      hash: hashDirectory(join(options.outDir, 'modules', module.manifest.id)),
    })),
  };
  const lockfilePath = writeLockfile(options.outDir, lockfile);

  const generatedDir = join(options.outDir, 'game/_generated');
  mkdirSync(generatedDir, { recursive: true });
  const mainScript = join(generatedDir, 'main.gd');
  const gameScript = join(generatedDir, 'game.gd');
  const inputMapScript = join(generatedDir, 'input_map.gd');
  const saveSectionsFile = join(generatedDir, 'save_sections.json');
  const mainScene = join(generatedDir, 'main.tscn');
  const projectGodot = join(options.outDir, 'project.godot');

  writeFileSync(mainScript, generateMainScript(resolution.modules), 'utf8');
  writeFileSync(gameScript, generateGameScript(), 'utf8');
  writeFileSync(inputMapScript, generateInputMap(resolution.modules), 'utf8');
  writeFileSync(saveSectionsFile, generateSaveSections(resolution.modules), 'utf8');
  writeFileSync(mainScene, generateMainScene(resolution.modules), 'utf8');
  const existingProject = existsSync(projectGodot)
    ? readFileSync(projectGodot, 'utf8')
    : null;
  const mergedProject = mergeProjectGodot(
    existingProject,
    generateProjectGodot({
      projectName: spec.project.name,
      modules: resolution.modules,
    }),
  );
  if (existingProject !== null) {
    writeFileSync(`${projectGodot}.bak`, existingProject, 'utf8');
  }
  writeFileSync(projectGodot, mergedProject, 'utf8');

  const manifestPath = writeGameManifest(
    options.outDir,
    [
      'game/_generated/game.gd',
      'game/_generated/input_map.gd',
      'game/_generated/save_sections.json',
      'game/_generated/main.gd',
      'game/_generated/main.tscn',
    ],
    template.acceptance_markers,
  );

  return {
    outDir: options.outDir,
    order: resolution.order,
    modules: resolution.modules,
    lockfile,
    files: [
      lockfilePath,
      projectGodot,
      mainScript,
      gameScript,
      inputMapScript,
      saveSectionsFile,
      mainScene,
      manifestPath,
    ],
  };
}
