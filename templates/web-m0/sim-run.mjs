import { readFileSync } from 'node:fs';
import { createSim, distance, step } from './sim.mjs';

const config = JSON.parse(readFileSync(new URL('./game.json', import.meta.url), 'utf8'));
const frameIndex = process.argv.indexOf('--frames');
const frames = Number(frameIndex === -1 ? 1800 : process.argv[frameIndex + 1]);
if (!Number.isFinite(frames) || frames <= 0) {
  console.error('invalid --frames');
  process.exit(2);
}

const state = createSim(config);
console.log('WEB_BOOT_OK');
if (state.map?.rows?.length) console.log('WEB_MAP_OK');

for (let frame = 0; frame < frames; frame += 1) {
  const gap = distance(state.player, state.enemy);
  step(
    state,
    {
      left: state.player.x > state.enemy.x + 20,
      right: state.player.x < state.enemy.x - 20,
      up: state.player.y > state.enemy.y + 20,
      down: state.player.y < state.enemy.y - 20,
      attack: gap <= config.player.attack_range,
    },
    1 / 60,
  );
  if (state.finished) break;
}

const killQuests = state.quests.filter((quest) => quest.type === 'kill');
if (killQuests.length > 0 && killQuests.every((quest) => quest.completed)) {
  console.log('WEB_QUEST_COMPLETE');
}
if (state.bossPhase) {
  console.log('WEB_BOSS_PHASE');
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
