import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const contract = JSON.parse(
  readFileSync(join(root, 'fixtures/contracts/engine-gameplay.json'), 'utf8'),
) as {
  survivor: { markers: string[]; engines: Record<string, string[]> };
  roguelike: {
    rooms: Array<{ id: string; name: string }>;
    events: string[];
    relics: string[];
    markers: string[];
    engines: Record<string, string[]>;
  };
};

const files: Record<string, string> = {
  webSurvivor: readFileSync(join(root, 'templates/web-survivor/game.js'), 'utf8'),
  webSurvivorRun: readFileSync(join(root, 'templates/web-survivor/sim-run.mjs'), 'utf8'),
  webRoguelike: readFileSync(join(root, 'templates/web-roguelike/rooms.mjs'), 'utf8'),
  webRoguelikeRun: readFileSync(join(root, 'templates/web-roguelike/sim-run.mjs'), 'utf8'),
  godotSurvivor: readFileSync(join(root, 'modules/system.survivor/src/survivor.gd'), 'utf8'),
  godotRoguelike: readFileSync(join(root, 'modules/system.roguelike/src/dungeon.gd'), 'utf8'),
  unitySurvivor: readFileSync(
    join(root, 'templates/unity-survivor/Assets/Editor/EditorVerifier.cs'),
    'utf8',
  ),
  unitySurvivorRuntime: readFileSync(
    join(root, 'templates/unity-survivor/Assets/Scripts/GameBootstrap.cs'),
    'utf8',
  ),
  unityRoguelike: readFileSync(
    join(root, 'templates/unity-roguelike/Assets/Editor/EditorVerifier.cs'),
    'utf8',
  ),
  unityRoguelikeSim: readFileSync(
    join(root, 'templates/unity-roguelike/Assets/Scripts/GenreSim.cs'),
    'utf8',
  ),
  unityRoguelikeRuntime: readFileSync(
    join(root, 'templates/unity-roguelike/Assets/Scripts/GameBootstrap.cs'),
    'utf8',
  ),
};

describe('cross-engine gameplay contract', () => {
  it('keeps the common survivor and roguelike markers', () => {
    for (const marker of contract.survivor.markers) {
      expect(files.webSurvivorRun + files.webSurvivor).toContain(marker);
      expect(files.godotSurvivor).toContain(marker);
      expect(files.unitySurvivor + files.unitySurvivorRuntime).toContain(marker);
    }
    for (const marker of contract.roguelike.markers) {
      expect(files.webRoguelikeRun).toContain(marker);
      expect(files.godotRoguelike).toContain(marker);
      expect(files.unityRoguelike + files.unityRoguelikeRuntime).toContain(marker);
    }
    for (const engines of [
      contract.survivor.engines,
      contract.roguelike.engines,
    ]) {
      for (const markers of Object.values(engines)) {
        expect(markers.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the roguelike room, event, and relic names aligned', () => {
    for (const room of contract.roguelike.rooms) {
      expect(files.webRoguelike).toContain(`id: '${room.id}'`);
      expect(files.webRoguelike).toContain(`name: '${room.name}'`);
      expect(files.godotRoguelike).toContain(room.name);
      expect(files.unityRoguelikeSim).toContain(room.name);
    }
    for (const event of contract.roguelike.events) {
      expect(files.webRoguelike).toContain(event);
      expect(files.godotRoguelike).toContain(event);
      expect(files.unityRoguelikeSim).toContain(event);
    }
    for (const relic of contract.roguelike.relics) {
      expect(files.webRoguelike).toContain(relic);
      expect(files.godotRoguelike).toContain(relic);
      expect(files.unityRoguelikeSim).toContain(relic);
    }
  });
});
