import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './client';
import type { AgentSnapshots } from './types';

export function useStudioState() {
  return useQuery({
    queryKey: ['studio', 'state'],
    queryFn: api.state,
    refetchInterval: 20_000,
  });
}

export function useProjectSnapshot() {
  return useQuery({
    queryKey: ['studio', 'project'],
    queryFn: api.project,
    refetchInterval: 8_000,
  });
}

export function useSettingsQuery() {
  return useQuery({ queryKey: ['studio', 'settings'], queryFn: api.settings });
}

export function useProjectsQuery() {
  return useQuery({ queryKey: ['studio', 'projects'], queryFn: api.projects });
}

export function useWorkflowsQuery() {
  return useQuery({ queryKey: ['studio', 'workflows'], queryFn: api.workflows });
}

/**
 * Agent 状态走 SSE：服务端每次变更推送完整快照，前端只做替换。
 * 事件流不可用时退化为 3 秒轮询，避免页面变成死数据。
 */
export function useAgentFeed(): { data?: AgentSnapshots; connected: boolean } {
  const [data, setData] = useState<AgentSnapshots>();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      let alive = true;
      const tick = async () => {
        try {
          const snapshot = await api.agent();
          if (alive) setData(snapshot);
        } catch {
          // 轮询失败时保持上一次快照
        }
      };
      void tick();
      const timer = window.setInterval(tick, 3000);
      return () => {
        alive = false;
        window.clearInterval(timer);
      };
    }

    const source = new EventSource('/api/agent/events');
    const onSnapshot = (event: MessageEvent<string>) => {
      try {
        setData(JSON.parse(event.data) as AgentSnapshots);
        setConnected(true);
      } catch {
        // 半包或服务端重启，忽略这一次
      }
    };
    source.addEventListener('snapshot', onSnapshot as EventListener);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  return { data, connected };
}
