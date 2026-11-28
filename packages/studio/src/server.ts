import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentManager, AGENT_POLICY_TOOLS } from './agent.js';
import { AssetAgentManager } from './asset-agent.js';
import { isLoopbackAddress, pickPath, type DialogRequest } from './dialog.js';
import { createAnimationAtlas } from './animation-atlas.js';
import { listProjects, projectNameForDirectory } from './projects.js';
import {
  loadStudioSettings,
  publicStudioSettings,
  saveStudioSettings,
  studioEnv,
  type StudioSettings,
} from './settings.js';
import { findAsset, loadCanvas, loadProject, mimeForFile, renameAsset, saveCanvas, scanAssets, setInBuild, syncBuildAssets, toggleInBuild } from './assets.js';
import { ComfyAudioRunner, ComfyWorkflowRunner } from './comfyui.js';
import { WorkflowRegistry } from './workflows.js';
import { generateSfx } from './sfx.js';
import { detectEngine } from './project.js';
import { artDir, buildScene, ensureArtwork, exportScene, listScenes, loadScene, reviewScene, resolveKit } from './scenes.js';
import { exportBadcase, sceneInsights } from './insights.js';
import {
  librarySprites,
  libraryState,
  libraryThumbnail,
  setSpritePrefab,
} from './library.js';
import {
  assertTrustedMutation,
  HttpSecurityError,
  isImageRelativePath,
  isSafeGodotBin,
  isSensitiveRelativePath,
} from './security.js';
import {
  appendRun,
  loadProjectSnapshot,
  runId,
  uploadFile,
  type VerifyRun,
} from './project.js';
import type { CanvasNode, ComfyUiConfig, StudioState } from './types.js';

export interface StudioServerOptions {
  projectDir: string;
  host?: string;
  port?: number;
  comfyui?: Partial<ComfyUiConfig>;
  cliEntry?: string;
  workspaceDir?: string;
  openDialog?: (request: DialogRequest) => Promise<string | undefined>;
}

interface StudioRuntime {
  root: string;
  getSettings(): StudioSettings;
  getEnv(): NodeJS.ProcessEnv;
  getComfyui(): ComfyUiConfig;
  getRunner(): ComfyWorkflowRunner;
  getAudioRunner(): ComfyAudioRunner;
  getAssetAgent(): AssetAgentManager;
}

export interface StudioServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

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

function rewritePlaytestUrl(value: string, base = '/play/'): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/play/')) {
    return value;
  }
  if (value === '/play') return value;
  return `${base}${value.slice(1)}`;
}

function rewritePlaytestCss(css: string, base = '/play/'): string {
  return css
    .replace(
      /url\(\s*(['"]?)(\/[^)'"]*)\1\s*\)/gi,
      (_match, quote: string, value: string) =>
        `url(${quote}${rewritePlaytestUrl(value, base)}${quote})`,
    )
    .replace(
      /@import\s+(['"])(\/[^'"]*)\1/gi,
      (_match, quote: string, value: string) =>
        `@import ${quote}${rewritePlaytestUrl(value, base)}${quote}`,
    );
}

function playtestRuntimeShim(base: string): string {
  return `<script>(function(){
var base=${JSON.stringify(base)};
function rewrite(value){
  if(typeof value!=="string"||!value.startsWith("/")||value.startsWith("//")||value.startsWith("/play/")||value==="/play")return value;
  return base+value.slice(1);
}
var nativeFetch=window.fetch;
if(nativeFetch){
  window.fetch=function(input,init){
    if(typeof input==="string")input=rewrite(input);
    else if(input instanceof Request){var url=rewrite(input.url);if(url!==input.url)input=new Request(url,input);}
    return nativeFetch.call(this,input,init);
  };
}
var NativeURL=window.URL;
if(NativeURL){
  window.URL=class extends NativeURL{constructor(url,baseUrl){super(rewrite(String(url)),baseUrl);}};
}
var nativeOpen=window.XMLHttpRequest&&XMLHttpRequest.prototype.open;
if(nativeOpen){
  XMLHttpRequest.prototype.open=function(method,url){var args=[].slice.call(arguments);args[1]=rewrite(args[1]);return nativeOpen.apply(this,args);};
}
function patch(ctor,property){
  var descriptor=ctor&&Object.getOwnPropertyDescriptor(ctor.prototype,property);
  if(!descriptor||!descriptor.set)return;
  try{Object.defineProperty(ctor.prototype,property,{configurable:descriptor.configurable,enumerable:descriptor.enumerable,get:descriptor.get,set:function(value){descriptor.set.call(this,rewrite(value));}});}catch(error){}
}
patch(window.HTMLImageElement,"src");
patch(window.HTMLMediaElement,"src");
patch(window.HTMLScriptElement,"src");
patch(window.HTMLLinkElement,"href");
var NativeAudio=window.Audio;
if(NativeAudio){
  window.Audio=function(src){return new NativeAudio(src===undefined?undefined:rewrite(src));};
  window.Audio.prototype=NativeAudio.prototype;
}
})();<\\/script>`;
}

function rewritePlaytestHtml(html: string, base: string): string {
  let output = html.replace(
    /(\b(?:src|href|poster|data-src)=)(["'])(\/[^"']*)\2/gi,
    (_match, attribute: string, quote: string, value: string) =>
      `${attribute}${quote}${rewritePlaytestUrl(value, base)}${quote}`,
  );
  output = rewritePlaytestCss(output, base);
  if (!/<base\s/i.test(output)) {
    output = /<head[^>]*>/i.test(output)
      ? output.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`)
      : `<base href="${base}">${output}`;
  }
  const shim = playtestRuntimeShim(base);
  output = /<\/head>/i.test(output)
    ? output.replace(/<\/head>/i, `${shim}</head>`)
    : `${shim}${output}`;
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

function detectGodotWebBuild(root: string): string | undefined {
  for (const relativePath of ['build/web/index.html', 'builds/web/index.html', 'web/index.html']) {
    const file = join(root, relativePath);
    if (existsSync(file) && statSync(file).isFile()) {
      return dirname(file);
    }
  }
  return undefined;
}

function detectUnityPlayer(root: string): string | undefined {
  const directories = [
    join(root, 'Builds', 'Windows'),
    join(root, 'Builds'),
    join(root, 'Build'),
  ];
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (lower.includes('crashhandler')) continue;
      if (!lower.endsWith('.exe') && !lower.endsWith('.x86_64')) continue;
      return join(directory, entry.name);
    }
  }
  return undefined;
}

export async function startStudioServer(options: StudioServerOptions): Promise<StudioServerHandle> {
  const root = resolve(options.projectDir);
  if (!existsSync(root)) throw new Error(`project directory not found: ${root}`);
  const workspaceDir = resolve(
    options.workspaceDir
      ?? process.env.GAMEDREAM_WORKSPACE
      ?? dirname(root),
  );
  const host = options.host ?? process.env.STUDIO_HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.STUDIO_PORT ?? 4173);
  let settings = loadStudioSettings(workspaceDir);
  if (options.comfyui?.url || options.comfyui?.workflow) {
    settings = {
      ...settings,
      image: {
        url: options.comfyui?.url ?? settings.image.url,
        workflow: options.comfyui?.workflow ?? settings.image.workflow,
        workflowsDir: settings.image.workflowsDir,
      },
    };
  }
  const generatedDir = join(root, '.gamedream', 'studio', 'generated');
  const projectWorkflows = join(root, '.gamedream', 'studio', 'workflows');
  const createWorkflowRunner = (current: StudioSettings): ComfyWorkflowRunner => {
    const workspaceWorkflows = current.image.workflowsDir
      ? resolve(workspaceDir, current.image.workflowsDir)
      : join(workspaceDir, '.gamedream', 'studio', 'workflows');
    const registry = new WorkflowRegistry({
      dirs: [projectWorkflows, workspaceWorkflows],
      legacyWorkflow: current.image.workflow,
    });
    return new ComfyWorkflowRunner(
      current.image.url,
      registry,
      generatedDir,
      root,
    );
  };
  let comfyui: ComfyUiConfig = {
    url: settings.image.url,
    workflow: settings.image.workflow,
    workflowsDir: settings.image.workflowsDir,
  };
  let runner = createWorkflowRunner(settings);
  let audioRunner = new ComfyAudioRunner(
    comfyui.url,
    generatedDir,
    root,
  );
  const cliEntry = options.cliEntry ?? process.env.GAMEDREAM_CLI;
  let agentEnv = studioEnv(settings);
  syncBuildAssets(root);
  const agent = new AgentManager({
    root,
    cliEntry,
    env: agentEnv,
    provider: settings.model.provider,
  });
  const assetAgent = new AssetAgentManager({
    root,
    getRunner: () => runner,
    getSettings: () => settings,
    workflowsDir: projectWorkflows,
    generatedDir,
    maxSteps: 16,
  });
  const runtime: StudioRuntime = {
    root,
    getSettings: () => settings,
    getEnv: () => agentEnv,
    getComfyui: () => comfyui,
    getRunner: () => runner,
    getAudioRunner: () => audioRunner,
    getAssetAgent: () => assetAgent,
  };
  const applySettings = (next: StudioSettings): void => {
    settings = next;
    agentEnv = studioEnv(settings);
    comfyui = {
      url: settings.image.url,
      workflow: settings.image.workflow,
      workflowsDir: settings.image.workflowsDir,
    };
    runner = createWorkflowRunner(settings);
    audioRunner = new ComfyAudioRunner(comfyui.url, generatedDir, root);
    agent.setEnv(agentEnv);
    agent.setDefaultProvider(settings.model.provider);
  };
  const childServers = new Set<StudioServerHandle>();
  const sseClients = new Set<ServerResponse>();
  const sseSequence = { value: 0 };
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
        try {
          assertTrustedMutation(request);
        } catch (error) {
          if (error instanceof HttpSecurityError) {
            json(response, error.status, { error: error.message });
            return;
          }
          throw error;
        }
        if (
          pathname === '/api/dialog'
          || pathname.startsWith('/api/settings')
          || pathname.startsWith('/api/projects')
        ) {
          await handleWorkspaceApi(request, response, pathname, {
            workspaceDir,
            root,
            runtime,
            cliEntry,
            host,
            applySettings,
            openDialog: options.openDialog ?? pickPath,
            openProject: async (projectPath) => {
              const child = await startStudioServer({
                projectDir: projectPath,
                workspaceDir,
                host,
                port: 0,
                cliEntry,
              });
              childServers.add(child);
              return child.url;
            },
          });
          return;
        }
        await handleApi(
          request,
          response,
          pathname,
          runtime,
          cliEntry,
          agent,
          sseClients,
          sseSequence,
          stopPlaytest,
          (child) => { playtestChild = child; },
        );
        return;
      }

      if (pathname === '/play' || pathname.startsWith('/play/')) {
        const playRoot =
          detectEngine(root) === 'godot' ? detectGodotWebBuild(root) ?? root : root;
        const relativePath = pathname === '/play' || pathname === '/play/'
          ? 'index.html'
          : pathname.slice('/play/'.length);
        if (isSensitiveRelativePath(relativePath)) {
          response.writeHead(404);
          response.end('Playtest build not found');
          return;
        }
        const file = safeProjectFile(playRoot, relativePath);
        if (!file || !existsSync(file) || !statSync(file).isFile()) {
          const indexFile = file && existsSync(file) && statSync(file).isDirectory()
            ? safeProjectFile(playRoot, join(relativePath, 'index.html'))
            : undefined;
          if (!indexFile || !existsSync(indexFile) || !statSync(indexFile).isFile()) {
            response.writeHead(404);
            response.end('Playtest build not found');
            return;
          }
          servePlaytestFile(request, response, indexFile, join(relativePath, 'index.html'));
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
      // 单页应用：三条路由都返回同一份 app/index.html，由前端路由渲染。
      // 旧的多页实现已删除，/legacy/* 只是给旧书签一个回落。
      if (pathname === '/legacy' || pathname.startsWith('/legacy/')) {
        response.writeHead(302, { location: pathname.replace('/legacy', '') || '/' });
        response.end();
        return;
      }
      const SPA_ROUTES = new Set([
        '/', '/assets', '/assets/', '/library', '/library/',
        '/scenes', '/scenes/', '/scenes/insights', '/scenes/insights/',
        '/settings', '/settings/', '/studio',
      ]);
      const relativePath = SPA_ROUTES.has(pathname)
        ? 'app/index.html'
        : pathname.replace(/^\/+/, '');
      const publicRoot = resolve(PUBLIC_DIR);
      const file = resolve(publicRoot, relativePath);
      if (
        !file.startsWith(`${publicRoot}${requireSeparator()}`)
        || !existsSync(file)
        || !statSync(file).isFile()
      ) {
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
      for (const run of assetAgent.list()) {
        if (run.status === 'running') assetAgent.cancel(run.id);
      }
      for (const child of childServers) {
        void child.close();
      }
      for (const client of sseClients) {
        if (!client.writableEnded) client.end();
      }
      sseClients.clear();
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    }),
  };
}

async function executeWebVisual(
  root: string,
  cliEntry: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VerifyRun> {
  if (!cliEntry) throw new Error('verification CLI entry is not configured');
  const started = Date.now();
  const screenshotOut = join(root, 'game', 'screenshots', 'screenshot.png');
  const run = await new Promise<VerifyRun>((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [
        resolve(cliEntry),
        'web',
        'verify',
        '--path',
        root,
        '--visual',
        '--screenshot-out',
        screenshotOut,
        '--json',
      ],
      {
        cwd: root,
        env: { ...process.env, ...env },
        windowsHide: true,
      },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error('web visual verification timed out after 120s'));
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
        passed?: boolean;
        message?: string;
        visual?: { passed?: boolean; message?: string; imagePath?: string };
      } = {};
      try {
        report = JSON.parse(stdout.trim()) as typeof report;
      } catch {
        // The CLI may fail before printing JSON.
      }
      const visual = report.visual;
      const gates = {
        G1: {
          status: visual ? 'pass' as const : 'fail' as const,
          message: visual ? undefined : report.message,
        },
        G6: {
          status: visual?.passed ? 'pass' as const : 'fail' as const,
          message: visual?.passed
            ? visual.imagePath
            : visual?.message ?? report.message ?? `exit ${code ?? 'unknown'}`,
        },
      };
      resolveRun({
        id: runId(),
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        engine: 'present',
        gates,
        ok: report.passed === true,
        output: `${stdout}\n${stderr}`.trim().slice(-4000) || `exit ${code ?? 'unknown'}`,
      });
    });
  });
  appendRun(root, run);
  return run;
}

async function executePlaytestVisual(
  root: string,
  cliEntry: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VerifyRun> {
  const engine = detectEngine(root);
  if (engine === 'web' && existsSync(join(root, 'index.html'))) {
    return executeWebVisual(root, cliEntry, env);
  }
  if (engine === 'godot') {
    return executeVerify(
      root,
      cliEntry,
      true,
      env,
      env.OPENAI_API_KEY ? 'openai' : undefined,
    );
  }
  throw new Error('Visual playtest review is supported for Web and Godot projects with a CLI entry.');
}

async function executeVerify(
  root: string,
  cliEntry: string | undefined,
  visual: boolean,
  env: NodeJS.ProcessEnv = process.env,
  vision?: 'fake' | 'openai',
): Promise<VerifyRun> {
  if (!cliEntry) throw new Error('verification CLI entry is not configured');
  const started = Date.now();
  const run = await new Promise<VerifyRun>((resolveRun, rejectRun) => {
    const args = [resolve(cliEntry), 'verify', '--path', root, '--json'];
    if (visual) args.push('--visual');
    if (vision) args.push('--vision', vision);
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, ...env },
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

function detectGodotPlaytest(env: NodeJS.ProcessEnv = process.env): {
  available: boolean;
  bin: string;
  version?: string;
} {
  const candidates = [env.GODOT_BIN, 'godot', 'godot4'].filter(Boolean) as string[];
  for (const bin of candidates) {
    if (!isSafeGodotBin(bin)) continue;
    const result = spawnSync(bin, ['--version'], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
    });
    const version = String(result.stdout ?? '').trim().split(/\r?\n/)[0] ?? '';
    if (result.status === 0 && /^4\./.test(version)) {
      return { available: true, bin, version };
    }
  }
  return { available: false, bin: candidates[0] ?? 'godot' };
}

interface WorkspaceApiContext {
  workspaceDir: string;
  root: string;
  runtime: StudioRuntime;
  cliEntry?: string;
  host: string;
  applySettings: (settings: StudioSettings) => void;
  openProject: (projectPath: string) => Promise<string>;
  openDialog: (request: DialogRequest) => Promise<string | undefined>;
}

async function handleWorkspaceApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  context: WorkspaceApiContext,
): Promise<void> {
  const method = request.method ?? 'GET';
  if (method === 'POST' && pathname === '/api/dialog') {
    if (!isLoopbackAddress(request.socket.remoteAddress)) {
      json(response, 403, { error: 'native path picker is available on localhost only' });
      return;
    }
    try {
      const body = (await readJson(request)) as {
        kind?: unknown;
        title?: unknown;
        filter?: unknown;
      };
      const selected = await context.openDialog({
        kind: body.kind === 'folder' ? 'folder' : 'file',
        title: typeof body.title === 'string' ? body.title : undefined,
        filter: typeof body.filter === 'string' ? body.filter : undefined,
      });
      json(response, 200, { path: selected ?? null });
    } catch (error) {
      json(response, 501, { error: (error as Error).message });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/settings') {
    json(response, 200, {
      settings: publicStudioSettings(context.runtime.getSettings()),
      workspace: context.workspaceDir,
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/settings') {
    try {
      const body = (await readJson(request)) as {
        model?: Partial<StudioSettings['model']>;
        image?: Partial<StudioSettings['image']>;
        engines?: Partial<StudioSettings['engines']>;
        agent?: Partial<StudioSettings['agent']>;
      };
      const next = saveStudioSettings(
        context.workspaceDir,
        context.runtime.getSettings(),
        body,
      );
      context.applySettings(next);
      json(response, 200, {
        settings: publicStudioSettings(next),
        workspace: context.workspaceDir,
      });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/projects') {
    json(response, 200, {
      workspace: context.workspaceDir,
      current: context.root,
      projects: listProjects(context.workspaceDir),
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/projects') {
    try {
      if (!context.cliEntry) throw new Error('agent CLI entry is not configured');
      const body = (await readJson(request)) as {
        name?: unknown;
        prompt?: unknown;
        provider?: unknown;
      };
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const requestedName = typeof body.name === 'string' ? body.name.trim() : '';
      const name = (requestedName || `project-${Date.now().toString(36)}`)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
      if (!prompt) throw new Error('prompt is required');
      if (!name) throw new Error('project name is required');
      const projectPath = resolve(context.workspaceDir, name);
      if (!projectPath.startsWith(`${resolve(context.workspaceDir)}${requireSeparator()}`)) {
        throw new Error('project path escapes workspace');
      }
      if (existsSync(projectPath)) throw new Error(`project already exists: ${projectPath}`);
      const settings = context.runtime.getSettings();
      const provider = body.provider === 'fake' || body.provider === 'openai'
        ? body.provider
        : settings.model.provider;
      const modules = process.env.GAMEDREAM_MODULES ?? resolve(process.cwd(), 'modules');
      const templates = process.env.GAMEDREAM_TEMPLATES ?? resolve(process.cwd(), 'templates');
      const result = spawnSync(
        process.execPath,
        [
          context.cliEntry,
          'create',
          prompt,
          '--out',
          projectPath,
          '--modules',
          modules,
          '--templates',
          templates,
          '--provider',
          provider,
          '--no-verify',
          '--json',
        ],
        {
          cwd: context.workspaceDir,
          env: { ...process.env, ...studioEnv(settings) },
          encoding: 'utf8',
          timeout: 180_000,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      if (result.status !== 0) {
        throw new Error(
          (result.stderr || result.stdout || `create exited ${result.status}`).trim().slice(0, 2000),
        );
      }
      json(response, 201, {
        project: {
          name: projectNameForDirectory(projectPath),
          path: projectPath,
          engine: detectEngine(projectPath),
          modifiedAt: new Date().toISOString(),
        },
        output: result.stdout,
      });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/projects/open') {
    try {
      const body = (await readJson(request)) as { path?: unknown };
      const requested = typeof body.path === 'string' ? body.path.trim() : '';
      if (!requested) throw new Error('project path is required');
      const workspaceRoot = resolve(context.workspaceDir);
      const projectPath = isAbsolute(requested)
        ? resolve(requested)
        : resolve(workspaceRoot, requested);
      if (
        !isAbsolute(requested)
        && !projectPath.startsWith(`${workspaceRoot}${requireSeparator()}`)
      ) {
        throw new Error('project path escapes workspace');
      }
      if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
        throw new Error('project not found');
      }
      const engine = detectEngine(projectPath);
      const hasSpec = existsSync(join(projectPath, 'gamedream.yaml'));
      if (engine === 'unknown' && !hasSpec) {
        throw new Error(
          'not a recognized project (expected project.godot, index.html, ProjectSettings/ProjectVersion.txt, or gamedream.yaml)',
        );
      }
      const url = await context.openProject(projectPath);
      json(response, 200, {
        url,
        project: {
          name: projectNameForDirectory(projectPath),
          path: projectPath,
          engine,
        },
      });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  json(response, 404, { error: `unknown workspace API route: ${method} ${pathname}` });
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  runtime: StudioRuntime,
  cliEntry: string | undefined,
  agent: AgentManager,
  sseClients: Set<ServerResponse>,
  sseSequence: { value: number },
  stopPlaytest: () => void,
  setPlaytestChild: (child: ReturnType<typeof spawn>) => void,
): Promise<void> {
  const method = request.method ?? 'GET';
  const root = runtime.root;
  const runner = runtime.getRunner();
  const audioRunner = runtime.getAudioRunner();
  const comfyui = runtime.getComfyui();
  const studioEnvironment = runtime.getEnv();

  if (method === 'GET' && pathname === '/api/playtest/capabilities') {
    const engine = detectEngine(root);
    const godot = detectGodotPlaytest(studioEnvironment);
    const godotWeb = detectGodotWebBuild(root);
    const unityPlayer = detectUnityPlayer(root);
    json(response, 200, {
      engine,
      web: {
        available: existsSync(join(root, 'index.html')),
        url: '/play/',
      },
      godot: {
        available: godot.available,
        web: { available: Boolean(godotWeb), url: '/play/' },
        bin: godot.bin,
        version: godot.version,
      },
      unity: {
        available: Boolean(unityPlayer),
        player: unityPlayer ? relative(root, unityPlayer).split('\\').join('/') : undefined,
      },
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
      const webBuild = detectGodotWebBuild(root);
      if (webBuild) {
        json(response, 200, { mode: 'iframe', url: '/play/' });
        return;
      }
      const godot = detectGodotPlaytest(studioEnvironment);
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
        env: { ...process.env, ...studioEnvironment },
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
      const player = detectUnityPlayer(root);
      if (!player) {
        json(response, 503, {
          error: 'Unity player build not found. Build the project first (Builds/Windows/*.exe).',
        });
        return;
      }
      stopPlaytest();
      const child = spawn(player, [], {
        cwd: dirname(player),
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      setPlaytestChild(child);
      json(response, 200, {
        mode: 'external',
        pid: child.pid,
        bin: player,
        message: 'Unity playtest launched in a separate window.',
      });
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

  if (method === 'POST' && pathname === '/api/playtest/visual') {
    try {
      const run = await executePlaytestVisual(root, cliEntry, studioEnvironment);
      json(response, 200, { run });
    } catch (error) {
      json(response, 503, { error: (error as Error).message });
    }
    return;
  }

  const assetAgent = runtime.getAssetAgent();
  if (method === 'GET' && pathname === '/api/asset-agent') {
    json(response, 200, { runs: assetAgent.list() });
    return;
  }
  if (method === 'POST' && pathname === '/api/asset-agent/start') {
    try {
      const body = (await readJson(request)) as { prompt?: unknown };
      const run = assetAgent.start(typeof body.prompt === 'string' ? body.prompt : '');
      json(response, 202, { run });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }
  const assetRunMatch = pathname.match(/^\/api\/asset-agent\/([^/]+)$/);
  if (assetRunMatch) {
    if (method === 'GET') {
      const run = assetAgent.get(assetRunMatch[1]);
      if (!run) {
        json(response, 404, { error: 'asset agent run not found' });
        return;
      }
      json(response, 200, { run });
      return;
    }
  }
  const assetCancelMatch = pathname.match(/^\/api\/asset-agent\/([^/]+)\/cancel$/);
  if (method === 'POST' && assetCancelMatch) {
    try {
      json(response, 200, { run: assetAgent.cancel(assetCancelMatch[1]) });
    } catch (error) {
      json(response, 404, { error: (error as Error).message });
    }
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
      sseSequence.value += 1;
      response.write(
        `id: ${sseSequence.value}\nretry: 1500\nevent: snapshot\ndata: ${JSON.stringify(agent.list())}\n\n`,
      );
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

  if (method === 'POST' && pathname === '/api/agent/policy/rules') {
    try {
      const body = (await readJson(request)) as {
        tool?: unknown;
        mode?: unknown;
        arg?: unknown;
        prefix?: unknown;
        reason?: unknown;
      };
      if (typeof body.tool !== 'string' || (body.mode !== 'allow' && body.mode !== 'ask' && body.mode !== 'deny')) {
        json(response, 400, { error: 'tool and mode allow|ask|deny are required' });
        return;
      }
      json(response, 200, {
        policy: agent.addPolicyRule({
          tool: body.tool,
          mode: body.mode,
          arg: typeof body.arg === 'string' ? body.arg : undefined,
          prefix: typeof body.prefix === 'string' ? body.prefix : undefined,
          reason: typeof body.reason === 'string' ? body.reason : undefined,
        }),
        availableTools: AGENT_POLICY_TOOLS,
        source: '.gamedream/studio/agent-policy.json',
      });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  const policyRuleMatch = pathname.match(/^\/api\/agent\/policy\/rules\/(\d+)$/);
  if (method === 'DELETE' && policyRuleMatch) {
    try {
      json(response, 200, {
        policy: agent.removePolicyRule(Number(policyRuleMatch[1])),
        availableTools: AGENT_POLICY_TOOLS,
        source: '.gamedream/studio/agent-policy.json',
      });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  if (method === 'DELETE' && pathname === '/api/agent/batches/clear') {
    try {
      json(response, 200, { removed: agent.clearFinished() });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  const batchDeleteMatch = pathname.match(/^\/api\/agent\/batches\/([^/]+)$/);
  if (method === 'DELETE' && batchDeleteMatch) {
    try {
      json(response, 200, { removed: agent.deleteBatch(batchDeleteMatch[1]) });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  const retryMatch = pathname.match(/^\/api\/agent\/batches\/([^/]+)\/retry$/);
  if (method === 'POST' && retryMatch) {
    try {
      json(response, 202, { batch: await agent.retry(retryMatch[1]) });
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
        maxCostUsd?: unknown;
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
        maxCostUsd: typeof body.maxCostUsd === 'number' ? body.maxCostUsd : undefined,
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

  // 场景预览里的贴图：稳定 URL，浏览器直接缓存，避免把 base64 塞进 SVG
  const sceneArtMatch = pathname.match(/^\/api\/scenes\/art\/([a-z0-9-]+)\/([a-z0-9-]+)\.png$/);
  if (method === 'GET' && sceneArtMatch) {
    const file = join(artDir(root), sceneArtMatch[1], `${sceneArtMatch[2]}.png`);
    if (!existsSync(file)) {
      json(response, 404, { error: 'artwork not found' });
      return;
    }
    response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=300' });
    createReadStream(file).pipe(response);
    return;
  }

  if (method === 'POST' && pathname === '/api/scenes/art') {
    try {
      const body = (await readJson(request)) as { kitId?: unknown };
      const kit = resolveKit({ kitId: typeof body.kitId === 'string' ? body.kitId : undefined });
      json(response, 200, { artwork: ensureArtwork(root, kit) });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  // 素材库：索引由 `dream scene assets index` 写进 .gamedream/studio/art-index.json
  if (method === 'GET' && pathname === '/api/library') {
    const params = new URL(request.url ?? '/', 'http://localhost').searchParams;
    const state = libraryState(root);
    if (!state.ready) {
      json(response, 200, { library: state, sprites: [] });
      return;
    }
    const limit = Number(params.get('limit') ?? '240');
    json(response, 200, {
      library: state,
      sprites: librarySprites(root, {
        kind: params.get('kind') ?? undefined,
        text: params.get('text') ?? undefined,
        prefab: params.get('prefab') ?? undefined,
        sheet: params.get('sheet') ?? undefined,
        tileable: params.get('tileable') === '1' ? true : undefined,
        limit: Number.isFinite(limit) ? limit : 240,
      }),
    });
    return;
  }

  const libraryThumbMatch = pathname.match(/^\/api\/library\/thumb\/([^/]+)\/(\d+)\.png$/);
  if (method === 'GET' && libraryThumbMatch) {
    const png = libraryThumbnail(root, decodeURIComponent(libraryThumbMatch[1]), Number(libraryThumbMatch[2]));
    if (!png) {
      json(response, 404, { error: 'sprite not found' });
      return;
    }
    response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
    response.end(png);
    return;
  }

  if (method === 'POST' && pathname === '/api/library/prefab') {
    try {
      const body = (await readJson(request)) as { sheet?: unknown; index?: unknown; prefab?: unknown };
      if (typeof body.sheet !== 'string' || typeof body.index !== 'number') {
        json(response, 400, { error: 'sheet (string) and index (number) are required' });
        return;
      }
      const prefab = typeof body.prefab === 'string' && body.prefab.trim() ? body.prefab.trim() : null;
      const result = setSpritePrefab(root, { sheet: body.sheet, index: body.index, prefab });
      if (!result.ok) {
        json(response, 404, { error: 'sprite not found' });
        return;
      }
      json(response, 200, { sprite: result.sprite });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/scenes') {
    json(response, 200, { scenes: listScenes(root) });
    return;
  }

  // badcase 看板：必须排在 /api/scenes/:id 与 /api/scenes/:id/export 之前，
  // 否则 "insights" 会被当成一个场景 id
  if (method === 'GET' && pathname === '/api/scenes/insights') {
    json(response, 200, { insights: sceneInsights(root) });
    return;
  }

  if (method === 'POST' && pathname === '/api/scenes/insights/export') {
    try {
      const body = (await readJson(request)) as { kind?: unknown; key?: unknown };
      const kind = body.kind === 'unmet' ? 'unmet' : body.kind === 'issue' ? 'issue' : null;
      if (!kind || typeof body.key !== 'string' || !body.key.trim()) {
        json(response, 400, { error: 'kind (issue|unmet) and key are required' });
        return;
      }
      json(response, 200, { export: exportBadcase(root, { kind, key: body.key.trim() }) });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  const sceneExportMatch = pathname.match(/^\/api\/scenes\/([^/]+)\/export$/);
  if (method === 'POST' && sceneExportMatch) {
    try {
      const body = (await readJson(request)) as { engine?: unknown; artStyle?: unknown };
      const engine = typeof body.engine === 'string' ? body.engine : 'godot';
      if (engine !== 'godot') {
        json(response, 400, { error: `unsupported engine: ${engine}` });
        return;
      }
      const outcome = exportScene(root, sceneExportMatch[1], {
        artStyle: body.artStyle === 'tile' ? 'tile' : 'billboard',
      });
      json(response, 200, outcome);
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  const sceneReviewMatch = pathname.match(/^\/api\/scenes\/([^/]+)\/review$/);
  if (method === 'POST' && sceneReviewMatch) {
    try {
      const body = (await readJson(request)) as { verdict?: unknown; score?: unknown; notes?: unknown };
      const verdict = body.verdict === 'good' || body.verdict === 'bad' || body.verdict === 'acceptable'
        ? body.verdict
        : null;
      if (!verdict) {
        json(response, 400, { error: 'verdict must be good, acceptable, or bad' });
        return;
      }
      const scene = reviewScene(root, sceneReviewMatch[1], {
        verdict,
        score: typeof body.score === 'number' ? body.score : undefined,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
      });
      json(response, 200, { scene });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  const sceneMatch = pathname.match(/^\/api\/scenes\/([^/]+)$/);
  if (method === 'GET' && sceneMatch) {
    const scene = loadScene(root, sceneMatch[1]);
    if (!scene) {
      json(response, 404, { error: 'scene not found' });
      return;
    }
    json(response, 200, { scene });
    return;
  }

  if (method === 'POST' && pathname === '/api/scenes') {
    try {
      const body = (await readJson(request)) as {
        spec?: unknown;
        prompt?: unknown;
        kitId?: unknown;
        seed?: unknown;
        attempts?: unknown;
      };
      const outcome = await buildScene(root, {
        spec: body.spec,
        prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
        kitId: typeof body.kitId === 'string' ? body.kitId : undefined,
        seed: typeof body.seed === 'number' ? body.seed : undefined,
        attempts: typeof body.attempts === 'number' ? body.attempts : undefined,
        env: studioEnvironment,
      });
      json(response, 201, { scene: outcome.scene, finished: outcome.finished, failure: outcome.failure });
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
        workflows: runner.listWorkflows(),
        defaultWorkflow: runner.defaultWorkflow('image'),
        defaultAudio: runner.defaultWorkflow('audio'),
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
      workflows: runner.listWorkflows(),
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/workflows') {
    json(response, 200, {
      workflows: runner.listWorkflows(),
      defaultImage: runner.defaultWorkflow('image'),
      defaultAudio: runner.defaultWorkflow('audio'),
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
    const file = relativeFile && isImageRelativePath(relativeFile)
      ? safeProjectFile(root, relativeFile)
      : undefined;
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
      const run = await executeVerify(root, cliEntry, visual, studioEnvironment);
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

  if (method === 'POST' && pathname === '/api/animation/atlas') {
    try {
      const body = (await readJson(request)) as {
        assetIds?: unknown;
        name?: unknown;
        fps?: unknown;
        loop?: unknown;
      };
      const assetIds = Array.isArray(body.assetIds)
        ? body.assetIds.filter((id): id is string => typeof id === 'string').slice(0, 8)
        : [];
      const atlas = createAnimationAtlas(root, {
        assetIds,
        name: typeof body.name === 'string' ? body.name : undefined,
        fps: typeof body.fps === 'number' ? body.fps : undefined,
        loop: typeof body.loop === 'boolean' ? body.loop : undefined,
      });
      json(response, 201, { atlas });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/generate') {
    let body: {
      prompt?: unknown;
      transparent?: unknown;
      count?: unknown;
      animation?: unknown;
      audio?: unknown;
      sfx?: unknown;
      duration?: unknown;
      lyrics?: unknown;
      workflowId?: unknown;
    };
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
    if (body.sfx === true) {
      const duration = body.duration === undefined ? 0.6 : Number(body.duration);
      if (!Number.isFinite(duration) || duration < 0.1 || duration > 3) {
        json(response, 400, { error: 'sfx duration must be between 0.1 and 3 seconds' });
        return;
      }
      try {
        const result = generateSfx(root, { prompt, duration });
        json(response, 201, { job: result.job, jobs: [result.job] });
      } catch (error) {
        json(response, 400, { error: (error as Error).message });
      }
      return;
    }
    const requestedWorkflow = typeof body.workflowId === 'string'
      ? body.workflowId.trim()
      : '';
    if (body.audio === true) {
      const duration = body.duration === undefined ? 30 : Number(body.duration);
      if (!Number.isFinite(duration) || duration < 10 || duration > 60) {
        json(response, 400, { error: 'audio duration must be between 10 and 60 seconds' });
        return;
      }
      const lyrics = typeof body.lyrics === 'string' ? body.lyrics.slice(0, 2000) : '';
      let job;
      try {
        job = requestedWorkflow && requestedWorkflow !== 'builtin-bgm'
          ? runner.startAudio(prompt, duration, lyrics, requestedWorkflow)
          : audioRunner.start(prompt, duration, lyrics);
      } catch (error) {
        json(response, 400, { error: (error as Error).message });
        return;
      }
      json(response, 202, { job, jobs: [job] });
      return;
    }
    const selectedWorkflow = requestedWorkflow || runner.defaultWorkflow('image');
    if (!selectedWorkflow) {
      json(response, 503, { error: `ComfyUI workflow not found: ${comfyui.workflow}` });
      return;
    }
    const workflow = runner.listWorkflows().find((item) => item.id === selectedWorkflow);
    if (!workflow?.valid) {
      json(response, 400, {
        error: workflow?.error ?? `ComfyUI workflow not found: ${selectedWorkflow}`,
      });
      return;
    }
    if (workflow.kind !== 'image') {
      json(response, 400, { error: `ComfyUI workflow is not an image workflow: ${selectedWorkflow}` });
      return;
    }
    const jobs = body.animation === true
      ? runner.startAnimation(prompt, body.transparent === true, count, selectedWorkflow)
      : runner.startBatch(prompt, body.transparent === true, count, selectedWorkflow);
    json(response, 202, {
      job: jobs[0],
      jobs,
      animationId: jobs[0]?.animationId,
      workflowId: selectedWorkflow,
    });
    return;
  }

  const jobMatch = pathname.match(/^\/api\/jobs\/([a-f0-9-]+)$/);
  if (method === 'GET' && jobMatch) {
    const job = runner.getJob(jobMatch[1]) ?? audioRunner.getJob(jobMatch[1]);
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

  const renameMatch = pathname.match(/^\/api\/assets\/([a-f0-9]+)\/rename$/);
  if (method === 'POST' && renameMatch) {
    try {
      const body = (await readJson(request)) as { name?: unknown };
      const asset = renameAsset(
        root,
        renameMatch[1],
        typeof body.name === 'string' ? body.name : '',
      );
      json(response, 200, { asset });
    } catch (error) {
      json(response, 400, { error: (error as Error).message });
    }
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
      nodes: Array.isArray(body.nodes) ? (body.nodes as CanvasNode[]) : [],
      inBuild: Array.isArray(body.inBuild) ? (body.inBuild as string[]) : [],
    });
    syncBuildAssets(root);
    json(response, 200, { canvas });
    return;
  }

  if (pathname === '/api/canvas' && method === 'GET') {
    json(response, 200, loadCanvas(root));
    return;
  }

  json(response, 404, { error: `unknown API route: ${method} ${pathname}` });
}
