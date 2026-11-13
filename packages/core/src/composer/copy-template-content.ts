import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
    } else if (!existsSync(to)) {
      cpSync(from, to);
      copied.push(to);
    }
  }
}
