import { Ear, Headphones, Smartphone, Sparkles } from 'lucide-react';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { priceModeMeta, relativeTime } from '../lib/format';
import { Logo } from './Logo';

interface WelcomeProps {
  market: CountryCode;
  priceMode: PriceMode;
  config: AppConfig | null;
  onAsk: (query: string) => void;
}

const SUGGESTIONS = [
  {
    query: 'Sony WH-1000XM5 哪里买最便宜？',
    label: 'Sony XM5 哪里最便宜？',
    description: '六个市场、四个平台一次比完',
    example: '查一下价格',
    category: '降噪耳机',
    Icon: Headphones,
  },
  {
    query: 'iPhone 15 128GB 的到手价是多少？',
    label: 'iPhone 15 到手价',
    description: '把运费、优惠券和标价一起算清',
    example: '算到手价',
    category: '手机',
    Icon: Smartphone,
  },
  {
    query: 'SK-II 神仙水 230ml 比价',
    label: 'SK-II 神仙水比价',
    description: '官方店到底比第三方贵多少',
    example: '比官方店',
    category: '护肤',
    Icon: Sparkles,
  },
  {
    query: 'AirPods Pro 2 现在划算吗？',
    label: 'AirPods Pro 2 划算吗？',
    description: '看当前价是不是近 30 天低点',
    example: '看 30 日低',
    category: '无线耳机',
    Icon: Ear,
  },
];

function formatCount(value: number | undefined): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function Welcome({ market, priceMode, config, onAsk }: WelcomeProps) {
  const marketInfo = MARKETS[market];
  const mode = priceModeMeta(priceMode);
  const gateway = config?.gateway;
  const updatedLabel = gateway?.lastRun
    ? relativeTime(gateway.lastRun.createdAt)
    : '等待首次同步';
  const syncLabel = gateway?.lastRun
    ? updatedLabel === '刚刚'
      ? '刚刚同步'
      : `${updatedLabel}同步`
    : '等待首次同步';

  return (
    <section className="welcome">
      <div className="welcome-inner">
        <div className="welcome-mark" aria-hidden="true">
          <Logo size={38} />
        </div>
        <div className="welcome-eyebrow">
          东南亚比价工作台
          <span className="welcome-eyebrow-dot" />
          {marketInfo.nameZh} · {marketInfo.currency}
        </div>
        <h1>今天想比哪一件？</h1>
        <p className="welcome-lead">
          直接说商品。Picolah 会查本地价格库，把六个市场的在售价、运费和券后价摊开，
          再告诉你值不值得买。
        </p>

        <div className="welcome-meta" aria-label="价格库概况">
          <span className="welcome-meta-item welcome-meta-live">
            <span className="status-dot" />
            价格库在线
          </span>
          <span className="welcome-meta-sep" />
          <span className="welcome-meta-item">{formatCount(gateway?.markets ?? 6)} 个市场</span>
          <span className="welcome-meta-item">{formatCount(gateway?.offers)} 条在售价</span>
          <span className="welcome-meta-item">{syncLabel}</span>
          <span className="welcome-meta-sep" />
          <span className="welcome-meta-item">
            当前口径 <b>{mode.label}</b>
          </span>
        </div>

        <div className="prompt-grid">
          {SUGGESTIONS.map(({ query, label, description, example, category, Icon }, index) => (
            <button
              className="prompt-card"
              key={query}
              type="button"
              onClick={() => onAsk(query)}
              style={{ animationDelay: `${index * 55}ms` }}
            >
              <span className="prompt-icon" aria-hidden="true">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <span className="prompt-copy">
                <span className="prompt-kicker">{category}</span>
                <strong>{label}</strong>
                <span className="prompt-desc">{description}</span>
                <span className="prompt-example">{example}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="welcome-note">
          <Sparkles size={13} />
          <span>独立爬虫同步价格。网站只读价格库，不直接抓取平台页面。</span>
        </div>
      </div>
    </section>
  );
}
