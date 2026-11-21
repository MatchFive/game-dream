import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { scanAssets } from './assets.js';
import type { CanvasState, StudioAsset, StudioProject } from './types.js';

export type EngineKind = 'godot' | 'web' | 'unity' | 'unknown';

export interface GateSnapshot {
  status: 'pass' | 'fail' | 'skip';
  message?: string;
}

export interface VerifyRun {
  id: string;
  createdAt: string;
  durationMs: number;
  engine: 'present' | 'missing';
  gates: Record<string, GateSnapshot>;
  ok: boolean;
  output?: string;
}

export interface SessionSummary {
  steps?: number;
  generation?: number;
  finished?: boolean;
  updatedAt?: string;
  eventCount?: number;
  path: string;
}

export interface ProjectBuild {
  engine: EngineKind;
  manifest: boolean;
  lockfile: boolean;
  screenshot?: {
    file: string;
    url: string;
  };
  runs: VerifyRun[];
  latestRun?: VerifyRun;
  session?: SessionSummary;
}

export interface ProjectSnapshot {
  project: StudioProject;
  assets: StudioAsset[];
  canvas: CanvasState;
  build: ProjectBuild;
  comfyui: {
    url: string;
    workflow: string;
    workflowExists: boolean;
    online: boolean;
  };
}

const RUNS_FILE = 'runs.json';
const STUDIO_DIR = 'studio';

function studioDirectory(root: string): string {
  return join(root, '.gamedream', STUDIO_DIR);
}

export function detectEngine(root: string): EngineKind {
  if (existsSync(join(root, 'project.godot'))) return 'godot';
  if (existsSync(join(root, 'ProjectSettings', 'ProjectVersion.txt'))) return 'unity';
  if (
    existsSync(join(root, 'index.html')) ||
    existsSync(join(root, 'package.json')) && existsSync(join(root, 'vite.config.ts'))
  ) {
    return 'web';
  }
  return 'unknown';
}

export function findScreenshot(root: string): { file: string; url: string } | undefined {
  const candidates: string[] = [];
  const visit = (directory: string, depth = 0): void => {
    if (!existsSync(directory) || depth > 4) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.tools') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path, depth + 1);
        continue;
      }
      if (['.png', '.jpg', '.jpeg', '.webp'].includes(extname(entry.name).toLowerCase())) {
        candidates.push(path);
      }
    }
  };
  for (const directory of [
    join(root, 'screenshots'),
    join(root, 'game', 'screenshots'),
    join(root, 'docs', 'evidence'),
  ]) {
    visit(directory);
  }
  candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  const file = candidates.find((candidate) => /screenshot|shot|preview/i.test(basename(candidate)));
  if (!file) return undefined;
  const relativeFile = relative(root, file).split('\\').join('/');
  return { file: relativeFile, url: `/api/project/screenshot?file=${encodeURIComponent(relativeFile)}` };
}

export function loadRuns(root: string): VerifyRun[] {
  const file = join(studioDirectory(root), RUNS_FILE);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRun).slice(0, 30) : [];
  } catch {
    return [];
  }
}

function isRun(value: unknown): value is VerifyRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<VerifyRun>;
  return (
    typeof run.id === 'string' &&
    typeof run.createdAt === 'string' &&
    typeof run.durationMs === 'number' &&
    Boolean(run.gates) &&
    typeof run.ok === 'boolean'
  );
}

export function appendRun(root: string, run: VerifyRun): VerifyRun[] {
  const runs = [run, ...loadRuns(root)].slice(0, 30);
  const directory = studioDirectory(root);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, RUNS_FILE), `${JSON.stringify(runs, null, 2)}\n`, 'utf8');
  return runs;
}

function loadSession(root: string): SessionSummary | undefined {
  const file = join(root, '.gamedream', 'session.json');
  if (!existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      generation?: number;
      finished?: boolean;
      steps?: number;
      usage?: { calls?: number };
      events?: unknown[];
      updatedAt?: string;
    };
    return {
      path: relative(root, file).split('\\').join('/'),
      steps: typeof parsed.steps === 'number' ? parsed.steps : undefined,
      generation: typeof parsed.generation === 'number' ? parsed.generation : undefined,
      finished: typeof parsed.finished === 'boolean' ? parsed.finished : undefined,
      eventCount: Array.isArray(parsed.events) ? parsed.events.length : undefined,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    return undefined;
  }
}

export function loadProjectSnapshot(
  root: string,
  canvas: CanvasState,
  comfyui: ProjectSnapshot['comfyui'],
): ProjectSnapshot {
  const runs = loadRuns(root);
  return {
    project: {
      name: (() => {
        const config = join(root, 'gamedream.yaml');
        if (existsSync(config)) {
          try {
            const match = readFileSync(config, 'utf8').match(/^name:\s*["']?([^"'\r\n]+)["']?/m);
            if (match?.[1]?.trim()) return match[1].trim();
          } catch {
            // Fall back.
          }
        }
        const packageFile = join(root, 'package.json');
        if (existsSync(packageFile)) {
          try {
            const pkg = JSON.parse(readFileSync(packageFile, 'utf8')) as { name?: string };
            if (pkg.name) return pkg.name;
          } catch {
            // Fall back.
          }
        }
        return basename(root);
      })(),
      root,
    },
    assets: scanAssets(root, canvas.inBuild),
    canvas,
    build: {
      engine: detectEngine(root),
      manifest: existsSync(join(root, 'game', 'game.manifest.json')),
      lockfile: existsSync(join(root, 'modules.lock.json')),
      screenshot: findScreenshot(root),
      runs,
      latestRun: runs[0],
      session: loadSession(root),
    },
    comfyui,
  };
}

export function runId(): string {
  return createHash('sha1')
    .update(`${Date.now()}-${randomUUID()}`)
    .digest('hex')
    .slice(0, 12);
}

export function uploadFile(root: string, name: string, base64: string): string {
  const extension = extname(name).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp3', '.wav', '.ogg'].includes(extension)) {
    throw new Error(`unsupported upload extension: ${extension || 'none'}`);
  }
  const safe = basename(name).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+/, '') || `upload${extension}`;
  const directory = join(root, 'assets', 'uploads');
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${Date.now()}-${safe}`);
  writeFileSync(file, Buffer.from(base64, 'base64'));
  return relative(root, file).split('\\').join('/');
}
