import {
  detectGodot,
  type CommandRunner,
  type GodotInstallation,
} from '@gamedream/godot';

export interface DoctorReport {
  node: string;
  godot: GodotInstallation | null;
}

export async function doctorCommand(
  options: { env?: NodeJS.ProcessEnv; runner?: CommandRunner } = {},
): Promise<DoctorReport> {
  const godot = await detectGodot({ env: options.env, runner: options.runner });
  return { node: process.version, godot };
}
