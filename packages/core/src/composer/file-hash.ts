import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function walk(dir: string, result: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, result);
    else result.push(path);
  }
}

export function hashDirectory(dir: string): string {
  const files: string[] = [];
  walk(dir, files);
  files.sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(dir, file).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}
