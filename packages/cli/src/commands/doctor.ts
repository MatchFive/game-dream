import {
  detectGodot,
  findExportTemplates,
  type CommandRunner,
  type ExportTemplateStatus,
  type GodotInstallation,
} from '@gamedream/godot';

export interface DoctorReport {
  node: string;
  godot: GodotInstallation | null;
  templates: ExportTemplateStatus | null;
  ok: boolean;
  problems: string[];
  warnings: string[];
}

export async function doctorCommand(
  options: { env?: NodeJS.ProcessEnv; runner?: CommandRunner } = {},
): Promise<DoctorReport> {
  const godot = await detectGodot({ env: options.env, runner: options.runner });
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!godot) {
    problems.push(
      'Godot 4.4+ not found. Set GODOT_BIN to the console executable (Godot_v4.*_console.exe) or add godot to PATH.',
    );
  } else if (godot.major < 4 || (godot.major === 4 && godot.minor < 4)) {
    problems.push(`Godot ${godot.version} detected; 4.4+ required.`);
  }
  const templates = godot ? findExportTemplates(godot.version, options.env ?? process.env) : null;
  if (templates && !templates.installed) {
    warnings.push(
      `Godot export templates missing for ${templates.version}; native export unavailable at ${templates.dir}. Install templates via the Godot editor or use \`dream godot package\`.`,
    );
  }
  return {
    node: process.version,
    godot,
    templates,
    ok: problems.length === 0,
    problems,
    warnings,
  };
}
