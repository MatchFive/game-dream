import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
// @ts-ignore - the template ships plain ESM without a declaration file
import { createSim as createPlatformerSim, step as stepPlatformer } from '../../../templates/web-platformer/sim.mjs';
import { webComposeCommand, webVerifyCommand } from '../src/commands/web.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Web platformer', () => {
  it('composes and reaches the flag headlessly', () => {
    const outDir = join(makeTempDir('gamedream web platformer '), 'game');
    webComposeCommand({
      outDir,
      templatesDir: join(root, 'templates/web-platformer'),
      name: 'skyline-runner',
    });
    const verified = webVerifyCommand({ projectDir: outDir, frames: 1800 });
    expect(verified.passed).toBe(true);
    expect(verified.stdout).toContain('WEB_BOOT_OK');
    expect(verified.stdout).toContain('WEB_WIN');
  });

  it('clears three stages with distinct layouts', () => {
    const state = createPlatformerSim();
    const visited = [];
    for (let frame = 0; frame < 1800 && !state.finished; frame += 1) {
      const stage = state.stageIndex;
      stepPlatformer(state, { auto: true }, 1 / 60);
      if (!visited.includes(stage)) visited.push(stage);
    }
    expect(state.finished).toBe('win');
    expect(state.stageIndex).toBe(2);
    expect(visited).toEqual([0, 1, 2]);
    expect(state.collected).toBeGreaterThan(0);
  });
});
