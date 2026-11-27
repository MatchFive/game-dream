import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const web = join(root, 'packages/studio/web/src');

function read(relative: string): string {
  return readFileSync(join(web, relative), 'utf8');
}

// 顶栏导航只能有一份实现。三个页面曾经各自写一套（分段胶囊 / 两颗按钮 /
// 硬编码英文），这里把它锁在共享的 Topbar 组件里，只允许 aria-current 随路由变化。
describe('studio top bar navigation', () => {
  it('lives in one shared component', () => {
    const topbar = read('components/Topbar.tsx');
    expect(topbar).toMatch(/<nav className="studio-nav"/);
    for (const route of ['to="/"', 'to="/assets"', 'to="/settings"']) {
      expect(topbar).toContain(route);
    }
    for (const key of ['studio.mission', 'studio.assets', 'studio.settings']) {
      expect(topbar).toContain(key);
    }
  });

  it('lets the router own the active state', () => {
    const topbar = read('components/Topbar.tsx');
    expect(topbar).toContain('NavLink');
    expect(topbar).not.toContain('aria-current="page"');
  });

  it('keeps the locale toggle on every page', () => {
    expect(read('components/Topbar.tsx')).toContain('onClick={toggle}');
    for (const page of ['pages/MissionPage.tsx', 'pages/AssetsPage.tsx', 'pages/SettingsPage.tsx']) {
      expect(read(page)).toContain('<Topbar');
    }
  });

  it('serves the SPA shell for every studio route', () => {
    const server = readFileSync(join(root, 'packages/studio/src/server.ts'), 'utf8');
    expect(server).toContain('app/index.html');
    for (const route of ["'/'", "'/assets'", "'/settings'"]) {
      expect(server).toContain(route);
    }
    expect(existsSync(join(root, 'packages/studio/web/index.html'))).toBe(true);
  });

  it('ships no legacy multi-page front end', () => {
    const publicDir = join(root, 'packages/studio/public');
    const entries = readdirSync(publicDir);
    for (const legacy of ['studio.html', 'index.html', 'settings.html', 'studio.js', 'app.js', 'settings.js', 'i18n.js']) {
      expect(entries).not.toContain(legacy);
    }
    // 共享样式仍在，React 页面依赖它们
    expect(entries).toContain('theme.css');
    expect(entries).toContain('studio.css');
    expect(entries).toContain('styles.css');
  });

  it('redirects old /legacy links to the spa route', () => {
    const server = readFileSync(join(root, 'packages/studio/src/server.ts'), 'utf8');
    expect(server).toContain("pathname.startsWith('/legacy/')");
    expect(server).not.toContain("'studio.html'");
    expect(server).not.toContain("'settings.html'");
  });

  it('defines the nav style once, in theme.css', () => {
    const theme = readFileSync(join(root, 'packages/studio/public/theme.css'), 'utf8');
    const studio = readFileSync(join(root, 'packages/studio/public/studio.css'), 'utf8');
    expect(theme).toMatch(/\.studio-nav \{/);
    expect(studio).not.toMatch(/\.studio-nav \{/);
  });
});
