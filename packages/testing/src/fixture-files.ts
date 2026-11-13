import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';

export function writeFile(root: string, relativePath: string, contents: string): string {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
  return target;
}

export function writeModule(root: string, id: string, manifest: Record<string, unknown>): string {
  const dir = join(root, id);
  writeFile(root, join(id, 'module.yaml'), stringify(manifest));
  writeFile(root, join(id, 'src', 'placeholder.gd'), 'extends Node\n');
  return dir;
}
