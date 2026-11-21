const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('4.4.1.stable.fake');
  process.exit(0);
}
if (args.includes('--import')) {
  process.exit(0);
}
if (args.some((arg) => arg.endsWith('.gd'))) {
  process.exit(0);
}
const markers = [
  'GAMEDREAM_BOOT_OK',
  'GAMEDREAM_SURVIVOR_SPAWN',
  'GAMEDREAM_SURVIVOR_LEVEL',
  'GAMEDREAM_UPGRADE',
  'GAMEDREAM_BOSS',
  'GAMEDREAM_BOSS_PHASE',
  'GAMEDREAM_WIN',
];
console.log(markers.join('\n'));
