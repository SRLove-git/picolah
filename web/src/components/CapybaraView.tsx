import { CalendarDays, Check, Lock, ShoppingBag, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CAPY_SLOTS, type CapySlot } from '../../shared/capybara';
import { formatMoney, relativeTime } from '../lib/format';
import { useCapybara } from '../lib/capybara';
import { CapyAvatar } from './CapyAvatar';
import { AccessoryPreview } from './CapyAccessoryArt';
import { PageHeader } from './PageHeader';
import { ProductArt } from './ProductArt';
import './capybara.css';

interface CapybaraViewProps {
  onOpenSidebar: () => void;
  notify: (message: string) => void;
}

/**
 * The companion page: how the capybara grew, what it is wearing, and the
 * products the shopper recorded as actually bought.
 */
export function CapybaraView({ onOpenSidebar, notify }: CapybaraViewProps) {
  const { t, i18n } = useTranslation();
  const english = i18n.language.startsWith('en');
  const { view, available, syncing, toggleAccessory, removePurchase } = useCapybara();

  const slotName = (slot: CapySlot) => {
    const info = CAPY_SLOTS.find((entry) => entry.id === slot);
    return english ? info?.nameEn : info?.nameZh;
  };

  const activeRows = view.xpRows.filter((row) => row.count > 0);
  const wornIds = new Set(view.worn.map((accessory) => accessory.id));

  async function handleToggle(id: string) {
    try {
      await toggleAccessory(id);
    } catch {
      notify(t('capybara.toggleFailed'));
    }
  }

  async function handleRemove(id: string) {
    try {
      await removePurchase(id);
    } catch {
      notify(t('capybara.removeFailed'));
    }
  }

  return (
    <div className="pc-page pc-capy-page">
      <PageHeader
        eyebrow={t('capybara.eyebrow')}
        title={t('capybara.title')}
        description={t('capybara.body')}
        onOpenSidebar={onOpenSidebar}
      >
        <div className="pc-capy-head-meta">
          <span className="pc-capy-chip">
            <CalendarDays size={15} strokeWidth={2} />
            {view.createdAt && view.daysTogether > 1
              ? t('capybara.days', { count: view.daysTogether })
              : t('capybara.dayOne')}
          </span>
          {!available && <span className="pc-capy-chip is-muted">{t('capybara.demo')}</span>}
        </div>
      </PageHeader>

      <div className="pc-page-body pc-capy-body">
        <section className={`pc-capy-hero ${view.stage.id === 'legend' ? 'is-legend' : ''}`}>
          <div className="pc-capy-stage">
            <span className="pc-capy-stage-floor" aria-hidden="true" />
            <CapyAvatar view={view} size={320} />
            <div className="pc-capy-stage-copy">
              <strong>{english ? view.stage.nameEn : view.stage.nameZh}</strong>
              <p>{english ? view.stage.taglineEn : view.stage.taglineZh}</p>
            </div>
          </div>

          <div className="pc-capy-level">
            <div className="pc-capy-level-head">
              <span className="pc-eyebrow">{t('capybara.stage')}</span>
              <span className="pc-capy-level-num">{t('capybara.level', { level: view.level })}</span>
            </div>

            <div
              className="pc-capy-meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={view.span}
              aria-valuenow={view.into}
              aria-label={t('capybara.xp', { into: view.into, span: view.span })}
            >
              <span style={{ width: `${Math.round(view.progress * 100)}%` }} />
            </div>

            <div className="pc-capy-meter-meta">
              <span>{t('capybara.xp', { into: view.into, span: view.span })}</span>
              <span>
                {view.maxed
                  ? t('capybara.maxed')
                  : t('capybara.toNext', { xp: Math.max(0, view.nextLevelAt - view.xp) })}
              </span>
            </div>

            {view.nextStage && (
              <p className="pc-capy-next-stage">
                <Sparkles size={14} strokeWidth={2.2} />
                {t('capybara.nextStage', {
                  stage: english ? view.nextStage.nameEn : view.nextStage.nameZh,
                })}
              </p>
            )}

            <div className="pc-capy-quickstats">
              <span>
                <strong>{view.counts.comparisons}</strong>
                {t('capybara.unitComparisons')}
              </span>
              <span>
                <strong>{view.purchases.length}</strong>
                {t('capybara.unitPurchases')}
              </span>
              <span>
                <strong>{view.worn.length}</strong>
                {t('capybara.unitWorn')}
              </span>
            </div>

            <div className="pc-capy-wearing">
              <span className="pc-eyebrow">{t('capybara.equippedLabel')}</span>
              {view.worn.length === 0 ? (
                <p className="pc-capy-wearing-empty">{t('capybara.wardrobeHint')}</p>
              ) : (
                <ul>
                  {view.worn.map((accessory) => (
                    <li key={accessory.id}>
                      <button
                        type="button"
                        onClick={() => void handleToggle(accessory.id)}
                        disabled={syncing}
                        title={t('capybara.unequip')}
                      >
                        <AccessoryPreview id={accessory.id} className="pc-capy-wearing-glyph" />
                        {english ? accessory.nameEn : accessory.nameZh}
                        <span aria-hidden="true">×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <div className="pc-capy-columns">
          <section className="pc-panel pc-capy-wardrobe">
            <header className="pc-capy-panel-head">
              <div>
                <h2>{t('capybara.wardrobe')}</h2>
                <p>{t('capybara.wardrobeHint')}</p>
              </div>
              <span className="pc-capy-panel-count">
                <Check size={14} strokeWidth={2.4} />
                {t('capybara.wornCount', { count: view.worn.length })}
              </span>
            </header>

            <ul className="pc-capy-wardrobe-grid">
              {view.accessories.map((accessory) => {
                const isWorn = wornIds.has(accessory.id);
                return (
                  <li key={accessory.id}>
                    <button
                      type="button"
                      className={`pc-capy-item ${accessory.unlocked ? '' : 'is-locked'} ${isWorn ? 'is-worn' : ''}`}
                      onClick={() => void handleToggle(accessory.id)}
                      disabled={!accessory.unlocked || syncing}
                      aria-pressed={isWorn}
                      title={
                        accessory.unlocked
                          ? `${english ? accessory.nameEn : accessory.nameZh} · ${slotName(accessory.slot)}`
                          : english
                            ? accessory.unlockLabelEn
                            : accessory.unlockLabelZh
                      }
                    >
                      <span
                        className="pc-capy-item-art"
                        style={{ ['--pc-capy-accent' as string]: accessory.accent }}
                      >
                        <AccessoryPreview id={accessory.id} />
                      </span>
                      <span className="pc-capy-item-copy">
                        <strong>{english ? accessory.nameEn : accessory.nameZh}</strong>
                        <small>
                          {isWorn
                            ? t('capybara.unequip')
                            : accessory.unlocked
                              ? t('capybara.equip')
                              : english
                                ? accessory.unlockLabelEn
                                : accessory.unlockLabelZh}
                        </small>
                      </span>
                      <span className="pc-capy-item-tag">
                        {!accessory.unlocked && <Lock size={12} strokeWidth={2.4} />}
                        {isWorn && <Check size={12} strokeWidth={2.8} />}
                        {slotName(accessory.slot)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="pc-panel pc-capy-purchases">
            <header className="pc-capy-panel-head">
              <div>
                <h2>{t('capybara.purchases')}</h2>
                <p>{t('capybara.purchasesHint')}</p>
              </div>
              <span className="pc-capy-panel-count">
                <ShoppingBag size={14} strokeWidth={2.2} />
                {view.purchases.length}
              </span>
            </header>

            {view.purchases.length === 0 ? (
              <div className="pc-capy-empty">
                <ShoppingBag size={30} strokeWidth={1.6} />
                <p>{t('capybara.purchasesEmpty')}</p>
              </div>
            ) : (
              <ul className="pc-capy-purchase-list">
                {view.purchases.map((purchase) => (
                  <li key={purchase.id}>
                    <ProductArt visual={purchase.product.visual} size={48} />
                    <div className="pc-capy-purchase-copy">
                      <strong>{purchase.product.name}</strong>
                      <span>
                        {purchase.product.brand} · {purchase.market}
                      </span>
                      <small>
                        {purchase.price !== null
                          ? `${t('capybara.price')} ${formatMoney(purchase.price, purchase.market)}`
                          : t('capybara.recorded')}
                        {' · '}
                        {relativeTime(purchase.createdAt)}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="pc-capy-remove"
                      onClick={() => void handleRemove(purchase.id)}
                      disabled={syncing}
                      aria-label={`${t('capybara.remove')} ${purchase.product.name}`}
                      title={t('capybara.remove')}
                    >
                      <Trash2 size={16} strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="pc-panel pc-capy-growth">
          <header className="pc-capy-panel-head">
            <div>
              <h2>{t('capybara.growth')}</h2>
              <p>{t('capybara.growthHint')}</p>
            </div>
            <span className="pc-capy-panel-count is-xp">
              {t('capybara.growthTotal', { xp: view.xp })}
            </span>
          </header>

          {activeRows.length === 0 ? (
            <div className="pc-capy-empty">
              <Sparkles size={28} strokeWidth={1.6} />
              <p>{t('capybara.howBody')}</p>
            </div>
          ) : (
            <ul className="pc-capy-xp-list">
              {activeRows.map((row) => (
                <li key={row.source}>
                  <span className="pc-capy-xp-label">{english ? row.labelEn : row.labelZh}</span>
                  <span className="pc-capy-xp-count">
                    {row.count} × {row.unit}
                  </span>
                  <strong>+{row.xp} XP</strong>
                </li>
              ))}
            </ul>
          )}

          <footer className="pc-capy-how">
            <strong>{t('capybara.howTo')}</strong>
            <p>{t('capybara.howBody')}</p>
            <div className="pc-capy-how-chips">
              {view.xpRows.slice(0, 4).map((row) => (
                <span key={row.source}>
                  {english ? row.labelEn : row.labelZh} <b>+{row.unit}</b>
                </span>
              ))}
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
