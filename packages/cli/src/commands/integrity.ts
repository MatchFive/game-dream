import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { hashDirectory, type GameManifest, type Lockfile } from '@gamedream/core';

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${sep}`);
}

export function verifyProjectIntegrity(
  projectDir: string,
  lockfile: Lockfile,
  manifest: GameManifest,
): string[] {
  const problems: string[] = [];
  const root = resolve(projectDir);
  const modulesRoot = resolve(root, 'modules');

  for (const module of lockfile.modules) {
    const directory = resolve(modulesRoot, module.id);
    if (!isInside(modulesRoot, directory) || directory === modulesRoot) {
      problems.push(`unsafe module id: ${module.id}`);
      continue;
    }
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      problems.push(`missing module directory: modules/${module.id}`);
      continue;
    }
    try {
      if (hashDirectory(directory) !== module.hash) {
        problems.push(`hash mismatch: modules/${module.id}`);
      }
    } catch (error) {
      problems.push(`cannot hash modules/${module.id}: ${(error as Error).message}`);
    }
  }

  const hashedFiles = Object.entries(manifest.hashes);
  if (hashedFiles.length === 0) {
    problems.push('game/game.manifest.json has no managed file hashes');
  }
  for (const [relativePath, expected] of hashedFiles) {
    const file = resolve(root, relativePath);
    if (!isInside(root, file)) {
      problems.push(`unsafe hashed path: ${relativePath}`);
      continue;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      problems.push(`missing hashed file: ${relativePath}`);
      continue;
    }
    const actual = `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
    if (actual !== expected) problems.push(`hash mismatch: ${relativePath}`);
  }

  return problems;
}
