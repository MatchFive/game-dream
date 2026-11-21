import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAsset, loadCanvas, loadProject, mimeForFile, saveCanvas, scanAssets, setInBuild, toggleInBuild } from './assets.js';
import { ComfyRunner } from './comfyui.js';
import type { ComfyUiConfig, StudioState } from './types.js';

export interface StudioServerOptions {
  projectDir: string;
  host?: string;
  port?: number;
  comfyui?: Partial<ComfyUiConfig>;
}

export interface StudioServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

const DEFAULT_COMFY_URL = 'http://192.168.124.56:8000';
const DEFAULT_WORKFLOW = 'D:/QQ/image_qwen_image_2_1_t2i.json';
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_BODY_BYTES = 1024 * 1024;

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('invalid JSON body');
  }
}

function contentTypeFor(file: string): string {
  const extension = extname(file).toLowerCase();
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  };
  return types[extension] ?? mimeForFile(file);
}

function serveFile(
  request: IncomingMessage,
  response: ServerResponse,
  file: string,
  cache: boolean,
): void {
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentTypeFor(file),
    'content-length': statSync(file).size,
    'cache-control': cache ? 'public, max-age=60' : 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}

function safeProjectFile(root: string, relativePath: string): string | undefined {
  const file = resolve(root, relativePath);
  const prefix = resolve(root);
  return file === prefix || file.startsWith(`${prefix}${requireSeparator()}`) ? file : undefined;
}

function requireSeparator(): string {
  return process.platform === 'win32' ? '\\' : '/';
}

export async function startStudioServer(options: StudioServerOptions): Promise<StudioServerHandle> {
  const root = resolve(options.projectDir);
  if (!existsSync(root)) throw new Error(`project directory not found: ${root}`);
  const host = options.host ?? process.env.STUDIO_HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.STUDIO_PORT ?? 4173);
  const comfyui = {
    url: options.comfyui?.url ?? process.env.COMFYUI_URL ?? DEFAULT_COMFY_URL,
    workflow: options.comfyui?.workflow ?? process.env.COMFYUI_WORKFLOW ?? DEFAULT_WORKFLOW,
  };
  const runner = new ComfyRunner(comfyui, join(root, '.gamedream', 'studio', 'generated'), root);

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (pathname.startsWith('/api/')) {
        await handleApi(request, response, pathname, root, runner, comfyui);
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405);
        response.end('Method not allowed');
        return;
      }
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = resolve(PUBLIC_DIR, relativePath);
      if (!file.startsWith(resolve(PUBLIC_DIR)) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      serveFile(request, response, file, !relativePath.endsWith('.html'));
    } catch (error) {
      if (!response.headersSent) json(response, 500, { error: (error as Error).message });
      else response.end();
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  return {
    url: `http://${displayHost}:${actualPort}`,
    port: actualPort,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    }),
  };
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  root: string,
  runner: ComfyRunner,
  comfyui: ComfyUiConfig,
): Promise<void> {
  const method = request.method ?? 'GET';

  if (method === 'GET' && pathname === '/api/state') {
    const canvas = loadCanvas(root);
    const online = await runner.health();
    const state: StudioState = {
      project: loadProject(root),
      assets: scanAssets(root, canvas.inBuild),
      canvas,
      comfyui: {
        url: comfyui.url,
        workflow: comfyui.workflow,
        workflowExists: runner.workflowExists(),
        online,
      },
    };
    json(response, 200, state);
    return;
  }

  if (method === 'GET' && pathname === '/api/health') {
    json(response, 200, {
      comfyui: (await runner.health()) ? 'online' : 'offline',
      workflowExists: runner.workflowExists(),
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/generate') {
    let body: { prompt?: unknown; transparent?: unknown };
    try {
      body = (await readJson(request)) as typeof body;
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
      return;
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      json(response, 400, { error: 'prompt is required' });
      return;
    }
    if (prompt.length > 2000) {
      json(response, 400, { error: 'prompt is limited to 2000 characters' });
      return;
    }
    if (!runner.workflowExists()) {
      json(response, 503, { error: `ComfyUI workflow not found: ${comfyui.workflow}` });
      return;
    }
    const job = runner.start(prompt, body.transparent === true);
    json(response, 202, { job });
    return;
  }

  const jobMatch = pathname.match(/^\/api\/jobs\/([a-f0-9-]+)$/);
  if (method === 'GET' && jobMatch) {
    const job = runner.getJob(jobMatch[1]);
    if (!job) {
      json(response, 404, { error: 'job not found' });
      return;
    }
    json(response, 200, { job });
    return;
  }

  const rawMatch = pathname.match(/^\/api\/assets\/([a-f0-9]+)\/raw$/);
  if ((method === 'GET' || method === 'HEAD') && rawMatch) {
    const asset = findAsset(root, rawMatch[1]);
    const file = asset ? safeProjectFile(root, asset.file) : undefined;
    if (!asset || !file) {
      json(response, 404, { error: 'asset not found' });
      return;
    }
    response.setHeader('content-type', asset.mime);
    response.setHeader('cache-control', 'public, max-age=60');
    if (method === 'HEAD') {
      response.writeHead(200);
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
    return;
  }

  const useMatch = pathname.match(/^\/api\/assets\/([a-f0-9]+)\/use$/);
  if (method === 'POST' && useMatch) {
    const asset = findAsset(root, useMatch[1]);
    if (!asset) {
      json(response, 404, { error: 'asset not found' });
      return;
    }
    let value: boolean | undefined;
    try {
      const body = (await readJson(request)) as { value?: unknown };
      if (typeof body.value === 'boolean') value = body.value;
    } catch {
      // A body is optional for this route.
    }
    const canvas = value === undefined ? toggleInBuild(root, asset.id) : setInBuild(root, asset.id, value);
    json(response, 200, { canvas });
    return;
  }

  if ((method === 'PUT' || method === 'POST') && pathname === '/api/canvas') {
    let body: { nodes?: unknown; inBuild?: unknown };
    try {
      body = (await readJson(request)) as typeof body;
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
      return;
    }
    if (!Array.isArray(body.nodes)) {
      json(response, 400, { error: 'nodes must be an array' });
      return;
    }
    const canvas = saveCanvas(root, {
      nodes: body.nodes as never,
      inBuild: Array.isArray(body.inBuild) ? (body.inBuild as string[]) : [],
    });
    json(response, 200, { canvas });
    return;
  }

  if (pathname === '/api/canvas' && method === 'GET') {
    json(response, 200, loadCanvas(root));
    return;
  }

  json(response, 404, { error: `unknown API route: ${method} ${pathname}` });
}
