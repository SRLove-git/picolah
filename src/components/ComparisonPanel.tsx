import { ArrowUpRight, BadgeCheck, Clock3 } from 'lucide-react';
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

function MetricComparison({ offers, market, priceMode }: { offers: Offer[]; market: CountryCode; priceMode: PriceMode }) {
  const { t, i18n } = useTranslation();
  const prices = offers.map((offer) => offerValue(offer, priceMode));
  const ratings = offers.map((offer) => offer.rating);
  const reviews = offers.map((offer) => offer.reviews);
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
              { key: 'rating', name: t('comparison.ratingMetric'), width: relativeBar(offer.rating, ratingMin, ratingMax), label: offer.rating.toFixed(1), best: offer.rating === ratingMax },
              { key: 'reviews', name: t('comparison.reviewMetric'), width: relativeBar(offer.reviews, reviewMin, reviewMax), label: numberFormat.format(offer.reviews), best: offer.reviews === reviewMax },
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
        {t('comparison.shipping')} {offer.shippingFee > 0 ? formatMoney(offer.shippingFee, country) : t('comparison.freeShipping')}
      </span>
      {offer.discount > 0 && (
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
  const { product, market } = comparison;
  if (!product) return null;

  const marketInfo = MARKETS[market];
  const sorted = sortOffers(comparison.offers, priceMode);
  const best = sorted[0];

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
            <strong>{formatMoney(offerValue(best, priceMode), market)}</strong>
          </div>
        )}
      </div>

      <div className="comparison-toolbar is-compact">
        <span className="toolbar-updated">
          <Clock3 size={13} />
          {t('comparison.updated')} {relativeTime(comparison.updatedAt)}
        </span>
      </div>

      {best ? (
        <>
          <MetricComparison offers={sorted} market={market} priceMode={priceMode} />
          <div className="offer-table">
            <div className="offer-table-head">
              <span className="col-rank">#</span>
              <span>{t('comparison.seller')}</span>
              <span className="col-trend">{t('comparison.trend')}</span>
              <span className="col-price">{t(`controls.${priceMode}.label`)}</span>
            </div>
            {sorted.map((offer, index) => {
              const platform = PLATFORMS[offer.platformId];
              const value = offerValue(offer, priceMode);
              return (
                <a
                  className={`offer-row ${index === 0 ? 'is-best' : ''}`}
                  key={offer.id}
                  href={offer.url}
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
                      <Breakdown offer={offer} country={market} mode={priceMode} />
                      <span className="offer-rating">
                        <span aria-hidden="true">★</span> {offer.rating.toFixed(1)}
                        <span className="review-count">
                          · {new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'zh-CN').format(offer.reviews)} {t('comparison.reviews')}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="offer-trend">
                    <Sparkline values={offer.history} accent={index === 0 ? '#111827' : '#9ca3af'} />
                    <span>{t('comparison.low')} {formatMoney(offer.low30d, market)}</span>
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
          return (
            <button
              className="alternative-card"
              key={item.product.id}
              type="button"
              onClick={() =>
                onAsk(t('comparison.askCheapest', { product: item.product.name, market: i18n.language === 'en' ? MARKETS[item.market].nameEn : MARKETS[item.market].nameZh }))
              }
            >
              <span className="alternative-mascot">
                <Capybara size={54} />
              </span>
              <span className="alternative-copy">
                <span className="alternative-category">{item.product.category}</span>
                <strong>{item.product.name}</strong>
                <span className="alternative-meta">
                  {offer ? (
                    <>
                      {platform?.name || offer.platform} · {formatMoney(offerValue(offer, priceMode), market)}
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
                  {t(`controls.${priceMode}.label`)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
