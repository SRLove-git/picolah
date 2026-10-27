const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

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
  return USER_ID_PATTERN.test(raw) ? raw : null;
}

export function isValidUserId(value: string): boolean {
  return USER_ID_PATTERN.test(value);
}
