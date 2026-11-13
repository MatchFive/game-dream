import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function makeTempDir(prefix = 'gamedream test '): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
