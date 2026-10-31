const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
// createUser reserves 32 hex characters for authenticated account IDs.
// Browser identities are UUIDs (or the legacy u-/anon- form), never account IDs.
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/i;

export function isAnonymousUserId(value: string): boolean {
  return USER_ID_PATTERN.test(value) && !ACCOUNT_ID_PATTERN.test(value);
}

/**
 * A single identity for everything a shopper accumulates: the signed-in
 * account when there is one, otherwise the browser's anonymous id.
 */
export function requestUserId(request: {
  header(name: string): string | undefined;
  user?: { id: string };
}): string | null {
  const accountId = String(request.user?.id || '').trim();
  if (USER_ID_PATTERN.test(accountId)) return accountId;
  const raw = String(request.header('x-picolah-user') || '').trim();
  return isAnonymousUserId(raw) ? raw : null;
}

export function isValidUserId(value: string): boolean {
  return USER_ID_PATTERN.test(value);
}
