// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { AgentSnapshots } from './types';

const agent = vi.fn();
vi.mock('./client', () => ({ api: { agent: () => agent() } }));

const { useAgentFeed } = await import('./hooks');

const snapshot = (marker: string) => ({ marker }) as unknown as AgentSnapshots;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  onopen?: () => void;
  onerror?: () => void;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emit(type: string, data: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }

  close() {
    this.closed = true;
  }
}

const originalEventSource = globalThis.EventSource;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  FakeEventSource.instances = [];
  globalThis.EventSource = originalEventSource;
});

describe('useAgentFeed over SSE', () => {
  beforeEach(() => {
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  });

  it('subscribes to the snapshot stream and applies pushed payloads', async () => {
    const { result } = renderHook(() => useAgentFeed());
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe('/api/agent/events');

    act(() => source.emit('snapshot', JSON.stringify(snapshot('first'))));
    await waitFor(() => expect(result.current.data).toMatchObject({ marker: 'first' }));
    expect(result.current.connected).toBe(true);
  });

  it('survives a malformed frame without dropping the last snapshot', async () => {
    const { result } = renderHook(() => useAgentFeed());
    const source = FakeEventSource.instances[0];

    act(() => source.emit('snapshot', JSON.stringify(snapshot('good'))));
    await waitFor(() => expect(result.current.data).toMatchObject({ marker: 'good' }));

    // 半包/重启时的坏帧：忽略，但不要把界面打回空态
    act(() => source.emit('snapshot', '{"marker":'));
    expect(result.current.data).toMatchObject({ marker: 'good' });
  });

  it('marks the feed as disconnected when the stream errors', async () => {
    const { result } = renderHook(() => useAgentFeed());
    const source = FakeEventSource.instances[0];

    act(() => source.emit('snapshot', JSON.stringify(snapshot('live'))));
    await waitFor(() => expect(result.current.connected).toBe(true));

    act(() => source.onerror?.());
    expect(result.current.connected).toBe(false);
    // 断开后保留最后一次数据，界面不闪回空态
    expect(result.current.data).toMatchObject({ marker: 'live' });
  });

  it('closes the stream on unmount', () => {
    const { unmount } = renderHook(() => useAgentFeed());
    const source = FakeEventSource.instances[0];
    unmount();
    expect(source.closed).toBe(true);
  });
});

describe('useAgentFeed without EventSource', () => {
  beforeEach(() => {
    // 老浏览器 / 被 polyfill 掉的场景：删除全局 EventSource
    delete (globalThis as { EventSource?: unknown }).EventSource;
  });

  it('polls once immediately and then on an interval', async () => {
    vi.useFakeTimers();
    agent.mockResolvedValue(snapshot('polled'));

    const { result } = renderHook(() => useAgentFeed());
    await vi.waitFor(() => expect(result.current.data).toMatchObject({ marker: 'polled' }));
    expect(agent).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(agent).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous snapshot when a poll fails', async () => {
    vi.useFakeTimers();
    agent.mockResolvedValueOnce(snapshot('first'));
    const { result } = renderHook(() => useAgentFeed());
    await vi.waitFor(() => expect(result.current.data).toMatchObject({ marker: 'first' }));

    agent.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.data).toMatchObject({ marker: 'first' });
  });

  it('stops polling after unmount', async () => {
    vi.useFakeTimers();
    agent.mockResolvedValue(snapshot('tick'));
    const { unmount } = renderHook(() => useAgentFeed());
    await vi.waitFor(() => expect(agent).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(agent).toHaveBeenCalledTimes(1);
  });
});
