import { ArrowRight, Menu, Play, Sparkles, TrendingUp } from 'lucide-react';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { REELS, compactCount } from '../lib/reels';
import { Capybara, Wordmark } from './PicolahMark';
import { ProductArt } from './ProductArt';
import { PromptComposer } from './PromptComposer';

interface HomeViewProps {
  market: CountryCode;
  priceMode: PriceMode;
  config: AppConfig | null;
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: (message: string, image?: string) => void;
  onStop: () => void;
  onAsk: (query: string) => void;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  onOpenReels: (index?: number) => void;
  onOpenSidebar: () => void;
}

const SUGGESTIONS = [
  { label: 'Sony XM5', query: 'Sony WH-1000XM5 哪里买最便宜？', color: '#ef4f7e' },
  { label: 'iPhone 15', query: 'iPhone 15 128GB 的到手价是多少？', color: '#5b9cf5' },
  { label: 'SK-II 神仙水', query: 'SK-II 神仙水 230ml 比价', color: '#9a78f0' },
  { label: 'AirPods Pro 2', query: 'AirPods Pro 2 现在划算吗？', color: '#4fc5a5' },
  { label: '空气炸锅', query: '小米智能空气炸锅 6L 比价', color: '#f2b53c' },
];

export function HomeView({
  market,
  priceMode,
  config,
  busy,
  inputRef,
  onSend,
  onStop,
  onAsk,
  onMarketChange,
  onPriceModeChange,
  onOpenReels,
  onOpenSidebar,
}: HomeViewProps) {
  return (
    <section className="pc-home" aria-label="首页">
      <div className="pc-home-aurora" aria-hidden="true">
        <span className="pc-aurora pc-aurora-pink" />
        <span className="pc-aurora pc-aurora-lilac" />
        <span className="pc-aurora pc-aurora-mint" />
      </div>
      <div className="pc-doodles" aria-hidden="true">
        <span className="pc-doodle pc-doodle-1">✦</span>
        <span className="pc-doodle pc-doodle-2">✧</span>
        <span className="pc-doodle pc-doodle-3">✦</span>
        <span className="pc-doodle pc-doodle-4">♡</span>
        <span className="pc-doodle pc-doodle-5">✧</span>
      </div>

      <button
        type="button"
        className="pc-mobile-menu"
        onClick={onOpenSidebar}
        aria-label="打开导航"
      >
        <Menu size={19} />
      </button>

      <div className="pc-home-scroll">
        <div className="pc-home-main">
          <div className="pc-hero-mascot">
            <span className="pc-hero-bubble">先 pico，再买。</span>
            <Capybara size={176} className="pc-hero-capy" />
            <span className="pc-hero-spark pc-hero-spark-a" aria-hidden="true">
              ✦
            </span>
            <span className="pc-hero-spark pc-hero-spark-b" aria-hidden="true">
              ✧
            </span>
          </div>

          <Wordmark size={64} className="pc-hero-wordmark" />
          <p className="pc-hero-tagline">
            购物之前，<span>PICO</span> 一下
          </p>
          <p className="pc-hero-subline">喜欢的东西，也值得多比一比。</p>

          <div className="pc-home-prompt">
            <div className="pc-home-question">
              <Sparkles size={13} />
              今天想找什么好东西？
            </div>
            <PromptComposer
              variant="hero"
              market={market}
              priceMode={priceMode}
              config={config}
              busy={busy}
              inputRef={inputRef}
              onSend={onSend}
              onStop={onStop}
              onMarketChange={onMarketChange}
              onPriceModeChange={onPriceModeChange}
            />
          </div>

          <div className="pc-suggestions" aria-label="热门搜索">
            <span className="pc-suggestions-label">
              <TrendingUp size={13} />
              大家在比
            </span>
            {SUGGESTIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                className="pc-suggestion"
                onClick={() => onAsk(item.query)}
              >
                <i style={{ background: item.color }} />
                {item.label}
              </button>
            ))}
            <button type="button" className="pc-suggestion-more" onClick={() => onOpenReels()}>
              看测评
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="pc-home-reels">
            <div className="pc-home-reels-head">
              <span>
                <span className="pc-reels-badge">
                  <Play size={9} fill="currentColor" />
                  REELS
                </span>
                商品测评短视频
              </span>
              <button type="button" onClick={() => onOpenReels()}>
                全部 <ArrowRight size={13} />
              </button>
            </div>
            <div className="pc-mini-reels">
              {REELS.slice(0, 3).map((reel, index) => (
                <button
                  key={reel.id}
                  type="button"
                  className="pc-mini-reel"
                  onClick={() => onOpenReels(index)}
                  style={{
                    background: `linear-gradient(135deg, ${reel.gradient[0]}, ${reel.gradient[1]})`,
                  }}
                >
                  <div className="pc-mini-reel-art">
                    <ProductArt visual={reel.visual} size={62} />
                    <span className="pc-mini-reel-play">
                      <Play size={11} fill="currentColor" />
                    </span>
                  </div>
                  <span className="pc-mini-reel-copy">
                    <strong>{reel.shortTitle}</strong>
                    <small>
                      {reel.handle} · {compactCount(reel.likes)} 赞
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="pc-home-foot">
          <span>价格由独立爬虫同步 · Picolah 只展示价格库里的数据</span>
        </footer>
      </div>
    </section>
  );
}
