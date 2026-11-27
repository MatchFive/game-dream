import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const PACKAGES = ['agent', 'cli', 'core', 'godot', 'studio', 'unity', 'web'];

function collectSources(dir: string, result: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSources(path, result);
    } else if (entry.name.endsWith('.ts')) {
      result.push(path);
    }
  }
  return result;
}

function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

// fs.cpSync 在 Windows 非 ASCII 路径下会抛 ENOENT，源路径含中文时还会直接
// 段错误（exit 139），无法被 try/catch 接住。所有复制必须走 copyPath。
describe('copy invariant', () => {
  it('never calls fs.cpSync in package sources', () => {
    const offenders: string[] = [];
    for (const name of PACKAGES) {
      const srcDir = join(root, 'packages', name, 'src');
      let sources: string[];
      try {
        sources = collectSources(srcDir);
      } catch {
        continue;
      }
      for (const file of sources) {
        if (/\bcpSync\s*\(/.test(stripComments(readFileSync(file, 'utf8')))) {
          offenders.push(relative(root, file).replaceAll('\\', '/'));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
