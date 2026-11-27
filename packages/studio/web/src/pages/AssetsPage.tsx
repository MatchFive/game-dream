import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useStudioState, useWorkflowsQuery } from '../api/hooks';
import { Icon } from '../components/Sprite';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import type { CanvasNode, StudioAsset } from '../api/types';

const KINDS = ['all', 'concept', 'sprite', 'screenshot', 'audio'] as const;
type Kind = (typeof KINDS)[number];

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export function AssetsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const state = useStudioState();
  const workflows = useWorkflowsQuery();

  const assets = state.data?.assets ?? [];
  const [kind, setKind] = useState<Kind>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [transform, setTransform] = useState<Transform>({ x: 40, y: 40, scale: 1 });
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(1);
  const [transparent, setTransparent] = useState(true);
  const [mode, setMode] = useState<'image' | 'audio' | 'sfx'>('image');
  const [duration, setDuration] = useState(30);
  const [workflowId, setWorkflowId] = useState('');
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const fitted = useRef(false);

  useEffect(() => {
    if (state.data?.canvas.nodes && nodes.length === 0) setNodes(state.data.canvas.nodes);
  }, [state.data, nodes.length]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (kind !== 'all' && asset.kind !== kind) return false;
      if (!term) return true;
      return asset.name.toLowerCase().includes(term) || asset.file.toLowerCase().includes(term);
    });
  }, [assets, kind, query]);

  const selected = assets.find((asset) => asset.id === selectedId);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    setNameDraft(selected?.name ?? '');
  }, [selected?.id, selected?.name]);

  async function renameSelected() {
    if (!selected) return;
    const next = nameDraft.trim();
    if (!next || next === selected.name) return;
    try {
      await api.renameAsset(selected.id, next);
      await queryClient.invalidateQueries({ queryKey: ['studio'] });
      toast.push(t('assets.renamed'));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  }

  const nodeHeight = useCallback((node: CanvasNode) => {
    if (node.kind === 'brief') return 72;
    if (node.kind === 'group') return node.width / 2 + 24;
    return 140;
  }, []);

  const fitView = useCallback(
    (list: CanvasNode[]) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || list.length === 0) {
        setTransform({ x: 40, y: 40, scale: 1 });
        return;
      }
      const minX = Math.min(...list.map((node) => node.x));
      const minY = Math.min(...list.map((node) => node.y));
      const maxX = Math.max(...list.map((node) => node.x + node.width));
      const maxY = Math.max(...list.map((node) => node.y + nodeHeight(node)));
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      const scale = Math.min(1, Math.max(0.3, Math.min((rect.width - 72) / width, (rect.height - 72) / height)));
      setTransform({
        scale,
        x: (rect.width - width * scale) / 2 - minX * scale,
        y: (rect.height - height * scale) / 2 - minY * scale,
      });
    },
    [nodeHeight],
  );

  useEffect(() => {
    if (nodes.length > 0 && !fitted.current) {
      fitted.current = true;
      fitView(nodes);
    }
  }, [nodes, fitView]);

  const persist = useCallback(
    (next: CanvasNode[]) => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void api
          .saveCanvas({ nodes: next, inBuild: state.data?.canvas.inBuild ?? [] })
          .catch((error: Error) => toast.push(error.message, 'error'));
      }, 700);
    },
    [state.data?.canvas.inBuild, toast],
  );

  function moveNode(id: string, x: number, y: number) {
    setNodes((current) => {
      const next = current.map((node) => (node.id === id ? { ...node, x, y } : node));
      persist(next);
      return next;
    });
  }

  function addToCanvas(asset: StudioAsset) {
    const node: CanvasNode = {
      id: `asset-${asset.id}-${Date.now().toString(36)}`,
      kind: 'asset',
      assetId: asset.id,
      x: Math.round((-transform.x + 160) / transform.scale),
      y: Math.round((-transform.y + 140) / transform.scale),
      width: 180,
    };
    const next = [...nodes, node];
    setNodes(next);
    persist(next);
  }

  async function toggleInBuild(asset: StudioAsset) {
    try {
      await api.useAsset(asset.id, !asset.inBuild);
      await queryClient.invalidateQueries({ queryKey: ['studio'] });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  }

  async function upload(file: File) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });
    try {
      await api.upload(file.name, data);
      await queryClient.invalidateQueries({ queryKey: ['studio'] });
      toast.push(t('assets.imported', { name: file.name }));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  }

  async function generate() {
    if (!prompt.trim()) {
      toast.push(t('assets.promptRequired'), 'error');
      return;
    }
    setGenerating(true);
    try {
      const result = await api.generate({
        prompt,
        count,
        transparent: mode === 'image' ? transparent : false,
        audio: mode === 'audio',
        sfx: mode === 'sfx',
        duration: mode === 'image' ? undefined : duration,
        workflowId: mode === 'image' || mode === 'audio' ? workflowId || undefined : undefined,
      });
      const jobId = result.job?.id;
      if (jobId) await pollJob(jobId);
      await queryClient.invalidateQueries({ queryKey: ['studio'] });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function pollJob(id: string) {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const { job } = await api.job(id);
      if (job.status === 'done') {
        toast.push(t('assets.generated'));
        return;
      }
      if (job.status === 'error') {
        toast.push(job.error ?? t('common.error'), 'error');
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    toast.push(t('assets.jobRunning'), 'error');
  }

  function onWheel(event: React.WheelEvent) {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextScale = Math.min(2.4, Math.max(0.3, transform.scale * (event.deltaY < 0 ? 1.1 : 0.9)));
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    setTransform({
      scale: nextScale,
      x: px - ((px - transform.x) / transform.scale) * nextScale,
      y: py - ((py - transform.y) / transform.scale) * nextScale,
    });
  }

  return (
    <>
      <Topbar
        crumb={
          <>
            <strong>{state.data?.project.name ?? 'Project'}</strong>
            <span className="sep">/</span>
            <span>{t('studio.assets')}</span>
            <span className="sep">·</span>
            <span>
              {assets.length} {t('common.assets')}
            </span>
          </>
        }
        actions={
          <>
            <button className="button primary" type="button" disabled={generating} onClick={() => void generate()}>
              <Icon name="spark" /> {t('assets.generate')}
            </button>
            <div className="avatar">GD</div>
          </>
        }
      />

      <main className="assets-grid">
        <aside className="assets-col assets-library" aria-label={t('assets.assets')}>
          <div className="library-head">
            <div className="library-title">
              <h1>{t('assets.assets')}</h1>
              <span className="library-count">{filtered.length}</span>
            </div>
            <label className="search">
              <Icon name="search" />
              <input
                type="search"
                value={query}
                placeholder={t('assets.search')}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="filters" role="group">
              {KINDS.map((item) => (
                <button
                  key={item}
                  className="filter"
                  type="button"
                  aria-pressed={kind === item}
                  onClick={() => setKind(item)}
                >
                  {item === 'all' ? t('assets.all') : t(`assets.${item === 'sprite' ? 'sprites' : item === 'concept' ? 'concepts' : item === 'screenshot' ? 'builds' : 'audio'}`)}
                </button>
              ))}
            </div>
            <label className="button secondary" style={{ textAlign: 'center' }}>
              <Icon name="folder" /> {t('assets.import')}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif,.svg,.mp3,.wav,.ogg"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="library-list">
            {filtered.map((asset) => (
              <button
                key={asset.id}
                className="library-item"
                type="button"
                aria-selected={asset.id === selectedId}
                onClick={() => setSelectedId(asset.id)}
              >
                <span className="thumb">
                  {asset.kind === 'audio' ? <Icon name="wave" /> : <img src={asset.url} alt="" loading="lazy" />}
                </span>
                <span className="meta">
                  <strong>{asset.name}</strong>
                  <small>
                    {asset.kind} · {Math.round(asset.bytes / 1024)} KB
                  </small>
                </span>
                {asset.inBuild && <span className="in-build">●</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="context-path">{t('assets.emptyFilter')}</p>}
          </div>
        </aside>

        <section className="assets-col assets-canvas-col" aria-label={t('assets.tagCanvas')}>
          <div className="studio-toolbar">
            <div className="studio-toolbar-actions">
              <button
                className="icon-btn"
                type="button"
                aria-label="zoom out"
                onClick={() => setTransform((current) => ({ ...current, scale: Math.max(0.3, current.scale / 1.15) }))}
              >
                <Icon name="minus" />
              </button>
              <span className="context-path">{Math.round(transform.scale * 100)}%</span>
              <button
                className="icon-btn"
                type="button"
                aria-label="zoom in"
                onClick={() => setTransform((current) => ({ ...current, scale: Math.min(2.4, current.scale * 1.15) }))}
              >
                <Icon name="plus" />
              </button>
              <button className="icon-btn" type="button" aria-label="fit" onClick={() => fitView(nodes)}>
                <Icon name="fit" />
              </button>
            </div>
          </div>
          <div
            className="canvas-surface"
            ref={canvasRef}
            onWheel={onWheel}
            onPointerDown={(event) => {
              if (event.button !== 0 || (event.target as HTMLElement).closest('.canvas-node')) return;
              panRef.current = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
            }}
            onPointerMove={(event) => {
              if (dragRef.current) {
                const drag = dragRef.current;
                moveNode(
                  drag.id,
                  drag.nodeX + (event.clientX - drag.startX) / transform.scale,
                  drag.nodeY + (event.clientY - drag.startY) / transform.scale,
                );
                return;
              }
              if (!panRef.current) return;
              const pan = panRef.current;
              setTransform((current) => ({
                ...current,
                x: pan.tx + (event.clientX - pan.x),
                y: pan.ty + (event.clientY - pan.y),
              }));
            }}
            onPointerUp={() => {
              dragRef.current = null;
              panRef.current = null;
            }}
            onPointerLeave={() => {
              dragRef.current = null;
              panRef.current = null;
            }}
          >
            <div
              className="canvas-world"
              style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            >
              {nodes.map((node) => {
                const asset = assets.find((item) => item.id === node.assetId);
                const groupAssets = (node.assetIds ?? [])
                  .map((id) => assets.find((item) => item.id === id))
                  .filter((item): item is StudioAsset => Boolean(item));
                return (
                  <div
                    className={`canvas-node canvas-node-${node.kind}`}
                    key={node.id}
                    style={{ left: node.x, top: node.y, width: node.width }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelectedId(node.assetId ?? node.assetIds?.[0]);
                      dragRef.current = {
                        id: node.id,
                        startX: event.clientX,
                        startY: event.clientY,
                        nodeX: node.x,
                        nodeY: node.y,
                      };
                    }}
                  >
                    {node.kind === 'brief' && (
                      <div className="node-brief">
                        <strong>{t('common.brief')}</strong>
                        <small>{t('assets.briefHint')}</small>
                      </div>
                    )}
                    {node.kind === 'group' && (
                      <div className="node-grid">
                        {groupAssets.map((item) => (
                          <span className="node-cell" key={item.id}>
                            <img src={item.url} alt="" />
                          </span>
                        ))}
                      </div>
                    )}
                    {(node.kind === 'asset' || node.kind === 'animation') && (
                      <div className="canvas-node-thumb">
                        {asset?.kind === 'audio' ? <Icon name="wave" /> : asset ? <img src={asset.url} alt="" /> : null}
                      </div>
                    )}
                    <span className="canvas-node-label">
                      {asset?.name ?? (node.kind === 'group' ? `${groupAssets.length} ${t('common.assets')}` : node.title ?? node.kind)}
                    </span>
                  </div>
                );
              })}
            </div>
            {nodes.length === 0 && <div className="canvas-hint">{t('assets.emptyCanvas')}</div>}
          </div>

          <div className="generate-dock">
            <div className="dock-head">
              <span>{t('assets.generateArt')}</span>
              <span className="refs">
                {state.data?.comfyui.online ? t('common.online') : t('common.offline')}
              </span>
            </div>
            <textarea
              value={prompt}
              placeholder={t('assets.promptPlaceholder')}
              onChange={(event) => setPrompt(event.target.value)}
              rows={2}
            />
            <div className="dock-row">
              <select value={mode} onChange={(event) => setMode(event.target.value as 'image' | 'audio' | 'sfx')}>
                <option value="image">{t('assets.modeImage')}</option>
                <option value="audio">{t('assets.modeAudio')}</option>
                <option value="sfx">{t('assets.modeSfx')}</option>
              </select>
              {mode !== 'sfx' && (
                <select value={workflowId} onChange={(event) => setWorkflowId(event.target.value)}>
                  <option value="">{t('assets.workflowAuto')}</option>
                  {(workflows.data?.workflows ?? [])
                    .filter((workflow) => (mode === 'audio' ? workflow.kind === 'audio' : workflow.kind === 'image'))
                    .map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </option>
                    ))}
                </select>
              )}
              {mode === 'image' ? (
                <>
                  <label className="studio-check">
                    <input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} />{' '}
                    <span>{t('assets.transparent')}</span>
                  </label>
                  <label className="studio-agent-count">
                    <span>{t('assets.count')}</span>
                    <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <label className="studio-agent-count">
                  <span>{t('assets.duration')}</span>
                  <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                    {(mode === 'sfx' ? [0.2, 0.4, 0.6, 1, 1.5, 2, 3] : [10, 15, 20, 30, 45, 60]).map((value) => (
                      <option key={value} value={value}>
                        {value}s
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button className="button primary" type="button" disabled={generating} onClick={() => void generate()}>
                {generating ? t('assets.generating') : t('assets.generate')}
              </button>
            </div>
          </div>
        </section>

        <aside className="assets-col assets-inspector" aria-label={t('assets.inspect')}>
          {selected ? (
            <>
              <div className="inspector-preview">
                {selected.kind === 'audio' ? <Icon name="wave" /> : <img src={selected.url} alt={selected.name} />}
              </div>
              <div className="inspector-name">
                <input
                  value={nameDraft}
                  aria-label={t('assets.rename')}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void renameSelected();
                  }}
                />
                <button
                  className="button secondary"
                  type="button"
                  disabled={!nameDraft.trim() || nameDraft === selected.name}
                  onClick={() => void renameSelected()}
                >
                  {t('assets.rename')}
                </button>
              </div>
              <p className="context-path">{selected.file}</p>
              <dl className="inspector-list">
                <div>
                  <dt>{t('common.type')}</dt>
                  <dd>{selected.kind}</dd>
                </div>
                <div>
                  <dt>{t('common.size')}</dt>
                  <dd>{Math.round(selected.bytes / 1024)} KB</dd>
                </div>
                <div>
                  <dt>{t('common.source')}</dt>
                  <dd>{selected.source}</dd>
                </div>
                {selected.seed && (
                  <div>
                    <dt>{t('common.seed')}</dt>
                    <dd>{selected.seed}</dd>
                  </div>
                )}
              </dl>
              <div className="inspector-actions">
                <button className="button primary" type="button" onClick={() => addToCanvas(selected)}>
                  <Icon name="plus" /> {t('assets.addToCanvas')}
                </button>
                <button className="button secondary" type="button" onClick={() => void toggleInBuild(selected)}>
                  <Icon name="check" /> {selected.inBuild ? t('assets.inBuildRemove') : t('assets.inBuildAdd')}
                </button>
              </div>
            </>
          ) : (
            <div className="studio-agent-empty">{t('assets.selectedAsset')}</div>
          )}
        </aside>
      </main>
    </>
  );
}
