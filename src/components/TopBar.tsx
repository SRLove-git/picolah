import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Menu,
  Plus,
  Sparkles,
  Tag,
  TrendingDown,
  Truck,
  Wallet,
} from 'lucide-react';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { COUNTRY_LIST, MARKETS } from '../../shared/types';
import { PRICE_MODES } from '../lib/format';
import { CountryFlag } from './CountryFlag';

const PRICE_ICONS = {
  landed: Wallet,
  item: Tag,
  shipping: Truck,
  history: TrendingDown,
} as const;

interface TopBarProps {
  title: string | null;
  config: AppConfig | null;
  market: CountryCode;
  priceMode: PriceMode;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  onOpenSidebar: () => void;
  onNew: () => void;
}

function MarketSelect({
  market,
  onChange,
}: {
  market: CountryCode;
  onChange: (market: CountryCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = MARKETS[market];

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="market-select" ref={rootRef}>
      <button
        className={`market-trigger ${open ? 'is-open' : ''}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="选择市场"
      >
        <CountryFlag code={market} width={19} />
        <span className="market-label">
          <span>{current.nameZh}</span>
          <small>{current.currency}</small>
        </span>
        <ChevronDown size={14} className={open ? 'chevron-up' : ''} />
      </button>

      {open && (
        <div className="market-menu" role="listbox" aria-label="东南亚市场">
          <div className="market-menu-head">
            <span>选择市场</span>
            <span className="mono-tag">SEA · 06</span>
          </div>
          {COUNTRY_LIST.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={item.code === market}
              key={item.code}
              className={`market-option ${item.code === market ? 'is-selected' : ''}`}
              onClick={() => {
                onChange(item.code);
                setOpen(false);
              }}
            >
              <span className="market-option-flag" aria-hidden="true">
                <CountryFlag code={item.code} width={19} />
              </span>
              <span className="market-option-copy">
                <span>{item.nameZh}</span>
                <small>{item.nameEn}</small>
              </span>
              <span className="market-option-currency">{item.currency}</span>
              {item.code === market && <Check size={14} className="market-check" />}
            </button>
          ))}
          <div className="market-menu-foot">价格按本地货币展示，不自动换汇</div>
        </div>
      )}
    </div>
  );
}

export function TopBar({
  title,
  config,
  market,
  priceMode,
  onMarketChange,
  onPriceModeChange,
  onOpenSidebar,
  onNew,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="mobile-menu-btn" onClick={onOpenSidebar} aria-label="打开对话历史">
          <Menu size={18} />
        </button>
        <div className="topbar-workspace">
          <span className="topbar-kicker">PICOLAH / WORKSPACE</span>
          <span className="topbar-title">{title || '比价工作台'}</span>
        </div>
      </div>

      <div className="price-tabs" role="group" aria-label="价格口径">
        {PRICE_MODES.map((mode) => {
          const Icon = PRICE_ICONS[mode.id];
          return (
            <button
              type="button"
              key={mode.id}
              className={`price-tab ${priceMode === mode.id ? 'is-active' : ''}`}
              onClick={() => onPriceModeChange(mode.id)}
              title={mode.hint}
              aria-pressed={priceMode === mode.id}
            >
              <Icon size={13} strokeWidth={1.9} />
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>

      <div className="topbar-right">
        <span
          className={`topbar-status ${config ? 'is-online' : 'is-connecting'}`}
          title={config ? `价格库连接正常 · ${config.gateway.offers} 条在售报价` : '正在连接价格库'}
        >
          <span className="status-dot" />
          {config ? '价格库在线' : '正在连接'}
        </span>
        <div
          className={`model-pill ${config?.llmConfigured ? 'is-live' : 'is-local'}`}
          title={
            config?.llmConfigured
              ? `${config.llmProvider} · ${config.llmModel}。比价建议由大模型生成。`
              : '当前使用本地比价摘要。配置 LLM_API_KEY 后自动切换为大模型回答。'
          }
        >
          <Sparkles size={14} />
          <span className="model-name">
            {config?.llmConfigured ? config.llmProvider : 'Picolah AI'}
          </span>
          <span className="model-dot" />
        </div>
        <MarketSelect market={market} onChange={onMarketChange} />
        <button className="topbar-new" type="button" onClick={onNew}>
          <Plus size={15} strokeWidth={2.1} />
          <span>新对话</span>
        </button>
      </div>
    </header>
  );
}
