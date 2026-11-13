import {
  runHeadless,
  type CommandRunner,
  type GodotInstallation,
} from '@gamedream/godot';

export async function runCommand(options: {
  projectDir: string;
  godot: GodotInstallation;
  quitAfter?: number;
  runner?: CommandRunner;
}) {
  return runHeadless(options.projectDir, options.godot, {
    quitAfter: options.quitAfter ?? 1200,
    runner: options.runner,
  });
}
