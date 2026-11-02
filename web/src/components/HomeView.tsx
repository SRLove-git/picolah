import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { Wordmark } from './PicolahMark';
import { PicoRoamer } from './PicoRoamer';
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

  return (
    <section className="pc-home" aria-label={t('home.label')}>
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
          <PicoRoamer />

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
