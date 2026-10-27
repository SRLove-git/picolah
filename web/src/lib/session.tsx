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
  getSession,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  type SessionState,
  type SessionUser,
} from './api';

interface SessionContextValue extends SessionState {
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  loginPrompt: { reason: string } | null;
  promptLogin: (reason?: string) => void;
  closeLoginPrompt: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ user: null, required: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginPrompt, setLoginPrompt] = useState<{ reason: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await getSession());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法连接服务器');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password);
    setState(next);
    setError(null);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    const next = await registerRequest(email, password, displayName);
    setState(next);
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setState((current) => ({ ...current, user: null }));
  }, []);

  const promptLogin = useCallback((reason = 'default') => {
    setLoginPrompt({ reason });
  }, []);

  const closeLoginPrompt = useCallback(() => {
    setLoginPrompt(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      loading,
      error,
      login,
      register,
      logout,
      refresh,
      loginPrompt,
      promptLogin,
      closeLoginPrompt,
    }),
    [state, loading, error, login, register, logout, refresh, loginPrompt, promptLogin, closeLoginPrompt],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

export type { SessionUser };
