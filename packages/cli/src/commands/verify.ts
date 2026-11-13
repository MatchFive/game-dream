import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  createVisionProvider,
  type VisualReview,
  type VisionProvider,
  type VisionProviderKind,
} from '@gamedream/agent';
import { parseGameManifest, parseLockfile } from '@gamedream/core';
import {
  detectGodot,
  findScriptErrors,
  hasMarker,
  importProject,
  runHeadless,
  runScreenshot,
  type CommandRunner,
  type ScreenshotResult,
} from '@gamedream/godot';

export interface GateResult {
  status: 'pass' | 'fail' | 'skip';
  message?: string;
}

export interface VerifyReport {
  gates: Record<'G1' | 'G2' | 'G3', GateResult> & { G6?: GateResult };
  engine: 'present' | 'missing';
}

const GODOT_MISSING_MESSAGE =
  'Godot 4.4+ not found. Set GODOT_BIN to the console executable (Godot_v4.*_console.exe) or add godot to PATH.';

const VISION_SYSTEM =
  'You review game screenshots. Return JSON only with readable, hud_visible, player_visible, enemy_visible, dialogue_readable booleans and an issues string array.';
const VISION_USER =
  'Review this gameplay screenshot. Confirm the HUD, player, enemy, and dialogue are visible and readable.';

export function parseVisionKind(value: string): VisionProviderKind {
  if (value === 'fake' || value === 'openai') return value;
  throw new Error(`unknown vision provider: ${value}`);
}

export async function verifyCommand(options: {
  projectDir: string;
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
  visual?: boolean;
  visualOut?: string;
  vision?: VisionProviderKind;
  visionProvider?: VisionProvider;
}): Promise<VerifyReport> {
  let engine: VerifyReport['engine'] = 'missing';
  let markers = ['GAMEDREAM_BOOT_OK'];
  const gates: VerifyReport['gates'] = {
    G1: { status: 'fail' },
    G2: { status: 'skip', message: GODOT_MISSING_MESSAGE },
    G3: { status: 'skip', message: GODOT_MISSING_MESSAGE },
  };
  const visualRequested = Boolean(options.visual || options.vision);
  if (visualRequested) gates.G6 = { status: 'skip', message: 'not run' };

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
    if (gates.G6) gates.G6 = { status: 'skip', message: 'not run: G1 failed' };
    return { gates, engine };
  }

  const godot = await detectGodot({ env: options.env, runner: options.runner });
  if (!godot) {
    if (gates.G6) gates.G6 = { status: 'skip', message: 'not run: Godot missing' };
    return { gates, engine };
  }

  engine = 'present';
  if (godot.major < 4 || (godot.major === 4 && godot.minor < 4)) {
    gates.G2 = {
      status: 'fail',
      message: `Godot ${godot.version} detected; 4.4+ required.`,
    };
    gates.G3 = { status: 'skip', message: 'not run: G2 failed' };
    if (gates.G6) gates.G6 = { status: 'skip', message: 'not run: G2 failed' };
    return { gates, engine };
  }

  const imported = await importProject(options.projectDir, godot, options.runner);
  const importErrors = findScriptErrors(imported);
  if (imported.exitCode !== 0 || importErrors.length > 0) {
    gates.G2 = {
      status: 'fail',
      message: importErrors.join('\n') || `exit ${imported.exitCode}`,
    };
    if (gates.G6) gates.G6 = { status: 'skip', message: 'not run: G2 failed' };
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

  if (visualRequested) {
    const outPath =
      options.visualOut ??
      join(options.projectDir, 'game/screenshots/screenshot.png');
    try {
      const shot = await runScreenshot(options.projectDir, godot, {
        outPath,
        runner: options.runner,
      });
      const failure = visualFailure(shot);
      if (failure) {
        gates.G6 = { status: 'fail', message: failure };
      } else if (options.vision && shot.imagePath) {
        const provider =
          options.visionProvider ??
          createVisionProvider({ kind: options.vision, env: options.env });
        const review = await provider.review({
          imagePath: shot.imagePath,
          system: VISION_SYSTEM,
          user: VISION_USER,
        });
        const reviewFailure = visionFailure(review);
        gates.G6 = reviewFailure
          ? { status: 'fail', message: reviewFailure }
          : {
              status: 'pass',
              message: `${shot.metrics?.width}x${shot.metrics?.height}, ${shot.metrics?.colors} colors, vision:${provider.name}`,
            };
      } else {
        gates.G6 = {
          status: 'pass',
          message: `${shot.metrics?.width}x${shot.metrics?.height}, ${shot.metrics?.colors} colors`,
        };
      }
    } catch (error) {
      gates.G6 = {
        status: 'fail',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { gates, engine };
}

function visualFailure(shot: ScreenshotResult): string | null {
  const errors = findScriptErrors(shot);
  if (shot.exitCode !== 0) return `exit ${shot.exitCode}`;
  if (errors.length > 0) return errors.join('\n');
  if (!shot.imagePath || !existsSync(shot.imagePath)) return 'missing screenshot';
  try {
    if (statSync(shot.imagePath).size < 1000) return 'screenshot too small';
  } catch {
    return 'missing screenshot';
  }
  const metrics = shot.metrics;
  if (!metrics) return 'missing metrics';
  const values = [
    metrics.width,
    metrics.height,
    metrics.samples,
    metrics.non_black,
    metrics.colors,
    metrics.center_colors,
  ];
  if (!values.every((value) => Number.isFinite(value))) return 'invalid metrics';
  if (metrics.width < 640 || metrics.height < 360) {
    return `screenshot too small: ${metrics.width}x${metrics.height}`;
  }
  if (metrics.samples <= 0 || metrics.non_black / metrics.samples < 0.05) {
    return 'screenshot mostly black';
  }
  if (metrics.colors < 8) return 'screenshot has too few colors';
  if (metrics.center_colors < 4) return 'screenshot has too few center colors';
  return null;
}

function visionFailure(review: VisualReview): string | null {
  const detail = review.issues
    .slice(0, 3)
    .map((issue) => issue.replace(/\s+/g, ' ').trim().slice(0, 120))
    .filter(Boolean)
    .join('; ');
  const suffix = detail ? ` (${detail})` : '';
  if (!review.readable) return `vision: not readable${suffix}`;
  if (!review.hud_visible) return `vision: HUD not visible${suffix}`;
  if (!review.player_visible) return `vision: player not visible${suffix}`;
  if (!review.enemy_visible) return `vision: enemy not visible${suffix}`;
  if (!review.dialogue_readable) return `vision: dialogue not readable${suffix}`;
  return null;
}

export function exitCodeFor(report: VerifyReport): 0 | 2 | 3 {
  if (Object.values(report.gates).some((gate) => gate.status === 'fail')) return 2;
  if (report.gates.G2.status === 'skip' || report.gates.G3.status === 'skip') return 3;
  return 0;
}
