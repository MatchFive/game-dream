export const DEFAULT_MUSIC_VOLUME = 0.35;

export function clampMusicVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_MUSIC_VOLUME;
  return Math.min(1, Math.max(0, number));
}

export function findBgmTrack(manifest) {
  if (!manifest || !Array.isArray(manifest.assets)) return undefined;
  return manifest.assets.find(
    (asset) => asset && asset.kind === 'audio' && typeof asset.file === 'string',
  );
}
