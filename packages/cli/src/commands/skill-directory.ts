import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';

export function resolveSkillDirectory(skillsDir: string, name: string): string {
  const value = String(name ?? '').trim();
  if (
    !value ||
    value === '.' ||
    value === '..' ||
    /[\\/]/.test(value) ||
    /^[A-Za-z]:/.test(value) ||
    !existsSync(skillsDir)
  ) {
    throw new Error(`unknown skill: ${value || name}`);
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  if (!entries.some((entry) => entry.isDirectory() && entry.name === value)) {
    throw new Error(`unknown skill: ${value}`);
  }

  const directory = join(skillsDir, value);
  const realRoot = realpathSync(skillsDir);
  const realDirectory = realpathSync(directory);
  if (realDirectory !== realRoot && !realDirectory.startsWith(`${realRoot}${sep}`)) {
    throw new Error(`unknown skill: ${value}`);
  }
  return directory;
}
