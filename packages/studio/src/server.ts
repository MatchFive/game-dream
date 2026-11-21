import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentManager, AGENT_POLICY_TOOLS } from './agent.js';
import { findAsset, loadCanvas, loadProject, mimeForFile, saveCanvas, scanAssets, setInBuild, toggleInBuild } from './assets.js';
import { ComfyRunner } from './comfyui.js';
import { detectEngine } from './project.js';
import {
  appendRun,
  loadProjectSnapshot,
  runId,
  uploadFile,
  type VerifyRun,
} from './project.js';
import type { ComfyUiConfig, StudioState } from './types.js';

export interface StudioServerOptions {
  projectDir: string;
  host?: string;
  port?: number;
  comfyui?: Partial<ComfyUiConfig>;
  cliEntry?: string;
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
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJson(request: IncomingMessage, limit = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error('request body is too large');
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

function rewritePlaytestUrl(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/play/')) {
    return value;
  }
  if (value === '/play') return value;
  return `/play${value}`;
}

function rewritePlaytestCss(css: string): string {
  return css
    .replace(
      /url\(\s*(['"]?)(\/[^)'"]*)\1\s*\)/gi,
      (_match, quote: string, value: string) => `url(${quote}${rewritePlaytestUrl(value)}${quote})`,
    )
    .replace(
      /@import\s+(['"])(\/[^'"]*)\1/gi,
      (_match, quote: string, value: string) => `@import ${quote}${rewritePlaytestUrl(value)}${quote}`,
    );
}

function rewritePlaytestHtml(html: string, base: string): string {
  let output = html.replace(
    /(\b(?:src|href|poster|data-src)=)(["'])(\/[^"']*)\2/gi,
    (_match, attribute: string, quote: string, value: string) =>
      `${attribute}${quote}${rewritePlaytestUrl(value)}${quote}`,
  );
  output = rewritePlaytestCss(output);
  if (!/<base\s/i.test(output)) {
    output = /<head[^>]*>/i.test(output)
      ? output.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`)
      : `<base href="${base}">${output}`;
  }
  return output;
}

function servePlaytestFile(
  request: IncomingMessage,
  response: ServerResponse,
  file: string,
  relativePath: string,
): void {
  const extension = extname(file).toLowerCase();
  if (extension !== '.html' && extension !== '.css') {
    serveFile(request, response, file, false);
    return;
  }
  const directory = relativePath.replace(/\\/g, '/').replace(/[^/]+$/, '');
  const content = extension === '.html'
    ? rewritePlaytestHtml(
        readFileSync(file, 'utf8'),
        `/play/${directory}`,
      )
    : rewritePlaytestCss(readFileSync(file, 'utf8'));
  const type = extension === '.html'
    ? 'text/html; charset=utf-8'
    : 'text/css; charset=utf-8';
  response.writeHead(200, {
    'content-type': type,
    'content-length': Buffer.byteLength(content),
    'cache-control': 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  response.end(content);
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
  const cliEntry = options.cliEntry ?? process.env.GAMEDREAM_CLI;
  const agent = new AgentManager({ root, cliEntry });
  const sseClients = new Set<ServerResponse>();
  let playtestChild: ReturnType<typeof spawn> | undefined;
  const stopPlaytest = () => {
    if (!playtestChild?.pid) return;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(playtestChild.pid), '/t', '/f'], { windowsHide: true });
    } else {
      playtestChild.kill('SIGTERM');
    }
    playtestChild = undefined;
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (pathname.startsWith('/api/')) {
        await handleApi(
          request,
          response,
          pathname,
          root,
          runner,
          comfyui,
          cliEntry,
          agent,
          sseClients,
          stopPlaytest,
          (child) => { playtestChild = child; },
        );
        return;
      }

      if (pathname === '/play' || pathname.startsWith('/play/')) {
        const relativePath = pathname === '/play' || pathname === '/play/'
          ? 'index.html'
          : pathname.slice('/play/'.length);
        const file = safeProjectFile(root, relativePath);
        if (!file || !existsSync(file) || !statSync(file).isFile()) {
          response.writeHead(404);
          response.end('Playtest build not found');
          return;
        }
        servePlaytestFile(request, response, file, relativePath);
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405);
        response.end('Method not allowed');
        return;
      }
      const relativePath = pathname === '/'
        ? 'studio.html'
        : pathname === '/assets' || pathname === '/assets/'
          ? 'index.html'
          : pathname === '/studio'
            ? 'studio.html'
            : pathname.replace(/^\/+/, '');
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
      stopPlaytest();
      agent.close();
      for (const client of sseClients) {
        if (!client.writableEnded) client.end();
      }
      sseClients.clear();
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    }),
  };
}

async function executeVerify(
  root: string,
  cliEntry: string | undefined,
  visual: boolean,
): Promise<VerifyRun> {
  if (!cliEntry) throw new Error('verification CLI entry is not configured');
  const started = Date.now();
  const run = await new Promise<VerifyRun>((resolveRun, rejectRun) => {
    const args = [resolve(cliEntry), 'verify', '--path', root, '--json'];
    if (visual) args.push('--visual');
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error('verification timed out after 120s'));
    }, 120_000);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      let report: {
        gates?: Record<string, { status: 'pass' | 'fail' | 'skip'; message?: string }>;
        engine?: 'present' | 'missing';
      } = {};
      try {
        report = JSON.parse(stdout.trim()) as typeof report;
      } catch {
        // The report may be empty when the CLI failed before producing JSON.
      }
      const gates = report.gates ?? {};
      const result: VerifyRun = {
        id: runId(),
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        engine: report.engine ?? 'missing',
        gates,
        ok: Boolean(report.gates)
          && Object.values(gates).every((gate) => gate.status === 'pass'),
        output: `${stdout}\n${stderr}`.trim().slice(-4000) || `exit ${code ?? 'unknown'}`,
      };
      resolveRun(result);
    });
  });
  appendRun(root, run);
  return run;
}

function detectGodotPlaytest(): {
  available: boolean;
  bin: string;
  version?: string;
} {
  const candidates = [process.env.GODOT_BIN, 'godot', 'godot4'].filter(Boolean) as string[];
  for (const bin of candidates) {
    const result = spawnSync(bin, ['--version'], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    const version = String(result.stdout ?? '').trim().split(/\r?\n/)[0] ?? '';
    if (result.status === 0 && /^4\./.test(version)) {
      return { available: true, bin, version };
    }
  }
  return { available: false, bin: candidates[0] ?? 'godot' };
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  root: string,
  runner: ComfyRunner,
  comfyui: ComfyUiConfig,
  cliEntry: string | undefined,
  agent: AgentManager,
  sseClients: Set<ServerResponse>,
  stopPlaytest: () => void,
  setPlaytestChild: (child: ReturnType<typeof spawn>) => void,
): Promise<void> {
  const method = request.method ?? 'GET';

  if (method === 'GET' && pathname === '/api/playtest/capabilities') {
    const engine = detectEngine(root);
    const godot = detectGodotPlaytest();
    json(response, 200, {
      engine,
      web: {
        available: existsSync(join(root, 'index.html')),
        url: '/play/',
      },
      godot: {
        available: godot.available,
        bin: godot.bin,
        version: godot.version,
      },
      unity: { available: false },
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/playtest/start') {
    const engine = detectEngine(root);
    if (engine === 'web' && existsSync(join(root, 'index.html'))) {
      json(response, 200, { mode: 'iframe', url: '/play/' });
      return;
    }
    if (engine === 'godot') {
      const godot = detectGodotPlaytest();
      if (!godot.available) {
        json(response, 503, {
          error: 'Godot 4.4+ not found. Set GODOT_BIN or add godot to PATH.',
        });
        return;
      }
      stopPlaytest();
      const child = spawn(godot.bin, ['--path', root], {
        cwd: root,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      setPlaytestChild(child);
      json(response, 200, {
        mode: 'external',
        pid: child.pid,
        bin: godot.bin,
        message: 'Godot playtest launched in a separate window.',
      });
      return;
    }
    if (engine === 'unity') {
      json(response, 501, { error: 'Unity playtest is not available from the Studio server yet.' });
      return;
    }
    json(response, 400, { error: 'No playable web or Godot project detected in this directory.' });
    return;
  }

  if (method === 'POST' && pathname === '/api/playtest/stop') {
    stopPlaytest();
    json(response, 200, { stopped: true });
    return;
  }

  if (method === 'GET' && pathname === '/api/agent/events') {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = () => {
      if (response.writableEnded) return;
      response.write(`event: snapshot\ndata: ${JSON.stringify(agent.list())}\n\n`);
    };
    send();
    const unsubscribe = agent.subscribe(send);
    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(': ping\n\n');
    }, 15_000);
    sseClients.add(response);
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      sseClients.delete(response);
    };
    request.once('close', cleanup);
    request.once('aborted', cleanup);
    response.once('close', cleanup);
    return;
  }

  if (method === 'GET' && pathname === '/api/agent/policy') {
    json(response, 200, {
      policy: agent.getPolicy(),
      availableTools: AGENT_POLICY_TOOLS,
      source: '.gamedream/studio/agent-policy.json',
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/agent/policy') {
    try {
      const body = (await readJson(request)) as {
        tool?: unknown;
        mode?: unknown;
        default?: unknown;
      };
      const tool = typeof body.tool === 'string' ? body.tool.trim() : '';
      const mode = body.mode;
      if ((!tool && body.default !== true) || (mode !== 'allow' && mode !== 'ask' && mode !== 'deny')) {
        json(response, 400, { error: 'tool (or default) and mode allow|ask|deny are required' });
        return;
      }
      json(response, 200, {
        policy: body.default === true
          ? agent.updateDefaultPolicy(mode)
          : agent.updatePolicy(tool, mode),
        availableTools: AGENT_POLICY_TOOLS,
        source: '.gamedream/studio/agent-policy.json',
      });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/agent') {
    json(response, 200, agent.list());
    return;
  }

  const agentBatchMatch = pathname.match(/^\/api\/agent\/batches\/([^/]+)$/);
  if (method === 'GET' && agentBatchMatch) {
    const batch = agent.get(agentBatchMatch[1]);
    if (!batch) {
      json(response, 404, { error: 'agent batch not found' });
      return;
    }
    json(response, 200, { batch });
    return;
  }

  if (method === 'POST' && pathname === '/api/agent/start') {
    try {
      const body = (await readJson(request)) as {
        prompt?: unknown;
        provider?: unknown;
        skill?: unknown;
        maxSteps?: unknown;
        maxTokens?: unknown;
        maxPromptTokens?: unknown;
        candidates?: unknown;
        resume?: unknown;
        approvalTools?: unknown;
      };
      const batch = await agent.start({
        prompt: typeof body.prompt === 'string' ? body.prompt : '',
        provider: body.provider === 'fake' ? 'fake' : 'auto',
        skill: typeof body.skill === 'string' ? body.skill : undefined,
        maxSteps: typeof body.maxSteps === 'number' ? body.maxSteps : undefined,
        maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
        maxPromptTokens: typeof body.maxPromptTokens === 'number'
          ? body.maxPromptTokens
          : undefined,
        candidates: typeof body.candidates === 'number' ? body.candidates : undefined,
        resume: body.resume === true,
        approvalTools: Array.isArray(body.approvalTools)
          ? body.approvalTools.map(String)
          : undefined,
      });
      json(response, 202, { batch });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  const cancelMatch = pathname.match(/^\/api\/agent\/batches\/([^/]+)\/cancel$/);
  if (method === 'POST' && cancelMatch) {
    try {
      json(response, 200, { batch: agent.cancel(cancelMatch[1]) });
    } catch (error) {
      json(response, 404, { error: (error as Error).message });
    }
    return;
  }

  const diffMatch = pathname.match(
    /^\/api\/agent\/batches\/([^/]+)\/candidates\/([^/]+)\/diff$/,
  );
  if (method === 'GET' && diffMatch) {
    try {
      json(response, 200, { diff: agent.diff(diffMatch[1], diffMatch[2]) });
    } catch (error) {
      json(response, 404, { error: (error as Error).message });
    }
    return;
  }

  const rollbackMatch = pathname.match(/^\/api\/agent\/batches\/([^/]+)\/rollback$/);
  if (method === 'POST' && rollbackMatch) {
    try {
      json(response, 200, { batch: agent.rollback(rollbackMatch[1]) });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  const applyMatch = pathname.match(/^\/api\/agent\/batches\/([^/]+)\/apply$/);
  if (method === 'POST' && applyMatch) {
    try {
      const body = (await readJson(request)) as { runId?: unknown };
      const batch = agent.get(applyMatch[1]);
      if (!batch) {
        json(response, 404, { error: 'agent batch not found' });
        return;
      }
      const runId = typeof body.runId === 'string' ? body.runId : batch.selectedRunId;
      if (!runId) {
        json(response, 400, { error: 'runId is required' });
        return;
      }
      json(response, 200, { batch: agent.apply(applyMatch[1], runId) });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  const approvalMatch = pathname.match(
    /^\/api\/agent\/batches\/([^/]+)\/runs\/([^/]+)\/approval$/,
  );
  if (method === 'POST' && approvalMatch) {
    try {
      const body = (await readJson(request)) as {
        approvalId?: unknown;
        allowed?: unknown;
        reason?: unknown;
      };
      if (typeof body.approvalId !== 'string') {
        json(response, 400, { error: 'approvalId is required' });
        return;
      }
      const approval = agent.approve(
        approvalMatch[1],
        approvalMatch[2],
        body.approvalId,
        body.allowed === true,
        typeof body.reason === 'string' ? body.reason : undefined,
      );
      json(response, 200, { approval });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

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

  if (method === 'GET' && pathname === '/api/project') {
    const canvas = loadCanvas(root);
    const snapshot = loadProjectSnapshot(root, canvas, {
      url: comfyui.url,
      workflow: comfyui.workflow,
      workflowExists: runner.workflowExists(),
      online: await runner.health(),
    });
    json(response, 200, snapshot);
    return;
  }

  if (method === 'GET' && pathname === '/api/project/screenshot') {
    const canvas = loadCanvas(root);
    const snapshot = loadProjectSnapshot(root, canvas, {
      url: comfyui.url,
      workflow: comfyui.workflow,
      workflowExists: runner.workflowExists(),
      online: false,
    });
    const requested = new URL(request.url ?? '/', 'http://local').searchParams.get('file');
    const relativeFile = requested ?? snapshot.build.screenshot?.file;
    const file = relativeFile ? safeProjectFile(root, relativeFile) : undefined;
    if (!file) {
      json(response, 404, { error: 'screenshot not found' });
      return;
    }
    serveFile(request, response, file, false);
    return;
  }

  if (method === 'POST' && pathname === '/api/verify') {
    let visual = false;
    try {
      const body = (await readJson(request)) as { visual?: unknown };
      visual = body.visual === true;
    } catch {
      // Optional body.
    }
    try {
      const run = await executeVerify(root, cliEntry, visual);
      json(response, 200, { run });
    } catch (error) {
      json(response, 503, { error: (error as Error).message });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/upload') {
    try {
      const body = (await readJson(request, MAX_UPLOAD_BYTES)) as { name?: unknown; data?: unknown };
      const name = typeof body.name === 'string' ? body.name : '';
      const data = typeof body.data === 'string' ? body.data : '';
      if (!name || !data) {
        json(response, 400, { error: 'name and data are required' });
        return;
      }
      const file = uploadFile(root, name, data.replace(/^data:[^;]+;base64,/, ''));
      json(response, 201, { file });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/generate') {
    let body: { prompt?: unknown; transparent?: unknown; count?: unknown };
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
    const count = body.count === undefined ? 1 : Number(body.count);
    if (!Number.isInteger(count) || count < 1 || count > 4) {
      json(response, 400, { error: 'count must be an integer between 1 and 4' });
      return;
    }
    if (!runner.workflowExists()) {
      json(response, 503, { error: `ComfyUI workflow not found: ${comfyui.workflow}` });
      return;
    }
    const jobs = runner.startBatch(prompt, body.transparent === true, count);
    json(response, 202, { job: jobs[0], jobs });
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
