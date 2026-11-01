export const JOURNAL_TITLE_LIMIT = 80;
export const JOURNAL_CONTENT_LIMIT = 4000;
export const JOURNAL_PAGE_SIZE = 20;

export interface JournalInput {
  date: string;
  title: string;
  content: string;
}

export interface JournalEntry extends JournalInput {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface JournalPage {
  entries: JournalEntry[];
  total: number;
}

/** Calendar dates stay in the writer's local day, without a timezone conversion. */
export function isJournalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const stamp = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0, 10) === value;
}
