import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronDown,
  Tag,
  TrendingDown,
  Truck,
  Wallet,
} from 'lucide-react';
import type { CountryCode, PriceMode } from '../../shared/types';
import { COUNTRY_LIST, MARKETS } from '../../shared/types';
import { PRICE_MODES } from '../lib/format';
import { CountryFlag } from './CountryFlag';

const PRICE_ICONS = {
  landed: Wallet,
  item: Tag,
  shipping: Truck,
  history: TrendingDown,
} as const;

function useDismiss(open: boolean, close: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, close]);

  return rootRef;
}

export function MarketPicker({
  market,
  onChange,
  direction = 'up',
  compact = false,
  tone = 'light',
}: {
  market: CountryCode;
  onChange: (market: CountryCode) => void;
  direction?: 'up' | 'down';
  compact?: boolean;
  tone?: 'light' | 'ghost';
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, () => setOpen(false));
  const current = MARKETS[market];

  return (
    <div className={`pc-picker pc-market-picker ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`pc-picker-trigger pc-picker-trigger-${tone}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('controls.changeMarket')}
      >
        <CountryFlag code={market} width={compact ? 16 : 18} />
        <span className="pc-picker-label">
          {compact ? current.currency : i18n.language === 'en' ? current.nameEn : current.nameZh}
        </span>
        <ChevronDown size={13} className={open ? 'is-flipped' : ''} />
      </button>

      {open && (
        <div
          className={`pc-picker-menu pc-market-menu ${direction === 'up' ? 'is-up' : ''}`}
          role="listbox"
          aria-label={t('controls.selectMarket')}
        >
          <div className="pc-picker-menu-head">
            <span>{t('controls.market')}</span>
            <span className="pc-picker-menu-tag">SEA · 06</span>
          </div>
          {COUNTRY_LIST.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={item.code === market}
              key={item.code}
              className={`pc-picker-option ${item.code === market ? 'is-selected' : ''}`}
              onClick={() => {
                onChange(item.code);
                setOpen(false);
              }}
            >
              <CountryFlag code={item.code} width={20} />
              <span className="pc-picker-option-copy">
                <strong>{i18n.language === 'en' ? item.nameEn : item.nameZh}</strong>
                <small>{i18n.language === 'en' ? item.nameZh : item.nameEn}</small>
              </span>
              <span className="pc-picker-option-meta">{item.currency}</span>
              {item.code === market && <Check size={14} className="pc-picker-check" />}
            </button>
          ))}
          <div className="pc-picker-menu-foot">{t('controls.localCurrency')}</div>
        </div>
      )}
    </div>
  );
}

export function PriceModePicker({
  priceMode,
  onChange,
  direction = 'up',
  tone = 'light',
}: {
  priceMode: PriceMode;
  onChange: (mode: PriceMode) => void;
  direction?: 'up' | 'down';
  tone?: 'light' | 'ghost';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, () => setOpen(false));
  const mode = {
    label: t(`controls.${priceMode}.label`),
    hint: t(`controls.${priceMode}.hint`),
  };
  const Icon = PRICE_ICONS[priceMode];

  return (
    <div className={`pc-picker pc-price-picker ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`pc-picker-trigger pc-picker-trigger-${tone}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={mode.hint}
      >
        <Icon size={14} strokeWidth={1.9} />
        <span className="pc-picker-label">{mode.label}</span>
        <ChevronDown size={13} className={open ? 'is-flipped' : ''} />
      </button>

      {open && (
        <div
          className={`pc-picker-menu pc-price-menu ${direction === 'up' ? 'is-up' : ''}`}
          role="listbox"
          aria-label={t('controls.priceBasis')}
        >
          <div className="pc-picker-menu-head">
            <span>{t('controls.priceBasis')}</span>
            <span className="pc-picker-menu-tag">{t('controls.fourTypes')}</span>
          </div>
          {PRICE_MODES.map((item) => {
            const ItemIcon = PRICE_ICONS[item.id];
            return (
              <button
                type="button"
                role="option"
                aria-selected={item.id === priceMode}
                key={item.id}
                className={`pc-picker-option ${item.id === priceMode ? 'is-selected' : ''}`}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
              >
                <span className="pc-picker-option-icon">
                  <ItemIcon size={15} />
                </span>
                <span className="pc-picker-option-copy">
                  <strong>{t(`controls.${item.id}.label`)}</strong>
                  <small>{t(`controls.${item.id}.hint`)}</small>
                </span>
                {item.id === priceMode && <Check size={14} className="pc-picker-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PriceModeTabs({
  priceMode,
  onChange,
}: {
  priceMode: PriceMode;
  onChange: (mode: PriceMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pc-mode-tabs" role="group" aria-label={t('controls.priceBasis')}>
      {PRICE_MODES.map((mode) => {
        const Icon = PRICE_ICONS[mode.id];
        return (
          <button
            type="button"
            key={mode.id}
            className={`pc-mode-tab ${priceMode === mode.id ? 'is-active' : ''}`}
            onClick={() => onChange(mode.id)}
            title={t(`controls.${mode.id}.hint`)}
            aria-pressed={priceMode === mode.id}
          >
            <Icon size={13} strokeWidth={1.9} />
            <span>{t(`controls.${mode.id}.label`)}</span>
          </button>
        );
      })}
    </div>
  );
}

