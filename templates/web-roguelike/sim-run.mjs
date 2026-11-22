import { readFileSync } from 'node:fs';
import { createSim, step } from './sim.mjs';

JSON.parse(readFileSync(new URL('./game.json', import.meta.url), 'utf8'));
const index = process.argv.indexOf('--frames');
const frames = Number(index === -1 ? 1800 : process.argv[index + 1]);
if (!Number.isFinite(frames) || frames <= 0) {
  console.error('invalid --frames');
  process.exit(2);
}

const state = createSim();
console.log('WEB_BOOT_OK');
let room = -1;
let relicCount = 0;
for (let frame = 0; frame < frames; frame += 1) {
  step(state, { auto: true }, 1 / 60);
  if (state.roomIndex !== room) {
    room = state.roomIndex;
    console.log(`WEB_ROOM=${state.room.id}`);
    console.log(`ROGUELIKE_ROOM=${state.room.id}`);
  }
  if (state.relics.length !== relicCount) {
    relicCount = state.relics.length;
    console.log(`WEB_RELIC=${state.relics[state.relics.length - 1]}`);
    console.log(`ROGUELIKE_RELIC=${state.relics[state.relics.length - 1]}`);
  }
  if (state.finished) break;
}
if (state.finished === 'win') {
  console.log('WEB_WIN');
  console.log('ROGUELIKE_WIN');
  console.log(`WEB_GOLD=${state.gold}`);
  console.log(`WEB_ROOMS=${state.rooms.length}`);
  process.exit(0);
}
if (state.finished === 'lose') {
  console.log('WEB_LOSE');
  process.exit(1);
}
console.log('WEB_TIMEOUT');
process.exit(1);
