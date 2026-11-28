import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Topbar } from '../components/Topbar';
import { Icon } from '../components/Sprite';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import type { LibrarySprite } from '../api/types';

/** 与 kit 的 prefab 对齐：改建议时给的是这几个，而不是让模型/人自由发挥 */
const PREFABS = ['house-small', 'house-long', 'smithy', 'tavern', 'chapel', 'market-hall', 'dock-house'];

const KINDS = [
  'all',
  'building',
  'building-part',
  'gate',
  'wall',
  'terrain',
  'prop',
  'tree',
  'vehicle',
  'decoration',
] as const;

/**
 * 素材库浏览页。
 *
 * 索引是模型建的（切片 + 逐块分类），但模型会犯一种很具体的错：它认识"酒馆"这一个词，
 * 就把十几块都建议成同一个 prefab。策划用眼睛一秒能看出来哪块该是客栈——
 * 所以这个页面必须能改，否则索引只能读、不能纠。
 */
export function LibraryPage() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  // 筛选条件也进 URL：`?kind=terrain` 这类链接可以直接发给别人
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  // 选中的素材写进 URL：可以直接把"这一块"发给别人，也让刷新后不丢焦点
  const [params, setParams] = useSearchParams();
  const [saving, setSaving] = useState(false);

  // 输入防抖：每敲一个字都打一次服务端没必要
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const kindParam = params.get('kind');
  const kind = (KINDS as readonly string[]).includes(kindParam ?? '')
    ? (kindParam as (typeof KINDS)[number])
    : 'all';
  const sheet = params.get('sheet') ?? '';
  const patchParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const query = useQuery({
    queryKey: ['library', kind, debounced, sheet],
    queryFn: () => api.library({
      kind: kind === 'all' ? undefined : kind,
      text: debounced || undefined,
      sheet: sheet || undefined,
      limit: 300,
    }),
  });

  const library = query.data?.library;
  const sprites = query.data?.sprites ?? [];
  const summary = library?.summary;
  const idParam = params.get('sprite');
  // 没指定就默认选第一块：空着的详情面板没有信息量
  const selected: LibrarySprite | null = sprites.find((sprite) => sprite.id === idParam) ?? sprites[0] ?? null;
  const selectSprite = (sprite: LibrarySprite) => {
    const next = new URLSearchParams(params);
    next.set('sprite', sprite.id);
    setParams(next, { replace: true });
  };

  async function assign(sprite: LibrarySprite, prefab: string | null) {
    setSaving(true);
    try {
      await api.setSpritePrefab({ sheet: sprite.sheet, index: sprite.index, prefab });
      await queryClient.invalidateQueries({ queryKey: ['library'] });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar
        crumb={(
          <span>
            <strong>{t('library.title')}</strong>
            <small className="crumb-note">
              {summary
                ? t('library.subtitle', { sprites: summary.sprites, sheets: summary.sheets, model: summary.model })
                : t('library.emptySubtitle')}
            </small>
          </span>
        )}
        actions={(
          <Link className="button secondary" to="/scenes">
            <Icon name="grid" />
            {t('library.backToScenes')}
          </Link>
        )}
      />

      <div className="library-layout">
        <aside className="library-filters">
          <div className="eyebrow">{t('library.kind')}</div>
          <div className="library-kinds">
            {KINDS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`chip ${kind === entry ? 'active' : ''}`}
                onClick={() => patchParams({ kind: entry === 'all' ? '' : entry })}
              >
                {entry}
                {entry !== 'all' && summary?.kinds[entry] ? <small>{summary.kinds[entry]}</small> : null}
              </button>
            ))}
          </div>

          <div className="eyebrow">{t('library.search')}</div>
          <input
            className="input"
            value={text}
            placeholder={t('library.searchPlaceholder')}
            onChange={(event) => setText(event.target.value)}
          />

          <div className="eyebrow">{t('library.sheet')}</div>
          <select className="input" value={sheet} onChange={(event) => patchParams({ sheet: event.target.value })}>
            <option value="">{t('library.allSheets')}</option>
            {[...new Set(query.data?.sprites.map((sprite) => sprite.sheet) ?? [])].sort().map((file) => (
              <option key={file} value={file}>{file}</option>
            ))}
          </select>

          {summary && (
            <div className="library-stats">
              <div><span>{t('library.statSprites')}</span><b>{summary.sprites}</b></div>
              <div><span>{t('library.statTileable')}</span><b>{summary.tileable}</b></div>
              <div><span>{t('library.statAssigned')}</span>
                <b>{Object.values(summary.prefabs).reduce((sum, count) => sum + count, 0)}</b>
              </div>
            </div>
          )}

          {library?.ready && !library.sourceExists && (
            <p className="library-warn">{t('library.sourceMissing', { path: summary?.source ?? '' })}</p>
          )}
        </aside>

        <section className="library-grid-wrap">
          {!library?.ready && (
            <div className="library-empty">
              <p>{t('library.notIndexed')}</p>
              <code>dream scene assets index --source &lt;素材库&gt; --out .gamedream/studio/art-index.json --kit village-cn</code>
            </div>
          )}
          {library?.ready && sprites.length === 0 && (
            <div className="library-empty"><p>{t('library.noMatch')}</p></div>
          )}
          {sprites.length > 0 && (
            <div className="library-grid">
              {sprites.map((sprite) => (
                <button
                  key={sprite.id}
                  type="button"
                  className={`library-cell ${selected?.id === sprite.id ? 'active' : ''}`}
                  onClick={() => selectSprite(sprite)}
                  title={`${sprite.label} · ${sprite.w}×${sprite.h}`}
                >
                  <img src={sprite.thumb} alt={sprite.label} loading="lazy" />
                  <span className="library-cell-label">{sprite.label || sprite.kind}</span>
                  {sprite.prefab && <span className="library-cell-prefab">{sprite.prefab}</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="library-detail">
          {!selected && <p className="context-path">{t('library.pick')}</p>}
          {selected && (
            <>
              <div className="library-preview">
                <img src={selected.thumb} alt={selected.label} />
              </div>
              <div className="eyebrow">{t('library.detail')}</div>
              {/* 名称单独一行：context-list 是"标签 …… 值"的两端对齐，中文长名会被推到最右边 */}
              <h3 className="library-name">{selected.label || selected.kind}</h3>
              <ul className="context-list">
                <li><span>{t('library.fieldKind')}</span><b>{selected.kind}</b></li>
                <li><span>{t('library.fieldSize')}</span><b>{selected.w}×{selected.h}</b></li>
                <li><span>{t('library.fieldTileable')}</span><b>{selected.tileable ? t('library.yes') : t('library.no')}</b></li>
              </ul>
              <div className="eyebrow">{t('library.tags')}</div>
              <div className="library-tags">
                {selected.tags.length === 0 && <span className="context-path">—</span>}
                {selected.tags.map((tag) => <span key={tag} className="chip small">{tag}</span>)}
              </div>
              <div className="eyebrow">{t('library.prefab')}</div>
              <select
                className="input"
                value={selected.prefab ?? ''}
                disabled={saving}
                onChange={(event) => assign(selected, event.target.value || null)}
              >
                <option value="">{t('library.noPrefab')}</option>
                {PREFABS.map((prefab) => <option key={prefab} value={prefab}>{prefab}</option>)}
              </select>
              <p className="context-path">
                {t('library.idHint', { id: selected.id })}
              </p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
