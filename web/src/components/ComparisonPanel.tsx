import { ArrowUpRight, BadgeCheck, BellPlus, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
import type { ComparisonAlternative, CountryCode, Offer, PriceMode } from '../../shared/types';
import { MARKETS, PLATFORMS } from '../../shared/types';
import {
  formatMoney,
  offerValue,
  relativeTime,
  sortOffers,
} from '../lib/format';
import { addWatchlist, outboundUrl } from '../lib/api';
import { useSession } from '../lib/session';
import { PlatformBadge } from './PlatformBadge';
import { Sparkline } from './Sparkline';
import { Capybara } from './PicolahMark';

interface ComparisonPanelProps {
  comparison: import('../../shared/types').Comparison;
  priceMode: PriceMode;
}

function relativeBar(value: number, minimum: number, maximum: number) {
  if (maximum <= minimum) return 100;
  return 42 + ((value - minimum) / (maximum - minimum)) * 58;
}

// Only compare values supported by every live source. Missing shipping is not
// free shipping, and a current quote is never a 30-day low.
function comparablePriceMode(offers: Offer[], requested: PriceMode): PriceMode {
  const live = offers.filter((offer) => offer.source === 'live');
  if (!live.length) return requested;
  if (requested === 'history' || requested === 'landed') {
    return live.every((offer) => offer.landedPriceConfidence === 'exact') ? 'landed' : 'item';
  }
  if (requested === 'shipping' && live.some((offer) => offer.shippingKnown !== true)) return 'item';
  return requested;
}

function MetricComparison({ offers, market, priceMode }: { offers: Offer[]; market: CountryCode; priceMode: PriceMode }) {
  const { t, i18n } = useTranslation();
  const prices = offers.map((offer) => offerValue(offer, priceMode));
  const ratings = offers.filter((offer) => offer.ratingKnown !== false).map((offer) => offer.rating);
  const reviews = offers.filter((offer) => offer.reviewsKnown !== false).map((offer) => offer.reviews);
  const priceMin = Math.min(...prices);
  const priceMax = Math.max(...prices);
  const ratingMin = Math.min(...ratings);
  const ratingMax = Math.max(...ratings);
  const reviewMin = Math.min(...reviews);
  const reviewMax = Math.max(...reviews);
  const numberFormat = new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'zh-CN');

  return (
    <section className="offer-metrics" aria-label={t('comparison.chartTitle')}>
      <header className="offer-metrics-head">
        <strong>{t('comparison.chartTitle')}</strong>
        <span>{t('comparison.chartHint')}</span>
      </header>
      <div className="offer-metrics-scroll">
        <div className="offer-metrics-grid">
          <span />
          <span className="offer-metric-heading tone-price">
            <b>{t('comparison.priceMetric')}</b><small>{t('comparison.lowerBetter')}</small>
          </span>
          <span className="offer-metric-heading tone-rating">
            <b>{t('comparison.ratingMetric')}</b><small>{t('comparison.higherBetter')}</small>
          </span>
          <span className="offer-metric-heading tone-reviews">
            <b>{t('comparison.reviewMetric')}</b><small>{t('comparison.higherBetter')}</small>
          </span>
          {offers.map((offer) => {
            const platform = PLATFORMS[offer.platformId];
            const price = offerValue(offer, priceMode);
            const metrics = [
              { key: 'price', name: t('comparison.priceMetric'), width: relativeBar(price, priceMin, priceMax), label: formatMoney(price, market), best: price === priceMin },
              { key: 'rating', name: t('comparison.ratingMetric'), width: offer.ratingKnown === false ? 0 : relativeBar(offer.rating, ratingMin, ratingMax), label: offer.ratingKnown === false ? t('liveComparison.notProvided') : offer.rating.toFixed(1), best: offer.ratingKnown !== false && offer.rating === ratingMax },
              { key: 'reviews', name: t('comparison.reviewMetric'), width: offer.reviewsKnown === false ? 0 : relativeBar(offer.reviews, reviewMin, reviewMax), label: offer.reviewsKnown === false ? t('liveComparison.notProvided') : numberFormat.format(offer.reviews), best: offer.reviewsKnown !== false && offer.reviews === reviewMax },
            ];
            return (
              <div className="offer-metric-row" key={offer.id}>
                <span className="offer-metric-platform" title={platform?.name || offer.platform}>
                  <PlatformBadge platformId={offer.platformId} />
                  <b>{platform?.name || offer.platform}</b>
                </span>
                {metrics.map((metric) => (
                  <span
                    className={`offer-metric-cell tone-${metric.key} ${metric.best ? 'is-best' : ''}`}
                    key={metric.key}
                    data-label={metric.name}
                    style={{ '--metric-width': `${metric.width}%` } as CSSProperties}
                    aria-label={`${platform?.name || offer.platform}: ${metric.label}`}
                  >
                    <i />
                    <strong>{metric.label}</strong>
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Breakdown({ offer, country, mode }: { offer: Offer; country: CountryCode; mode: PriceMode }) {
  const { t } = useTranslation();
  return (
    <span className="offer-breakdown">
      <span className={mode === 'item' ? 'is-active-metric' : ''}>
        {t('comparison.item')} {formatMoney(offer.itemPrice, country)}
      </span>
      <span className="breakdown-dot" />
      <span className={mode === 'shipping' ? 'is-active-metric' : ''}>
        {t('comparison.shipping')} {offer.shippingKnown === false ? t('liveComparison.notProvided') : offer.shippingFee > 0 ? formatMoney(offer.shippingFee, country) : t('comparison.freeShipping')}
      </span>
      {offer.discountKnown !== false && offer.discount > 0 && (
        <>
          <span className="breakdown-dot" />
          <span className="breakdown-discount">{t('comparison.coupon')} −{formatMoney(offer.discount, country)}</span>
        </>
      )}
    </span>
  );
}

export function ComparisonPanel({ comparison, priceMode }: ComparisonPanelProps) {
  const { t, i18n } = useTranslation();
  const { user, required, promptLogin } = useSession();
  const [watched, setWatched] = useState(false);
  const { product, market } = comparison;
  if (!product) return null;

  const marketInfo = MARKETS[market];
  const isLive = Boolean(comparison.search) || comparison.offers.some((offer) => offer.source === 'live');
  const displayMode = comparablePriceMode(comparison.offers, priceMode);
  const sorted = sortOffers(comparison.offers, displayMode);
  const best = sorted[0];

  const watch = async () => {
    if (required && !user) {
      promptLogin('watchlist');
      return;
    }
    try {
      await addWatchlist(product.id, market);
      setWatched(true);
    } catch {
      if (required) promptLogin('watchlist');
      else setWatched(false);
    }
  };

  return (
    <div className="comparison-card">
      <div className="comparison-head">
        <div className="product-art-wrap comparison-mascot">
          <Capybara size={72} />
        </div>
        <div className="product-copy">
          <h3>{product.name}</h3>
        </div>
        {best && (
          <div className="headline-price">
            <strong>{formatMoney(offerValue(best, displayMode), market)}</strong>
          </div>
        )}
        {!isLive && <button
          type="button"
          className={`pc-watch-add ${watched ? 'is-watched' : ''}`}
          onClick={() => void watch()}
          disabled={watched}
          title={t('watchlist.add')}
        >
          <BellPlus size={14} />
          {watched ? t('watchlist.watching') : t('watchlist.add')}
        </button>}
      </div>

      <div className="comparison-toolbar is-compact">
        <span className="toolbar-updated">
          <Clock3 size={13} />
          {t('comparison.updated')} {relativeTime(comparison.updatedAt)}
        </span>
        {isLive && displayMode !== priceMode && <span>{t('liveComparison.currentPriceHint', { mode: t(`controls.${displayMode}.label`) })}</span>}
      </div>

      {best ? (
        <>
          <MetricComparison offers={sorted} market={market} priceMode={displayMode} />
          <div className="offer-table">
            <div className="offer-table-head">
              <span className="col-rank">#</span>
              <span>{t('comparison.seller')}</span>
              <span className="col-trend">{t(isLive ? 'liveComparison.priceHistory' : 'comparison.trend')}</span>
              <span className="col-price">{t(`controls.${displayMode}.label`)}</span>
            </div>
            {sorted.map((offer, index) => {
              const platform = PLATFORMS[offer.platformId];
              const value = offerValue(offer, displayMode);
              return (
                <a
                  className={`offer-row ${index === 0 ? 'is-best' : ''}`}
                  key={offer.id}
                  href={outboundUrl(offer) || undefined}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ animationDelay: `${index * 55}ms` }}
                >
                  <span className={`offer-rank ${index === 0 ? 'is-first' : ''}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="offer-identity">
                    <div className="offer-name-line">
                      <PlatformBadge platformId={offer.platformId} />
                      <span className="offer-platform-name">{platform?.name || offer.platform}</span>
                      <span className="offer-seller">{offer.seller}</span>
                      {offer.isOfficial && (
                        <span className="official-tag">
                          <BadgeCheck size={12} />
                          {t('comparison.official')}
                        </span>
                      )}
                      {index === 0 && <span className="best-tag">{t('comparison.best')}</span>}
                    </div>
                    <div className="offer-subline">
                      <Breakdown offer={offer} country={market} mode={displayMode} />
                      <span className="offer-rating">
                        <span aria-hidden="true">★</span> {offer.ratingKnown === false ? t('liveComparison.notProvided') : offer.rating.toFixed(1)}
                        <span className="review-count">
                          · {offer.reviewsKnown === false ? t('liveComparison.notProvided') : new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'zh-CN').format(offer.reviews)} {t('comparison.reviews')}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="offer-trend">
                    {offer.source === 'live' ? <span>{t('liveComparison.noHistory')}</span> : <>
                      <Sparkline values={offer.history} accent={index === 0 ? '#111827' : '#9ca3af'} />
                      <span>{t('comparison.low')} {formatMoney(offer.low30d, market)}</span>
                    </>}
                  </div>
                  <div className="offer-price">
                    <strong>{formatMoney(value, market)}</strong>
                    <span className="offer-link">
                      {t('comparison.visit')}
                      <ArrowUpRight size={13} />
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
          <p className="pc-affiliate-note">{t('comparison.affiliate')}</p>
        </>
      ) : (
        <div className="comparison-empty">
          <span className="empty-orbit" aria-hidden="true" />
          <div>
            <strong>{t('comparison.unavailable', { market: i18n.language === 'en' ? marketInfo.nameEn : marketInfo.nameZh })}</strong>
            <p>{t('comparison.unavailableHint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function AlternativeGrid({
  alternatives,
  market,
  priceMode,
  onAsk,
  title,
}: {
  alternatives: ComparisonAlternative[];
  market: CountryCode;
  priceMode: PriceMode;
  onAsk: (query: string) => void;
  title?: string;
}) {
  const { t, i18n } = useTranslation();
  if (!alternatives.length) return null;
  const marketInfo = MARKETS[market];

  return (
    <div className="alternatives">
      <div className="alternatives-head">
        <span>{title || t('comparison.seeAlso')}</span>
        <small>{i18n.language === 'en' ? marketInfo.nameEn : marketInfo.nameZh} · {t('comparison.currentMarket')}</small>
      </div>
      <div className="alternatives-grid">
        {alternatives.map((item) => {
          const offer = item.offer;
          const platform = offer ? PLATFORMS[offer.platformId] : null;
          const mode = offer ? comparablePriceMode([offer], priceMode) : priceMode;
          const content = <>
              <span className="alternative-mascot">
                <Capybara size={54} />
              </span>
              <span className="alternative-copy">
                <span className="alternative-category">{item.product.category}</span>
                <strong>{item.product.name}</strong>
                <span className="alternative-meta">
                  {offer ? (
                    <>
                      {platform?.name || offer.platform} · {formatMoney(offerValue(offer, mode), market)}
                    </>
                  ) : (
                    t('comparison.noOffer')
                  )}
                </span>
              </span>
              <span className="alternative-arrow">
                <ArrowUpRight size={15} />
              </span>
              {offer && (
                <span className="alternative-mode">
                  {t(`controls.${mode}.label`)}
                </span>
              )}
          </>;
          return offer?.source === 'live' ? (
            <a
              className="alternative-card"
              key={item.product.id}
              href={outboundUrl(offer) || undefined}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`${item.product.name} · ${t('comparison.visit')}`}
            >{content}</a>
          ) : (
            <button
              className="alternative-card"
              key={item.product.id}
              type="button"
              onClick={() =>
                onAsk(t('comparison.askCheapest', { product: item.product.name, market: i18n.language === 'en' ? MARKETS[item.market].nameEn : MARKETS[item.market].nameZh }))
              }
            >{content}</button>
          );
        })}
      </div>
    </div>
  );
}
