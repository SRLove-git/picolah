import { useEffect, useRef, useState } from 'react';

export interface TryOnRecord {
  id: string;
  productKey: string;
  name: string;
  imageUrl?: string;
  provider: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  error: string | null;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TryOnRequestInput {
  productId?: string;
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
}

export interface TryOnStatus {
  state: 'idle' | 'pending' | 'done' | 'failed';
  record: TryOnRecord | null;
  error: string | null;
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!response.ok) {
    const error = new Error(body.message || body.error || `HTTP ${response.status}`);
    (error as Error & { code?: string }).code = body.error;
    throw error;
  }
  return body as T;
}

export async function getTryOnConfig(): Promise<{ enabled: boolean; provider: string | null }> {
  return parse(await fetch('/api/capybara/tryon/config'));
}

/**
 * Whether this deployment can generate pictures. A missing or disabled
 * provider hides every entry point instead of failing when clicked.
 */
export function useTryOnConfig(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getTryOnConfig()
      .then((config) => {
        if (!cancelled) setEnabled(Boolean(config.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}

export async function startTryOn(input: TryOnRequestInput): Promise<{ tryon: TryOnRecord; cached?: boolean }> {
  return parse(await fetch('/api/capybara/tryon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }));
}

export async function getTryOn(id: string): Promise<{ tryon: TryOnRecord }> {
  return parse(await fetch(`/api/capybara/tryon/${encodeURIComponent(id)}`));
}

export async function recentTryOns(limit = 12): Promise<{ tryons: TryOnRecord[] }> {
  return parse(await fetch(`/api/capybara/tryon/recent?limit=${limit}`));
}

/** Starts (or reuses) a generation and polls until it settles. */
export function useTryOn(input: TryOnRequestInput | null) {
  const [status, setStatus] = useState<TryOnStatus>({ state: 'idle', record: null, error: null });
  const generation = useRef(0);

  useEffect(() => {
    setStatus({ state: 'idle', record: null, error: null });
  }, [input?.productId, input?.name, input?.brand, input?.category, input?.imageUrl]);

  useEffect(() => {
    if (!input) return;
    const mine = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const poll = async (id: string) => {
      try {
        const { tryon } = await getTryOn(id);
        if (cancelled || mine !== generation.current) return;
        if (tryon.status === 'done') {
          setStatus({ state: 'done', record: tryon, error: null });
        } else if (tryon.status === 'failed') {
          setStatus({ state: 'failed', record: tryon, error: tryon.error });
        } else {
          setStatus({ state: 'pending', record: tryon, error: null });
          timer = setTimeout(() => void poll(id), 1200);
        }
      } catch (error) {
        if (cancelled || mine !== generation.current) return;
        setStatus({ state: 'failed', record: null, error: (error as Error).message });
      }
    };

    setStatus({ state: 'pending', record: null, error: null });
    startTryOn(input)
      .then(({ tryon, cached }) => {
        if (cancelled || mine !== generation.current) return;
        if (cached && tryon.status === 'done') {
          setStatus({ state: 'done', record: tryon, error: null });
        } else {
          setStatus({ state: 'pending', record: tryon, error: null });
          void poll(tryon.id);
        }
      })
      .catch((error) => {
        if (cancelled || mine !== generation.current) return;
        setStatus({ state: 'failed', record: null, error: (error as Error).message });
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [input]);

  return status;
}
