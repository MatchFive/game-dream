import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { composeCommand } from '../src/commands/compose.js';
import { verifyCommand } from '../src/commands/verify.js';
import type { CommandRunner } from '@gamedream/godot';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('verify transient Godot crashes', () => {
  it('retries a Windows import crash once instead of failing G2', async () => {
    let imports = 0;
    const runner: CommandRunner = {
      async run(_command, args) {
        if (args[0] === '--version') {
          return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
        }
        if (args.includes('--import')) {
          imports += 1;
          if (imports === 1) {
            return { exitCode: 3221225477, stdout: '', stderr: '' };
          }
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return {
          exitCode: 0,
          stdout: 'GAMEDREAM_BOOT_OK\nGAMEDREAM_WIN\n',
          stderr: '',
        };
      },
    };
    const outDir = join(makeTempDir('gamedream verify retry '), 'game');
    await composeCommand({
      specPath: join(root, 'fixtures/specs/m0.yaml'),
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
    });
    const report = await verifyCommand({
      projectDir: outDir,
      env: { GODOT_BIN: 'godot' },
      runner,
    });
    expect(imports).toBe(2);
    expect(report.gates.G2.status).toBe('pass');
    expect(report.gates.G3.status).toBe('pass');
  });
});
