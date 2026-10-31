import { ArrowUp, CalendarDays, Check, Lock, NotebookPen, Shirt, ShoppingBag, Sprout, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRef, useState, type KeyboardEvent } from 'react';
import { CAPY_SLOTS, type CapySlot } from '../../shared/capybara';
import { formatMoney, relativeTime } from '../lib/format';
import { useCapybara } from '../lib/capybara';
import { CapyCompanion } from './CapyCompanion';
import { AccessoryPreview } from './CapyAccessoryArt';
import { PageHeader } from './PageHeader';
import { ProductArt } from './ProductArt';
import './capybara.css';
import './capy-room.css';

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
  const [outfitVersion, setOutfitVersion] = useState(0);
  type Panel = 'wardrobe' | 'growth' | 'purchases';
  const [panel, setPanel] = useState<Panel>('wardrobe');
  const roomRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});
  const panels = [
    { id: 'wardrobe' as const, label: english ? 'Wardrobe' : '衣橱', Icon: Shirt },
    { id: 'growth' as const, label: english ? 'Growing up' : '成长', Icon: Sprout },
    { id: 'purchases' as const, label: english ? 'Keepsakes' : '购物记', Icon: ShoppingBag },
  ];
  function openWardrobe() {
    setPanel('wardrobe');
    const tab = tabRefs.current.wardrobe;
    tab?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    tab?.focus({ preventScroll: true });
  }
  function selectWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % panels.length;
    else if (event.key === 'ArrowLeft') next = (index + panels.length - 1) % panels.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = panels.length - 1;
    else return;
    event.preventDefault();
    setPanel(panels[next].id);
    tabRefs.current[panels[next].id]?.focus();
  }

  const slotName = (slot: CapySlot) => {
    const info = CAPY_SLOTS.find((entry) => entry.id === slot);
    return english ? info?.nameEn : info?.nameZh;
  };

  const activeRows = view.xpRows.filter((row) => row.count > 0);
  const wornIds = new Set(view.worn.map((accessory) => accessory.id));

  async function handleToggle(id: string) {
    try {
      await toggleAccessory(id);
      setOutfitVersion((version) => version + 1);
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
    <div className="pc-page pc-capy-page pc-capy-home-page">
      <PageHeader
        eyebrow="LIFE WITH CAPY"
        title={english ? "Capy's little home" : '卡皮的小窝'}
        description={english ? 'A little room. A little joy. A little time together.' : '一起吃饭、玩耍，把日子过得软乎乎。'}
        onOpenSidebar={onOpenSidebar}
      >
        <div className="pc-capy-head-meta">
          <span className="pc-capy-chip"><CalendarDays size={15} strokeWidth={2} />
            {view.createdAt && view.daysTogether > 1 ? t('capybara.days', { count: view.daysTogether }) : t('capybara.dayOne')}
          </span>
          {!available && <span className="pc-capy-chip is-muted">{t('capybara.demo')}</span>}
        </div>
      </PageHeader>
      <div className="pc-page-body pc-capy-body pc-capy-room-body">
        <section className="pc-capy-room-stage" ref={roomRef} tabIndex={-1} aria-label={english ? "Capy's room" : '卡皮的房间'}>
          <CapyCompanion view={view} size={440} outfitVersion={outfitVersion} room onWardrobe={openWardrobe} />
        </section>
        <aside className="pc-room-notebook">
          <header className="pc-room-notebook-head">
            <div><span className="pc-eyebrow"><NotebookPen size={12} />{english ? 'LITTLE MOMENTS' : '小日子，慢慢记'}</span>
              <h2>{english ? "Capy's journal" : '小窝手帐'}</h2>
            </div>
            <button type="button" className="pc-room-return" onClick={() => {
              roomRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
              roomRef.current?.focus({ preventScroll: true });
            }}><ArrowUp size={14} /><span>{english ? 'Back to Capy' : '回到卡皮'}</span></button>
          </header>
          <div className="pc-room-tabs" role="tablist" aria-label={english ? "Capy's journal" : '小窝手帐'}>
            {panels.map(({ id, label, Icon }, index) => <button key={id} type="button" role="tab"
              id={`capy-tab-${id}`} aria-controls={`capy-panel-${id}`} aria-selected={panel === id}
              tabIndex={panel === id ? 0 : -1} ref={(node) => { tabRefs.current[id] = node; }}
              onClick={() => setPanel(id)} onKeyDown={(event) => selectWithKeyboard(event, index)}>
              <Icon size={16} /><span>{label}</span>
            </button>)}
          </div>
          <section className="pc-panel pc-capy-wardrobe pc-room-panel" id="capy-panel-wardrobe" role="tabpanel" aria-labelledby="capy-tab-wardrobe" hidden={panel !== 'wardrobe'} tabIndex={0}>
            <header className="pc-capy-panel-head">
              <div>
                <h2>{t('capybara.wardrobe')}</h2>
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

          <section className="pc-panel pc-capy-purchases pc-room-panel" id="capy-panel-purchases" role="tabpanel" aria-labelledby="capy-tab-purchases" hidden={panel !== 'purchases'} tabIndex={0}>
            <header className="pc-capy-panel-head">
              <div>
                <h2>{t('capybara.purchases')}</h2>
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
        <section className="pc-panel pc-capy-growth pc-room-panel" id="capy-panel-growth" role="tabpanel" aria-labelledby="capy-tab-growth" hidden={panel !== 'growth'} tabIndex={0}>
          <header className="pc-capy-panel-head">
            <div>
              <h2>{t('capybara.growth')}</h2>
            </div>
            <span className="pc-capy-panel-count is-xp">
              {t('capybara.growthTotal', { xp: view.xp })}
            </span>
          </header>


          <div className="pc-capy-quickstats">
            <span><strong>{view.counts.comparisons}</strong>{t('capybara.unitComparisons')}</span>
            <span><strong>{view.purchases.length}</strong>{t('capybara.unitPurchases')}</span>
            <span><strong>{view.worn.length}</strong>{t('capybara.unitWorn')}</span>
          </div>
          <p className="pc-room-growth-note">{english ? 'Every thoughtful comparison is part of growing together.' : '每次认真比价，都在陪它一点点长大。'}</p>
          <div className="pc-room-stage-note"><strong>{english ? view.stage.nameEn : view.stage.nameZh}</strong>
            <p>{english ? view.stage.taglineEn : view.stage.taglineZh}</p>
            {!view.maxed && <small>{t('capybara.toNext', { xp: Math.max(0, view.nextLevelAt - view.xp) })}</small>}
          </div>

          {activeRows.length > 0 && (
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
        </section>
        </aside>
      </div>
    </div>
  );
}
