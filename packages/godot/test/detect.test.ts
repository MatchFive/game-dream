import { describe, expect, it } from 'vitest';
import { detectGodot } from '../src/detect.js';
import type { CommandRunner } from '../src/runner.js';

const runner: CommandRunner = {
  async run(command, args) {
    if (command === 'godot' && args[0] === '--version') {
      return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
    }
    return { exitCode: 1, stdout: '', stderr: 'not found' };
  },
};

describe('detectGodot', () => {
  it('parses a version from GODOT_BIN', async () => {
    const result = await detectGodot({ env: { GODOT_BIN: 'godot' }, runner });
    expect(result?.version).toBe('4.4.1.stable.official');
    expect(result?.major).toBe(4);
    expect(result?.minor).toBe(4);
  });

  it('returns null when no candidate works', async () => {
    const missing: CommandRunner = {
      async run() {
        return { exitCode: 1, stdout: '', stderr: 'missing' };
      },
    };
    expect(await detectGodot({ env: {}, runner: missing })).toBeNull();
  });
});
