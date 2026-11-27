import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import type { AssetAgentRun } from '../api/types';
import { Icon } from './Sprite';
import { useToast } from './Toast';

interface AssetAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  onFinished: () => void;
}

function statusText(run: AssetAgentRun | undefined, t: (key: string) => string): string {
  if (!run) return t('assets.agentEmpty');
  if (run.status === 'running') return t('assets.agentRunning');
  if (run.status === 'finished') return t('assets.agentFinished');
  return `${t('assets.agentFailed')}${run.error ? `: ${run.error}` : ''}`;
}

function logLines(run: AssetAgentRun | undefined, t: (key: string) => string): string[] {
  if (!run) return [];
  const lines: string[] = [];
  for (const event of run.events ?? []) {
    if (event.type === 'tool/start') lines.push(`→ ${event.tool ?? ''}`);
    else if (event.type === 'tool/end') {
      const output = event.output ? ` ${String(event.output).replace(/\s+/g, ' ').slice(0, 700)}` : '';
      lines.push(`${event.ok ? '✓' : '✗'} ${event.tool ?? ''}${output}`);
    } else if (event.type === 'assistant/chunk') lines.push(String(event.output ?? ''));
    else if (event.type === 'asset/end') {
      lines.push(
        event.ok
          ? t('assets.agentFinished')
          : `${t('assets.agentFailed')}${event.error ? `: ${event.error}` : ''}`,
      );
    }
  }
  return lines;
}

/** 素材 Agent：一句话铺满画布，后台跑 ComfyUI 任务，这里只做观测与取消。 */
export function AssetAgentDialog({ open, onOpenChange, initialPrompt, onFinished }: AssetAgentDialogProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [run, setRun] = useState<AssetAgentRun>();
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (open && initialPrompt) setPrompt((current) => current || initialPrompt);
  }, [open, initialPrompt]);

  // 打开时接上最近一次运行，避免看不到正在跑的任务
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void api
      .assetAgentList()
      .then((data) => {
        if (alive && data.runs[0]) setRun(data.runs[0]);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  // 运行中轮询；结束后刷新素材列表
  useEffect(() => {
    if (!run || run.status !== 'running') return;
    let alive = true;
    const timer = window.setInterval(() => {
      void api
        .assetAgentGet(run.id)
        .then((data) => {
          if (!alive) return;
          setRun(data.run);
          if (data.run.status !== 'running') {
            window.clearInterval(timer);
            onFinished();
          }
        })
        .catch(() => undefined);
    }, 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [run, onFinished]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [run?.events.length]);

  async function start() {
    const text = prompt.trim();
    if (!text) {
      toast.push(t('assets.promptRequired'), 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await api.assetAgentStart(text);
      setRun(data.run);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!run) return;
    setBusy(true);
    try {
      const data = await api.assetAgentCancel(run.id);
      setRun(data.run);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const lines = logLines(run, t);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="agent-dialog-overlay" />
        <Dialog.Content className="agent-dialog" aria-describedby={undefined}>
          <div className="agent-dialog-head">
            <Dialog.Title>{t('assets.agentTitle')}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-btn" type="button" aria-label={t('common.close')}>
                <Icon name="x" />
              </button>
            </Dialog.Close>
          </div>
          <p className="agent-dialog-hint">{t('assets.agentHint')}</p>
          <textarea
            rows={4}
            value={prompt}
            placeholder={t('assets.agentPlaceholder')}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <div className="agent-dialog-actions">
            <button className="button primary" type="button" disabled={busy || run?.status === 'running'} onClick={() => void start()}>
              <Icon name="spark" /> {t('assets.agentStart')}
            </button>
            {run?.status === 'running' && (
              <button className="button secondary" type="button" disabled={busy} onClick={() => void cancel()}>
                {t('assets.agentStop')}
              </button>
            )}
            <span className={`agent-dialog-status ${run?.status ?? 'idle'}`}>{statusText(run, t)}</span>
          </div>
          <pre className="asset-agent-log" ref={logRef}>
            {lines.length > 0 ? lines.join('\n') : t('assets.agentEmpty')}
          </pre>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
