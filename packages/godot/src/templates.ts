import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ExportTemplateStatus {
  version: string;
  dir: string;
  installed: boolean;
  platforms: {
    windows: boolean;
    linux: boolean;
    web: boolean;
    macos: boolean;
  };
}

export function templateVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length >= 4 && /^(stable|beta|rc|dev)$/.test(parts[3])) {
    return parts.slice(0, 4).join('.');
  }
  return parts.length >= 3 ? parts.slice(0, 3).join('.') : version;
}

export function exportTemplatesRoot(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    return join(env.APPDATA ?? '', 'Godot', 'export_templates');
  }
  if (platform === 'darwin') {
    return join(env.HOME ?? '', 'Library', 'Application Support', 'Godot', 'export_templates');
  }
  return join(
    env.XDG_DATA_HOME ?? join(env.HOME ?? '', '.local', 'share'),
    'godot',
    'export_templates',
  );
}

export function findExportTemplates(
  version: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): ExportTemplateStatus {
  const normalized = templateVersion(version);
  const dir = join(exportTemplatesRoot(env, platform), normalized);
  let files: string[] = [];
  try {
    if (existsSync(dir)) files = readdirSync(dir);
  } catch {
    files = [];
  }
  const platforms = {
    windows: files.some((file) => /^windows_(debug|release)_x86_64\.exe$/.test(file)),
    linux: files.some((file) => /^linux_(debug|release)\.x86_64$/.test(file)),
    web: files.some((file) => /^web_(debug|release)\.zip$/.test(file)),
    macos: files.some((file) => /^macos_(debug|release)\.zip$/.test(file)),
  };
  return {
    version: normalized,
    dir,
    installed: Object.values(platforms).some(Boolean),
    platforms,
  };
}
