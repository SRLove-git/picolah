import { useCallback, useEffect, useRef, useState } from 'react';
import type { Reel, ReelEventInput, ReelEventType } from '../../shared/reels';
import type { CountryCode } from '../../shared/types';
import { ReelClock } from './reel-clock';
import { recordReelEvent, reelEventId } from './reels-api';

interface PlaybackSession {
  id: string;
  reelId: string;
  market: CountryCode;
  clock: ReelClock;
  started: boolean;
  lastWatchMs: number;
  ended: boolean;
  sync: () => void;
  flush: (ended: boolean) => void;
}

export function useReelPlayback({ reel, market, visit, playing, mediaPlaying, onComplete, onFinalWatchSaved }: {
  reel: Reel | undefined;
  market: CountryCode;
  visit: number;
  playing: boolean;
  mediaPlaying: boolean;
  onComplete: () => void;
  onFinalWatchSaved: () => void;
}) {
  const session = useRef<PlaybackSession | null>(null);
  const pending = useRef(new Map<string, ReelEventInput>());
  const mounted = useRef(false);
  const pageActive = useRef(true);
  const [progress, setProgress] = useState(0);
  const [visiblePlaying, setVisiblePlaying] = useState(false);
  const [trackingFailed, setTrackingFailed] = useState(false);
  const [resume, setResume] = useState(0);
  const desired = useRef({ playing, mediaPlaying, onComplete, onFinalWatchSaved, market });
  desired.current = { playing, mediaPlaying, onComplete, onFinalWatchSaved, market };

  const send = useCallback(async (event: ReelEventInput) => {
    pending.current.set(event.eventId, event);
    try {
      await recordReelEvent(event, true);
      pending.current.delete(event.eventId);
      if (mounted.current && !pending.current.size) setTrackingFailed(false);
      // Navigation can render the next card before this POST is committed.
      // Re-rank only after that commit (including a successful exact retry),
      // using the current callback so an earlier session cannot restore a stale queue.
      if (mounted.current && pageActive.current && event.market === desired.current.market
        && event.type === 'watch' && event.ended) desired.current.onFinalWatchSaved();
    } catch {
      if (mounted.current) setTrackingFailed(true);
    }
  }, []);

  const retryTracking = useCallback(() => {
    for (const event of pending.current.values()) void send(event);
  }, [send]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    setProgress(0);
    setVisiblePlaying(false);
    if (!reel) return;
    let disposed = false;
    let ready = false;
    let leavingPage = false;
    const duration = reel.durationMs;
    const hasVideo = Boolean(reel.videoUrl);
    const value: PlaybackSession = {
      id: reelEventId(), reelId: reel.id, market,
      clock: new ReelClock(duration), started: false, lastWatchMs: -1, ended: false,
      sync: () => {}, flush: () => {},
    };
    session.current = value;

    value.flush = (ended) => {
      if (!value.started) return;
      const watchMs = Math.floor(value.clock.read(performance.now()));
      if (watchMs === value.lastWatchMs && (!ended || value.ended)) return;
      value.lastWatchMs = watchMs;
      value.ended ||= ended;
      void send({ eventId: reelEventId(), sessionId: value.id, reelId: value.reelId,
        market, type: 'watch', watchMs, ended: value.ended });
    };

    value.sync = () => {
      if (disposed || !ready) return;
      const running = !value.ended && !leavingPage && document.visibilityState === 'visible'
        && desired.current.playing && (!hasVideo || desired.current.mediaPlaying);
      value.clock.setRunning(running, performance.now());
      setVisiblePlaying(running);
      if (running && !value.started) {
        value.started = true;
        void send({ eventId: reelEventId(), sessionId: value.id, reelId: value.reelId, market, type: 'view' });
      }
      if (!running) value.flush(false);
      if (!hasVideo) {
        const elapsed = value.clock.read(performance.now());
        setProgress(Math.min(100, elapsed / duration * 100));
        if (elapsed >= duration && !value.ended) {
          value.clock.setRunning(false, performance.now());
          value.flush(true);
          setVisiblePlaying(false);
          desired.current.onComplete();
        }
      }
    };

    // StrictMode tears down its first setup synchronously. Deferring the first
    // start prevents that probe from creating a phantom view or ended session.
    queueMicrotask(() => { if (!disposed) { ready = true; value.sync(); } });
    const timer = window.setInterval(value.sync, 100);
    const heartbeat = window.setInterval(() => value.flush(false), 4_000);
    const visibility = () => value.sync();
    const pagehide = () => {
      leavingPage = true;
      pageActive.current = false;
      value.clock.setRunning(false, performance.now());
      value.flush(true);
      setVisiblePlaying(false);
    };
    const pageshow = () => {
      if (!leavingPage) return;
      leavingPage = false;
      pageActive.current = true;
      // A page restored from the back-forward cache begins a new visit; the
      // session sent when leaving must remain ended on the server.
      setResume((count) => count + 1);
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', pageshow);
    window.addEventListener('online', retryTracking);
    return () => {
      disposed = true;
      value.clock.setRunning(false, performance.now());
      value.flush(true);
      window.clearInterval(timer);
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
      window.removeEventListener('online', retryTracking);
      if (session.current === value) session.current = null;
    };
  }, [reel?.id, reel?.durationMs, reel?.videoUrl, market, visit, resume, send, retryTracking]);

  useEffect(() => { session.current?.sync(); }, [playing, mediaPlaying]);

  const createEvent = useCallback((type: ReelEventType): ReelEventInput | null => {
    const value = session.current;
    return value ? { eventId: reelEventId(), sessionId: value.id, reelId: value.reelId, market: value.market, type } : null;
  }, []);

  const mediaEnded = useCallback(() => {
    const value = session.current;
    if (!value || value.ended) return;
    value.clock.setRunning(false, performance.now());
    value.flush(true);
    setProgress(100);
    setVisiblePlaying(false);
    desired.current.onComplete();
  }, []);

  return { progress, setProgress, visiblePlaying, trackingFailed, retryTracking, createEvent, mediaEnded };
}
