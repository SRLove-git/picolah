import type { JournalEntry, JournalInput, JournalPage } from '../../shared/capy-journal';
import { isMockMode } from './api';
import { userHeaders } from './user';

export class JournalApiError extends Error {
  constructor(readonly code: string) { super(code); }
}

async function journalRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (isMockMode()) throw new JournalApiError('OFFLINE_DEMO');
  const response = await fetch(`/api/capybara/journal${path}`, {
    cache: 'no-store', signal: AbortSignal.timeout(20_000), ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...userHeaders() },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string };
    throw new JournalApiError(error.error || 'REQUEST_FAILED');
  }
  return response.json() as Promise<T>;
}

export function getCapyJournal(offset = 0, signal?: AbortSignal): Promise<JournalPage> {
  return journalRequest(`?offset=${offset}`, signal ? { signal } : undefined);
}

export async function saveCapyJournal(id: string, input: JournalInput, revision?: number): Promise<JournalEntry> {
  const result = await journalRequest<{ entry: JournalEntry }>(revision === undefined ? '' : `/${encodeURIComponent(id)}`, {
    method: revision === undefined ? 'POST' : 'PATCH',
    body: JSON.stringify(revision === undefined ? { id, ...input } : { revision, ...input }),
  });
  return result.entry;
}

export async function deleteCapyJournal(id: string, revision: number): Promise<void> {
  await journalRequest(`/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ revision }) });
}
