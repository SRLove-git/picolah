import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Search, Sparkles, TrendingUp } from 'lucide-react';
import type { AppConfig, CountryCode } from '../../shared/types';
import { PRODUCTS } from '../../shared/catalog';
import { UtilityBar } from './Controls';
import { PageHeader } from './PageHeader';
import { Capybara } from './PicolahMark';
import { ProductArt } from './ProductArt';

interface SearchViewProps {
  config: AppConfig | null;
  market: CountryCode;
  unread: boolean;
  onAsk: (query: string) => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenSidebar: () => void;
}

const TRENDS = [
  { query: 'Sony WH-1000XM5 哪里买最便宜？', label: 'Sony XM5 六国比价', tag: '耳机', heat: '2.8w' },
  { query: 'iPhone 15 128GB 的到手价是多少？', label: 'iPhone 15 还会再降吗', tag: '手机', heat: '2.1w' },
  { query: 'SK-II 神仙水 230ml 比价', label: '神仙水免税店差价', tag: '护肤', heat: '1.9w' },
  { query: 'AirPods Pro 2 现在划算吗？', label: 'AirPods Pro 2 30 日低', tag: '耳机', heat: '1.5w' },
  { query: '小米智能空气炸锅 6L 比价', label: '越南买空气炸锅', tag: '家电', heat: '1.2w' },
];

const EXPLORE_IDS = [
  'sony-wh1000xm5',
  'iphone-15-128',
  'skii-facial-essence-230',
  'airpods-pro-2',
  'xiaomi-air-fryer-6l',
  'new-balance-530',
];

const CATEGORIES = ['全部', '耳机', '手机', '护肤', '家电', '鞋履'];

const sgd = new Intl.NumberFormat('en-SG', {
  maximumFractionDigits: 0,
});

export function SearchView({
  config,
  market,
  unread,
  onAsk,
  onOpenNotifications,
  onOpenProfile,
  onOpenSidebar,
}: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia('(min-width: 821px)').matches) inputRef.current?.focus();
  }, []);

  const products = PRODUCTS.filter(
    (product) => EXPLORE_IDS.includes(product.id) && (category === '全部' || product.category === category),
  );

  return (
    <section className="pc-page pc-search-page" aria-label="搜索">
      <PageHeader
        eyebrow="EXPLORE"
        title="搜索"
        description="搜商品、品牌或型号，也可以直接从热门开始。"
        onOpenSidebar={onOpenSidebar}
      >
        <UtilityBar
          config={config}
          market={market}
          unread={unread}
          onOpenNotifications={onOpenNotifications}
          onOpenProfile={onOpenProfile}
          onOpenMarket={onOpenProfile}
        />
      </PageHeader>

      <div className="pc-page-body pc-search-body">
        <form
          className="pc-search-hero"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) onAsk(query.trim());
          }}
        >
          <Search size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜商品、品牌或型号，比如 Sony XM5…"
            aria-label="搜索商品"
          />
          <button type="submit" disabled={!query.trim()}>
            pico 一下
          </button>
        </form>

        <div className="pc-search-categories">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? 'is-active' : ''}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="pc-search-columns">
          <section className="pc-search-trends">
            <div className="pc-section-heading">
              <span>
                <TrendingUp size={15} />
                大家最近在比
              </span>
              <small>实时热度</small>
            </div>
            <div className="pc-trend-list">
              {TRENDS.map((trend, index) => (
                <button
                  key={trend.query}
                  type="button"
                  className="pc-trend-row"
                  onClick={() => onAsk(trend.query)}
                >
                  <span className="pc-trend-rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="pc-trend-copy">
                    <strong>{trend.label}</strong>
                    <small>
                      {trend.tag} · {trend.heat} 次查看
                    </small>
                  </span>
                  <span className="pc-trend-arrow">
                    <ArrowUpRight size={15} />
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="pc-search-explore">
            <div className="pc-section-heading">
              <span>
                <Sparkles size={15} />
                值得多看两眼
              </span>
              <small>价格库精选</small>
            </div>
            <div className="pc-explore-grid">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="pc-explore-card"
                  onClick={() => onAsk(`${product.name} 哪里买最便宜？`)}
                >
                  <span className="pc-explore-art">
                    <ProductArt visual={product.visual} size={64} />
                  </span>
                  <span className="pc-explore-copy">
                    <small>{product.category}</small>
                    <strong>{product.name}</strong>
                    <span>S${sgd.format(product.baseSgd)} 起</span>
                  </span>
                  <ArrowUpRight size={14} className="pc-explore-arrow" />
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="pc-search-guide">
          <div className="pc-search-guide-lead">
            <span className="pc-search-guide-mascot">
              <Capybara variant="face" size={48} />
            </span>
            <span>
              <strong>不知道怎么开始？</strong>
              <p>把商品名、型号或一张图丢给 Picolah，剩下的比价交给它。</p>
            </span>
          </div>
          <div className="pc-search-guide-steps">
            <span>
              <b>01</b>
              说商品
            </span>
            <span>
              <b>02</b>
              选市场
            </span>
            <span>
              <b>03</b>
              看到手价
            </span>
          </div>
          <button
            type="button"
            className="pc-primary-button"
            onClick={() => onAsk('Sony WH-1000XM5 哪里买最便宜？')}
          >
            试一个
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
