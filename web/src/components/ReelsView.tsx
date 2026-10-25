import { useCallback, useEffect, useRef, useState } from 'react';
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
  ThumbsDown,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CountryCode } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import type { ReelEventInput, ReelEventType, ReelFeedItem } from '../../shared/reels';
import { compactCount } from '../lib/reels';
import { recordReelEvent } from '../lib/reels-api';
import { useReelFeed } from '../lib/use-reel-feed';
import { useReelPlayback } from '../lib/use-reel-playback';
import { Capybara } from './PicolahMark';
import { ProductArt } from './ProductArt';
import './reels-feed.css';

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
  progress,
  onSelect,
}: {
  count: number;
  index: number;
  progress: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();

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
  const feed = useReelFeed(market, initialIndex);
  const { items, index, visit, goTo } = feed;
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [pending, setPending] = useState(false);
  const [failedAction, setFailedAction] = useState<{
    event: ReelEventInput; item: ReelFeedItem; patch?: Partial<ReelFeedItem>;
  } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [mediaState, setMediaState] = useState({ key: '', playing: false });
  const reel = items[index];
  const mediaKey = `${market}-${reel?.id}-${visit}`;
  const nextReel = useCallback(() => goTo(index + 1), [goTo, index]);
  const playback = useReelPlayback({ reel, market, visit, playing,
    mediaPlaying: mediaState.key === mediaKey && mediaState.playing, onComplete: nextReel,
    onFinalWatchSaved: feed.rerankAfterWatch });
  const isLiked = reel?.liked ?? false;
  const isSaved = reel?.saved ?? false;
  const isFollowing = reel?.following ?? false;

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    const sync = () => {
      if (playing && document.visibilityState === 'visible') {
        void element.play().catch(() => { if (active) setPlaying(false); });
      } else element.pause();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { active = false; element.pause(); document.removeEventListener('visibilitychange', sync); };
  }, [mediaKey, playing]);

  async function submitAction(action: NonNullable<typeof failedAction>) {
    if (pending) return;
    setPending(true);
    setFailedAction(null);
    try {
      await recordReelEvent(action.event);
      if (action.event.type === 'not_interested') feed.hide(action.item.id);
      else feed.update(action.item, action.patch ?? {});
    } catch {
      setFailedAction(action);
    } finally {
      setPending(false);
    }
  }

  function feedback(type: ReelEventType, patch?: Partial<ReelFeedItem>) {
    const event = playback.createEvent(type);
    if (event && reel) void submitAction({ event, item: reel, patch });
  }

  async function share() {
    const event = playback.createEvent('share');
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#reels`);
      notify(t('reels.linkCopied'));
      if (event) {
        try {
          await recordReelEvent(event, true);
          void feed.refresh();
        } catch { notify(t('reels.activityFailed')); }
      }
    } catch {
      notify(t('reels.linkFailed'));
    }
  }

  function compare() {
    if (!reel) return;
    const event = playback.createEvent('compare');
    if (event) void recordReelEvent(event, true).catch(() => notify(t('reels.activityFailed')));
    onAsk(reel.query);
  }

  return (
    <section className="pc-reels" aria-label={t('reels.label')}>
      {reel && <div
        className="pc-reels-ambient"
        aria-hidden="true"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${reel.gradient[0]}66, transparent 45%),
            radial-gradient(circle at 20% 80%, ${reel.gradient[1]}44, transparent 40%)`,
        }}
      />}

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
            disabled={!reel}
            onClick={() => setPlaying((value) => !value)}
            aria-label={t(playing ? 'reels.pause' : 'reels.play')}
          >
            {playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
          </button>
          <button
            type="button"
            className="pc-reels-round"
            disabled={!reel}
            onClick={() => {
              setMuted((value) => !value);
              if (!reel?.videoUrl) notify(t(muted ? 'reels.soundDemo' : 'reels.muted'));
            }}
            aria-label={t(muted ? 'reels.soundOn' : 'reels.mute')}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </header>

      <div className="pc-reels-feed-status" role="status" aria-live="polite">
        {feed.loading && <span>{t('reels.loading')}</span>}
        {feed.error && <span>{t('reels.loadFailed')} <button onClick={() => void feed.retry()}>{t('reels.retry')}</button></span>}
        {failedAction && <span>{t('reels.actionFailed')} <button disabled={pending} onClick={() => void submitAction(failedAction)}>{t('reels.retry')}</button></span>}
        {playback.trackingFailed && <span>{t('reels.activityFailed')} <button onClick={playback.retryTracking}>{t('reels.retry')}</button></span>}
      </div>
      {!reel && !feed.loading && !feed.error && <div className="pc-reels-empty"><Sparkles size={28} /><h2>{t('reels.emptyTitle')}</h2><p>{t('reels.emptyHint')}</p><button onClick={() => void feed.refresh()}>{t('reels.refresh')}</button></div>}
      {reel && <>
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
          className={`pc-reel ${playback.visiblePlaying ? '' : 'is-paused'} ${reel.videoUrl ? 'has-video' : ''}`}
          data-reel-id={reel.id}
          style={
            {
              '--reel-accent': reel.accent,
              background: `linear-gradient(155deg, ${reel.gradient[0]} 0%, ${reel.gradient[1]} 62%, #fff7ef 100%)`,
            } as React.CSSProperties
          }
        >
          <div className="pc-reel-grain" aria-hidden="true" />
          {reel.videoUrl && <video
            key={mediaKey}
            ref={video}
            className="pc-reel-video"
            src={reel.videoUrl}
            muted={muted}
            playsInline
            preload="metadata"
            onPlaying={() => setMediaState({ key: mediaKey, playing: true })}
            onPause={() => setMediaState({ key: mediaKey, playing: false })}
            onWaiting={() => setMediaState({ key: mediaKey, playing: false })}
            onStalled={() => setMediaState({ key: mediaKey, playing: false })}
            onEnded={playback.mediaEnded}
            onError={() => { setMediaState({ key: mediaKey, playing: false }); setPlaying(false); notify(t('reels.videoFailed')); }}
            onTimeUpdate={(event) => {
              const element = event.currentTarget;
              if (Number.isFinite(element.duration) && element.duration > 0) playback.setProgress(element.currentTime / element.duration * 100);
            }}
          />}
          <div className="pc-reel-top">
            <ReelProgress
              count={items.length}
              index={index}
              progress={playback.progress}
              onSelect={goTo}
            />
            <div className="pc-reel-topline">
              <span className="pc-reel-tag">
                <Sparkles size={11} />
                {t(reel.videoUrl ? 'reels.review' : 'reels.demoClip')}
              </span>
              <span className="pc-reel-index">
                {String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
              </span>
            </div>
            <div className="pc-reel-reason"><span>{t('reels.why')}</span>{i18n.language.startsWith('en') ? reel.reason.labelEn : reel.reason.labelZh}</div>
          </div>

          {!reel.videoUrl && <div className="pc-reel-scene" aria-hidden="true">
            <span className="pc-reel-orb pc-reel-orb-1" />
            <span className="pc-reel-orb pc-reel-orb-2" />
            <span className="pc-reel-ring" />
            <div className={`pc-reel-art ${playback.visiblePlaying ? 'is-playing' : ''}`}>
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
          </div>}

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
              onClick={() => feedback(isLiked ? 'unlike' : 'like', { liked: !isLiked, likes: Math.max(0, reel.likes + (isLiked ? -1 : 1)) })}
              disabled={pending}
              aria-pressed={isLiked}
              aria-label={t('reels.like')}
            >
              <span>
                <Heart size={22} fill={isLiked ? 'currentColor' : 'none'} />
              </span>
              <small>{compactCount(reel.likes)}</small>
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
              onClick={() => feedback(isSaved ? 'unsave' : 'save', { saved: !isSaved })}
              disabled={pending}
              aria-pressed={isSaved}
              aria-label={t('reels.save')}
            >
              <span>
                <Bookmark size={22} fill={isSaved ? 'currentColor' : 'none'} />
              </span>
              <small>{t('reels.save')}</small>
            </button>
            <button type="button" className="pc-reel-action pc-reel-dismiss" disabled={pending} onClick={() => feedback('not_interested')} aria-label={t('reels.notInterested')}><span><ThumbsDown size={20} /></span><small>{t('reels.notInterested')}</small></button>
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
                disabled={pending}
                aria-pressed={isFollowing}
                onClick={() => feedback(isFollowing ? 'unfollow' : 'follow', { following: !isFollowing })}
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
                onClick={compare}
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
      </>}

      <footer className="pc-reels-foot">
        <span>
          {t('reels.currentMarket')} <b>{i18n.language === 'en' ? MARKETS[market].nameEn : MARKETS[market].nameZh}</b> · {t('reels.demoPrice')}
        </span>
        <span>{t('reels.navigate')}</span>
      </footer>
    </section>
  );
}
