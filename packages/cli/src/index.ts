#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProgram } from './program.js';

const envFile = resolve('.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Ignore malformed .env files; explicit environment variables still work.
  }
}

await createProgram().parseAsync(process.argv);
