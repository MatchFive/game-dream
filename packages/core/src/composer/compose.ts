import { mkdirSync, writeFileSync } from 'node:fs';
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
import { generateGameScript } from './generate-game-script.js';
import { generateProjectGodot } from './generate-project-godot.js';
import { generateMainScene } from './generate-main-scene.js';
import { writeGameManifest } from './write-game-manifest.js';

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

  const generatedDir = join(options.outDir, 'game/_generated');
  mkdirSync(generatedDir, { recursive: true });
  const mainScript = join(generatedDir, 'main.gd');
  const gameScript = join(generatedDir, 'game.gd');
  const mainScene = join(generatedDir, 'main.tscn');
  const projectGodot = join(options.outDir, 'project.godot');

  writeFileSync(
    mainScript,
    `extends Node

func _ready() -> void:
	print("GAMEDREAM_BOOT_OK")
	await get_tree().create_timer(0.2).timeout
	var inventory := Game.get_service("inventory")
	if inventory == null:
		push_error("inventory service missing")
		get_tree().quit(1)
		return
	inventory.add_item("potion", 1)
	print("INVENTORY_COUNT=%d" % inventory.count("potion"))
	await get_tree().create_timer(0.2).timeout
	get_tree().quit(0)
`,
    'utf8',
  );
  writeFileSync(gameScript, generateGameScript(), 'utf8');
  writeFileSync(mainScene, generateMainScene(resolution.modules), 'utf8');
  writeFileSync(
    projectGodot,
    generateProjectGodot({
      projectName: spec.project.name,
      modules: resolution.modules,
    }),
    'utf8',
  );

  const manifestPath = writeGameManifest(options.outDir, [
    'game/_generated/game.gd',
    'game/_generated/main.gd',
    'game/_generated/main.tscn',
  ]);

  return {
    outDir: options.outDir,
    order: resolution.order,
    modules: resolution.modules,
    lockfile,
    files: [lockfilePath, projectGodot, mainScript, gameScript, mainScene, manifestPath],
  };
}

function resolveTemplatePath(options: ComposeOptions, templateId: string): string {
  return join(options.templatesDir, templateId, 'template.yaml');
}
