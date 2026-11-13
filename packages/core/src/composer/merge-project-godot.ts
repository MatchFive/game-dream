interface IniSection {
  name: string;
  entries: Array<[string, string]>;
}

interface ParsedIni {
  root: string[];
  sections: IniSection[];
}

function parseIni(text: string): ParsedIni {
  const lines = text.split(/\r?\n/);
  const root: string[] = [];
  const sections: IniSection[] = [];
  let current: IniSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      current = { name: trimmed.slice(1, -1), entries: [] };
      sections.push(current);
      continue;
    }
    if (current === null) {
      if (trimmed !== '') root.push(line);
      continue;
    }
    if (trimmed === '' || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals < 0) continue;
    current.entries.push([line.slice(0, equals).trim(), line.slice(equals + 1).trim()]);
  }

  return { root, sections };
}

function upsert(entries: Array<[string, string]>, key: string, value: string): void {
  const existing = entries.find(([entryKey]) => entryKey === key);
  if (existing) existing[1] = value;
  else entries.push([key, value]);
}

function serialize(parsed: ParsedIni): string {
  const lines: string[] = [...parsed.root];
  for (const section of parsed.sections) {
    lines.push('', `[${section.name}]`);
    for (const [key, value] of section.entries) lines.push(`${key}=${value}`);
  }
  return `${lines.join('\n')}\n`;
}

export function mergeProjectGodot(existing: string | null, generated: string): string {
  if (existing === null) return generated;

  const oldIni = parseIni(existing);
  const generatedIni = parseIni(generated);
  const sections = new Map(oldIni.sections.map((section) => [section.name, section]));
  const generatedSections = new Map(
    generatedIni.sections.map((section) => [section.name, section]),
  );

  const application =
    sections.get('application') ?? { name: 'application', entries: [] };
  for (const [key, value] of generatedSections.get('application')?.entries ?? []) {
    if (key === 'config/name') {
      if (!application.entries.some(([entryKey]) => entryKey === key)) {
        application.entries.push([key, value]);
      }
    } else if (key === 'config/features') {
      if (!application.entries.some(([entryKey]) => entryKey === key)) {
        application.entries.push([key, value]);
      }
    } else {
      upsert(application.entries, key, value);
    }
  }
  sections.set('application', application);

  const autoload = sections.get('autoload') ?? { name: 'autoload', entries: [] };
  const generatedAutoloads = generatedSections.get('autoload')?.entries ?? [];
  const managedAutoloads = new Set(generatedAutoloads.map(([key]) => key));
  autoload.entries = autoload.entries.filter(([key]) => !managedAutoloads.has(key));
  autoload.entries.push(...generatedAutoloads);
  sections.set('autoload', autoload);

  for (const [name, section] of generatedSections) {
    if (!sections.has(name)) sections.set(name, section);
  }

  return serialize({
    root: oldIni.root,
    sections: [
      ...oldIni.sections.map((section) => sections.get(section.name)!),
      ...[...sections.values()].filter(
        (section) => !oldIni.sections.some((old) => old.name === section.name),
      ),
    ],
  });
}
