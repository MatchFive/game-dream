import type { CommandResult } from './types.js';

export function hasMarker(result: CommandResult, marker: string): boolean {
  return result.stdout.includes(marker) || result.stderr.includes(marker);
}

export function findScriptErrors(result: CommandResult): string[] {
  return `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .filter((line) => /SCRIPT ERROR|Parse Error|Failed to load|Cannot open/.test(line));
}
