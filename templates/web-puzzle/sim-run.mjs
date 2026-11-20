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
for (let frame = 0; frame < frames; frame += 1) {
  step(state, { auto: true }, 1 / 60);
  if (state.finished) break;
}
if (state.finished === 'win') {
  console.log('WEB_WIN');
  process.exit(0);
}
if (state.finished === 'lose') {
  console.log('WEB_LOSE');
  process.exit(1);
}
console.log('WEB_TIMEOUT');
process.exit(1);
