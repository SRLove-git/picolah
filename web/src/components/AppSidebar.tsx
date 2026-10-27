import { Bell, Clapperboard, Fingerprint, Home, Languages, PawPrint, Search, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BrandLockup, Capybara } from './PicolahMark';

export type AppView = 'home' | 'capybara' | 'search' | 'watchlist' | 'messages' | 'reels' | 'profile' | 'account' | 'privacy' | 'terms' | 'chat';

interface AppSidebarProps {
  view: AppView;
  open: boolean;
  onNavigate: (view: AppView) => void;
  onClose: () => void;
}

const NAV = [
  { key: 'home' as const, labelKey: 'nav.home', Icon: Home },
  { key: 'capybara' as const, labelKey: 'nav.capybara', Icon: PawPrint },
  { key: 'search' as const, labelKey: 'nav.search', Icon: Search },
  { key: 'watchlist' as const, labelKey: 'nav.watchlist', Icon: Bell },
  { key: 'reels' as const, labelKey: 'nav.reels', Icon: Clapperboard },
  { key: 'profile' as const, labelKey: 'nav.profile', Icon: Fingerprint },
  { key: 'messages' as const, labelKey: 'nav.messages', Icon: Send },
];

export function AppSidebar({
  view,
  open,
  onNavigate,
  onClose,
}: AppSidebarProps) {
  const { t, i18n } = useTranslation();
  const activeKey = view === 'chat' ? 'messages' : view;

  function toggleLanguage() {
    void i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en');
  }

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
                  fill={isActive ? 'currentColor' : 'none'}
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
        <button
          type="button"
          className="pc-language-toggle"
          onClick={toggleLanguage}
          aria-label={t('language.switch')}
          data-tooltip={t('language.switch')}
        >
          <Languages size={24} strokeWidth={1.9} />
          <span>{t('language.short')}</span>
        </button>
        <button
          type="button"
          className={`pc-account-card ${view === 'account' ? 'is-active' : ''}`}
          onClick={() => onNavigate('account')}
          aria-current={view === 'account' ? 'page' : undefined}
          aria-label={t('nav.account')}
          data-tooltip={t('nav.account')}
        >
          <span className="pc-account-avatar">
            <Capybara variant="face" size={34} />
            <i />
          </span>
          <span className="pc-account-copy">
            <strong>{t('nav.account')}</strong>
          </span>
        </button>
      </footer>
    </aside>
  );
}
