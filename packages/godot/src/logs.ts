import type { CommandResult } from './types.js';

export function hasMarker(result: CommandResult, marker: string): boolean {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}$`, 'm');
  return pattern.test(result.stdout) || pattern.test(result.stderr);
}

export function findScriptErrors(result: CommandResult): string[] {
  return `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .filter((line) =>
      /SCRIPT ERROR|Parse Error|Failed to load|Cannot open|missing input action/.test(line),
    );
}
