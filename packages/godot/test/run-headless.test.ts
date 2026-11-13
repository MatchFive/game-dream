import { describe, expect, it } from 'vitest';
import { importProject } from '../src/import-project.js';
import { runHeadless } from '../src/run-headless.js';
import { findScriptErrors, hasMarker } from '../src/logs.js';
import type { CommandRunner } from '../src/runner.js';

const calls: Array<{ command: string; args: string[] }> = [];
const runner: CommandRunner = {
  async run(command, args) {
    calls.push({ command, args });
    return { exitCode: 0, stdout: 'GAMEDREAM_BOOT_OK\nINVENTORY_COUNT=1\n', stderr: '' };
  },
};

const godot = { bin: 'godot', version: '4.4.1.stable.official', major: 4, minor: 4 };

describe('Godot commands', () => {
  it('imports with --headless --import', async () => {
    await importProject('C:\\my game', godot, runner);
    expect(calls.at(-1)).toEqual({
      command: 'godot',
      args: ['--headless', '--path', 'C:\\my game', '--import'],
    });
  });

  it('runs headless with a quit guard', async () => {
    const result = await runHeadless('C:\\my game', godot, { quitAfter: 300, runner });
    expect(calls.at(-1)?.args).toContain('--quit-after');
    expect(hasMarker(result, 'GAMEDREAM_BOOT_OK')).toBe(true);
    expect(hasMarker(result, 'INVENTORY_COUNT=1')).toBe(true);
  });

  it('finds script errors', () => {
    const result = { exitCode: 0, stdout: 'SCRIPT ERROR: Parse Error\n', stderr: '' };
    expect(findScriptErrors(result)).toEqual(['SCRIPT ERROR: Parse Error']);
  });
});
