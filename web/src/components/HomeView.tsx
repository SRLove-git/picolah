import { useState, type PointerEvent } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { Capybara, Wordmark } from './PicolahMark';
import { PromptComposer } from './PromptComposer';

interface HomeViewProps {
  market: CountryCode;
  priceMode: PriceMode;
  config: AppConfig | null;
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: (message: string, image?: string) => void;
  onStop: () => void;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  onOpenSidebar: () => void;
}

export function HomeView({
  market,
  priceMode,
  config,
  busy,
  inputRef,
  onSend,
  onStop,
  onMarketChange,
  onPriceModeChange,
  onOpenSidebar,
}: HomeViewProps) {
  const { t } = useTranslation();
  const [mascotEngaged, setMascotEngaged] = useState(false);

  function handleMascotMove(event: PointerEvent<HTMLButtonElement>) {
    if (
      event.pointerType !== 'mouse' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.transform = `translate3d(${x * 10}px, ${y * 6}px, 0) rotate(${x * 3}deg)`;
  }

  function resetMascotPosition(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.transform = '';
  }

  function handleMascotClick() {
    setMascotEngaged(true);
    inputRef.current?.focus();
  }

  return (
    <section className="pc-home" aria-label={t('home.label')}>
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
        aria-label={t('home.openNav')}
      >
        <Menu size={19} />
      </button>

      <div className="pc-home-scroll">
        <div className="pc-home-main">
          <div className="pc-hero-mascot">
            <button
              type="button"
              className="pc-hero-mascot-button"
              aria-label={t('home.mascotAction')}
              onPointerMove={handleMascotMove}
              onPointerLeave={resetMascotPosition}
              onClick={handleMascotClick}
            >
              <span className="pc-hero-bubble" aria-live="polite">
                {t(mascotEngaged ? 'home.mascotReady' : 'home.mascotHello')}
              </span>
              <span className="pc-hero-capy-motion">
                <Capybara size={176} className="pc-hero-capy" />
              </span>
            </button>
            <span className="pc-hero-spark pc-hero-spark-a" aria-hidden="true">
              ✦
            </span>
            <span className="pc-hero-spark pc-hero-spark-b" aria-hidden="true">
              ✧
            </span>
          </div>

          <Wordmark size={64} className="pc-hero-wordmark" />
          <p className="pc-hero-tagline">
            {t('home.taglineBefore')}<span>{t('home.taglineWord')}</span>{t('home.taglineAfter')}
          </p>

          <div className="pc-home-prompt">
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
        </div>
      </div>
    </section>
  );
}
