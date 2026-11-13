import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
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

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function copyTree(
  source: string,
  target: string,
  rel: string,
  files: PackageFile[],
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
      copyTree(from, to, next, files);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
      const bytes = statSync(to).size;
      files.push({ path: next, bytes, sha256: hash(to) });
    }
  }
}

export function packageWebProject(options: PackageWebOptions): PackageWebResult {
  const projectDir = resolve(options.projectDir);
  const outDir = resolve(options.outDir);
  if (projectDir === outDir) {
    throw new Error('package output must differ from the project directory');
  }
  if (outDir.startsWith(join(projectDir, 'assets') + sep)) {
    throw new Error('package output cannot be inside the project assets directory');
  }
  if (projectDir.startsWith(outDir + sep)) {
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
    if (readdirSync(outDir).length > 0 && !options.force) {
      throw new Error(`refusing to overwrite non-empty ${outDir}; pass --force`);
    }
    if (options.force) rmSync(outDir, { recursive: true, force: true });
  }
  const created = existsSync(outDir);
  try {
    mkdirSync(outDir, { recursive: true });
    const files: PackageFile[] = [];
    for (const file of WEB_PROJECT_FILES) {
      const source = join(projectDir, file);
      const target = join(outDir, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      const bytes = statSync(target).size;
      files.push({ path: file, bytes, sha256: hash(target) });
    }
    if (existsSync(join(projectDir, 'assets'))) {
      const assetsDir = join(outDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      copyTree(join(projectDir, 'assets'), assetsDir, 'assets', files);
    }
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const bytes = files.reduce((total, file) => total + file.bytes, 0);
    writeFileSync(
      join(outDir, 'deployment.json'),
      `${JSON.stringify({ name, entry: 'index.html', files, bytes }, null, 2)}\n`,
      'utf8',
    );
    return { outDir, name, entry: 'index.html', files, bytes };
  } catch (error) {
    if (!created) rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
}
