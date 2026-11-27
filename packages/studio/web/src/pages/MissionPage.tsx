import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAgentFeed, useProjectSnapshot } from '../api/hooks';
import { AgentPanel } from '../components/AgentPanel';
import { gateStatusClass, gateStatusKey } from '../lib/gates';
import { Icon } from '../components/Sprite';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/Toast';
import { formatDate, useI18n } from '../i18n';
import type { GateSnapshot, VerifyRun } from '../api/types';

type PreviewTab = 'build' | 'evidence';

function GateList({ run }: { run?: VerifyRun }) {
  const { t: translate } = useI18n();
  const gates = Object.entries(run?.gates ?? {});
  if (gates.length === 0) {
    return <div className="studio-agent-empty">{translate('studio.noRunRecorded')}</div>;
  }
  return (
    <div className="studio-gate-list">
      {gates.map(([name, gate]) => (
        <div className={`studio-gate-row ${gateStatusClass(gate.status)}`} key={name}>
          <span className="dot" />
          <strong>{name}</strong>
          <span className="gate-state">{translate(gateStatusKey(gate.status))}</span>
          <small>{gate.detail ?? ''}</small>
        </div>
      ))}
    </div>
  );
}

export function MissionPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const snapshot = useProjectSnapshot();
  const agent = useAgentFeed();
  const [tab, setTab] = useState<PreviewTab>('build');
  const [playUrl, setPlayUrl] = useState<string>();
  const [busy, setBusy] = useState(false);

  const build = snapshot.data?.build;
  const latest = build?.latestRun;
  const gates = useMemo(() => Object.values(latest?.gates ?? {}), [latest]);
  const passed = gates.filter((gate) => (gate as GateSnapshot).status === 'pass').length;
  const screenshot = build?.screenshot?.url;

  async function runVerify(visual = false) {
    setBusy(true);
    try {
      await api.verify(visual);
      await queryClient.invalidateQueries({ queryKey: ['studio'] });
      toast.push(t('studio.verificationPassed'));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function startPlaytest() {
    try {
      const result = await api.startPlaytest();
      if (result?.url) setPlayUrl(result.url);
      else toast.push(t('studio.playExternal'));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  }

  const actions = (
    <>
      <span className="saved">
        <span className="dot" />
        <span>{snapshot.isSuccess ? t('studio.ready') : t('common.loading')}</span>
      </span>
      <button className="button primary" type="button" disabled={busy} onClick={() => void runVerify(false)}>
        <Icon name="check" /> {t('studio.verify')}
      </button>
      <div className="avatar">GD</div>
    </>
  );

  return (
    <>
      <Topbar
        actions={actions}
        crumb={
          <>
            <strong>{snapshot.data?.project.name ?? 'Project'}</strong>
            <span className="sep">/</span>
            <span>{t('studio.build')}</span>
            <span className="sep">·</span>
            <span>
              {build?.engine ?? 'unknown'} · {snapshot.data?.assets.length ?? 0} {t('common.assets')}
            </span>
          </>
        }
      />

      <main className="mission-grid">
        <aside className="mission-col mission-col-agent" aria-label={t('studio.agent')}>
          <AgentPanel
            snapshot={agent.data}
            connected={agent.connected}
            onChanged={() => {
              void queryClient.invalidateQueries({ queryKey: ['studio'] });
            }}
          />
        </aside>

        <section className="mission-col mission-col-stage" aria-label={t('studio.buildTab')}>
          <div className="studio-toolbar">
            <div className="studio-tabs" role="tablist" aria-label={t('studio.buildTab')}>
              <button
                className="studio-tab"
                type="button"
                role="tab"
                aria-selected={tab === 'build'}
                onClick={() => setTab('build')}
              >
                {t('studio.buildTab')}
              </button>
              <button
                className="studio-tab"
                type="button"
                role="tab"
                aria-selected={tab === 'evidence'}
                onClick={() => setTab('evidence')}
              >
                {t('studio.evidenceTab')}
              </button>
            </div>
            <div className="studio-toolbar-actions">
              <button className="icon-btn" type="button" title={t('studio.play')} onClick={() => void startPlaytest()}>
                <Icon name="play" />
              </button>
              <button
                className="icon-btn"
                type="button"
                title={t('studio.visualReview')}
                disabled={busy}
                onClick={() => void runVerify(true)}
              >
                <Icon name="check" />
              </button>
              <button
                className="icon-btn"
                type="button"
                title={t('studio.refresh')}
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['studio'] })}
              >
                <Icon name="refresh" />
              </button>
            </div>
          </div>

          <div className="preview-wrap">
            <div className="preview-frame">
              {playUrl ? (
                <iframe className="play-frame" title={t('studio.play')} src={playUrl} />
              ) : tab === 'build' && screenshot ? (
                <img src={screenshot} alt={t('studio.screenshot')} />
              ) : (
                <div className="preview-empty">
                  <div>
                    <strong>{t('studio.noScreenshot')}</strong>
                    <span>{t('studio.noScreenshotHint')}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="preview-meta">
              <span>{screenshot ?? '—'}</span>
              <span className="spacer" />
              <span>{latest ? formatDate(latest.createdAt, locale) : 'NO RUN'}</span>
              <span className="sep">·</span>
              <span>{build?.engine ?? '—'}</span>
            </div>
          </div>

          <section className="studio-log" aria-label={t('studio.latestVerification')}>
            <div className="studio-log-head">
              <span>{t('studio.latestVerification')}</span>
              <span>{latest ? (latest.ok ? t('common.pass') : t('common.fail')) : t('studio.notRun')}</span>
            </div>
            <pre>{latest?.output ?? t('studio.noVerifyLog')}</pre>
          </section>
        </section>

        <aside className="mission-col mission-col-context" aria-label={t('studio.projectMeta')}>
          <div className="studio-gate-head">
            <div className="eyebrow">
              {t('studio.releaseGate')} <span className="accent">/</span> {latest ? 'RUN' : 'NO RUN'}
            </div>
            <div className="studio-score">
              <strong>{passed}</strong>
              <span>/{gates.length || 3}</span>
              <span className="studio-gate-word">{latest ? (latest.ok ? t('studio.verified') : t('studio.needsFix')) : t('studio.notVerified')}</span>
            </div>
          </div>
          <GateList run={latest} />
          <div className="studio-verify">
            <button className="button primary" type="button" disabled={busy} onClick={() => void runVerify(false)}>
              <Icon name="check" /> {t('studio.runVerification')}
            </button>
          </div>

          <section className="context-card">
            <div className="eyebrow">{t('studio.projectBuild')}</div>
            <h2>{snapshot.data?.project.name ?? 'Project'}</h2>
            <div className="context-meta">
              <span>{build?.engine ?? t('studio.unknownEngine')}</span>
              <span className="sep">/</span>
              <span>
                {snapshot.data?.assets.length ?? 0} {t('common.assets')}
              </span>
            </div>
            <p className="context-path">{snapshot.data?.project.root ?? '—'}</p>
            <div className="context-actions">
              <a className="button secondary" href="/assets">
                <Icon name="folder" /> {t('studio.assetCanvas')}
              </a>
            </div>
          </section>

          <section className="context-card">
            <div className="context-title">
              <span>{t('studio.buildContract')}</span>
              <span>{build?.manifest && build?.lockfile ? t('studio.ready') : t('studio.incomplete')}</span>
            </div>
            <ul className="context-list">
              <li>
                <span>{t('studio.manifest')}</span>
                <strong>{build?.manifest ? t('common.present') : t('common.missing')}</strong>
              </li>
              <li>
                <span>{t('studio.lockfile')}</span>
                <strong>{build?.lockfile ? t('common.present') : t('common.missing')}</strong>
              </li>
            </ul>
          </section>

          <section className="context-card">
            <div className="context-title">
              <span>{t('studio.session')}</span>
              <span>{build?.session ? `${build.session.steps ?? 0} ${t('studio.steps')}` : t('studio.sessionNoneState')}</span>
            </div>
            {build?.session ? (
              <p className="context-path">
                {build.session.updatedAt ? formatDate(build.session.updatedAt, locale) : '—'} · {build.session.eventCount ?? 0}{' '}
                {t('studio.events')}
              </p>
            ) : (
              <p className="context-note">{t('studio.sessionNone')}</p>
            )}
          </section>

          <section className="context-card">
            <div className="context-title">
              <span>{t('studio.recentRuns')}</span>
              <span>{build?.runs.length ?? 0}</span>
            </div>
            <div className="context-runs">
              {(build?.runs ?? []).slice(0, 5).map((run) => (
                <div className="context-run" key={run.id}>
                  <span className={run.ok ? 'ok' : 'bad'}>{run.ok ? '✓' : '✕'}</span>
                  <span>{formatDate(run.createdAt, locale)}</span>
                  <span>{run.durationMs}ms</span>
                </div>
              ))}
              {(build?.runs.length ?? 0) === 0 && <p className="context-path">{t('studio.noRuns')}</p>}
            </div>
          </section>
        </aside>
      </main>
    </>
  );
}
