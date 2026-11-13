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
  engine: 'present' | 'missing';
}

const GODOT_MISSING_MESSAGE =
  'Godot 4.4+ not found. Set GODOT_BIN to the console executable (Godot_v4.*_console.exe) or add godot to PATH.';

export async function verifyCommand(options: {
  projectDir: string;
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
}): Promise<VerifyReport> {
  let engine: VerifyReport['engine'] = 'missing';
  let markers = ['GAMEDREAM_BOOT_OK'];
  const gates: VerifyReport['gates'] = {
    G1: { status: 'fail' },
    G2: { status: 'skip', message: GODOT_MISSING_MESSAGE },
    G3: { status: 'skip', message: GODOT_MISSING_MESSAGE },
  };

  try {
    parseLockfile(
      JSON.parse(readFileSync(join(options.projectDir, 'modules.lock.json'), 'utf8')),
    );
    const manifest = parseGameManifest(
      JSON.parse(
        readFileSync(join(options.projectDir, 'game/game.manifest.json'), 'utf8'),
      ),
    );
    markers = manifest.acceptance.markers;
    gates.G1 = { status: 'pass' };
  } catch (error) {
    gates.G1 = { status: 'fail', message: (error as Error).message };
    return { gates, engine };
  }

  const godot = await detectGodot({ env: options.env, runner: options.runner });
  if (!godot) return { gates, engine };

  engine = 'present';
  if (godot.major < 4 || (godot.major === 4 && godot.minor < 4)) {
    gates.G2 = {
      status: 'fail',
      message: `Godot ${godot.version} detected; 4.4+ required.`,
    };
    gates.G3 = { status: 'skip', message: 'not run: G2 failed' };
    return { gates, engine };
  }

  const imported = await importProject(options.projectDir, godot, options.runner);
  const importErrors = findScriptErrors(imported);
  if (imported.exitCode !== 0 || importErrors.length > 0) {
    gates.G2 = {
      status: 'fail',
      message: importErrors.join('\n') || `exit ${imported.exitCode}`,
    };
    return { gates, engine };
  }
  gates.G2 = { status: 'pass' };

  const run = await runHeadless(options.projectDir, godot, {
    quitAfter: 1200,
    runner: options.runner,
  });
  const errors = findScriptErrors(run);
  if (run.exitCode !== 0) {
    gates.G3 = { status: 'fail', message: `exit ${run.exitCode}` };
  } else if (errors.length > 0) {
    gates.G3 = { status: 'fail', message: errors.join('\n') };
  } else {
    const missing = markers.find((marker) => !hasMarker(run, marker));
    gates.G3 = missing
      ? { status: 'fail', message: `missing ${missing}` }
      : { status: 'pass' };
  }
  return { gates, engine };
}

export function exitCodeFor(report: VerifyReport): 0 | 2 | 3 {
  if (Object.values(report.gates).some((gate) => gate.status === 'fail')) return 2;
  if (report.gates.G2.status === 'skip' || report.gates.G3.status === 'skip') return 3;
  return 0;
}
