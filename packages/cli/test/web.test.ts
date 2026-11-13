import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { webComposeCommand, webVerifyCommand } from '../src/commands/web.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('web CLI commands', () => {
  it('composes and verifies a web project', () => {
    const outDir = join(makeTempDir('gamedream web cli '), 'web game');
    webComposeCommand({
      outDir,
      templatesDir: join(root, 'templates/web-m0'),
      name: 'cli',
    });
    const result = webVerifyCommand({ projectDir: outDir });
    expect(result.passed).toBe(true);
  });
});
