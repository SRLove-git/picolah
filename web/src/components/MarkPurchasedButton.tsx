import { Check, ShoppingBag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CountryCode, ProductVisual } from '../../shared/types';
import { useCapybara } from '../lib/capybara';

interface MarkPurchasedButtonProps {
  product: { id: string; name: string; visual: ProductVisual };
  market: CountryCode;
  price?: number | null;
  className?: string;
}

/**
 * One tap records a real purchase. The capybara uses it to unlock an
 * accessory, so the button doubles as the bridge between shopping and growth.
 */
export function MarkPurchasedButton({ product, market, price, className = '' }: MarkPurchasedButtonProps) {
  const { t } = useTranslation();
  const { view, purchase, syncing } = useCapybara();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const timerRef = useRef<number | null>(null);
  const owned = view.purchases.some((entry) => entry.product.id === product.id);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  async function record() {
    if (owned || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await purchase(product.id, market, price ?? null);
      setJustDone(true);
      timerRef.current = window.setTimeout(() => setJustDone(false), 2400);
    } catch {
      setFailed(true);
      timerRef.current = window.setTimeout(() => setFailed(false), 3200);
    } finally {
      setBusy(false);
    }
  }

  const label = failed
    ? t('capybara.purchaseFailed')
    : owned
      ? t('capybara.owned')
      : justDone
        ? t('capybara.owned')
        : t('capybara.markPurchased');

  return (
    <button
      type="button"
      className={`pc-buy-record ${owned ? 'is-owned' : ''} ${failed ? 'is-failed' : ''} ${className}`}
      onClick={() => void record()}
      disabled={owned || busy || syncing}
      aria-pressed={owned}
      title={`${t('capybara.markPurchased')} · ${product.name}`}
    >
      {owned ? <Check size={14} strokeWidth={2.6} /> : <ShoppingBag size={14} strokeWidth={2.1} />}
      <span>{busy ? '…' : label}</span>
    </button>
  );
}
