import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';

export interface ResolvedSkill {
  root: string;
  name: string;
  directory: string;
}

function rootsOf(skillsDir: string | string[]): string[] {
  const values = Array.isArray(skillsDir) ? skillsDir : [skillsDir];
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const root = value;
    if (seen.has(root)) continue;
    seen.add(root);
    roots.push(root);
  }
  return roots;
}

function validName(name: string): boolean {
  return Boolean(name)
    && name !== '.'
    && name !== '..'
    && !/[\\/]/.test(name)
    && !/^[A-Za-z]:/.test(name);
}

export function listSkills(skillsDir: string | string[]): ResolvedSkill[] {
  const found: ResolvedSkill[] = [];
  const seen = new Set<string>();
  for (const root of rootsOf(skillsDir)) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || seen.has(entry.name)) continue;
      seen.add(entry.name);
      found.push({ root, name: entry.name, directory: join(root, entry.name) });
    }
  }
  return found.sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveSkill(
  skillsDir: string | string[],
  name: string,
): ResolvedSkill {
  const value = String(name ?? '').trim();
  if (!validName(value)) {
    throw new Error(`unknown skill: ${value || name}`);
  }
  for (const root of rootsOf(skillsDir)) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    if (!entries.some((entry) => entry.isDirectory() && entry.name === value)) continue;
    const directory = join(root, value);
    const realRoot = realpathSync(root);
    const realDirectory = realpathSync(directory);
    if (realDirectory !== realRoot && !realDirectory.startsWith(`${realRoot}${sep}`)) {
      throw new Error(`unknown skill: ${value}`);
    }
    return { root, name: value, directory };
  }
  throw new Error(`unknown skill: ${value}`);
}

export function resolveSkillDirectory(
  skillsDir: string | string[],
  name: string,
): string {
  return resolveSkill(skillsDir, name).directory;
}
