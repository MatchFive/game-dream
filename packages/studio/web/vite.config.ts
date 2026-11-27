import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Studio 后端在开发时提供 /api 与三份共享 CSS；开发服务器把它们代理过去，
// 保证 dev 与 build 使用同一份样式文件，不在前端复制一套 CSS。
const backend = process.env.GAMEDREAM_STUDIO_ORIGIN ?? 'http://127.0.0.1:6399';

export default defineConfig({
  base: '/app/',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../public/app', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': backend,
      '/styles.css': backend,
      '/theme.css': backend,
      '/studio.css': backend,
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
