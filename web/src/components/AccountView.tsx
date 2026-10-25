import {
  BadgeCheck,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Download,
  Globe2,
  Heart,
  LogOut,
  Pencil,
  PlaySquare,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { COUNTRY_LIST, MARKETS } from '../../shared/types';
import { deleteAccount } from '../lib/api';
import { PRICE_MODES, relativeTime } from '../lib/format';
import { useSession } from '../lib/session';
import { CountryFlag } from './CountryFlag';
import { PageHeader } from './PageHeader';
import { Capybara } from './PicolahMark';

interface AccountViewProps {
  config: AppConfig | null;
  market: CountryCode;
  priceMode: PriceMode;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  onOpenGateway: () => void;
  onOpenSidebar: () => void;
  notify: (message: string) => void;
}

const PRICE_ICONS = {
  landed: Wallet,
  item: Sparkles,
  shipping: Globe2,
  history: Sparkles,
} as const;

export function AccountView({
  config,
  market,
  priceMode,
  onMarketChange,
  onPriceModeChange,
  onOpenGateway,
  onOpenSidebar,
  notify,
}: AccountViewProps) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useSession();
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const marketInfo = MARKETS[market];
  const lastRun = config?.gateway.lastRun;

  const removeAccount = async () => {
    if (!deletePassword) return;
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      notify(t('account.deleteDone'));
      logout();
    } catch (error) {
      notify(error instanceof Error ? error.message : t('account.deleteFailed'));
    } finally {
      setDeleting(false);
      setDeletePassword('');
    }
  };

  return (
    <section className="pc-page pc-profile-page" aria-label={t('account.label')}>
      <PageHeader
        eyebrow="ACCOUNT"
        title={t('account.label')}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="pc-page-body pc-profile-body">
        <div className="pc-profile-cover">
          <div className="pc-profile-aurora" aria-hidden="true" />
          <span className="pc-profile-doodle pc-profile-doodle-1" aria-hidden="true">
            ✦
          </span>
          <span className="pc-profile-doodle pc-profile-doodle-2" aria-hidden="true">
            ✧
          </span>
          <span className="pc-profile-doodle pc-profile-doodle-3" aria-hidden="true">
            ♡
          </span>
          <div className="pc-profile-cover-art">
            <Capybara size={150} />
          </div>
          <div className="pc-profile-identity">
            <span className="pc-profile-avatar">
              <Capybara variant="face" size={84} />
              <i />
            </span>
            <div className="pc-profile-name">
              <h2>
                {t('account.workspace')}
                <BadgeCheck size={18} />
              </h2>
              {user ? <p className="pc-profile-email">{user.email}</p> : null}
            </div>
            <button
              type="button"
              className="pc-outline-button pc-profile-edit"
              onClick={() => notify(t('account.editNotice'))}
            >
              <Pencil size={14} />
              {t('account.edit')}
            </button>
          </div>
        </div>

        <div className="pc-profile-grid">
          <details className="pc-profile-card">
            <summary>
              <span className="pc-profile-card-icon tone-pink">
                <Globe2 size={17} />
              </span>
              <div>
                <h3>{t('account.defaultMarket')}</h3>
                <p>{t('account.defaultMarketHint')}</p>
              </div>
              <ChevronDown size={17} className="pc-collapse-chevron" />
            </summary>
            <div className="pc-market-chips">
              {COUNTRY_LIST.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={`pc-market-chip ${item.code === market ? 'is-active' : ''}`}
                  onClick={() => onMarketChange(item.code)}
                >
                  <CountryFlag code={item.code} width={18} />
                  <span>
                    <strong>{i18n.language === 'en' ? item.nameEn : item.nameZh}</strong>
                    <small>{item.currency}</small>
                  </span>
                  {item.code === market && <Check size={13} />}
                </button>
              ))}
            </div>
          </details>

          <details className="pc-profile-card">
            <summary>
              <span className="pc-profile-card-icon tone-mint">
                <Wallet size={17} />
              </span>
              <div>
                <h3>{t('account.defaultPrice')}</h3>
                <p>{t('account.defaultPriceHint')}</p>
              </div>
              <ChevronDown size={17} className="pc-collapse-chevron" />
            </summary>
            <div className="pc-price-options">
              {PRICE_MODES.map((item) => {
                const Icon = PRICE_ICONS[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`pc-price-option ${item.id === priceMode ? 'is-active' : ''}`}
                    onClick={() => onPriceModeChange(item.id)}
                  >
                    <span className="pc-price-option-icon">
                      <Icon size={16} />
                    </span>
                    <span>
                      <strong>{t(`controls.${item.id}.label`)}</strong>
                      <small>{t(`controls.${item.id}.hint`)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="pc-profile-note">
              {t('account.currencyNote', { currency: marketInfo.currency })}
            </div>
          </details>

          <details className="pc-profile-card pc-profile-activity">
            <summary>
              <span className="pc-profile-card-icon tone-pink">
                <Clock3 size={17} />
              </span>
              <div>
                <h3>{t('account.activity')}</h3>
                <p>{t('account.activityHint')}</p>
              </div>
              <ChevronDown size={17} className="pc-collapse-chevron" />
            </summary>
            <div className="pc-activity-list">
              {[
                { key: 'watched', Icon: PlaySquare },
                { key: 'browsing', Icon: Clock3 },
                { key: 'likes', Icon: Heart },
                { key: 'saved', Icon: Bookmark },
              ].map(({ key, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => notify(t('account.noActivity', { label: t(`account.${key}`) }))}
                >
                  <span className="pc-activity-icon">
                    <Icon size={16} />
                  </span>
                  <span>
                    <strong>{t(`account.${key}`)}</strong>
                    <small>{t(`account.${key}Hint`)}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </details>

          <details className="pc-profile-card pc-profile-source">
            <summary>
              <span className="pc-profile-card-icon tone-blue">
                <Database size={17} />
              </span>
              <div>
                <h3>{t('account.source')}</h3>
                <p>{t('account.sourceHint')}</p>
              </div>
              <span className={`pc-source-state ${config ? 'is-live' : ''}`}>
                <i />
                {t(config ? 'account.online' : 'account.connecting')}
              </span>
              <ChevronDown size={17} className="pc-collapse-chevron" />
            </summary>
            <div className="pc-source-grid">
              <span>
                <small>{t('account.endpoint')}</small>
                <strong>{config?.gateway.endpoint || '/api/ingest'}</strong>
              </span>
              <span>
                <small>{t('account.lastSync')}</small>
                <strong>{lastRun ? relativeTime(lastRun.createdAt) : t('account.waiting')}</strong>
              </span>
              <span>
                <small>{t('account.latest')}</small>
                <strong>
                  {lastRun ? t('account.batch', { received: lastRun.received, upserted: lastRun.upserted }) : '—'}
                </strong>
              </span>
              <span>
                <small>{t('account.today')}</small>
                <strong>{t('account.offers', { count: config?.gateway.todayOffers ?? '—' })}</strong>
              </span>
            </div>
            <div className="pc-profile-card-actions">
              <button type="button" className="pc-primary-button" onClick={onOpenGateway}>
                <Settings2 size={14} />
                {t('account.manage')}
              </button>
            </div>
          </details>

          <details className="pc-profile-card pc-profile-account">
            <summary>
              <span className="pc-profile-card-icon tone-lilac">
                <BadgeCheck size={17} />
              </span>
              <div>
                <h3>{t('account.security')}</h3>
                <p>{t('account.securityHint')}</p>
              </div>
              <ChevronDown size={17} className="pc-collapse-chevron" />
            </summary>
            <div className="pc-account-rows">
              <span>
                <small>{t('account.workspace')}</small>
                <strong>{t('account.workspace')}</strong>
              </span>
              <span>
                <small>{t('account.username')}</small>
                <strong>{user?.displayName || 'Pico'}</strong>
              </span>
              <span>
                <small>{t('account.loginMethod')}</small>
                <strong>{t('account.emailPassword')}</strong>
              </span>
              <span>
                <small>{t('account.email')}</small>
                <strong>{user?.email || '—'}</strong>
              </span>
              <span>
                <small>{t('account.plan')}</small>
                <strong>
                  Beta <em>{t('account.free')}</em>
                </strong>
              </span>
              <span>
                <small>{t('account.recentLogin')}</small>
                <strong>{t('account.localLogin')}</strong>
              </span>
            </div>
            <div className="pc-profile-card-actions">
              <button
                type="button"
                className="pc-outline-button"
                onClick={() => notify(t('account.passwordNotice'))}
              >
                <Pencil size={14} />
                {t('account.changePassword')}
              </button>
              <button
                type="button"
                className="pc-text-button is-danger"
                onClick={() => void logout()}
              >
                <LogOut size={14} />
                {t('account.logout')}
              </button>
            </div>
          </details>

          <details className="pc-profile-card pc-profile-privacy">
            <summary>
              <span className="pc-profile-card-icon tone-mint">
                <ShieldCheck size={17} />
              </span>
              <div>
                <h3>{t('account.privacy')}</h3>
                <p>{t('account.privacyHint')}</p>
              </div>
              <ChevronDown size={17} className="pc-collapse-chevron" />
            </summary>
            <div className="pc-privacy-actions">
              <a className="pc-outline-button" href="/api/account/export" download>
                <Download size={14} />
                {t('account.export')}
              </a>
              <div className="pc-danger-zone">
                <label htmlFor="pc-delete-password">{t('account.deleteLabel')}</label>
                <div>
                  <input
                    id="pc-delete-password"
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    placeholder={t('account.deletePlaceholder')}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="pc-text-button is-danger"
                    disabled={!deletePassword || deleting}
                    onClick={() => void removeAccount()}
                  >
                    <Trash2 size={14} />
                    {deleting ? t('account.deleting') : t('account.delete')}
                  </button>
                </div>
                <small>{t('account.deleteWarning')}</small>
              </div>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
