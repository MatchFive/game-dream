export function findAnimationEntry(index) {
  if (!index || !Array.isArray(index.animations)) return undefined;
  return index.animations.find(
    (entry) => entry
      && typeof entry.image === 'string'
      && Number.isFinite(entry.frameWidth)
      && Number.isFinite(entry.frameHeight)
      && Number.isFinite(entry.frameCount)
      && entry.frameCount > 0,
  );
}

export function frameAtTime(entry, seconds) {
  const count = Math.max(1, Math.trunc(entry?.frameCount ?? 1));
  const fps = Math.max(1, Number(entry?.fps) || 8);
  return Math.floor(Math.max(0, seconds) * fps) % count;
}

export function atlasFrameRect(entry, frame) {
  const frameWidth = Math.max(1, Math.trunc(entry?.frameWidth ?? 1));
  const frameHeight = Math.max(1, Math.trunc(entry?.frameHeight ?? 1));
  const frameCount = Math.max(1, Math.trunc(entry?.frameCount ?? 1));
  return {
    x: (Math.max(0, frame) % frameCount) * frameWidth,
    y: 0,
    width: frameWidth,
    height: frameHeight,
  };
}
