import { readFileSync } from 'node:fs';
import { createSim, distance, step } from './sim.mjs';

const config = JSON.parse(readFileSync(new URL('./game.json', import.meta.url), 'utf8'));
const frames = Number(process.argv[process.argv.indexOf('--frames') + 1] || 600);
const state = createSim(config);
console.log('WEB_BOOT_OK');
for (let frame = 0; frame < frames; frame += 1) {
  const gap = distance(state.player, state.enemy);
  step(
    state,
    {
      right: state.player.x < state.enemy.x - 50,
      attack: gap <= config.player.attack_range,
    },
    1 / 60,
  );
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
