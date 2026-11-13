import type { GameSpec } from '../schemas/game-spec.js';
import { parseGameSpec } from '../schemas/game-spec.js';
import { loadYamlFile } from './load-yaml.js';

export function loadGameSpec(path: string): GameSpec {
  return parseGameSpec(loadYamlFile(path));
}
