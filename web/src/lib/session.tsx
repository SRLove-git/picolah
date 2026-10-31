import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  register: (email: string, password: string, code: string, displayName?: string) => Promise<void>;
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
  const requestVersion = useRef(0);
  const authPending = useRef(false);

  const refresh = useCallback(async () => {
    if (authPending.current) return;
    const version = ++requestVersion.current;
    try {
      const next = await getSession();
      if (version === requestVersion.current) {
        setState(next);
        setError(null);
      }
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : '无法连接服务器');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  const changeSession = useCallback(async (request: () => Promise<SessionState | null>) => {
    const version = ++requestVersion.current;
    authPending.current = true;
    try {
      const next = await request();
      if (version !== requestVersion.current) return;
      setState((current) => next ?? { ...current, user: null });
      setError(null);
    } finally {
      if (version === requestVersion.current) {
        authPending.current = false;
        setLoading(false);
      }
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await changeSession(() => loginRequest(email, password));
  }, [changeSession]);

  const register = useCallback(async (email: string, password: string, code: string, displayName?: string) => {
    await changeSession(() => registerRequest(email, password, code, displayName));
  }, [changeSession]);

  const logout = useCallback(async () => {
    await changeSession(async () => { await logoutRequest(); return null; });
  }, [changeSession]);

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
