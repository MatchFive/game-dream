import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@gamedream/core': fileURLToPath(
        new URL('./packages/core/src/index.ts', import.meta.url),
      ),
      '@gamedream/godot': fileURLToPath(
        new URL('./packages/godot/src/index.ts', import.meta.url),
      ),
      '@gamedream/testing': fileURLToPath(
        new URL('./packages/testing/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
