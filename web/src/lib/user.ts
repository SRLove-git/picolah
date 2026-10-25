const USER_KEY = 'picolah.userId';

/**
 * Anonymous, browser-local identity. There is no account system yet, so the
 * shopping profile must never leave this device unless the user exports it.
 */
export function getUserId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = localStorage.getItem(USER_KEY);
    if (existing && /^[a-zA-Z0-9_-]{8,80}$/.test(existing)) return existing;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(USER_KEY, id);
    return id;
  } catch {
    return '';
  }
}

export function userHeaders(): Record<string, string> {
  const id = getUserId();
  return id ? { 'X-Picolah-User': id } : {};
}
