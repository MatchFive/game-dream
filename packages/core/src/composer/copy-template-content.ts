import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateContentFile } from './validate-content.js';
import { copyPath } from '../io/copy-path.js';

export function copyTemplateContent(templateDir: string, outDir: string): string[] {
  const source = join(templateDir, 'content');
  if (!existsSync(source)) return [];
  const target = join(outDir, 'game/content');
  const copied: string[] = [];
  copyMissing(source, target, copied);
  return copied;
}

function copyMissing(source: string, target: string, copied: string[]): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      copyMissing(from, to, copied);
    } else {
      validateContentFile(from);
      if (!existsSync(to)) {
        copyPath(from, to);
        copied.push(to);
      }
    }
  }
}
