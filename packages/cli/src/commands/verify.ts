import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  createVisionProvider,
  type VisualReview,
  type VisionProvider,
  type VisionProviderKind,
} from '@gamedream/agent';
import { parseGameManifest, parseLockfile } from '@gamedream/core';
import { verifyProjectIntegrity } from './integrity.js';
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
  /**
   * `error` 表示环境问题（例如 Godot 反复原生崩溃、引擎缺失），
   * 与项目本身的质量无关，统计时不能算作项目失败。
   */
  status: 'pass' | 'fail' | 'skip' | 'error';
  message?: string;
  /** 崩溃重试的次数，仅在 status 为 error 时出现 */
  attempts?: number;
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
  /** 崩溃重试之间的等待，测试里注入以免真的等待 */
  sleep?: (ms: number) => Promise<void>;
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
    const lockfile = parseLockfile(
      JSON.parse(readFileSync(join(options.projectDir, 'modules.lock.json'), 'utf8')),
    );
    const manifest = parseGameManifest(
      JSON.parse(
        readFileSync(join(options.projectDir, 'game/game.manifest.json'), 'utf8'),
      ),
    );
    const integrityProblems = verifyProjectIntegrity(
      options.projectDir,
      lockfile,
      manifest,
    );
    if (integrityProblems.length > 0) {
      const shown = integrityProblems.slice(0, 3).join('; ');
      const more = integrityProblems.length > 3
        ? ` (+${integrityProblems.length - 3} more)`
        : '';
      throw new Error(`integrity check failed: ${shown}${more}`);
    }
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

  const importProjectOnce = () =>
    importProject(options.projectDir, godot, options.runner);
  const sleep = options.sleep ?? defaultSleep;
  const imported = await runToleratingCrashes(importProjectOnce, sleep);
  if (imported.crashed) {
    gates.G2 = {
      status: 'error',
      attempts: imported.attempts,
      message: godotCrashMessage('import', imported.result.exitCode, imported.attempts),
    };
    gates.G3 = { status: 'skip', message: 'not run: Godot crashed' };
    if (gates.G6) gates.G6 = { status: 'skip', message: 'not run: Godot crashed' };
    return { gates, engine };
  }
  const importErrors = findScriptErrors(imported.result);
  if (imported.result.exitCode !== 0 || importErrors.length > 0) {
    gates.G2 = {
      status: 'fail',
      message: importErrors.join('\n') || `exit ${imported.result.exitCode}`,
    };
    if (gates.G6) gates.G6 = { status: 'skip', message: 'not run: G2 failed' };
    return { gates, engine };
  }
  gates.G2 = { status: 'pass' };

  const runHeadlessOnce = () =>
    runHeadless(options.projectDir, godot, {
      quitAfter: 1200,
      runner: options.runner,
    });
  const run = await runToleratingCrashes(runHeadlessOnce, sleep);
  if (run.crashed) {
    gates.G3 = {
      status: 'error',
      attempts: run.attempts,
      message: godotCrashMessage('run', run.result.exitCode, run.attempts),
    };
  } else {
    const errors = findScriptErrors(run.result);
    if (run.result.exitCode !== 0) {
      gates.G3 = { status: 'fail', message: `exit ${run.result.exitCode}` };
    } else if (errors.length > 0) {
      gates.G3 = { status: 'fail', message: errors.join('\n') };
    } else {
      const missing = markers.find((marker) => !hasMarker(run.result, marker));
      gates.G3 = missing
        ? { status: 'fail', message: `missing ${missing}` }
        : { status: 'pass' };
    }
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

/** Windows NTSTATUS: access violation / stack buffer overrun seen intermittently when Godot imports or exits. */
const TRANSIENT_GODOT_EXITS = new Set([3221225477, 3221226356]);
const CRASH_RETRY_LIMIT = 2;
const CRASH_BACKOFF_MS = [300, 900];

function isTransientGodotCrash(result: { exitCode: number }): boolean {
  return TRANSIENT_GODOT_EXITS.has(result.exitCode);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function godotCrashMessage(phase: 'import' | 'run', exitCode: number, attempts: number): string {
  return `Godot crashed ${attempts}x during ${phase} (exit ${exitCode}); environment problem, not a project failure`;
}

/**
 * 有界重试：原生崩溃和项目本身的脚本错误不同，重跑一次往往就过了。
 * 重试仍崩溃时把结果标记为 crashed，由调用方归到 status: 'error'。
 */
async function runToleratingCrashes<T extends { exitCode: number }>(
  attempt: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
): Promise<{ result: T; attempts: number; crashed: boolean }> {
  let result = await attempt();
  let attempts = 1;
  while (isTransientGodotCrash(result) && attempts <= CRASH_RETRY_LIMIT) {
    await sleep(CRASH_BACKOFF_MS[attempts - 1] ?? CRASH_BACKOFF_MS[CRASH_BACKOFF_MS.length - 1]);
    result = await attempt();
    attempts += 1;
  }
  return { result, attempts, crashed: isTransientGodotCrash(result) };
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

export function exitCodeFor(report: VerifyReport): 0 | 2 | 3 | 4 {
  if (Object.values(report.gates).some((gate) => gate.status === 'fail')) return 2;
  // 4 = 环境问题（引擎反复崩溃），与项目失败区分开，便于 CI 分流
  if (Object.values(report.gates).some((gate) => gate.status === 'error')) return 4;
  if (report.gates.G2.status === 'skip' || report.gates.G3.status === 'skip') return 3;
  return 0;
}
