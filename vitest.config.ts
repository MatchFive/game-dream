import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // vitest 默认把 SSR 转换缓存写到 %TEMP%，Windows Defender 偶尔会锁住文件，
  // 导致 worker 直接挂掉（表现为少数用例凭空消失 + "Errors 1"）。放到项目内更稳。
  cacheDir: 'node_modules/.vitest-cache',
  resolve: {
    alias: {
      '@gamedream/agent': fileURLToPath(
        new URL('./packages/agent/src/index.ts', import.meta.url),
      ),
      '@gamedream/core': fileURLToPath(
        new URL('./packages/core/src/index.ts', import.meta.url),
      ),
      '@gamedream/godot': fileURLToPath(
        new URL('./packages/godot/src/index.ts', import.meta.url),
      ),
      '@gamedream/studio': fileURLToPath(
        new URL('./packages/studio/src/index.ts', import.meta.url),
      ),
      '@gamedream/testing': fileURLToPath(
        new URL('./packages/testing/src/index.ts', import.meta.url),
      ),
      '@gamedream/unity': fileURLToPath(
        new URL('./packages/unity/src/index.ts', import.meta.url),
      ),
      '@gamedream/web': fileURLToPath(
        new URL('./packages/web/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 一部分用例会真的拉起 CLI 进程和 Chrome（program / web-genres / screenshot）。
    // 默认按 CPU 数开满 worker 时，这些重进程互相抢资源，会随机超时或断言失败。
    maxWorkers: 8,
    minWorkers: 1,
  },
});
