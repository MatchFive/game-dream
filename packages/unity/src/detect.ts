import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

export interface UnityInstallation {
  bin: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
}

export interface DetectUnityOptions {
  env?: NodeJS.ProcessEnv;
  bin?: string;
  timeoutMs?: number;
}

const UNITY_NAME = process.platform === 'win32' ? 'Unity.exe' : 'Unity';

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function binFromPath(path: string): string | null {
  if (isFile(path)) return path;
  if (!isDirectory(path)) return null;
  const suffixes = [
    UNITY_NAME,
    join('Editor', UNITY_NAME),
    join('Contents', 'MacOS', 'Unity'),
    join('Unity.app', 'Contents', 'MacOS', 'Unity'),
  ];
  for (const suffix of suffixes) {
    const candidate = join(path, suffix);
    if (isFile(candidate)) return candidate;
  }
  return null;
}

function candidateRoots(): string[] {
  const roots = [
    'D:\\unity',
    'C:\\Program Files\\Unity\\Hub\\Editor',
    'C:\\Program Files\\Unity',
    '/Applications/Unity/Hub/Editor',
    join(process.env.HOME ?? process.env.USERPROFILE ?? '', 'Unity', 'Hub', 'Editor'),
  ];
  const candidates: string[] = [];
  for (const root of roots) {
    if (!root || !isDirectory(root)) continue;
    try {
      for (const entry of readdirSync(root)) {
        const versioned = join(root, entry, 'Editor');
        if (isDirectory(versioned)) candidates.push(versioned);
        candidates.push(join(root, entry));
      }
    } catch {
      // Unreadable roots are ignored; explicit --unity still works.
    }
  }
  return candidates;
}

export function findUnityCandidates(options: DetectUnityOptions = {}): string[] {
  const env = options.env ?? process.env;
  const requested = options.bin ?? env.UNITY_BIN ?? env.UNITY_EDITOR;
  if (requested) {
    const explicit = binFromPath(requested);
    return explicit ? [resolve(explicit)] : [];
  }
  const seen = new Set<string>();
  return candidateRoots()
    .map((path) => binFromPath(path))
    .filter((path): path is string => Boolean(path))
    .map((path) => resolve(path))
    .filter((path) => (seen.has(path) ? false : (seen.add(path), true)))
    .sort((a, b) => {
      const va = /[\\/](\d+)\.(\d+)\.(\d+)/.exec(a);
      const vb = /[\\/](\d+)\.(\d+)\.(\d+)/.exec(b);
      const na = va ? Number(va[1]) * 1_000_000 + Number(va[2]) * 1_000 + Number(va[3]) : 0;
      const nb = vb ? Number(vb[1]) * 1_000_000 + Number(vb[2]) * 1_000 + Number(vb[3]) : 0;
      return nb - na || b.localeCompare(a);
    });
}

export function findUnityBin(options: DetectUnityOptions = {}): string | null {
  return findUnityCandidates(options)[0] ?? null;
}

export function parseUnityVersion(
  output: string,
): { version: string; major: number; minor: number; patch: number } | null {
  const match = /(\d+)\.(\d+)\.(\d+)([a-z]\d+)?/i.exec(output);
  if (!match) return null;
  return {
    version: match[0],
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function detectUnity(options: DetectUnityOptions = {}): UnityInstallation | null {
  for (const bin of findUnityCandidates(options)) {
    const result = spawnSync(bin, ['-version'], {
      encoding: 'utf8',
      timeout: options.timeoutMs ?? 10_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) continue;
    const parsed = parseUnityVersion(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    if (!parsed || parsed.major < 6000) continue;
    return { bin, ...parsed };
  }
  return null;
}
