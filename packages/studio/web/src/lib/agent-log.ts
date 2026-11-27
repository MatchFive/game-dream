import type { AssetAgentEvent, AssetAgentRun } from '../api/types';

type Translate = (key: string) => string;

export interface AgentLogLine {
  kind: 'tool-start' | 'tool-end' | 'assistant' | 'result';
  ok?: boolean;
  text: string;
}

/**
 * 素材 Agent 的事件流 → 可读日志行。抽成纯函数，UI 只负责渲染，
 * 这样事件类型的增减不会悄悄改变面板行为。
 */
export function agentLogLines(run: AssetAgentRun | undefined, t: Translate): string[] {
  return agentLogEntries(run, t).map((line) => line.text);
}

export function agentLogEntries(run: AssetAgentRun | undefined, t: Translate): AgentLogLine[] {
  if (!run) return [];
  const lines: AgentLogLine[] = [];
  for (const event of run.events ?? []) {
    const line = toLine(event, t);
    if (line) lines.push(line);
  }
  return lines;
}

function toLine(event: AssetAgentEvent, t: Translate): AgentLogLine | null {
  if (event.type === 'tool/start') {
    return { kind: 'tool-start', text: `→ ${event.tool ?? ''}` };
  }
  if (event.type === 'tool/end') {
    const text = event.output ? String(event.output).replace(/\s+/g, ' ').trim().slice(0, 700) : '';
    const output = text ? ` ${text}` : '';
    return {
      kind: 'tool-end',
      ok: event.ok,
      text: `${event.ok ? '✓' : '✗'} ${event.tool ?? ''}${output}`,
    };
  }
  if (event.type === 'assistant/chunk') {
    return { kind: 'assistant', text: String(event.output ?? '') };
  }
  if (event.type === 'asset/end') {
    return {
      kind: 'result',
      ok: event.ok,
      text: event.ok
        ? t('assets.agentFinished')
        : `${t('assets.agentFailed')}${event.error ? `: ${event.error}` : ''}`,
    };
  }
  return null;
}

/** 面板顶部状态行；错误要带上原因，别只说"失败"。 */
export function agentStatusText(run: AssetAgentRun | undefined, t: Translate): string {
  if (!run) return t('assets.agentEmpty');
  if (run.status === 'running') return t('assets.agentRunning');
  if (run.status === 'finished') return t('assets.agentFinished');
  if (run.status === 'canceled') return t('assets.agentStopped');
  return `${t('assets.agentFailed')}${run.error ? `: ${run.error}` : ''}`;
}
