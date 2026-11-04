import { uiText } from '../lib/ui-copy';
import { Heart, NotebookPen, Shirt, ShoppingBag, Sparkles, Sprout, Trash2, X } from 'lucide-react';
import { Dialog } from '@base-ui/react/dialog';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatMoney, relativeTime } from '../lib/format';
import { useCapybara } from '../lib/capybara';
import { CapyPlayRoom } from './CapyPlayRoom';
import type { CapyRoomPanel, OpenCapyPanel } from './CapyHabitat';
import { CapyJournal, type JournalProtection } from './CapyJournal';
import { CapyWardrobe } from './CapyWardrobe';
import { CapyTryOnGallery } from './CapyTryOnGallery';
import { useTryOnConfig } from '../lib/tryon';
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
  const english = !i18n.language.startsWith('zh');
  const { view, available, syncing, toggleAccessory, removePurchase } = useCapybara();
  const [outfitVersion, setOutfitVersion] = useState(0);
  const [panel, setPanel] = useState<CapyRoomPanel>('wardrobe');
  const [panelOpen, setPanelOpen] = useState(false);
  const [instantPanel, setInstantPanel] = useState(false);
  const [journalProtection, setJournalProtection] = useState<JournalProtection>({ dirty: false, busy: false });
  const [confirmClose, setConfirmClose] = useState(false);
  const [journalVersion, setJournalVersion] = useState(0);
  const tryonEnabled = useTryOnConfig();
  useEffect(() => { if (!journalProtection.dirty) setConfirmClose(false); }, [journalProtection.dirty]);
  const returnFocus = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<CapyRoomPanel, HTMLButtonElement | null>>>({});
  const panels = [
    { id: 'wardrobe' as const, label: english ? uiText('Wardrobe') : '衣橱', Icon: Shirt },
    { id: 'tryon' as const, label: english ? uiText('Try-on') : '试穿', Icon: Sparkles },
    { id: 'growth' as const, label: english ? uiText('Growing up') : '成长', Icon: Sprout },
    { id: 'journal' as const, label: english ? uiText('Diary') : '日记', Icon: NotebookPen },
    { id: 'purchases' as const, label: english ? uiText('Keepsakes') : '购物记', Icon: ShoppingBag },
  ].filter((entry) => entry.id !== 'tryon' || tryonEnabled);
  const openPanel: OpenCapyPanel = (next, trigger, keyboard) => {
    returnFocus.current = trigger;
    setPanel(next);
    setInstantPanel(keyboard);
    setConfirmClose(false);
    setPanelOpen(true);
  };
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

  const activeRows = view.xpRows.filter((row) => row.count > 0);

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
        eyebrow={english ? uiText('MY LITTLE CAPY') : '和卡皮的每一天'}
        title={english ? uiText("Capy's little home") : '卡皮的小窝'}
        onOpenSidebar={onOpenSidebar}
      >
        <div className="pc-capy-head-meta">
          <span className="pc-capy-chip"><Heart size={15} strokeWidth={2} />
            {view.createdAt && view.daysTogether > 1 ? t('capybara.days', { count: view.daysTogether }) : t('capybara.dayOne')}
          </span>
          {!available && <span className="pc-capy-chip is-muted">{t('capybara.demo')}</span>}
        </div>
      </PageHeader>
      <div className="pc-page-body pc-capy-body pc-capy-room-body">
        <section className="pc-capy-room-stage" aria-label={english ? uiText("Capy's room") : '卡皮的房间'}>
          <CapyPlayRoom view={view} outfitVersion={outfitVersion} onOpenPanel={openPanel} roomMenuOpen={panelOpen} />
        </section>
      </div>
      <Dialog.Root open={panelOpen} onOpenChange={(open, details) => {
        if (!open && (journalProtection.dirty || journalProtection.busy)) {
          details.cancel();
          setPanel('journal');
          if (!journalProtection.busy) setConfirmClose(true);
          return;
        }
        setPanelOpen(open);
      }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="pc-room-backdrop" data-instant={instantPanel} />
          <Dialog.Viewport className="pc-room-modal-viewport">
            <Dialog.Popup className="pc-room-notebook pc-room-popup" id="capy-room-journal" data-instant={instantPanel}
              initialFocus={() => tabRefs.current[panel] ?? true} finalFocus={returnFocus}
              onKeyDownCapture={() => setInstantPanel(true)}>
              <header className="pc-room-notebook-head">
                <div><span className="pc-room-book-icon" aria-hidden="true"><NotebookPen size={22} /></span>
                  <Dialog.Title>{english ? uiText("Capy's little journal") : '卡皮的小手帐'}</Dialog.Title>
                </div>
                <Dialog.Close className="pc-room-close" disabled={journalProtection.busy} aria-label={english ? uiText('Back to Capy') : '回到卡皮'} title={english ? uiText('Back to Capy') : '回到卡皮'}><X size={20} /></Dialog.Close>
              </header>
              <div className="pc-room-tabs" role="tablist" aria-label={english ? uiText("Capy's journal") : '小窝手帐'}>
                {panels.map(({ id, label, Icon }, index) => <button key={id} type="button" role="tab"
                  id={`capy-tab-${id}`} aria-controls={`capy-panel-${id}`} aria-selected={panel === id}
                  tabIndex={panel === id ? 0 : -1} ref={(node) => { tabRefs.current[id] = node; }}
                  onClick={() => setPanel(id)} onKeyDown={(event) => selectWithKeyboard(event, index)}>
                  <Icon size={16} /><span>{label}</span>
                </button>)}
              </div>
              {confirmClose && <div className="pc-journal-feedback pc-journal-close-confirm" role="alert">
                <span>{english ? uiText('Your entry has unsaved changes.') : '这篇日记还有没保存的修改。'}</span>
                <button type="button" autoFocus onClick={(event) => {
                  setConfirmClose(false);
                  event.currentTarget.closest('[role="dialog"]')?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
                }}>{english ? uiText('Keep writing') : '继续写'}</button>
                <button type="button" onClick={() => {
                  setJournalVersion((version) => version + 1);
                  setJournalProtection({ dirty: false, busy: false });
                  setConfirmClose(false); setPanelOpen(false);
                }}>{english ? uiText('Discard and close') : '放弃并关闭'}</button>
              </div>}
              <div className="pc-room-panel-scroll">
                <section className="pc-room-panel" id="capy-panel-journal" role="tabpanel" aria-labelledby="capy-tab-journal" hidden={panel !== 'journal'} tabIndex={0}>
                  <CapyJournal key={journalVersion} active={panelOpen && panel === 'journal'} onProtectionChange={setJournalProtection} />
                </section>
                <section className="pc-panel pc-capy-wardrobe pc-room-panel" id="capy-panel-wardrobe" role="tabpanel" aria-labelledby="capy-tab-wardrobe" hidden={panel !== 'wardrobe'} tabIndex={0}>
                  <CapyWardrobe view={view} syncing={syncing} available={available} onToggle={handleToggle} />
                </section>

                <section className="pc-panel pc-capy-tryon pc-room-panel" id="capy-panel-tryon" role="tabpanel" aria-labelledby="capy-tab-tryon" hidden={panel !== 'tryon'} tabIndex={0}>
                  <CapyTryOnGallery />
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
                  <p className="pc-room-growth-note">{english ? uiText('Every thoughtful comparison is part of growing together.') : '每次认真比价，都在陪它一点点长大。'}</p>
                  <div className="pc-room-stage-note"><strong>{english ? uiText(view.stage.nameEn) : view.stage.nameZh}</strong>
                    <p>{english ? uiText(view.stage.taglineEn) : view.stage.taglineZh}</p>
                    {!view.maxed && <small>{t('capybara.toNext', { xp: Math.max(0, view.nextLevelAt - view.xp) })}</small>}
                  </div>

                  {activeRows.length > 0 && (
                    <ul className="pc-capy-xp-list">
                      {activeRows.map((row) => (
                        <li key={row.source}>
                          <span className="pc-capy-xp-label">{english ? uiText(row.labelEn) : row.labelZh}</span>
                          <span className="pc-capy-xp-count">
                            {row.count} × {row.unit}
                          </span>
                          <strong>+{row.xp} XP</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
