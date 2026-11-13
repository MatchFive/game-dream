import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';

export interface WebScreenshotMetrics {
  width: number;
  height: number;
  samples: number;
  non_black: number;
  colors: number;
  center_colors: number;
}

export interface WebScreenshotResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  imagePath?: string;
  metrics?: WebScreenshotMetrics;
  browser?: string;
  message?: string;
}

export interface WebVisualResult extends WebScreenshotResult {}

export interface CaptureWebOptions {
  projectDir: string;
  outPath?: string;
  width?: number;
  height?: number;
  browserBin?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  virtualTimeBudget?: number;
}

function platformCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const paths: string[] = [];
  const programFiles = env.ProgramFiles ?? env.PROGRAMFILES;
  const programFilesX86 = env['ProgramFiles(x86)'] ?? env['PROGRAMFILES(X86)'];
  const local = env.LOCALAPPDATA;
  if (platform === 'win32') {
    for (const base of [programFiles, programFilesX86, local]) {
      if (!base) continue;
      paths.push(
        join(base, 'Google/Chrome/Application/chrome.exe'),
        join(base, 'Microsoft/Edge/Application/msedge.exe'),
        join(base, 'Chromium/Application/chrome.exe'),
      );
    }
  } else if (platform === 'darwin') {
    paths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    paths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/snap/bin/chromium',
    );
  }
  return paths;
}

function fromPath(command: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string | undefined {
  const finder = platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(finder, [command], { encoding: 'utf8', env });
  if (result.status !== 0) return undefined;
  const first = (result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return first;
}

export function findWebBrowser(options: {
  explicit?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
} = {}): string | undefined {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  if (options.explicit) {
    return existsSync(options.explicit)
      ? options.explicit
      : fromPath(options.explicit, platform, env) ?? options.explicit;
  }
  const configured = env.GAMEDREAM_BROWSER ?? env.CHROME_BIN ?? env.EDGE_BIN;
  if (configured) return configured;
  for (const candidate of platformCandidates(env, platform)) {
    if (existsSync(candidate)) return candidate;
  }
  for (const command of ['chrome', 'msedge', 'chromium', 'google-chrome', 'microsoft-edge']) {
    const found = fromPath(command, platform, env);
    if (found) return found;
  }
  return undefined;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function startStaticServer(projectDir: string): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const root = resolve(projectDir);
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = resolve(root, relativePath);
      if (file !== root && !file.startsWith(root + sep)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      if (!existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404).end('not found');
        return;
      }
      response.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      createReadStream(file)
        .on('error', () => response.destroy())
        .pipe(response);
    } catch {
      response.writeHead(400).end('bad request');
    }
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('cannot determine screenshot server address');
  }
  return {
    url: `http://127.0.0.1:${address.port}/index.html`,
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections?.();
      }),
  };
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - upLeft);
  if (dl <= du && dl <= dul) return left;
  if (du <= dul) return up;
  return upLeft;
}

export function readPngMetrics(path: string): WebScreenshotMetrics | undefined {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    return undefined;
  }
  if (bytes.length < 8 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return undefined;
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) return undefined;
    if (type === 'IHDR') {
      if (length < 13) return undefined;
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (
    width <= 0 ||
    height <= 0 ||
    bitDepth !== 8 ||
    interlace !== 0 ||
    (colorType !== 2 && colorType !== 6) ||
    idat.length === 0
  ) {
    return undefined;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return undefined;
  }
  if (raw.length < (stride + 1) * height) return undefined;
  const pixels = Buffer.alloc(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source];
    source += 1;
    const rowStart = y * stride;
    const previousStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source];
      source += 1;
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[previousStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[previousStart + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      else if (filter !== 0) return undefined;
      pixels[rowStart + x] = (value + predictor) & 0xff;
    }
  }

  const colors = new Set<number>();
  const centerColors = new Set<number>();
  let samples = 0;
  let nonBlack = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const index = y * stride + x * channels;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const color = (r << 16) | (g << 8) | b;
      samples += 1;
      if (r + g + b > 12) nonBlack += 1;
      colors.add(color);
      if (x >= width * 0.25 && x < width * 0.75 && y >= height * 0.25 && y < height * 0.75) {
        centerColors.add(color);
      }
    }
  }
  return {
    width,
    height,
    samples,
    non_black: nonBlack,
    colors: colors.size,
    center_colors: centerColors.size,
  };
}

function visualFailure(result: WebScreenshotResult): string | null {
  if (!result.imagePath || !existsSync(result.imagePath)) return 'missing screenshot';
  try {
    if (statSync(result.imagePath).size < 1000) return 'screenshot too small';
  } catch {
    return 'missing screenshot';
  }
  const metrics = result.metrics;
  if (!metrics) return 'missing metrics';
  const values = [
    metrics.width,
    metrics.height,
    metrics.samples,
    metrics.non_black,
    metrics.colors,
    metrics.center_colors,
  ];
  if (!values.every(Number.isFinite)) return 'invalid metrics';
  if (metrics.width < 640 || metrics.height < 360) {
    return `screenshot too small: ${metrics.width}x${metrics.height}`;
  }
  if (metrics.samples <= 0 || metrics.non_black / metrics.samples < 0.05) {
    return 'screenshot mostly black';
  }
  if (metrics.colors < 8) return 'screenshot has too few colors';
  if (metrics.center_colors < 4) return 'screenshot has too few center colors';
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolveTimeout, rejectTimeout) => {
    const timer = setTimeout(() => rejectTimeout(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolveTimeout(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectTimeout(error);
      },
    );
  });
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

class CdpClient {
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: never) => void; reject: (error: Error) => void }
  >();
  private readonly listeners = new Map<string, Array<(params: unknown) => void>>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message ?? 'CDP error'));
        else waiter.resolve(message.result as never);
      } else if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) {
          listener(message.params);
        }
      }
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', () => resolveOpen(), { once: true });
      socket.addEventListener(
        'error',
        () => rejectOpen(new Error('cannot connect to browser DevTools')),
        { once: true },
      );
    });
    return new CdpClient(socket);
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    const id = (this.nextId += 1);
    return new Promise<T>((resolveSend, rejectSend) => {
      this.pending.set(id, {
        resolve: resolveSend as (value: never) => void,
        reject: rejectSend,
      });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(method: string, listener: (params: unknown) => void): void {
    const existing = this.listeners.get(method) ?? [];
    existing.push(listener);
    this.listeners.set(method, existing);
  }

  close(): void {
    this.socket.close();
  }
}

async function waitForDevTools(browser: ReturnType<typeof spawn>, timeoutMs: number): Promise<string> {
  let stderr = '';
  return new Promise((resolveUrl, rejectUrl) => {
    const timer = setTimeout(
      () => rejectUrl(new Error(`browser DevTools did not start: ${stderr.slice(-500)}`)),
      timeoutMs,
    );
    browser.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match) {
        clearTimeout(timer);
        resolveUrl(match[1]);
      }
    });
    browser.once('error', (error) => {
      clearTimeout(timer);
      rejectUrl(new Error(`browser failed to start: ${error.message}`));
    });
    browser.once('exit', (code) => {
      clearTimeout(timer);
      rejectUrl(new Error(`browser exited before DevTools started (${code}): ${stderr.slice(-500)}`));
    });
  });
}

async function captureWithDevTools(options: {
  browser: string;
  url: string;
  outPath: string;
  profile: string;
  width: number;
  height: number;
  timeoutMs: number;
  settleMs: number;
}): Promise<Record<string, unknown>> {
  const browser = spawn(
    options.browser,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-sync',
      '--mute-audio',
      `--window-size=${options.width},${options.height}`,
      `--user-data-dir=${options.profile}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  let stderr = '';
  browser.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  let client: CdpClient | undefined;
  try {
    const wsUrl = await waitForDevTools(browser, Math.min(options.timeoutMs, 15_000));
    client = await CdpClient.connect(wsUrl);
    const target = await client.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
    });
    const attached = await client.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    const session = attached.sessionId;
    await client.send('Page.enable', {}, session);
    await client.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: options.width,
        height: options.height,
        deviceScaleFactor: 1,
        mobile: false,
      },
      session,
    );
    const loaded = new Promise<void>((resolveLoad) => {
      client!.on('Page.loadEventFired', () => resolveLoad());
    });
    await client.send('Page.navigate', { url: options.url }, session);
    await withTimeout(loaded, 5_000, 'page load timed out').catch(() => undefined);
    await sleep(options.settleMs);
    const screenshot = await withTimeout(
      client.send<{ data: string }>('Page.captureScreenshot', { format: 'png' }, session),
      options.timeoutMs,
      'screenshot capture timed out',
    );
    writeFileSync(options.outPath, Buffer.from(screenshot.data, 'base64'));
    return { stderr };
  } finally {
    try {
      await client?.send('Browser.close');
    } catch {
      // Browser may already be closing.
    }
    client?.close();
    browser.kill();
    await sleep(100);
  }
}

export async function captureWebScreenshot(options: CaptureWebOptions): Promise<WebScreenshotResult> {
  const projectDir = resolve(options.projectDir);
  const outPath = resolve(options.outPath ?? join(projectDir, 'screenshot.png'));
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const browser = options.browserBin
    ? findWebBrowser({ explicit: options.browserBin, env: options.env })
    : findWebBrowser({ env: options.env });
  if (!browser) {
    return {
      passed: false,
      exitCode: 3,
      stdout: '',
      stderr: '',
      message: 'Chrome or Edge not found; set GAMEDREAM_BROWSER to the browser executable',
    };
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const temp = mkdtempSync(join(tmpdir(), 'gamedream-web-shot-'));
  const profile = join(temp, 'profile');
  let server: Awaited<ReturnType<typeof startStaticServer>> | undefined;
  try {
    server = await startStaticServer(projectDir);
    const capture = await captureWithDevTools({
      browser,
      url: server.url,
      outPath,
      profile,
      width,
      height,
      timeoutMs: options.timeoutMs ?? 30_000,
      settleMs: options.virtualTimeBudget ?? 1500,
    });
    const stderr = String(capture.stderr ?? '');
    if (!existsSync(outPath)) {
      return {
        passed: false,
        exitCode: 1,
        stdout: '',
        stderr,
        browser,
        message: 'browser did not write a screenshot',
      };
    }
    const metrics = readPngMetrics(outPath);
    if (!metrics) {
      return {
        passed: false,
        exitCode: 1,
        stdout: '',
        stderr,
        browser,
        imagePath: outPath,
        message: 'cannot read screenshot PNG',
      };
    }
    const partial = {
      passed: true,
      exitCode: 0,
      stdout: '',
      stderr,
      browser,
      imagePath: outPath,
      metrics,
    };
    const failure = visualFailure(partial);
    return failure ? { ...partial, passed: false, exitCode: 2, message: failure } : partial;
  } catch (error) {
    return {
      passed: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      browser,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await server?.close();
    try {
      rmSync(temp, { recursive: true, force: true });
    } catch {
      // Browser profiles can remain locked briefly on Windows; the OS temp cleanup handles it.
    }
  }
}

export async function verifyWebVisual(options: CaptureWebOptions): Promise<WebVisualResult> {
  return captureWebScreenshot(options);
}
