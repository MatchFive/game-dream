import { readFileSync } from 'node:fs';

export function validateContentFile(path: string): void {
  if (!path.endsWith('.json')) return;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`invalid content JSON: ${path}: ${(error as Error).message}`);
  }
  if (
    data === null ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof (data as { id?: unknown }).id !== 'string'
  ) {
    throw new Error(`invalid content: ${path}: expected an object with a string id`);
  }
}
