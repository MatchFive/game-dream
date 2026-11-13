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
import { WEB_PROJECT_FILES } from './compose.js';

export interface PackageFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface PackageWebOptions {
  projectDir: string;
  outDir: string;
  force?: boolean;
}

export interface PackageWebResult {
  outDir: string;
  name: string;
  entry: 'index.html';
  files: PackageFile[];
  bytes: number;
}

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

function sourcePath(projectDir: string, relativePath: string): string {
  const source = join(projectDir, relativePath);
  if (!existsSync(source)) {
    throw new Error(`web project is missing: ${relativePath}`);
  }
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`refusing to package symlink: ${source}`);
  }
  if (!stat.isFile()) {
    throw new Error(`expected a file: ${source}`);
  }
  const real = realpathSync(source);
  if (!isInside(projectDir, real)) {
    throw new Error(`source escapes project: ${source}`);
  }
  return source;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function copyTree(
  source: string,
  target: string,
  rel: string,
  files: PackageFile[],
  projectDir: string,
): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
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
      if (!isInside(projectDir, real)) {
        throw new Error(`source escapes project: ${from}`);
      }
      copyFileSync(from, to);
      const bytes = statSync(to).size;
      files.push({ path: next, bytes, sha256: sha256(to) });
    }
  }
}

export function packageWebProject(options: PackageWebOptions): PackageWebResult {
  const projectDir = canonical(resolve(options.projectDir));
  const outDir = canonical(resolve(options.outDir));
  if (projectDir === outDir) {
    throw new Error('package output must differ from the project directory');
  }
  const assetsDir = join(projectDir, 'assets');
  if (isInside(assetsDir, outDir)) {
    throw new Error('package output cannot be inside the project assets directory');
  }
  if (isInside(outDir, projectDir)) {
    throw new Error('package output cannot contain the project directory');
  }
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
    throw new Error(`web project not found: ${projectDir}`);
  }
  if (!existsSync(join(projectDir, 'index.html'))) {
    throw new Error(`web project is missing index.html: ${projectDir}`);
  }
  const missing = WEB_PROJECT_FILES.filter(
    (file) => !existsSync(join(projectDir, file)),
  );
  if (missing.length > 0) {
    throw new Error(`web project is missing: ${missing.join(', ')}`);
  }
  let name: string;
  try {
    const config = JSON.parse(readFileSync(join(projectDir, 'game.json'), 'utf8')) as {
      name?: unknown;
    };
    if (typeof config.name !== 'string' || !config.name.trim()) {
      throw new Error('name must be a non-empty string');
    }
    name = config.name;
  } catch (error) {
    throw new Error(`invalid game.json: ${(error as Error).message}`);
  }

  if (existsSync(outDir)) {
    const stat = statSync(outDir);
    if (!stat.isDirectory()) {
      if (!options.force) {
        throw new Error(`output path exists and is not a directory: ${outDir}`);
      }
    } else if (readdirSync(outDir).length > 0 && !options.force) {
      throw new Error(`refusing to overwrite non-empty ${outDir}; pass --force`);
    }
  }

  const staging = `${outDir}.tmp-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    const files: PackageFile[] = [];
    for (const file of WEB_PROJECT_FILES) {
      const source = sourcePath(projectDir, file);
      const target = join(staging, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      const bytes = statSync(target).size;
      files.push({ path: file, bytes, sha256: sha256(target) });
    }
    if (existsSync(assetsDir)) {
      const stat = lstatSync(assetsDir);
      if (stat.isSymbolicLink()) {
        throw new Error(`refusing to package symlink assets: ${assetsDir}`);
      }
      if (!stat.isDirectory()) {
        throw new Error(`assets is not a directory: ${assetsDir}`);
      }
      const target = join(staging, 'assets');
      mkdirSync(target, { recursive: true });
      copyTree(assetsDir, target, 'assets', files, projectDir);
    }
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const bytes = files.reduce((total, file) => total + file.bytes, 0);
    writeFileSync(
      join(staging, 'deployment.json'),
      `${JSON.stringify({ name, entry: 'index.html', files, bytes }, null, 2)}\n`,
      'utf8',
    );
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
    renameSync(staging, outDir);
    return { outDir, name, entry: 'index.html', files, bytes };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
