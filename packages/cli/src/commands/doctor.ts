import {
  detectGodot,
  type CommandRunner,
  type GodotInstallation,
} from '@gamedream/godot';

export interface DoctorReport {
  node: string;
  godot: GodotInstallation | null;
  ok: boolean;
  problems: string[];
}

export async function doctorCommand(
  options: { env?: NodeJS.ProcessEnv; runner?: CommandRunner } = {},
): Promise<DoctorReport> {
  const godot = await detectGodot({ env: options.env, runner: options.runner });
  const problems: string[] = [];
  if (!godot) {
    problems.push(
      'Godot 4.4+ not found. Set GODOT_BIN to the console executable (Godot_v4.*_console.exe) or add godot to PATH.',
    );
  } else if (godot.major < 4 || (godot.major === 4 && godot.minor < 4)) {
    problems.push(`Godot ${godot.version} detected; 4.4+ required.`);
  }
  return { node: process.version, godot, ok: problems.length === 0, problems };
}
