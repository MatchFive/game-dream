import {
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '@gamedream/testing';
import type { CommandRunner } from '@gamedream/godot';
import { composeCommand } from '../src/commands/compose.js';
import { verifyCommand } from '../src/commands/verify.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const fakeGodot: CommandRunner = {
  async run(_command, args) {
    if (args[0] === '--version') {
      return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
    }
    return {
      exitCode: 0,
      stdout: 'GAMEDREAM_BOOT_OK\nINVENTORY_COUNT=1\n',
      stderr: '',
    };
  },
};

async function composeProject(): Promise<string> {
  const outDir = join(makeTempDir('gamedream integrity '), 'game');
  await composeCommand({
    specPath: join(root, 'fixtures/specs/minimal.yaml'),
    outDir,
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
  });
  return outDir;
}

async function verify(projectDir: string) {
  return verifyCommand({
    projectDir,
    env: { GODOT_BIN: 'godot' },
    runner: fakeGodot,
  });
}

describe('verify integrity', () => {
  it('passes on a freshly composed project', async () => {
    const outDir = await composeProject();
    const report = await verify(outDir);
    expect(report.gates.G1.status).toBe('pass');
  }, 30_000);

  it('fails G1 when a generated managed file changes', async () => {
    const outDir = await composeProject();
    const file = join(outDir, 'game/_generated/game.gd');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n# tampered\n`, 'utf8');
    const report = await verify(outDir);
    expect(report.gates.G1.status).toBe('fail');
    expect(report.gates.G1.message).toContain('hash mismatch: game/_generated/game.gd');
    expect(report.gates.G2.status).toBe('skip');
  }, 30_000);

  it('fails G1 when a module file changes or disappears', async () => {
    const outDir = await composeProject();
    const lockfile = JSON.parse(
      readFileSync(join(outDir, 'modules.lock.json'), 'utf8'),
    ) as { modules: Array<{ id: string }> };
    const moduleId = lockfile.modules[0].id;
    writeFileSync(join(outDir, 'modules', moduleId, 'tamper.gd'), 'extends Node\n', 'utf8');
    const changed = await verify(outDir);
    expect(changed.gates.G1.status).toBe('fail');
    expect(changed.gates.G1.message).toContain(`hash mismatch: modules/${moduleId}`);

    unlinkSync(join(outDir, 'game/_generated/main.gd'));
    const missing = await verify(outDir);
    expect(missing.gates.G1.status).toBe('fail');
    expect(missing.gates.G1.message).toContain('missing hashed file');
  }, 30_000);

  it('fails G1 when the manifest has no managed hashes', async () => {
    const outDir = await composeProject();
    const manifestPath = join(outDir, 'game/game.manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { hashes: unknown };
    manifest.hashes = {};
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    const report = await verify(outDir);
    expect(report.gates.G1.status).toBe('fail');
    expect(report.gates.G1.message).toContain('no managed file hashes');
  }, 30_000);
});
