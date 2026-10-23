import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Heart,
  Menu,
  MessageCircle,
  Pause,
  Play,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CountryCode } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { REELS, compactCount } from '../lib/reels';
import { Capybara } from './PicolahMark';
import { ProductArt } from './ProductArt';

interface ReelsViewProps {
  market: CountryCode;
  initialIndex?: number;
  onAsk: (query: string) => void;
  onOpenSidebar: () => void;
  notify: (message: string) => void;
}

function ReelProgress({
  count,
  index,
  playing,
  onSelect,
  onComplete,
}: {
  count: number;
  index: number;
  playing: boolean;
  onSelect: (index: number) => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
  }, [index]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(100, value + 0.8));
    }, 130);
    return () => window.clearInterval(timer);
  }, [playing, index]);

  useEffect(() => {
    if (!playing || progress < 100) return;
    const timer = window.setTimeout(onComplete, 220);
    return () => window.clearTimeout(timer);
  }, [playing, progress, onComplete]);

  return (
    <div className="pc-reel-progress" role="group" aria-label={t('reels.progress')}>
      {Array.from({ length: count }, (_, itemIndex) => (
        <button
          key={itemIndex}
          type="button"
          className="pc-reel-segment"
          onClick={() => onSelect(itemIndex)}
          aria-label={t('reels.clip', { count: itemIndex + 1 })}
        >
          <span
            style={{
              width: itemIndex < index ? '100%' : itemIndex === index ? `${progress}%` : '0%',
            }}
          />
        </button>
      ))}
    </div>
  );
}

export function ReelsView({
  market,
  initialIndex = 0,
  onAsk,
  onOpenSidebar,
  notify,
}: ReelsViewProps) {
  const { t, i18n } = useTranslation();
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), REELS.length - 1));
  const [playing, setPlaying] = useState(true);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [muted, setMuted] = useState(true);
  const [following, setFollowing] = useState<Record<string, boolean>>({});

  const reel = REELS[index];
  const isLiked = Boolean(liked[reel.id]);
  const isSaved = Boolean(saved[reel.id]);
  const isFollowing = Boolean(following[reel.handle]);

  const goTo = (next: number) => {
    setIndex((next + REELS.length) % REELS.length);
  };

  const nextReel = useCallback(() => {
    setIndex((value) => (value + 1) % REELS.length);
  }, []);

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#reels`);
      notify(t('reels.linkCopied'));
    } catch {
      notify(t('reels.linkFailed'));
    }
  }

  return (
    <section className="pc-reels" aria-label={t('reels.label')}>
      <div
        className="pc-reels-ambient"
        aria-hidden="true"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${reel.gradient[0]}66, transparent 45%),
            radial-gradient(circle at 20% 80%, ${reel.gradient[1]}44, transparent 40%)`,
        }}
      />

      <header className="pc-reels-head">
        <button
          type="button"
          className="pc-reels-menu"
          onClick={onOpenSidebar}
          aria-label={t('reels.openNav')}
        >
          <Menu size={19} />
        </button>
        <div className="pc-reels-title">
          <span className="pc-reels-title-icon">
            <Clapperboard size={19} />
          </span>
          <div>
            <h1>Reels</h1>
            <p>{t('reels.subtitle')}</p>
          </div>
        </div>
        <div className="pc-reels-head-actions">
          <span className="pc-reels-auto">{t(playing ? 'reels.autoplay' : 'reels.paused')}</span>
          <button
            type="button"
            className="pc-reels-round"
            onClick={() => setPlaying((value) => !value)}
            aria-label={t(playing ? 'reels.pause' : 'reels.play')}
          >
            {playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
          </button>
          <button
            type="button"
            className="pc-reels-round"
            onClick={() => {
              setMuted((value) => !value);
              notify(t(muted ? 'reels.soundDemo' : 'reels.muted'));
            }}
            aria-label={t(muted ? 'reels.soundOn' : 'reels.mute')}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </header>

      <div className="pc-reels-stage">
        <button
          type="button"
          className="pc-reels-nav pc-reels-prev"
          onClick={() => goTo(index - 1)}
          aria-label={t('reels.prev')}
        >
          <ChevronUp size={20} />
        </button>

        <article
          className="pc-reel"
          style={
            {
              '--reel-accent': reel.accent,
              background: `linear-gradient(155deg, ${reel.gradient[0]} 0%, ${reel.gradient[1]} 62%, #fff7ef 100%)`,
            } as React.CSSProperties
          }
        >
          <div className="pc-reel-grain" aria-hidden="true" />
          <div className="pc-reel-top">
            <ReelProgress
              count={REELS.length}
              index={index}
              playing={playing}
              onSelect={goTo}
              onComplete={nextReel}
            />
            <div className="pc-reel-topline">
              <span className="pc-reel-tag">
                <Sparkles size={11} />
                {t('reels.review')}
              </span>
              <span className="pc-reel-index">
                {String(index + 1).padStart(2, '0')} / {String(REELS.length).padStart(2, '0')}
              </span>
            </div>
          </div>

          <div className="pc-reel-scene" aria-hidden="true">
            <span className="pc-reel-orb pc-reel-orb-1" />
            <span className="pc-reel-orb pc-reel-orb-2" />
            <span className="pc-reel-ring" />
            <div className={`pc-reel-art ${playing ? 'is-playing' : ''}`}>
              <ProductArt visual={reel.visual} size={280} />
            </div>
            <span className="pc-reel-price-tag">
              <small>{t('reels.todayLow')}</small>
              <strong>{reel.price}</strong>
            </span>
            <span className="pc-reel-market-tag">
              {MARKETS[reel.market].flag} {i18n.language === 'en' ? MARKETS[reel.market].nameEn : MARKETS[reel.market].nameZh}
            </span>
            <span className="pc-reel-sticker">{t('reels.worth')}</span>
          </div>

          <button
            type="button"
            className={`pc-reel-playcenter ${playing ? 'is-playing' : ''}`}
            onClick={() => setPlaying((value) => !value)}
            aria-label={t(playing ? 'reels.pause' : 'reels.play')}
          >
            {playing ? <Pause size={20} /> : <Play size={22} fill="currentColor" />}
          </button>

          <div className="pc-reel-actions">
            <button
              type="button"
              className={`pc-reel-action ${isLiked ? 'is-active' : ''}`}
              onClick={() => setLiked((value) => ({ ...value, [reel.id]: !isLiked }))}
              aria-label={t('reels.like')}
            >
              <span>
                <Heart size={22} fill={isLiked ? 'currentColor' : 'none'} />
              </span>
              <small>{compactCount(reel.likes + (isLiked ? 1 : 0))}</small>
            </button>
            <button
              type="button"
              className="pc-reel-action"
              onClick={() => notify(t('reels.comments', { count: reel.comments }))}
              aria-label={t('reels.comment')}
            >
              <span>
                <MessageCircle size={22} />
              </span>
              <small>{compactCount(reel.comments)}</small>
            </button>
            <button type="button" className="pc-reel-action" onClick={() => void share()} aria-label={t('reels.share')}>
              <span>
                <Send size={21} />
              </span>
              <small>{compactCount(reel.shares)}</small>
            </button>
            <button
              type="button"
              className={`pc-reel-action ${isSaved ? 'is-active pc-reel-saved' : ''}`}
              onClick={() => setSaved((value) => ({ ...value, [reel.id]: !isSaved }))}
              aria-label={t('reels.save')}
            >
              <span>
                <Bookmark size={22} fill={isSaved ? 'currentColor' : 'none'} />
              </span>
              <small>{t('reels.save')}</small>
            </button>
            <span className="pc-reel-avatar">
              <Capybara variant="face" size={30} />
            </span>
          </div>

          <div className="pc-reel-bottom">
            <div className="pc-reel-author">
              <span className="pc-reel-author-avatar">
                <Capybara variant="face" size={36} />
              </span>
              <span className="pc-reel-author-copy">
                <strong>
                  {reel.author}
                  <BadgeCheck size={13} />
                </strong>
                <small>
                  {reel.handle} · {reel.authorTag}
                </small>
              </span>
              <button
                type="button"
                className={`pc-follow ${isFollowing ? 'is-following' : ''}`}
                onClick={() =>
                  setFollowing((value) => ({ ...value, [reel.handle]: !isFollowing }))
                }
              >
                {t(isFollowing ? 'reels.following' : 'reels.follow')}
              </button>
            </div>

            <h2>{reel.title}</h2>
            <p>{reel.caption}</p>
            <span className="pc-reel-tags">{reel.tags}</span>

            <div className="pc-reel-product">
              <span className="pc-reel-product-copy">
                <small>{t('reels.currentDeal')}</small>
                <strong>{reel.productName}</strong>
                <span>{reel.compare}</span>
              </span>
              <button
                type="button"
                className="pc-reel-cta"
                onClick={() => onAsk(`${reel.query}`)}
              >
                <span>{t('reels.compare')}</span>
                <Sparkles size={13} />
              </button>
            </div>
          </div>
        </article>

        <button
          type="button"
          className="pc-reels-nav pc-reels-next"
          onClick={() => goTo(index + 1)}
          aria-label={t('reels.next')}
        >
          <ChevronDown size={20} />
        </button>
      </div>

      <footer className="pc-reels-foot">
        <span>
          {t('reels.currentMarket')} <b>{i18n.language === 'en' ? MARKETS[market].nameEn : MARKETS[market].nameZh}</b> · {t('reels.demoPrice')}
        </span>
        <span>{t('reels.navigate')}</span>
      </footer>
    </section>
  );
}
