import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface GodotPackageFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface GodotPackageOptions {
  projectDir: string;
  outDir: string;
  force?: boolean;
}

export interface GodotPackageResult {
  outDir: string;
  name: string;
  entry: 'project.godot';
  files: GodotPackageFile[];
  bytes: number;
}

const SKIP_DIRS = new Set([
  '.godot',
  '.git',
  '.commandcode',
  '.superpowers',
  'build',
  'node_modules',
  'screenshots',
]);

function canonical(path: string): string {
  try {
    return realpathSync.native?.(path) ?? realpathSync(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;
    return join(canonical(parent), basename(path));
  }
}

function isInside(base: string, candidate: string): boolean {
  const rel = relative(base, candidate);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function skipped(name: string): boolean {
  return (
    name === 'release.json' ||
    name === 'screenshot.png' ||
    name.endsWith('.bak') ||
    name.endsWith('.log') ||
    name.endsWith('.tmp')
  );
}

function hashFile(path: string): string {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(1024 * 1024);
  const fd = openSync(path, 'r');
  try {
    let read = 0;
    while ((read = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

function copyTree(
  source: string,
  target: string,
  rel: string,
  files: GodotPackageFile[],
  projectDir: string,
): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || skipped(entry.name)) continue;
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error(`refusing to package symlink: ${from}`);
    }
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyTree(from, to, next, files, projectDir);
    } else if (entry.isFile()) {
      const real = realpathSync(from);
      if (!isInside(projectDir, real)) throw new Error(`source escapes project: ${from}`);
      copyFileSync(from, to);
      const bytes = statSync(to).size;
      files.push({ path: next, bytes, sha256: hashFile(to) });
    }
  }
}

export function packageGodotProject(options: GodotPackageOptions): GodotPackageResult {
  const projectDir = canonical(resolve(options.projectDir));
  const outDir = canonical(resolve(options.outDir));
  if (projectDir === outDir) throw new Error('package output must differ from the project directory');
  if (isInside(outDir, projectDir)) {
    throw new Error('package output cannot contain the project directory');
  }
  if (isInside(projectDir, outDir)) {
    throw new Error('package output must be outside the project directory');
  }
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
    throw new Error(`Godot project not found: ${projectDir}`);
  }
  for (const required of [
    'project.godot',
    'modules.lock.json',
    'game/game.manifest.json',
    'export_presets.cfg',
  ]) {
    if (!existsSync(join(projectDir, required))) {
      throw new Error(`Godot project is missing: ${required}`);
    }
  }
  const project = readFileSync(join(projectDir, 'project.godot'), 'utf8');
  const name = /config\/name="([^"]+)"/.exec(project)?.[1] ?? basename(projectDir);
  if (existsSync(outDir)) {
    const stat = statSync(outDir);
    if (!stat.isDirectory()) {
      if (!options.force) throw new Error(`output path exists and is not a directory: ${outDir}`);
    } else if (readdirSync(outDir).length > 0 && !options.force) {
      throw new Error(`refusing to overwrite non-empty ${outDir}; pass --force`);
    }
  }

  const staging = `${outDir}.tmp-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    const files: GodotPackageFile[] = [];
    mkdirSync(staging, { recursive: true });
    copyTree(projectDir, staging, '', files, projectDir);
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const bytes = files.reduce((total, file) => total + file.bytes, 0);
    writeFileSync(
      join(staging, 'release.json'),
      `${JSON.stringify({ name, entry: 'project.godot', files, bytes }, null, 2)}\n`,
      'utf8',
    );
    const backup = `${outDir}.backup-${process.pid}`;
    rmSync(backup, { recursive: true, force: true });
    let moved = false;
    try {
      if (existsSync(outDir)) {
        renameSync(outDir, backup);
        moved = true;
      }
      renameSync(staging, outDir);
      if (moved) rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      if (moved && !existsSync(outDir) && existsSync(backup)) {
        renameSync(backup, outDir);
      }
      throw error;
    }
    return { outDir, name, entry: 'project.godot', files, bytes };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
