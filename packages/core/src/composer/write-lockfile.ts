import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lockfile } from '../schemas/lockfile.js';

export function writeLockfile(outDir: string, lockfile: Lockfile): string {
  const path = join(outDir, 'modules.lock.json');
  writeFileSync(path, `${JSON.stringify(lockfile, null, 2)}\n`, 'utf8');
  return path;
}
