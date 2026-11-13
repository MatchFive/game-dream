import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGameManifest, parseLockfile } from '@gamedream/core';
import {
  detectGodot,
  findScriptErrors,
  hasMarker,
  importProject,
  runHeadless,
  type CommandRunner,
} from '@gamedream/godot';

export interface GateResult {
  status: 'pass' | 'fail' | 'skip';
  message?: string;
}

export interface VerifyReport {
  gates: Record<'G1' | 'G2' | 'G3', GateResult>;
}

export async function verifyCommand(options: {
  projectDir: string;
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
}): Promise<VerifyReport> {
  const gates: VerifyReport['gates'] = {
    G1: { status: 'fail' },
    G2: { status: 'skip', message: 'GODOT_NOT_FOUND' },
    G3: { status: 'skip', message: 'GODOT_NOT_FOUND' },
  };

  try {
    parseLockfile(
      JSON.parse(readFileSync(join(options.projectDir, 'modules.lock.json'), 'utf8')),
    );
    parseGameManifest(
      JSON.parse(
        readFileSync(join(options.projectDir, 'game/game.manifest.json'), 'utf8'),
      ),
    );
    gates.G1 = { status: 'pass' };
  } catch (error) {
    gates.G1 = { status: 'fail', message: (error as Error).message };
    return { gates };
  }

  const godot = await detectGodot({ env: options.env, runner: options.runner });
  if (!godot) return { gates };

  const imported = await importProject(options.projectDir, godot, options.runner);
  const importErrors = findScriptErrors(imported);
  if (imported.exitCode !== 0 || importErrors.length > 0) {
    gates.G2 = {
      status: 'fail',
      message: importErrors.join('\n') || `exit ${imported.exitCode}`,
    };
    return { gates };
  }
  gates.G2 = { status: 'pass' };

  const run = await runHeadless(options.projectDir, godot, {
    quitAfter: 300,
    runner: options.runner,
  });
  const errors = findScriptErrors(run);
  if (run.exitCode !== 0) {
    gates.G3 = { status: 'fail', message: `exit ${run.exitCode}` };
  } else if (errors.length > 0) {
    gates.G3 = { status: 'fail', message: errors.join('\n') };
  } else if (!hasMarker(run, 'GAMEDREAM_BOOT_OK')) {
    gates.G3 = { status: 'fail', message: 'missing GAMEDREAM_BOOT_OK' };
  } else if (!hasMarker(run, 'INVENTORY_COUNT=1')) {
    gates.G3 = { status: 'fail', message: 'missing INVENTORY_COUNT=1' };
  } else {
    gates.G3 = { status: 'pass' };
  }
  return { gates };
}
