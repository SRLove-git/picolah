import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReelFeedItem } from '../../shared/reels';
import type { CountryCode } from '../../shared/types';
import { getReelFeed } from './reels-api';

interface FeedState { items: ReelFeedItem[]; index: number; visit: number }

export function useReelFeed(market: CountryCode, initialIndex: number) {
  const [state, setState] = useState<FeedState>({ items: [], index: 0, visit: 0 });
  const current = useRef(state);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const lastAdvance = useRef(false);
  const advancePending = useRef(false);
  const initial = useRef(initialIndex);
  const mounted = useRef(false);
  const currentMarket = useRef(market);
  currentMarket.current = market;

  const commit = useCallback((next: FeedState) => {
    current.current = next;
    setState(next);
  }, []);

  const refresh = useCallback(async (advance = false) => {
    if (!mounted.current || currentMarket.current !== market) return;
    lastAdvance.current = advance;
    advancePending.current = advance;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const version = ++sequence.current;
    const before = current.current;
    const active = before.items[before.index];
    const prefix = advance ? [] : before.items.slice(0, before.index + 1);
    setLoading(true);
    setError(false);
    try {
      let feed = await getReelFeed(market, advance ? active ? [active.id] : [] : prefix.map((item) => item.id), controller.signal);
      // With a one-item remaining catalog, start a new viewing session on replay.
      if (advance && !feed.items.length && active) feed = await getReelFeed(market, [], controller.signal);
      if (controller.signal.aborted || version !== sequence.current) return;
      const latest = current.current;
      if (active && !advance) {
        // Keep the active card and all already visited cards stable while reranking the queue.
        const stable = latest.items.slice(0, latest.index + 1);
        commit({ ...latest, items: [...stable, ...feed.items.filter((item) => !stable.some((old) => old.id === item.id))] });
      } else {
        const index = active || advance ? 0 : Math.min(Math.max(initial.current, 0), Math.max(0, feed.items.length - 1));
        commit({ items: feed.items, index, visit: latest.visit + 1 });
      }
    } catch {
      if (!controller.signal.aborted && version === sequence.current) setError(true);
    } finally {
      if (!controller.signal.aborted && version === sequence.current) {
        advancePending.current = false;
        setLoading(false);
      }
    }
  }, [market, commit]);

  useEffect(() => {
    mounted.current = true;
    commit({ items: [], index: 0, visit: current.current.visit + 1 });
    void refresh();
    return () => { mounted.current = false; advancePending.current = false; ++sequence.current; request.current?.abort(); };
  }, [refresh, commit]);

  const goTo = useCallback((next: number) => {
    if (!mounted.current || currentMarket.current !== market) return;
    const value = current.current;
    if (!value.items.length) return;
    if (next >= value.items.length) { void refresh(true); return; }
    const index = next < 0 ? value.items.length - 1 : next;
    if (index === value.index) return;
    commit({ ...value, index, visit: value.visit + 1 });
    void refresh();
  }, [commit, refresh, market]);

  const update = useCallback((item: ReelFeedItem, patch: Partial<ReelFeedItem>) => {
    if (!mounted.current || currentMarket.current !== market) return;
    const value = current.current;
    commit({ ...value, items: value.items.map((old) => old.id === item.id ? { ...old, ...patch }
      : patch.following !== undefined && old.handle === item.handle ? { ...old, following: patch.following } : old) });
    void refresh();
  }, [commit, refresh, market]);

  const hide = useCallback((id: string) => {
    if (!mounted.current || currentMarket.current !== market) return;
    const value = current.current;
    const activeId = value.items[value.index]?.id;
    const items = value.items.filter((item) => item.id !== id);
    const removesActive = activeId === id;
    const index = removesActive ? Math.min(value.index, Math.max(0, items.length - 1))
      : Math.max(0, items.findIndex((item) => item.id === activeId));
    commit({ items, index, visit: value.visit + (removesActive ? 1 : 0) });
    void refresh();
  }, [commit, refresh, market]);

  const retry = useCallback(() => refresh(lastAdvance.current), [refresh]);
  // A final watch may finish storing while navigation is loading the next
  // cycle. Preserve that pending advance; otherwise only rerank queued cards.
  const rerankAfterWatch = useCallback(() => { void refresh(advancePending.current); }, [refresh]);
  return { ...state, loading, error, refresh, retry, rerankAfterWatch, goTo, update, hide };
}
