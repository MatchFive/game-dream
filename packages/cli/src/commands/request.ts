import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  parseRequest,
  requestLine,
  requestPrompt,
  type GameRequest,
  type RequestStatus,
} from '@gamedream/core';
import { developCommand, type DevelopOptions } from './develop.js';

/**
 * 需求通道（见 docs/boundaries.md）。
 *
 * 外部编码 agent 不直接改模板、玩法、关卡、美术；它写一条 request，
 * 再由项目 agent 执行。这样"谁提的、要什么、做到没有"都留在仓库里。
 */

export function requestsDir(dir = 'requests'): string {
  return resolve(dir);
}

function slugify(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // 中文标题转不出 slug 时给个兜底，别生成空文件名
  return ascii.replace(/[\u4e00-\u9fa5]/g, '').replace(/^-+|-+$/g, '') || `request-${Date.now().toString(36)}`;
}

export interface RequestNewOptions {
  dir?: string;
  id?: string;
  title: string;
  prompt: string;
  skill?: string;
  acceptance?: string[];
  constraints?: string[];
  createdBy?: string;
}

export function requestNew(options: RequestNewOptions): { file: string; request: GameRequest } {
  const dir = requestsDir(options.dir);
  mkdirSync(dir, { recursive: true });

  const id = options.id ?? slugify(options.title);
  const request = parseRequest({
    schema: 1,
    id,
    title: options.title,
    prompt: options.prompt,
    skill: options.skill,
    acceptance: options.acceptance ?? [],
    constraints: options.constraints ?? [],
    createdBy: options.createdBy ?? 'coding-agent',
    createdAt: new Date().toISOString(),
    status: 'open',
    runId: null,
  });

  const file = join(dir, `${request.id}.json`);
  if (existsSync(file)) throw new Error(`request already exists: ${file}`);
  writeFileSync(file, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  return { file, request };
}

export function requestList(dir = 'requests'): GameRequest[] {
  const path = requestsDir(dir);
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((name) => name.endsWith('.json'))
    .map((name) => parseRequest(JSON.parse(readFileSync(join(path, name), 'utf8'))))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function requestPath(dir: string, id: string): string {
  return join(requestsDir(dir), `${id}.json`);
}

export function requestShow(dir: string, id: string): GameRequest {
  const file = requestPath(dir, id);
  if (!existsSync(file)) throw new Error(`request not found: ${file}`);
  return parseRequest(JSON.parse(readFileSync(file, 'utf8')));
}

export function requestSet(
  dir: string,
  id: string,
  patch: { status?: RequestStatus; runId?: string; notes?: string },
): GameRequest {
  const current = requestShow(dir, id);
  const next = parseRequest({
    ...current,
    status: patch.status ?? current.status,
    runId: patch.runId ?? current.runId ?? null,
    notes: patch.notes ?? current.notes,
  });
  writeFileSync(requestPath(dir, id), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export interface RequestRunOptions {
  dir?: string;
  /** 需求 id，对应 requests/<id>.json */
  outDir: string;
  skills: string;
  provider: string;
  maxSteps?: number;
  visual?: boolean;
  env?: NodeJS.ProcessEnv;
  /** 明确允许在没有引擎的环境里跑（会把 G2/G3 降级为 skip） */
  allowMissingEngine?: boolean;
}

/**
 * 执行一条需求：把 request 变成 agent 提示词，run id 用 request id。
 * 跑完不会自动标记 done——验收要人（或验收脚本）确认后 `request set --status done`，
 * 否则"agent 说做完了"就等于做完了。
 */
export async function requestRun(id: string, options: RequestRunOptions) {
  const request = requestShow(options.dir ?? 'requests', id);
  if (request.status === 'done') throw new Error(`request ${id} is already done`);

  const developOptions: DevelopOptions = {
    prompt: requestPrompt(request),
    outDir: options.outDir,
    skillsDir: options.skills.split(',')[0]?.trim() || 'skills',
    skillsDirs: options.skills.split(',').map((value) => value.trim()).filter(Boolean),
    skill: request.skill ?? 'survivor-demo',
    providerKind: options.provider as DevelopOptions['providerKind'],
    maxSteps: options.maxSteps,
    visual: options.visual,
    env: options.env,
    // run id 用需求 id：运行记录和需求一一对应，事后能查"这一版是谁做的"
    runId: request.id,
    allowMissingEngine: options.allowMissingEngine,
  };

  requestSet(options.dir ?? 'requests', request.id, { status: 'running', runId: request.id });
  const report = await developCommand(developOptions);
  return { request, report };
}

export function formatRequestList(items: GameRequest[]): string[] {
  if (items.length === 0) return ['no requests yet — `dream request new --title ... --prompt ...`'];
  return items.map(requestLine);
}
