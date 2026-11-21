import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { detectEngine } from './project.js';

export interface ManagedProject {
  name: string;
  path: string;
  engine: string;
  modifiedAt: string;
}

function projectName(root: string): string {
  try {
    const yaml = join(root, 'gamedream.yaml');
    if (existsSync(yaml)) {
      const match = readFileSync(yaml, 'utf8').match(/^name:\s*["']?([^"'\r\n]+)["']?/m);
      if (match?.[1]?.trim()) return match[1].trim();
    }
    const packageFile = join(root, 'package.json');
    if (existsSync(packageFile)) {
      const pkg = JSON.parse(readFileSync(packageFile, 'utf8')) as { name?: unknown };
      if (typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim();
    }
    const product = join(root, 'ProjectSettings', 'ProjectSettings.asset');
    if (existsSync(product)) {
      const match = readFileSync(product, 'utf8').match(/^\s*productName:\s*(.+)$/m);
      if (match?.[1]?.trim()) return match[1].trim();
    }
  } catch {
    // Fall back to the directory name.
  }
  return basename(root);
}

export function listProjects(workspaceDir: string): ManagedProject[] {
  if (!existsSync(workspaceDir)) return [];
  const projects: ManagedProject[] = [];
  for (const entry of readdirSync(workspaceDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(workspaceDir, entry.name);
    const engine = detectEngine(path);
    if (engine === 'unknown') continue;
    projects.push({
      name: projectName(path),
      path,
      engine,
      modifiedAt: statSync(path).mtime.toISOString(),
    });
  }
  return projects.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

export function projectNameForDirectory(path: string): string {
  return projectName(path);
}
