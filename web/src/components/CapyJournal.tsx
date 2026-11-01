import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, NotebookPen, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { JOURNAL_CONTENT_LIMIT, JOURNAL_TITLE_LIMIT, isJournalDate, type JournalEntry, type JournalInput } from '../../shared/capy-journal';
import { deleteCapyJournal, getCapyJournal, JournalApiError, saveCapyJournal } from '../lib/capy-journal';
import './capy-journal.css';

export interface JournalProtection { dirty: boolean; busy: boolean }
interface Draft extends JournalInput { id: string; revision?: number; original: JournalInput }

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function CapyJournal({ active, onProtectionChange }: { active: boolean; onProtectionChange: (value: JournalProtection) => void }) {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  const fieldId = useId();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const loadingPage = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const dirty = Boolean(draft && (draft.date !== draft.original.date || draft.title !== draft.original.title || draft.content !== draft.original.content));

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onProtectionChange({ dirty, busy }); }, [dirty, busy, onProtectionChange]);
  useEffect(() => () => onProtectionChange({ dirty: false, busy: false }), [onProtectionChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function load(offset = 0) {
    if (loadingPage.current) return;
    loadingPage.current = true;
    setLoading(true);
    setLoadError(false);
    try {
      const result = await getCapyJournal(offset);
      if (!mounted.current) return;
      setEntries((previous) => offset === 0 ? result.entries : [...previous, ...result.entries.filter((item) => !previous.some((row) => row.id === item.id))]);
      setTotal(result.total);
      setLoaded(true);
    } catch {
      if (mounted.current) setLoadError(true);
    } finally {
      loadingPage.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  useEffect(() => { if (active && !loaded && !loadError) void load(); }, [active, loaded, loadError]);
  useEffect(() => { if (draft) editor.current?.focus(); }, [draft?.id]);

  function start(entry?: JournalEntry) {
    const original: JournalInput = entry ? { date: entry.date, title: entry.title, content: entry.content } : { date: today(), title: '', content: '' };
    setDraft({ ...original, original, id: entry?.id ?? crypto.randomUUID(), revision: entry?.revision });
    setError(null); setSaved(false); setDiscard(false); setDeleting(null);
  }

  function cancel() {
    setDraft(null); setError(null); setDiscard(false);
    requestAnimationFrame(() => newButton.current?.focus());
  }

  async function save(asNew = false) {
    if (!draft || pending.current || loadingPage.current || !draft.content.trim() || !isJournalDate(draft.date)) return;
    pending.current = true; setBusy(true); setError(null);
    const current = asNew ? { ...draft, id: crypto.randomUUID(), revision: undefined } : draft;
    if (asNew) setDraft(current);
    try {
      const result = await saveCapyJournal(current.id, { date: current.date, title: current.title, content: current.content }, current.revision);
      if (!mounted.current) return;
      // The save is complete even if refreshing the list subsequently fails.
      setEntries((previous) => [result, ...previous.filter((entry) => entry.id !== result.id)]);
      if (current.revision === undefined && !entries.some((entry) => entry.id === result.id)) setTotal((value) => value + 1);
      setDraft(null); setDiscard(false); setSaved(true);
      await load();
      requestAnimationFrame(() => newButton.current?.focus());
    } catch (cause) {
      if (mounted.current) setError(cause instanceof JournalApiError ? cause.code : 'REQUEST_FAILED');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function remove(entry: JournalEntry) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null); setSaved(false);
    try {
      await deleteCapyJournal(entry.id, entry.revision);
      if (!mounted.current) return;
      setEntries((previous) => previous.filter((item) => item.id !== entry.id));
      setTotal((value) => Math.max(0, value - 1)); setDeleting(null);
      await load();
      requestAnimationFrame(() => newButton.current?.focus());
    } catch (cause) {
      if (mounted.current) setError(cause instanceof JournalApiError ? cause.code : 'REQUEST_FAILED');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const conflict = error === 'CONFLICT' || error === 'NOT_FOUND';
  const errorText = conflict
    ? (en ? 'This entry changed elsewhere. Your text is still here; save it as a new entry or reopen the latest version.' : '这篇日记已在别处修改或删除。你的文字还在，可以另存一篇，或取消后重新打开最新版本。')
    : (en ? 'Could not save this change. Your text is still here. Please try again.' : '这次没能保存，文字还在这里，请重试。');

  return <div className="pc-journal">
    <div className="pc-journal-heading">
      <div><strong>{en ? 'Our little days' : '和卡皮的小日子'}</strong><p>{en ? 'A little moment, just for you.' : '把今天的小开心，写在这里。'}</p></div>
      {!draft && <button type="button" ref={newButton} className="pc-journal-primary" disabled={!loaded || loading || busy}
        onClick={() => start()}><Plus size={16} />{en ? 'Write an entry' : '写日记'}</button>}
    </div>
    {saved && <p className="pc-journal-saved" role="status"><Check size={15} />{en ? 'Saved' : '已保存'}</p>}
    {loadError && <div className="pc-journal-feedback" role="alert"><span>{en ? 'Your journal could not be loaded.' : '暂时没能读到日记。'}</span>
      <button type="button" disabled={loading || busy} onClick={() => void load()}><RotateCcw size={14} />{en ? 'Retry' : '重试'}</button></div>}
    {error && <div className="pc-journal-feedback" role="alert"><span>{draft ? errorText : en ? 'Could not delete this entry. Reload the journal and try again.' : '没能删除这篇日记，请重新加载后再试。'}</span>
      {conflict && draft && <button type="button" disabled={busy} onClick={() => void save(true)}>{en ? 'Save as new' : '另存一篇'}</button>}
      {!draft && <button type="button" disabled={busy} onClick={() => { setError(null); setDeleting(null); void load(); }}>{en ? 'Reload' : '重新加载'}</button>}</div>}
    {draft ? <form className="pc-journal-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label><span id={`${fieldId}-date`}>{en ? 'Date' : '日期'}</span><input aria-labelledby={`${fieldId}-date`} type="date" required value={draft.date} disabled={busy}
        onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
      <label><span id={`${fieldId}-title`}>{en ? 'Title (optional)' : '标题（选填）'}</span><input aria-labelledby={`${fieldId}-title`} type="text" maxLength={JOURNAL_TITLE_LIMIT} value={draft.title} disabled={busy}
        placeholder={en ? 'Give today a little name' : '给今天起个小名字'} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label><span id={`${fieldId}-story`}>{en ? 'Today’s story' : '今天的故事'}</span><textarea aria-labelledby={`${fieldId}-story`} ref={editor} required rows={7} maxLength={JOURNAL_CONTENT_LIMIT} value={draft.content} disabled={busy}
        placeholder={en ? 'What would you like to remember?' : '今天发生了什么？和卡皮说说吧……'} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label>
      <div className="pc-journal-editor-foot"><span>{draft.content.length} / {JOURNAL_CONTENT_LIMIT}</span>
        <div><button type="button" disabled={busy} onClick={() => dirty ? setDiscard(true) : cancel()}>{en ? 'Cancel' : '取消'}</button>
          <button type="submit" className="pc-journal-primary" disabled={busy || loading || !draft.content.trim() || !isJournalDate(draft.date)}><Save size={15} />{busy ? (en ? 'Saving…' : '保存中…') : (en ? 'Save entry' : '保存日记')}</button></div>
      </div>
      {discard && <div className="pc-journal-feedback" role="alert"><span>{en ? 'Discard these unsaved changes?' : '放弃这次还没保存的修改吗？'}</span>
        <button type="button" onClick={() => { setDiscard(false); editor.current?.focus(); }}>{en ? 'Keep writing' : '继续写'}</button>
        <button type="button" onClick={cancel}>{en ? 'Discard changes' : '放弃修改'}</button></div>}
    </form> : <>
      {loading && <p className="pc-journal-loading" role="status">{en ? 'Opening your journal…' : '正在翻开日记……'}</p>}
      {loaded && !entries.length && !loading && <div className="pc-journal-empty"><NotebookPen size={30} /><strong>{en ? 'A fresh page awaits' : '新的一页，等你来写'}</strong><p>{en ? 'Tap “Write an entry” to keep your first memory.' : '点一下“写日记”，记下第一个小瞬间。'}</p></div>}
      <ul className="pc-journal-list">{entries.map((entry) => <li key={entry.id} className="pc-journal-entry">
        <time dateTime={entry.date}>{new Intl.DateTimeFormat(en ? 'en' : 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${entry.date}T12:00:00`))}</time>
        <h3>{entry.title || (en ? 'A little moment' : '一个小瞬间')}</h3><p>{entry.content}</p>
        <div className="pc-journal-entry-actions"><button type="button" disabled={busy || loading} aria-label={`${en ? 'Edit entry' : '编辑日记'} ${entry.title || entry.date}`} onClick={() => start(entry)}><Pencil size={14} />{en ? 'Edit' : '编辑'}</button>
          <button type="button" disabled={busy || loading} aria-label={`${en ? 'Delete entry' : '删除日记'} ${entry.title || entry.date}`} onClick={() => { setDeleting(entry.id); setError(null); }}><Trash2 size={14} />{en ? 'Delete' : '删除'}</button></div>
        {deleting === entry.id && <div className="pc-journal-feedback" role="alert"><span>{en ? 'Delete this entry?' : '要删除这篇日记吗？'}</span>
          <button type="button" disabled={busy} onClick={() => setDeleting(null)}>{en ? 'Keep it' : '先留着'}</button>
          <button type="button" disabled={busy} onClick={() => void remove(entry)}>{en ? 'Confirm delete' : '确认删除'}</button></div>}
      </li>)}</ul>
      {loaded && entries.length < total && <button type="button" className="pc-journal-more" disabled={loading || busy} onClick={() => void load(entries.length)}>{en ? 'More memories' : '再翻一页'}</button>}
    </>}
  </div>;
}
