import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeGameManifest(outDir: string, managedFiles: string[]): string {
  const hashes: Record<string, string> = {};
  for (const relativePath of managedFiles) {
    const absolute = join(outDir, relativePath);
    hashes[relativePath] = `sha256:${createHash('sha256')
      .update(readFileSync(absolute))
      .digest('hex')}`;
  }
  const manifest = {
    version: 1,
    managed: [
      'game/_generated/**',
      'project.godot#autoload',
      'project.godot#input',
      'project.godot#application/run/main_scene',
    ],
    user: [
      'game/content/**',
      'game/config/**',
      'game/scenes/**',
      'game/scripts/**',
      'game/ui/**',
      'game/tests/**',
    ],
    hashes,
  };
  const path = join(outDir, 'game/game.manifest.json');
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return path;
}
