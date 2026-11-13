export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GodotInstallation {
  bin: string;
  version: string;
  major: number;
  minor: number;
}
