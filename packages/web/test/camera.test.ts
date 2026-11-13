import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));

async function camera() {
  return import(pathToFileURL(join(root, 'templates/web-m0/camera.mjs')).href);
}

describe('web camera math', () => {
  it('uses map dimensions or arena fallback', async () => {
    const { worldSize } = await camera();
    expect(
      worldSize(
        {
          map: {
            rows: ['##', '##'],
            tile_size: 16,
            tileset: { floor: '2f5d3a', wall: '1b3324' },
          },
        },
        { arena: { width: 960, height: 540 } },
      ),
    ).toEqual({ width: 32, height: 32 });
    expect(worldSize({ map: null }, { arena: { width: 960, height: 540 } })).toEqual({
      width: 960,
      height: 540,
    });
  });

  it('zooms mobile and narrow viewports', async () => {
    const { cameraZoom } = await camera();
    expect(cameraZoom(true, 1280)).toBe(2);
    expect(cameraZoom(false, 719)).toBe(2);
    expect(cameraZoom(false, 720)).toBe(1.2);
    expect(cameraZoom(false, 1280)).toBe(1.2);
  });
});
