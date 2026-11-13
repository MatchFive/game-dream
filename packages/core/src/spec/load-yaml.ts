import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export function loadYamlFile(path: string): unknown {
  return parse(readFileSync(path, 'utf8'));
}
