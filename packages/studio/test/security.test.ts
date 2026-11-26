import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertTrustedMutation,
  HttpSecurityError,
  isImageRelativePath,
  isSafeGodotBin,
  isSensitiveRelativePath,
} from '../src/security.js';

function request(method: string, headers: Record<string, string>): IncomingMessage {
  return { method, headers } as unknown as IncomingMessage;
}

function statusOf(run: () => void): number {
  try {
    run();
    return 0;
  } catch (error) {
    return error instanceof HttpSecurityError ? error.status : 500;
  }
}

describe('studio request security', () => {
  it('blocks cross-site mutations, bad origins, and non-JSON bodies', () => {
    expect(statusOf(() => assertTrustedMutation(request('POST', {
      'sec-fetch-site': 'cross-site',
    })))).toBe(403);
    expect(statusOf(() => assertTrustedMutation(request('DELETE', {
      origin: 'http://evil.test',
      host: '127.0.0.1:4173',
    })))).toBe(403);
    expect(statusOf(() => assertTrustedMutation(request('POST', {
      origin: 'null',
      host: '127.0.0.1:4173',
    })))).toBe(403);
    expect(statusOf(() => assertTrustedMutation(request('POST', {
      host: '127.0.0.1:4173',
      'content-length': '2',
      'content-type': 'text/plain',
    })))).toBe(415);
  });

  it('allows same-origin browser requests and non-browser clients', () => {
    expect(statusOf(() => assertTrustedMutation(request('POST', {
      host: '127.0.0.1:4173',
      origin: 'http://127.0.0.1:4173',
      'content-length': '2',
      'content-type': 'application/json; charset=utf-8',
    })))).toBe(0);
    expect(statusOf(() => assertTrustedMutation(request('POST', {
      host: '127.0.0.1:4173',
      'content-length': '2',
      'content-type': 'application/vnd.gamedream+json',
    })))).toBe(0);
    expect(statusOf(() => assertTrustedMutation(request('POST', {
      host: '127.0.0.1:4173',
    })))).toBe(0);
    expect(statusOf(() => assertTrustedMutation(request('GET', {
      'sec-fetch-site': 'cross-site',
    })))).toBe(0);
  });
});

describe('studio path security', () => {
  it('rejects hidden, parent, and dependency segments', () => {
    expect(isSensitiveRelativePath('.env')).toBe(true);
    expect(isSensitiveRelativePath('.gamedream/session.json')).toBe(true);
    expect(isSensitiveRelativePath('assets/../.env')).toBe(true);
    expect(isSensitiveRelativePath('node_modules/phaser/index.js')).toBe(true);
    expect(isSensitiveRelativePath('NODE_MODULES/phaser/index.js')).toBe(true);
    expect(isSensitiveRelativePath('assets/hero.png')).toBe(false);
    expect(isSensitiveRelativePath('index.html')).toBe(false);
  });

  it('only accepts image extensions outside sensitive paths', () => {
    expect(isImageRelativePath('screenshots/latest.png')).toBe(true);
    expect(isImageRelativePath('assets/hero.JPG')).toBe(true);
    expect(isImageRelativePath('.env')).toBe(false);
    expect(isImageRelativePath('.hidden/hero.png')).toBe(false);
    expect(isImageRelativePath('game.json')).toBe(false);
  });
});

describe('studio godot binary security', () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it('accepts command names and real files with spaces', () => {
    expect(isSafeGodotBin('godot')).toBe(true);
    expect(isSafeGodotBin('godot4')).toBe(true);
    directory = mkdtempSync(join(tmpdir(), 'gamedream godot '));
    const binary = join(directory, 'godot console.exe');
    writeFileSync(binary, '');
    expect(isSafeGodotBin(binary)).toBe(true);
  });

  it('rejects shell metacharacters and non-files', () => {
    expect(isSafeGodotBin('godot & calc')).toBe(false);
    expect(isSafeGodotBin('godot.exe | whoami')).toBe(false);
    expect(isSafeGodotBin('-godot')).toBe(false);
    expect(isSafeGodotBin(join(tmpdir(), 'missing-godot.exe'))).toBe(false);
    expect(isSafeGodotBin(tmpdir())).toBe(false);
  });
});
