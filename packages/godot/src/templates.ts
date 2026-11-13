import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type TemplatePlatform = 'windows' | 'linux' | 'web' | 'macos';

export interface ExportTemplateStatus {
  version: string;
  dir: string;
  requested: TemplatePlatform | null;
  installed: boolean;
  complete: boolean;
  missing: TemplatePlatform[];
  platforms: Record<TemplatePlatform, boolean>;
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
    return join(env.APPDATA ?? homedir(), 'Godot', 'export_templates');
  }
  if (platform === 'darwin') {
    return join(env.HOME ?? homedir(), 'Library', 'Application Support', 'Godot', 'export_templates');
  }
  return join(
    env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), '.local', 'share'),
    'godot',
    'export_templates',
  );
}

export function hostTemplatePlatform(
  platform: NodeJS.Platform = process.platform,
): TemplatePlatform {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

export function findExportTemplates(
  version: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  requested: TemplatePlatform | null = null,
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
    windows: files.some((file) => /^windows_(debug|release)_(x86_64|arm64)\.exe$/.test(file)),
    linux: files.some((file) => /^linux_(debug|release)\.(x86_64|arm64|arm32)$/.test(file)),
    web: files.some((file) => /^web_(debug|release)\.zip$/.test(file)),
    macos: files.some((file) => file === 'macos.zip' || /^macos_(debug|release)\.zip$/.test(file)),
  };
  const missing = (Object.keys(platforms) as TemplatePlatform[]).filter(
    (name) => !platforms[name],
  );
  return {
    version: normalized,
    dir,
    requested,
    installed: requested ? platforms[requested] : missing.length < 4,
    complete: missing.length === 0,
    missing,
    platforms,
  };
}
