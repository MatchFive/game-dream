import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Topbar } from '../components/Topbar';
import { Icon } from '../components/Sprite';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import type { InsightCluster, InsightSample } from '../api/types';

/**
 * badcase 看板。
 *
 * 调提示词和求解器的时候，最没用的信息是"通过率 68%"——它不告诉你该改哪。
 * 有用的是：同一个闸门在多少份布局里反复亮、模型反复说哪几件事做不到、
 * 被判 bad 的样本集中在哪一类。这个页面就是把这些聚起来的靶子，
 * 点开能看到布局本身，也能把一簇样本导出去。
 */
export function InsightsPage() {
  const { t } = useI18n();
  const toast = useToast();
  // 选中的簇放进 URL：调提示词时可以把"这一类失败"直接发给别人
  const [params, setParams] = useSearchParams();
  const [sampleId, setSampleId] = useState<string>();
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ file: string; count: number }>();

  const insights = useQuery({ queryKey: ['scene-insights'], queryFn: api.sceneInsights });
  const scene = useQuery({
    queryKey: ['scene', sampleId],
    queryFn: () => api.scene(sampleId as string),
    enabled: Boolean(sampleId),
  });

  const data = insights.data?.insights;
  const clusters = data ? [...data.issues, ...data.unmet] : [];
  const kindParam = params.get('kind');
  const keyParam = params.get('key');
  const active = clusters.find((cluster) => cluster.kind === kindParam && cluster.key === keyParam)
    ?? clusters[0];
  const selectCluster = (cluster: InsightCluster) => {
    const next = new URLSearchParams(params);
    next.set('kind', cluster.kind);
    next.set('key', cluster.key);
    setParams(next, { replace: true });
  };

  // 换簇时把样本选中拉到第一行，省得每次都点一下
  useEffect(() => {
    if (!active) return;
    if (!sampleId || !active.samples.some((sample) => sample.id === sampleId)) {
      setSampleId(active.samples[0]?.id);
    }
  }, [active, sampleId]);

  const detail = scene.data?.scene;

  async function exportCluster(cluster: InsightCluster) {
    setExporting(true);
    try {
      const result = await api.exportBadcase({ kind: cluster.kind, key: cluster.key });
      setExported({ file: result.export.file, count: result.export.count });
      toast.push(t('insights.exported', { count: result.export.count }));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  }

  const actions = (
    <Link className="button secondary" to="/scenes">
      <Icon name="layers" /> {t('insights.backToScenes')}
    </Link>
  );

  const VISIBLE = 10;
  const group = (kind: 'issue' | 'unmet', items: InsightCluster[]) => {
    const shown = showAll ? items : items.slice(0, VISIBLE);
    return (
    <div className="insights-group">
      <div className="eyebrow">{kind === 'issue' ? t('insights.issueGroup') : t('insights.unmetGroup')}</div>
      {items.length === 0 && <p className="context-path">{t('insights.noCluster')}</p>}
      {shown.map((cluster) => {
        const isActive = active?.kind === cluster.kind && active?.key === cluster.key;
        return (
          <button
            type="button"
            key={`${cluster.kind}:${cluster.key}`}
            className={`scene-item ${isActive ? 'active' : ''}`}
            onClick={() => selectCluster(cluster)}
          >
            <span className={`dot ${kind === 'issue' ? 'bad' : 'ok'}`} />
            <span className="scene-item-name" title={cluster.variants.join(' / ')}>{cluster.key}</span>
            <small>{cluster.count}</small>
            <em className="verdict">{cluster.bad > 0 ? t('insights.badCount', { count: cluster.bad }) : ''}</em>
          </button>
        );
      })}
      {items.length > VISIBLE && (
        <button className="button secondary insights-more" type="button" onClick={() => setShowAll(!showAll)}>
          {showAll ? t('insights.showLess') : t('insights.showAll', { count: items.length })}
        </button>
      )}
    </div>
    );
  };

  return (
    <>
      <Topbar crumb={<strong>{t('insights.title')}</strong>} actions={actions} />
      <main className="insights-layout">
        <aside className="insights-clusters" aria-label={t('insights.title')}>
          {data && (
            <dl className="inspector-list insights-totals">
              <div>
                <dt>{t('insights.totalScenes')}</dt>
                <dd>{data.totals.scenes}</dd>
              </div>
              <div>
                <dt>{t('insights.totalPass')}</dt>
                <dd>{data.totals.pass}</dd>
              </div>
              <div>
                <dt>{t('insights.totalFail')}</dt>
                <dd>{data.totals.fail}</dd>
              </div>
              <div>
                <dt>{t('insights.totalUnmet')}</dt>
                <dd>{data.totals.withUnmet}</dd>
              </div>
              <div>
                <dt>{t('insights.totalReviewed')}</dt>
                <dd>{data.totals.reviewed}</dd>
              </div>
            </dl>
          )}
          {data && data.totals.scenes === 0 && (
            <div className="studio-agent-empty">{t('insights.empty')}</div>
          )}
          {data && group('issue', data.issues)}
          {data && group('unmet', data.unmet)}
        </aside>

        <section className="insights-samples" aria-label={t('insights.samples')}>
          {!active && <div className="studio-agent-empty">{t('insights.pickCluster')}</div>}
          {active && (
            <>
              <header className="insights-sample-head">
                <div>
                  <div className="eyebrow">{active.kind === 'issue' ? t('insights.issueGroup') : t('insights.unmetGroup')}</div>
                  <strong>{active.key}</strong>
                  <small>{t('insights.sampleCount', { count: active.count })}</small>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  disabled={exporting}
                  onClick={() => void exportCluster(active)}
                >
                  <Icon name="doc" /> {exporting ? t('insights.exporting') : t('insights.export')}
                </button>
              </header>
              {exported && (
                <p className="context-path">
                  {t('insights.exportedTo')} {exported.file} ({exported.count})
                </p>
              )}
              {active.variants.length > 1 && (
                <p className="context-path insights-variants">
                  {t('insights.variants')} {active.variants.join(' · ')}
                </p>
              )}
              <div className="insights-sample-grid">
                {active.samples.map((sample: InsightSample) => (
                  <button
                    type="button"
                    key={sample.id}
                    className={`insights-sample ${sample.id === sampleId ? 'active' : ''}`}
                    onClick={() => setSampleId(sample.id)}
                  >
                    <span className={`dot ${sample.pass ? 'ok' : 'bad'}`} />
                    <span className="scene-item-name">{sample.name}</span>
                    <small>{sample.buildings}</small>
                    {sample.verdict && <em className={`verdict ${sample.verdict}`}>{t(`scenes.${sample.verdict}`)}</em>}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="insights-detail" aria-label={t('scenes.preview')}>
          {detail ? (
            <>
              <div
                className="scene-svg insights-svg"
                // SVG 由服务端按布局数据生成，只含数字与调色板颜色
                dangerouslySetInnerHTML={{ __html: detail.svg }}
              />
              <div className="studio-gate-head">
                <div className="eyebrow">{t('scenes.gates')}</div>
                <span className={`studio-gate-word ${detail.validation.pass ? 'ok' : 'bad'}`}>
                  {detail.validation.pass ? t('common.pass') : t('common.fail')}
                </span>
              </div>
              <ul className="context-list">
                {detail.validation.issues.map((issue) => (
                  <li key={issue.code}>
                    <span className="accent">{issue.code}</span> {issue.detail}
                  </li>
                ))}
                {detail.validation.issues.length === 0 && <li>{t('insights.noIssues')}</li>}
              </ul>
              {(detail.spec.unmet?.length ?? 0) > 0 && (
                <>
                  <div className="eyebrow">{t('scenes.unmet')}</div>
                  <ul className="context-list scene-unmet">
                    {(detail.spec.unmet ?? []).map((item) => (
                      <li key={item}>
                        <span className="warn">!</span> {item}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <Link className="button secondary" to="/scenes">
                {t('insights.openInScenes')}
              </Link>
            </>
          ) : (
            <div className="studio-agent-empty">{t('insights.pickCluster')}</div>
          )}
        </aside>
      </main>
    </>
  );
}
