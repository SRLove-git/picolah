import { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing, CheckCheck, ExternalLink, Trash2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CountryCode, PriceAlert, WatchlistItem } from '../../shared/types';
import { PLATFORMS } from '../../shared/types';
import {
  getAlerts,
  getWatchlist,
  markAlertRead,
  markAllAlertsRead,
  outboundUrl,
  removeWatchlist,
} from '../lib/api';
import { formatMoney, relativeTime } from '../lib/format';
import { useSession } from '../lib/session';
import { PageHeader } from './PageHeader';
import { PlatformBadge } from './PlatformBadge';
import { ProductArt } from './ProductArt';
import { Sparkline } from './Sparkline';
import { MarkPurchasedButton } from './MarkPurchasedButton';

interface WatchlistViewProps {
  market: CountryCode;
  onOpenSidebar: () => void;
  notify: (message: string) => void;
}

export function WatchlistView({ market, onOpenSidebar, notify }: WatchlistViewProps) {
  const { t, i18n } = useTranslation();
  const { user, required, promptLogin } = useSession();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [watch, alertData] = await Promise.all([getWatchlist(), getAlerts()]);
      setItems(watch.items);
      setAlerts(alertData.alerts);
      setUnread(alertData.unread);
    } catch {
      // The page still renders an empty state when the API is unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!(required && !user)) void load();
  }, [load, required, user]);

  const remove = async (id: string) => {
    try {
      await removeWatchlist(id);
      setItems((current) => current.filter((item) => item.id !== id));
      notify(i18n.language.startsWith('zh') ? '已取消关注' : 'Removed from watchlist');
    } catch {
      notify(i18n.language.startsWith('zh') ? '操作失败，请稍后再试' : 'Could not update the watchlist');
    }
  };

  const readAll = async () => {
    await markAllAlertsRead();
    setAlerts((current) => current.map((alert) => ({ ...alert, read: true })));
    setUnread(0);
  };

  if (required && !user) {
    return (
      <section className="pc-page pc-watchlist-page" aria-label={t('watchlist.label')}>
        <PageHeader
          eyebrow="WATCHLIST"
          title={t('watchlist.label')}
          onOpenSidebar={onOpenSidebar}
        />
        <div className="pc-page-body pc-watchlist-body">
          <div className="pc-guest-gate">
            <span className="pc-guest-gate-icon">
              <Bell size={26} />
            </span>
            <h2>{t('auth.watchlistTitle')}</h2>
            <p>{t('auth.watchlistBody')}</p>
            <button type="button" className="pc-guest-cta" onClick={() => promptLogin('watchlist')}>
              {t('auth.loginCta')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pc-page pc-watchlist-page" aria-label={t('watchlist.label')}>
      <PageHeader
        eyebrow="WATCHLIST"
        title={t('watchlist.label')}
        onOpenSidebar={onOpenSidebar}
      />
      <div className="pc-page-body pc-watchlist-body">
        <div className="pc-watchlist-summary">
          <div>
            <p className="pc-eyebrow">{t('watchlist.eyebrow')}</p>
            <h2>{t('watchlist.title')}</h2>
            <p>{t('watchlist.body')}</p>
          </div>
          <span className="pc-watchlist-count">
            <Wallet size={16} />
            {items.length} {t('watchlist.items')}
          </span>
        </div>

        {alerts.length > 0 ? (
          <section className="pc-panel pc-alerts-panel" aria-label={t('watchlist.alerts')}>
            <header className="pc-alerts-head">
              <strong>
                {unread > 0 ? <BellRing size={15} /> : <Bell size={15} />}
                {t('watchlist.alerts')}
                {unread > 0 ? <span className="pc-alert-badge">{unread}</span> : null}
              </strong>
              {unread > 0 ? (
                <button type="button" onClick={() => void readAll()}>
                  <CheckCheck size={13} />
                  {t('watchlist.markAll')}
                </button>
              ) : null}
            </header>
            <ul className="pc-alert-list">
              {alerts.slice(0, 6).map((alert) => (
                <li key={alert.id} className={alert.read ? '' : 'is-unread'}>
                  <a
                    href={alert.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={() => {
                      if (!alert.read) {
                        void markAlertRead(alert.id);
                        setAlerts((current) =>
                          current.map((item) => (item.id === alert.id ? { ...item, read: true } : item)),
                        );
                        setUnread((value) => Math.max(0, value - 1));
                      }
                    }}
                  >
                    <span className="pc-alert-dot" aria-hidden="true" />
                    <span>
                      <strong>{alert.productName}</strong>
                      <small>
                        {alert.type === 'target' ? t('watchlist.targetHit') : t('watchlist.priceDrop')} ·{' '}
                        {formatMoney(alert.price, alert.market)} · {relativeTime(alert.createdAt)}
                      </small>
                    </span>
                    <ExternalLink size={13} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {loading ? (
          <div className="pc-watchlist-empty">
            <span className="pc-skeleton-line" />
            <span className="pc-skeleton-line is-short" />
          </div>
        ) : items.length === 0 ? (
          <div className="pc-watchlist-empty">
            <span className="pc-watchlist-empty-mark">+</span>
            <h3>{t('watchlist.emptyTitle')}</h3>
            <p>{t('watchlist.emptyBody')}</p>
          </div>
        ) : (
          <div className="pc-watchlist-grid">
            {items.map((item) => {
              const offer = item.currentOffer;
              const platform = offer ? PLATFORMS[offer.platformId] : null;
              return (
                <article className="pc-watch-card" key={item.id}>
                  <div className="pc-watch-art">
                    <ProductArt visual={item.product.visual} size={64} />
                  </div>
                  <div className="pc-watch-copy">
                    <div>
                      <p className="pc-eyebrow">{item.product.brand}</p>
                      <h3>{item.product.name}</h3>
                    </div>
                    <div className="pc-watch-meta">
                      <span>
                        {t('watchlist.target')}:{' '}
                        <strong>
                          {item.targetPrice == null
                            ? t('watchlist.anyDrop')
                            : formatMoney(item.targetPrice, item.market)}
                        </strong>
                      </span>
                      {offer ? (
                        <a href={outboundUrl(offer)} target="_blank" rel="noreferrer noopener">
                          <PlatformBadge platformId={offer.platformId} />
                          {platform?.name || offer.platform} · {formatMoney(offer.finalPrice, item.market)}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="pc-watch-unavailable">{t('watchlist.noOffer')}</span>
                      )}
                    </div>
                    {offer ? (
                      <div className="pc-watch-spark">
                        <Sparkline values={offer.history} width={180} height={34} accent={item.met ? '#1f9d75' : '#ef4f7e'} />
                        <span>
                          {t('watchlist.low30d')} {formatMoney(offer.low30d, item.market)}
                        </span>
                      </div>
                    ) : null}
                    <MarkPurchasedButton
                      product={item.product}
                      market={item.market}
                      price={offer?.finalPrice ?? null}
                      className="pc-watch-buy"
                    />
                  </div>
                  <div className="pc-watch-actions">
                    <span className={`pc-watch-state ${item.met ? 'is-met' : ''}`}>
                      {item.met ? t('watchlist.reached') : t('watchlist.watching')}
                    </span>
                    <button type="button" onClick={() => void remove(item.id)} aria-label={t('watchlist.remove')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
