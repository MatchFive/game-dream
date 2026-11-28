/**
 * 需求通道的数据格式。
 *
 * 背景（见 docs/boundaries.md）：所有"游戏实现"——模板玩法、关卡、美术、脚本——
 * 只能由项目内置 agent 执行。外部编码 agent 不允许直接写这些产物，它只能：
 *
 *   1. 改项目代码（CLI / Studio / 求解器 / 导出器…）
 *   2. 写一条 request（本文件），描述要什么、验收什么
 *   3. 调用项目 agent（`dream develop --request`）
 *
 * 这个格式就是第 2 条的载体：可校验、可追溯、能被 agent 直接消费。
 */

export const REQUEST_STATUSES = ['open', 'running', 'done', 'rejected'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface GameRequest {
  schema: 1;
  /** 短横线 slug，同时是文件名 */
  id: string;
  title: string;
  /** 给 agent 的自然语言需求 */
  prompt: string;
  /** 用哪个开发技能（可空，由调用方默认） */
  skill?: string;
  /** 验收标准：每条都应该是可观察的（标记、截图、闸门通过） */
  acceptance: string[];
  /** 硬约束：不许改什么、必须用什么 */
  constraints: string[];
  createdBy: string;
  createdAt: string;
  status: RequestStatus;
  /** done 时必须指向一次真实运行，否则无法追溯"这个改动是谁做的" */
  runId?: string | null;
  notes?: string;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * 校验一条需求。错误信息要能直接指出哪一栏不对——
 * 这个函数同时被 CLI 和仓库边界检查使用，报错含糊就等于没有检查。
 */
export function parseRequest(input: unknown): GameRequest {
  if (typeof input !== 'object' || input === null) throw new Error('request must be a JSON object');
  const raw = input as Record<string, unknown>;

  if (raw.schema !== 1) throw new Error('request.schema must be 1');
  if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) {
    throw new Error('request.id must be a lowercase slug (a-z, 0-9, dash), 1-64 chars');
  }
  if (typeof raw.title !== 'string' || raw.title.trim().length === 0) {
    throw new Error('request.title is required');
  }
  if (typeof raw.prompt !== 'string' || raw.prompt.trim().length < 10) {
    throw new Error('request.prompt must describe the work (at least 10 characters)');
  }
  if (raw.acceptance !== undefined && !isStringArray(raw.acceptance)) {
    throw new Error('request.acceptance must be an array of strings');
  }
  if (raw.constraints !== undefined && !isStringArray(raw.constraints)) {
    throw new Error('request.constraints must be an array of strings');
  }
  if (typeof raw.createdBy !== 'string' || raw.createdBy.trim().length === 0) {
    throw new Error('request.createdBy is required (who asked)');
  }
  if (typeof raw.createdAt !== 'string' || Number.isNaN(Date.parse(raw.createdAt))) {
    throw new Error('request.createdAt must be an ISO date-time');
  }
  if (typeof raw.status !== 'string' || !REQUEST_STATUSES.includes(raw.status as RequestStatus)) {
    throw new Error(`request.status must be one of ${REQUEST_STATUSES.join(', ')}`);
  }

  const status = raw.status as RequestStatus;
  const runId = typeof raw.runId === 'string' && raw.runId.trim().length > 0 ? raw.runId : null;
  // done 但没有运行记录 = 无法追溯是谁改的游戏，直接拒绝
  if (status === 'done' && !runId) {
    throw new Error('request.runId is required when status is "done"');
  }

  return {
    schema: 1,
    id: raw.id,
    title: raw.title.trim(),
    prompt: raw.prompt.trim(),
    skill: typeof raw.skill === 'string' && raw.skill.trim() ? raw.skill.trim() : undefined,
    acceptance: isStringArray(raw.acceptance) ? raw.acceptance : [],
    constraints: isStringArray(raw.constraints) ? raw.constraints : [],
    createdBy: raw.createdBy.trim(),
    createdAt: raw.createdAt,
    status,
    runId,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
  };
}

/**
 * 把一条需求变成 agent 的输入。
 *
 * 验收标准和硬约束必须进入提示词：否则 agent 只看到"加个 Boss 房间"，
 * 跑完却没人能判断做没做到。
 */
export function requestPrompt(request: GameRequest): string {
  const parts = [request.prompt];
  if (request.acceptance.length > 0) {
    parts.push(`验收标准：\n${request.acceptance.map((item) => `- ${item}`).join('\n')}`);
  }
  if (request.constraints.length > 0) {
    parts.push(`硬约束：\n${request.constraints.map((item) => `- ${item}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/** 列表里显示的一行摘要。 */
export function requestLine(request: GameRequest): string {
  const run = request.runId ? ` run=${request.runId}` : '';
  return `${request.id.padEnd(28)} ${request.status.padEnd(8)} ${request.title}${run}`;
}
