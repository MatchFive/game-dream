import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
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

function copyTree(
  source: string,
  target: string,
  rel: string,
  files: GodotPackageFile[],
  projectDir: string,
  topLevel: boolean,
): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (skipped(entry.name)) continue;
    if (topLevel && entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error(`refusing to package symlink: ${from}`);
    }
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyTree(from, to, next, files, projectDir, false);
    } else if (entry.isFile()) {
      const real = realpathSync(from);
      if (!isInside(projectDir, real)) throw new Error(`source escapes project: ${from}`);
      copyFileSync(from, to);
      const bytes = statSync(to).size;
      const sha256 = createHash('sha256').update(readFileSync(to)).digest('hex');
      files.push({ path: next, bytes, sha256 });
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
    copyTree(projectDir, staging, '', files, projectDir, true);
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const bytes = files.reduce((total, file) => total + file.bytes, 0);
    writeFileSync(
      join(staging, 'release.json'),
      `${JSON.stringify({ name, entry: 'project.godot', files, bytes }, null, 2)}\n`,
      'utf8',
    );
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
    renameSync(staging, outDir);
    return { outDir, name, entry: 'project.godot', files, bytes };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
