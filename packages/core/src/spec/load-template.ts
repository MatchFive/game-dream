import type { TemplateManifest } from '../schemas/template.js';
import { parseTemplate } from '../schemas/template.js';
import { loadYamlFile } from './load-yaml.js';

export function loadTemplate(path: string): TemplateManifest {
  return parseTemplate(loadYamlFile(path));
}
