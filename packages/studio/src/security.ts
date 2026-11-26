import { existsSync, statSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { extname } from 'node:path';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export class HttpSecurityError extends Error {
  readonly status: 403 | 415;

  constructor(status: 403 | 415, message: string) {
    super(message);
    this.name = 'HttpSecurityError';
    this.status = status;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function assertTrustedMutation(request: IncomingMessage): void {
  if (!MUTATING_METHODS.has((request.method ?? 'GET').toUpperCase())) return;

  if (headerValue(request.headers['sec-fetch-site']) === 'cross-site') {
    throw new HttpSecurityError(403, 'cross-site request rejected');
  }

  const origin = headerValue(request.headers.origin);
  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new HttpSecurityError(403, 'invalid request origin');
    }
    const host = headerValue(request.headers.host);
    if (parsed.protocol !== 'http:' || !host || parsed.host !== host) {
      throw new HttpSecurityError(403, 'cross-origin request rejected');
    }
  }

  const contentLength = Number(headerValue(request.headers['content-length']) ?? '0');
  const hasBody =
    (Number.isFinite(contentLength) && contentLength > 0) ||
    Boolean(headerValue(request.headers['transfer-encoding']));
  if (!hasBody) return;

  const contentType = headerValue(request.headers['content-type']) ?? '';
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType)) {
    throw new HttpSecurityError(415, 'JSON content-type required');
  }
}

export function isSensitiveRelativePath(relativePath: string): boolean {
  const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.some(
    (segment) =>
      segment === '..' ||
      segment.toLowerCase() === 'node_modules' ||
      segment.startsWith('.'),
  );
}

export function isImageRelativePath(relativePath: string): boolean {
  if (isSensitiveRelativePath(relativePath)) return false;
  return IMAGE_EXTENSIONS.has(extname(relativePath).toLowerCase());
}

export function isSafeGodotBin(bin: string): boolean {
  const value = bin.trim();
  if (!value) return false;
  const pathLike = /[\\/]/.test(value) || /^[A-Za-z]:/.test(value);
  if (pathLike) {
    try {
      return existsSync(value) && statSync(value).isFile();
    } catch {
      return false;
    }
  }
  return /^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(value);
}
