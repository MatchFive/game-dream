import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
// @ts-ignore - the template ships plain ESM without a declaration file
import { createSim as createRoguelikeSim, step as stepRoguelike } from '../../../templates/web-roguelike/sim.mjs';
import { webComposeCommand, webVerifyCommand } from '../src/commands/web.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const templates = ['web-roguelike', 'web-tower-defense', 'web-puzzle'];

describe('Web genre coverage', () => {
  for (const template of templates) {
    it(`composes and wins: ${template}`, () => {
      const outDir = join(makeTempDir(`gamedream ${template} `), 'game');
      webComposeCommand({
        outDir,
        templatesDir: join(root, 'templates', template),
        name: template,
      });
      const verified = webVerifyCommand({ projectDir: outDir, frames: 1800 });
      expect(verified.passed).toBe(true);
      expect(verified.stdout).toContain('WEB_BOOT_OK');
      expect(verified.stdout).toContain('WEB_WIN');
    });
  }

  it('runs a seeded three-room roguelike with an event and relic shop', () => {
    const state = createRoguelikeSim(42);
    expect(state.rooms.map((room: { id: string }) => room.id)).toEqual([
      'entry',
      'market',
      'vault',
    ]);
    for (let frame = 0; frame < 1800 && !state.finished; frame += 1) {
      stepRoguelike(state, { auto: true }, 1 / 60);
    }
    expect(state.finished).toBe('win');
    expect(state.roomIndex).toBe(2);
    expect(state.relics).toContain('ember');
    expect(state.roomEvents).toContain('market:cache');
    expect(state.gold).toBeGreaterThan(0);

    const same = createRoguelikeSim(42);
    const other = createRoguelikeSim(7);
    expect(same.rooms.map((room: { id: string }) => room.id)).toEqual(
      state.rooms.map((room: { id: string }) => room.id),
    );
    expect(other.rooms.map((room: { id: string }) => room.id)).not.toEqual(
      state.rooms.map((room: { id: string }) => room.id),
    );
  });
});
