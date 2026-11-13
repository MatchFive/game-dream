import {
  detectGodot,
  findExportTemplates,
  hostTemplatePlatform,
  type GodotInstallation,
  type TemplatePlatform,
} from '@gamedream/godot';
import type { CommandRunner } from '@gamedream/godot';

export interface TemplatesCommandOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  requested?: TemplatePlatform;
  godot?: GodotInstallation | null;
  runner?: CommandRunner;
}

export async function templatesCommand(options: TemplatesCommandOptions = {}) {
  const godot =
    options.godot === undefined
      ? await detectGodot({ env: options.env, runner: options.runner })
      : options.godot;
  if (!godot) return { godot: null, status: null, exitCode: 3 as const };
  const host = options.platform ?? process.platform;
  const requested = options.requested ?? hostTemplatePlatform(host);
  const status = findExportTemplates(godot.version, options.env, host, requested);
  return { godot, status, exitCode: (status.installed ? 0 : 1) as 0 | 1 };
}
