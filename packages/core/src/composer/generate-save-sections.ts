import type { ModuleRecord } from '../registry/types.js';

export function generateSaveSections(modules: ModuleRecord[]): string {
  const sections = [
    ...new Set(
      modules.flatMap((module) =>
        module.manifest.save_sections.map((section) => section.key),
      ),
    ),
  ];
  return `${JSON.stringify({ sections }, null, 2)}\n`;
}
