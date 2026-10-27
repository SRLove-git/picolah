import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  CAPY_SLOT_LIMITS,
  capyAccessory,
  capySnapshot,
  emptyCapyPayload,
  type CapyPayload,
  type CapyView,
} from '../../shared/capybara';
import type { CountryCode } from '../../shared/types';
import { addCapyPurchase, getCapybara, removeCapyPurchase, setCapyOutfit } from './api';
import { useSession } from './session';

interface CapyContextValue {
  view: CapyView;
  /** False in offline demo mode, where the companion cannot be persisted. */
  available: boolean;
  loading: boolean;
  syncing: boolean;
  refresh: () => Promise<void>;
  purchase: (productId: string, market: CountryCode, price?: number | null) => Promise<void>;
  removePurchase: (id: string) => Promise<void>;
  toggleAccessory: (id: string) => Promise<void>;
}

const CapyContext = createContext<CapyContextValue | null>(null);

export function CapyProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [payload, setPayload] = useState<CapyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await getCapybara());
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, user?.id]);

  const purchase = useCallback(
    async (productId: string, market: CountryCode, price?: number | null) => {
      setSyncing(true);
      try {
        setPayload(await addCapyPurchase(productId, market, price));
      } finally {
        setSyncing(false);
      }
    },
    [],
  );

  const removePurchase = useCallback(async (id: string) => {
    setSyncing(true);
    try {
      setPayload(await removeCapyPurchase(id));
    } finally {
      setSyncing(false);
    }
  }, []);

  const toggleAccessory = useCallback(
    async (id: string) => {
      const accessory = capyAccessory(id);
      if (!accessory) return;
      const current = payload?.equipped ?? [];
      let next: string[];
      if (current.includes(id)) {
        next = current.filter((entry) => entry !== id);
      } else {
        const limit = CAPY_SLOT_LIMITS[accessory.slot];
        const sameSlot = current.filter(
          (entry) => capyAccessory(entry)?.slot === accessory.slot,
        );
        const others = current.filter(
          (entry) => capyAccessory(entry)?.slot !== accessory.slot,
        );
        next = [...others, ...sameSlot.slice(0, Math.max(0, limit - 1)), id];
      }

      const previous = payload;
      setPayload((state) => (state ? { ...state, equipped: next } : state));
      setSyncing(true);
      try {
        setPayload(await setCapyOutfit(next));
      } catch (error) {
        setPayload(previous);
        throw error;
      } finally {
        setSyncing(false);
      }
    },
    [payload],
  );

  const view = useMemo(() => capySnapshot(payload ?? emptyCapyPayload()), [payload]);

  const value = useMemo<CapyContextValue>(
    () => ({
      view,
      available: payload !== null,
      loading,
      syncing,
      refresh,
      purchase,
      removePurchase,
      toggleAccessory,
    }),
    [view, loading, syncing, refresh, purchase, removePurchase, toggleAccessory, payload],
  );

  return <CapyContext.Provider value={value}>{children}</CapyContext.Provider>;
}

export function useCapybara(): CapyContextValue {
  const context = useContext(CapyContext);
  if (!context) throw new Error('useCapybara must be used inside <CapyProvider>');
  return context;
}
