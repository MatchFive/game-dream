import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import { Icon } from '../components/Sprite';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import type { SceneReview } from '../api/types';

const VERDICTS: Array<SceneReview['verdict']> = ['good', 'acceptable', 'bad'];

/**
 * 场景页：列表 → 预览 → 评审。
 * 评审写回 trace，人工判断和闸门指标一起构成训练标签。
 */
export function ScenesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [building, setBuilding] = useState(false);
  const [notes, setNotes] = useState('');

  const scenes = useQuery({ queryKey: ['scenes'], queryFn: api.scenes });
  const scene = useQuery({
    queryKey: ['scene', selectedId],
    queryFn: () => api.scene(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const items = scenes.data?.scenes ?? [];
  const active = scene.data?.scene;

  // 打开页面先选中最新一个，省得每次都点一下
  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
      setNotes(items[0].review?.notes ?? '');
    }
  }, [items, selectedId]);

  async function build() {
    if (!prompt.trim()) {
      toast.push(t('scenes.promptRequired'), 'error');
      return;
    }
    setBuilding(true);
    try {
      const result = await api.buildScene({ prompt: prompt.trim() });
      await queryClient.invalidateQueries({ queryKey: ['scenes'] });
      setSelectedId(result.scene.id);
      toast.push(
        result.finished ? t('scenes.built') : t('scenes.builtWithIssues', { issues: result.failure ?? '' }),
        result.finished ? 'info' : 'error',
      );
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBuilding(false);
    }
  }

  async function review(verdict: SceneReview['verdict']) {
    if (!active) return;
    try {
      await api.reviewScene(active.id, { verdict, notes: notes.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: ['scenes'] });
      await queryClient.invalidateQueries({ queryKey: ['scene', active.id] });
      toast.push(t('scenes.reviewed'));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  }

  const actions = (
    <div className="scene-build">
      <input
        value={prompt}
        placeholder={t('scenes.promptPlaceholder')}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void build();
        }}
      />
      <button className="button primary" type="button" disabled={building} onClick={() => void build()}>
        {building ? t('scenes.building') : t('scenes.build')}
      </button>
    </div>
  );

  return (
    <>
      <Topbar crumb={<strong>{t('studio.scenes')}</strong>} actions={actions} />
      <main className="scenes-layout">
        <aside className="scenes-list" aria-label={t('studio.scenes')}>
          {items.length === 0 && <div className="studio-agent-empty">{t('scenes.empty')}</div>}
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`scene-item ${item.id === selectedId ? 'active' : ''}`}
              onClick={() => {
                setSelectedId(item.id);
                setNotes(item.review?.notes ?? '');
              }}
            >
              <span className={`dot ${item.pass ? 'ok' : 'bad'}`} />
              <span className="scene-item-name">{item.name}</span>
              <small>{item.buildings}</small>
              {item.review && <em className={`verdict ${item.review.verdict}`}>{t(`scenes.${item.review.verdict}`)}</em>}
            </button>
          ))}
        </aside>

        <section className="scenes-canvas" aria-label={t('scenes.preview')}>
          {active ? (
            <div
              className="scene-svg"
              // SVG 由服务端根据布局数据生成，只含数字与调色板颜色
              dangerouslySetInnerHTML={{ __html: active.svg }}
            />
          ) : (
            <div className="studio-agent-empty">{t('scenes.selectHint')}</div>
          )}
        </section>

        <aside className="scenes-inspector" aria-label={t('scenes.inspector')}>
          {active ? (
            <>
              <div className="studio-gate-head">
                <div className="eyebrow">{t('scenes.gates')}</div>
                <div className="studio-score">
                  <span className={`studio-gate-word ${active.validation.pass ? 'ok' : 'bad'}`}>
                    {active.validation.pass ? t('common.pass') : t('common.fail')}
                  </span>
                  <span>
                    {active.validation.issues.length} {t('scenes.issues')}
                  </span>
                </div>
              </div>

              <dl className="inspector-list">
                <div>
                  <dt>{t('scenes.name')}</dt>
                  <dd>{active.name}</dd>
                </div>
                <div>
                  <dt>{t('scenes.buildings')}</dt>
                  <dd>{active.layout.buildings.length}</dd>
                </div>
                <div>
                  <dt>{t('scenes.attempts')}</dt>
                  <dd>{active.attempts}</dd>
                </div>
                {Object.entries(active.validation.metrics).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              {active.validation.issues.length > 0 && (
                <>
                  <div className="eyebrow">{t('scenes.issues')}</div>
                  <ul className="context-list">
                    {active.validation.issues.map((issue) => (
                      <li key={issue.code}>
                        <span className="accent">{issue.code}</span> {issue.detail}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="eyebrow">{t('scenes.review')}</div>
              <textarea
                className="scene-notes"
                rows={2}
                value={notes}
                placeholder={t('scenes.notesPlaceholder')}
                onChange={(event) => setNotes(event.target.value)}
              />
              <div className="scene-verdicts">
                {VERDICTS.map((verdict) => (
                  <button
                    key={verdict}
                    type="button"
                    className={`button ${active.review?.verdict === verdict ? 'primary' : 'secondary'}`}
                    onClick={() => void review(verdict)}
                  >
                    {t(`scenes.${verdict}`)}
                  </button>
                ))}
              </div>
              {active.review && (
                <p className="context-path">
                  {t('scenes.reviewedAt')} {new Date(active.review.at).toLocaleString()}
                </p>
              )}
              <p className="context-path">
                <Icon name="doc" /> trace {active.traceId}
              </p>
            </>
          ) : (
            <div className="studio-agent-empty">{t('scenes.selectHint')}</div>
          )}
        </aside>
      </main>
    </>
  );
}
