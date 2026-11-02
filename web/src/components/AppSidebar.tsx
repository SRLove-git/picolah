import { Fingerprint, Footprints, Home, Radar, Search, UserRound, UsersRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CountryCode } from '../../shared/types';
import { useSession } from '../lib/session';
import { MarketPicker } from './Controls';
import { BrandLockup } from './PicolahMark';

export type AppView = 'home' | 'capybara' | 'search' | 'radar' | 'friends' | 'watchlist' | 'messages' | 'reels' | 'profile' | 'account' | 'privacy' | 'terms' | 'chat';

interface AppSidebarProps {
  view: AppView;
  market: CountryCode;
  onMarketChange: (market: CountryCode) => void;
  open: boolean;
  onNavigate: (view: AppView) => void;
  onClose: () => void;
}

const NAV = [
  { key: 'home' as const, labelKey: 'nav.home', Icon: Home },
  { key: 'search' as const, labelKey: 'nav.search', Icon: Search },
  { key: 'radar' as const, labelKey: 'nav.radar', Icon: Radar },
  { key: 'friends' as const, labelKey: 'nav.friends', Icon: UsersRound },
  { key: 'messages' as const, labelKey: 'nav.messages', Icon: Footprints },
  { key: 'capybara' as const, labelKey: 'nav.capybara', Icon: Fingerprint },
];

export function AppSidebar({
  view,
  market,
  onMarketChange,
  open,
  onNavigate,
  onClose,
}: AppSidebarProps) {
  const { t } = useTranslation();
  const { user, promptLogin } = useSession();
  const activeKey = view === 'chat' ? 'messages' : view;
  const accountLabel = user ? t('nav.account') : t('auth.loginCta');

  return (
    <aside className={`pc-sidebar ${open ? 'is-open' : ''}`} aria-label={t('nav.main')}>
      <div className="pc-side-head">
        <BrandLockup
          size={23}
          onClick={() => {
            onNavigate('home');
          }}
        />
        <button className="pc-side-close" type="button" onClick={onClose} aria-label={t('nav.close')}>
          <X size={18} />
        </button>
      </div>

      <nav className="pc-nav">
        {NAV.map(({ key, labelKey, Icon }) => {
          const isActive = activeKey === key;
          const label = t(labelKey);
          return (
            <button
              key={key}
              type="button"
              className={`pc-nav-item ${isActive ? 'is-active' : ''}`}
              onClick={() => onNavigate(key)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              data-tooltip={label}
            >
              <span className="pc-nav-icon">
                <Icon
                  size={25}
                  strokeWidth={isActive ? 2.5 : 1.9}
                  fill={isActive && key !== 'radar' && key !== 'friends' ? 'currentColor' : 'none'}
                />
              </span>
              <span className="pc-nav-label">{label}</span>
            </button>
          );
        })}

      </nav>

      <footer className="pc-side-foot">
        <div className="pc-legal-links">
          <button type="button" onClick={() => onNavigate('privacy')}>
            {t('legal.privacy')}
          </button>
          <button type="button" onClick={() => onNavigate('terms')}>
            {t('legal.terms')}
          </button>
        </div>
        <div className="pc-side-market">
          <MarketPicker market={market} onChange={onMarketChange} flagOnly direction="up" tone="ghost" />
        </div>
        <button
          type="button"
          className={`pc-account-card ${view === 'account' ? 'is-active' : ''}`}
          onClick={() => {
            if (user) onNavigate('account');
            else promptLogin('account');
          }}
          aria-current={view === 'account' ? 'page' : undefined}
          aria-label={accountLabel}
          data-tooltip={accountLabel}
        >
          <span className="pc-account-avatar">
            {user?.avatar ? <img src={user.avatar} alt="" /> : <UserRound size={25} strokeWidth={1.6} aria-hidden="true" />}
            <i />
          </span>
          <span className="pc-account-copy">
            <strong>{accountLabel}</strong>
          </span>
        </button>
      </footer>
    </aside>
  );
}
