import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from './Sprite';
import { useI18n } from '../i18n';

interface TopbarProps {
  crumb: ReactNode;
  actions?: ReactNode;
}

export function Topbar({ crumb, actions }: TopbarProps) {
  const { locale, toggle, t } = useI18n();

  return (
    <header className="topbar studio-topbar">
      <a className="brand" href="/" style={{ textDecoration: 'none' }}>
        <span className="brand-mark">
          <Icon name="spark" />
        </span>
        <span className="brand-name">GAMEDREAM</span>
        <span className="brand-sub">STUDIO</span>
      </a>
      <div className="crumb">{crumb}</div>
      <nav className="studio-nav" aria-label="Studio sections">
        <NavLink to="/" end>
          {t('studio.mission')}
        </NavLink>
        <NavLink to="/assets">{t('studio.assets')}</NavLink>
        <NavLink to="/scenes">{t('studio.scenes')}</NavLink>
        <NavLink to="/settings">{t('studio.settings')}</NavLink>
      </nav>
      <div className="top-actions">
        <button
          className="icon-btn"
          type="button"
          onClick={toggle}
          aria-label={locale === 'zh' ? 'Switch to English' : '切换到中文'}
        >
          {locale === 'zh' ? 'EN' : '中'}
        </button>
        {actions}
      </div>
    </header>
  );
}
