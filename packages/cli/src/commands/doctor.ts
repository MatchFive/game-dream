import {
  detectGodot,
  findExportTemplates,
  hostTemplatePlatform,
  type CommandRunner,
  type ExportTemplateStatus,
  type GodotInstallation,
} from '@gamedream/godot';
import { detectUnity, type UnityInstallation } from '@gamedream/unity';

export type DoctorProviderKind = 'auto' | 'fake' | 'openai';

export interface DoctorProviderReport {
  provider: DoctorProviderKind;
  apiKey: boolean;
  model?: string;
  baseUrl: string;
  visionModel?: string;
}

export interface DoctorReport {
  node: string;
  godot: GodotInstallation | null;
  unity: UnityInstallation | null;
  provider: DoctorProviderReport;
  templates: ExportTemplateStatus | null;
  ok: boolean;
  problems: string[];
  warnings: string[];
}

export async function doctorCommand(
  options: {
    env?: NodeJS.ProcessEnv;
    runner?: CommandRunner;
    unity?: UnityInstallation | null;
  } = {},
): Promise<DoctorReport> {
  const env = options.env ?? process.env;
  const godot = await detectGodot({ env, runner: options.runner });
  const unity = options.unity !== undefined ? options.unity : detectUnity({ env });
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!godot) {
    problems.push(
      'Godot 4.4+ not found. Set GODOT_BIN to the console executable (Godot_v4.*_console.exe) or add godot to PATH.',
    );
  } else if (godot.major < 4 || (godot.major === 4 && godot.minor < 4)) {
    problems.push(`Godot ${godot.version} detected; 4.4+ required.`);
  }
  if (!unity) {
    warnings.push(
      'Unity 6 not found; Unity static checks still work, but runtime/build checks need UNITY_BIN.',
    );
  }

  const requestedProvider = env.GAMEDREAM_PROVIDER;
  const provider: DoctorProviderKind =
    requestedProvider === 'openai'
    || requestedProvider === 'fake'
    || requestedProvider === 'auto'
      ? requestedProvider
      : env.OPENAI_API_KEY
        ? 'openai'
        : 'auto';
  const apiKey = Boolean(env.OPENAI_API_KEY);
  if (!apiKey) {
    warnings.push(
      provider === 'openai'
        ? 'OPENAI_API_KEY is not set; --provider openai runs will fail.'
        : 'OPENAI_API_KEY is not set; auto will fall back to the deterministic fake provider.',
    );
  }
  const providerReport: DoctorProviderReport = {
    provider,
    apiKey,
    ...(env.GAMEDREAM_MODEL ? { model: env.GAMEDREAM_MODEL } : {}),
    baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    ...(env.GAMEDREAM_VISION_MODEL ? { visionModel: env.GAMEDREAM_VISION_MODEL } : {}),
  };

  const templates = godot
    ? findExportTemplates(
        godot.version,
        env,
        process.platform,
        hostTemplatePlatform(),
      )
    : null;
  if (templates && !templates.installed) {
    warnings.push(
      `Godot export templates missing for ${templates.requested} ${templates.version}; native export unavailable at ${templates.dir}. Install templates via the Godot editor or use \`dream godot package\`.`,
    );
  }
  return {
    node: process.version,
    godot,
    unity,
    provider: providerReport,
    templates,
    ok: problems.length === 0,
    problems,
    warnings,
  };
}
