import { useEffect, useRef, useState } from 'react';
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
import { PRICE_MODES, priceModeMeta } from '../lib/format';
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
        title="切换比价市场"
      >
        <CountryFlag code={market} width={compact ? 16 : 18} />
        <span className="pc-picker-label">
          {compact ? current.currency : current.nameZh}
        </span>
        <ChevronDown size={13} className={open ? 'is-flipped' : ''} />
      </button>

      {open && (
        <div
          className={`pc-picker-menu pc-market-menu ${direction === 'up' ? 'is-up' : ''}`}
          role="listbox"
          aria-label="选择市场"
        >
          <div className="pc-picker-menu-head">
            <span>比价市场</span>
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
                <strong>{item.nameZh}</strong>
                <small>{item.nameEn}</small>
              </span>
              <span className="pc-picker-option-meta">{item.currency}</span>
              {item.code === market && <Check size={14} className="pc-picker-check" />}
            </button>
          ))}
          <div className="pc-picker-menu-foot">价格按本地货币展示，不自动换汇</div>
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
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, () => setOpen(false));
  const mode = priceModeMeta(priceMode);
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
          aria-label="价格口径"
        >
          <div className="pc-picker-menu-head">
            <span>价格口径</span>
            <span className="pc-picker-menu-tag">4 种</span>
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
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
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
  return (
    <div className="pc-mode-tabs" role="group" aria-label="价格口径">
      {PRICE_MODES.map((mode) => {
        const Icon = PRICE_ICONS[mode.id];
        return (
          <button
            type="button"
            key={mode.id}
            className={`pc-mode-tab ${priceMode === mode.id ? 'is-active' : ''}`}
            onClick={() => onChange(mode.id)}
            title={mode.hint}
            aria-pressed={priceMode === mode.id}
          >
            <Icon size={13} strokeWidth={1.9} />
            <span>{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}

