export function worldSize(state, config) {
  return {
    width: state.map
      ? state.map.rows[0].length * state.map.tile_size
      : config.arena.width,
    height: state.map
      ? state.map.rows.length * state.map.tile_size
      : config.arena.height,
  };
}

export function cameraZoom(coarsePointer, innerWidth) {
  return coarsePointer || innerWidth < 720 ? 2 : 1.2;
}
