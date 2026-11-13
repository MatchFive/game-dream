import { existsSync, readdirSync } from 'node:fs';
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

function normalizeBin(path: string): string {
  return path.endsWith('Unity.exe') || path.endsWith('/Unity') || path.endsWith('\\Unity')
    ? path
    : join(path, 'Unity.exe');
}

function candidateRoots(): string[] {
  const roots = [
    'D:\\unity',
    'C:\\Program Files\\Unity\\Hub\\Editor',
    'C:\\Program Files\\Unity',
  ];
  const candidates: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      candidates.push(normalizeBin(join(root, entry, 'Editor')));
      candidates.push(normalizeBin(join(root, entry)));
    }
  }
  const mac = '/Applications/Unity/Hub/Editor';
  if (existsSync(mac)) {
    for (const entry of readdirSync(mac)) {
      candidates.push(join(mac, entry, 'Unity.app/Contents/MacOS/Unity'));
    }
  }
  return candidates;
}

export function findUnityBin(options: DetectUnityOptions = {}): string | null {
  const env = options.env ?? process.env;
  const requested = options.bin ?? env.UNITY_BIN ?? env.UNITY_EDITOR;
  if (requested) {
    const bin = requested.endsWith('.exe') || requested.endsWith('/Unity') || requested.endsWith('\\Unity')
      ? requested
      : normalizeBin(requested);
    return existsSync(bin) ? resolve(bin) : null;
  }
  for (const candidate of candidateRoots()) {
    if (existsSync(candidate)) return resolve(candidate);
  }
  return null;
}

export function parseUnityVersion(output: string): { version: string; major: number; minor: number; patch: number } | null {
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
  const bin = findUnityBin(options);
  if (!bin) return null;
  const result = spawnSync(bin, ['-version'], {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 10_000,
  });
  if (result.error || result.status !== 0) return null;
  const parsed = parseUnityVersion(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (!parsed || parsed.major < 6000) return null;
  return { bin, ...parsed };
}
