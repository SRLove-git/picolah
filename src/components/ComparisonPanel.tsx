import { ArrowUpRight, BadgeCheck, Clock3, Info } from 'lucide-react';
import type { ComparisonAlternative, CountryCode, Offer, PriceMode } from '../../shared/types';
import { MARKETS, PLATFORMS } from '../../shared/types';
import {
  formatMoney,
  offerValue,
  priceModeMeta,
  relativeTime,
  sortOffers,
} from '../lib/format';
import { PlatformBadge } from './PlatformBadge';
import { ProductArt } from './ProductArt';
import { Sparkline } from './Sparkline';
import { CountryFlag } from './CountryFlag';

interface ComparisonPanelProps {
  comparison: import('../../shared/types').Comparison;
  priceMode: PriceMode;
}

function Breakdown({ offer, country, mode }: { offer: Offer; country: CountryCode; mode: PriceMode }) {
  return (
    <span className="offer-breakdown">
      <span className={mode === 'item' ? 'is-active-metric' : ''}>
        商品 {formatMoney(offer.itemPrice, country)}
      </span>
      <span className="breakdown-dot" />
      <span className={mode === 'shipping' ? 'is-active-metric' : ''}>
        运费 {offer.shippingFee > 0 ? formatMoney(offer.shippingFee, country) : '包邮'}
      </span>
      {offer.discount > 0 && (
        <>
          <span className="breakdown-dot" />
          <span className="breakdown-discount">券 −{formatMoney(offer.discount, country)}</span>
        </>
      )}
    </span>
  );
}

export function ComparisonPanel({ comparison, priceMode }: ComparisonPanelProps) {
  const { product, market } = comparison;
  if (!product) return null;

  const mode = priceModeMeta(priceMode);
  const marketInfo = MARKETS[market];
  const sorted = sortOffers(comparison.offers, priceMode);
  const best = sorted[0];
  const second = sorted[1];
  const diff = best && second ? offerValue(second, priceMode) - offerValue(best, priceMode) : 0;

  return (
    <div className="comparison-card">
      <div className="comparison-glow" aria-hidden="true" />
      <div className="comparison-head">
        <div className="product-art-wrap">
          <ProductArt visual={product.visual} size={78} />
          <span className="product-art-badge">{product.brand}</span>
        </div>
        <div className="product-copy">
          <div className="product-overline">
            <span>{product.category}</span>
            <span className="overline-dot" />
            <span className="country-inline">
              <CountryFlag code={market} width={14} />
              {marketInfo.nameZh}
            </span>
            <span className="overline-dot" />
            <span>{comparison.offers.length} 个平台</span>
          </div>
          <h3>{product.name}</h3>
          <p>
            {product.tagline} <span className="spec-divider">·</span> {product.specs}
          </p>
        </div>
        {best && (
          <div className="headline-price">
            <span className="headline-label">{mode.bestLabel}</span>
            <strong>{formatMoney(offerValue(best, priceMode), market)}</strong>
            <span className="headline-diff">
              {second ? (
                diff > 0 ? (
                  <>
                    比次低省 <b>{formatMoney(diff, market)}</b>
                  </>
                ) : (
                  '与次低同价'
                )
              ) : (
                '当前唯一在售'
              )}
            </span>
          </div>
        )}
      </div>

      <div className="comparison-toolbar">
        <span className="toolbar-source">
          <span className="status-dot" />
          {comparison.sourceCount} 个平台 · {comparison.offers.length} 条本市场报价
        </span>
        <span className="toolbar-updated">
          <Clock3 size={13} />
          更新于 {relativeTime(comparison.updatedAt)}
        </span>
      </div>

      {best ? (
        <>
          <div className="offer-table">
            <div className="offer-table-head">
              <span className="col-rank">#</span>
              <span>在售平台 / 店铺</span>
              <span className="col-trend">近 30 天</span>
              <span className="col-price">{mode.label}</span>
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
                          官方
                        </span>
                      )}
                      {index === 0 && <span className="best-tag">最低</span>}
                    </div>
                    <div className="offer-subline">
                      <Breakdown offer={offer} country={market} mode={priceMode} />
                      <span className="offer-rating">
                        <span aria-hidden="true">★</span> {offer.rating.toFixed(1)}
                        <span className="review-count">
                          · {new Intl.NumberFormat('zh-CN').format(offer.reviews)} 评价
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="offer-trend">
                    <Sparkline values={offer.history} accent={index === 0 ? '#111827' : '#9ca3af'} />
                    <span>30日低 {formatMoney(offer.low30d, market)}</span>
                  </div>
                  <div className="offer-price">
                    <strong>{formatMoney(value, market)}</strong>
                    <span className="offer-link">
                      去平台
                      <ArrowUpRight size={13} />
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
          <div className="comparison-foot">
            <span className="foot-definition">
              <Info size={13} />
              {mode.hint}
            </span>
            <span className="foot-scope">
              本市场 {comparison.offers.length} 条 <span className="foot-slash">/</span> 全区{' '}
              {comparison.totalOffers} 条
            </span>
          </div>
        </>
      ) : (
        <div className="comparison-empty">
          <span className="empty-orbit" aria-hidden="true" />
          <div>
            <strong>{marketInfo.nameZh}暂时没有在售报价</strong>
            <p>价格库还没有覆盖这个市场，或者报价刚刚下架。可以切换市场，或看看下面的同类选择。</p>
          </div>
        </div>
      )}
      <div className="comparison-disclaimer">
        价格由独立爬虫数据源同步，仅作比价参考；下单前请以商家页面为准。
      </div>
    </div>
  );
}

export function AlternativeGrid({
  alternatives,
  market,
  priceMode,
  onAsk,
  title = '也可以看看',
}: {
  alternatives: ComparisonAlternative[];
  market: CountryCode;
  priceMode: PriceMode;
  onAsk: (query: string) => void;
  title?: string;
}) {
  if (!alternatives.length) return null;
  const mode = priceModeMeta(priceMode);
  const marketInfo = MARKETS[market];

  return (
    <div className="alternatives">
      <div className="alternatives-head">
        <span>{title}</span>
        <small>{marketInfo.nameZh} · 当前市场</small>
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
                onAsk(`${item.product.name} 在${MARKETS[item.market].nameZh}哪里买最便宜？`)
              }
            >
              <ProductArt visual={item.product.visual} size={58} />
              <span className="alternative-copy">
                <span className="alternative-category">{item.product.category}</span>
                <strong>{item.product.name}</strong>
                <span className="alternative-meta">
                  {offer ? (
                    <>
                      {platform?.name || offer.platform} · {formatMoney(offerValue(offer, priceMode), market)}
                    </>
                  ) : (
                    '暂无报价'
                  )}
                </span>
              </span>
              <span className="alternative-arrow">
                <ArrowUpRight size={15} />
              </span>
              {offer && (
                <span className="alternative-mode">
                  {mode.short}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
