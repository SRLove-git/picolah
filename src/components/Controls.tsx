import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  ChevronDown,
  CircleDollarSign,
  Tag,
  TrendingDown,
  Truck,
  Wallet,
} from 'lucide-react';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { COUNTRY_LIST, MARKETS } from '../../shared/types';
import { PRICE_MODES, priceModeMeta } from '../lib/format';
import { CountryFlag } from './CountryFlag';
import { Capybara } from './PicolahMark';

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

export function UtilityBar({
  config,
  market,
  unread,
  onOpenNotifications,
  onOpenProfile,
  onOpenMarket,
}: {
  config: AppConfig | null;
  market: CountryCode;
  unread?: boolean;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenMarket?: () => void;
}) {
  const marketInfo = MARKETS[market];
  const offers = config?.gateway.offers;
  const marketContent = (
    <>
      <CountryFlag code={market} width={17} />
      <span>{marketInfo.nameZh}</span>
      <small>{marketInfo.currency}</small>
    </>
  );

  return (
    <div className="pc-utility">
      <span className={`pc-live-pill ${config ? 'is-live' : ''}`} title="独立爬虫数据源状态">
        <i />
        {config ? '价格库在线' : '正在连接'}
        {typeof offers === 'number' && (
          <b>{new Intl.NumberFormat('zh-CN').format(offers)} 条</b>
        )}
      </span>
      {onOpenMarket ? (
        <button type="button" className="pc-utility-market" onClick={onOpenMarket} title="默认市场">
          {marketContent}
        </button>
      ) : (
        <span className="pc-utility-market is-static" title="当前默认市场">
          {marketContent}
        </span>
      )}
      <button
        type="button"
        className="pc-icon-button pc-bell"
        onClick={onOpenNotifications}
        aria-label="通知"
      >
        <Bell size={18} />
        {unread && <i className="pc-unread-dot" />}
      </button>
      <button
        type="button"
        className="pc-avatar-button"
        onClick={onOpenProfile}
        aria-label="打开个人主页"
      >
        <Capybara variant="face" size={38} />
      </button>
    </div>
  );
}

export function IconStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <span className="pc-icon-stat">
      <span className="pc-icon-stat-icon">{icon}</span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </span>
  );
}

export function CircleDollar() {
  return <CircleDollarSign size={16} />;
}
