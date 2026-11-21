export function findPlayerBinding(bindings) {
  if (!bindings || typeof bindings !== 'object') return undefined;
  const player = bindings.player;
  if (!player || typeof player.file !== 'string' || !player.file) return undefined;
  return player;
}
