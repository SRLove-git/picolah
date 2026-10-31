const USER_KEY = 'picolah.userId';
let memoryUserId = '';

/**
 * Browser-local anonymous identity for server-stored shopping/video signals.
 * Signed-in requests use the authenticated account; login merges this profile.
 */
export function getUserId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = localStorage.getItem(USER_KEY);
    if (existing && /^[a-zA-Z0-9_-]{8,80}$/.test(existing) && !/^[0-9a-f]{32}$/i.test(existing)) {
      memoryUserId = existing;
      return existing;
    }
  } catch {
    // Continue with a stable in-memory identity when browser storage is blocked.
  }
  if (!memoryUserId) {
    memoryUserId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  try {
    localStorage.setItem(USER_KEY, memoryUserId);
  } catch {
    // The current tab can still chat without persistent storage.
  }
  return memoryUserId;
}

export function userHeaders(): Record<string, string> {
  const id = getUserId();
  return id ? { 'X-Picolah-User': id } : {};
}
