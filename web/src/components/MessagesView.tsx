import { shoppingReplyText } from '../lib/chat-content';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, MessageCircle, Plus, Search, X } from 'lucide-react';
import type { ConversationSummary } from '../../shared/types';
import { dayGroup, relativeTime, stripMarkdown } from '../lib/format';
import { PageHeader } from './PageHeader';
import './messages.css';

interface MessagesViewProps {
  conversations: ConversationSummary[];
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenSidebar: () => void;
}

const GROUP_ORDER = ['今天', '昨天', '更早'] as const;

export function MessagesView({
  conversations,
  loading,
  onSelect,
  onNew,
  onOpenSidebar,
}: MessagesViewProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(needle) ||
        shoppingReplyText(conversation.preview).toLowerCase().includes(needle),
    );
  }, [conversations, query]);

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((label) => ({
        label,
        items: filtered.filter((conversation) => dayGroup(conversation.updatedAt) === label),
      })).filter((group) => group.items.length > 0),
    [filtered],
  );

  return (
    <section className="pc-page pc-messages-page" aria-label={t('messages.label')}>
      <PageHeader
        eyebrow="PICOLAH"
        title={t('messages.label')}
        description={t('messages.description')}
        onOpenSidebar={onOpenSidebar}
      >
        <button type="button" className="pc-msg-new" onClick={onNew}>
          <Plus size={16} />
          <span>{t('messages.new')}</span>
        </button>
      </PageHeader>

      <div className="pc-page-body pc-messages-body">
        <div className="pc-msg-toolbar">
          <label className="pc-msg-search">
            <Search size={16} />
            <input
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('messages.search')}
              aria-label={t('messages.search')}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={t('messages.clear')}>
                <X size={13} />
              </button>
            )}
          </label>
        </div>

        <div className="pc-msg-list" aria-busy={loading}>
          {loading && !conversations.length ? (
            <div className="pc-msg-skeletons" aria-hidden="true">
              {[0, 1, 2, 3].map((item) => (
                <div className="pc-msg-skeleton" key={item}>
                  <span className="pc-skeleton-lines">
                    <i style={{ width: '46%' }} />
                    <i style={{ width: '84%' }} />
                  </span>
                </div>
              ))}
            </div>
          ) : groups.length ? (
            groups.map((group, index) => (
              <section className="pc-msg-group" key={group.label} aria-labelledby={`trail-group-${index}`}>
                <h2 className="pc-msg-group-head" id={`trail-group-${index}`}>
                  {t(group.label === '今天' ? 'messages.today' : group.label === '昨天' ? 'messages.yesterday' : 'messages.earlier')}
                  <span>{group.items.length}</span>
                </h2>
                <ul className="pc-msg-rows">
                  {group.items.map((conversation) => {
                    const preview = stripMarkdown(shoppingReplyText(conversation.preview) || t('messages.noReply'));
                    return (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          className="pc-msg-row"
                          onClick={() => onSelect(conversation.id)}
                        >
                          <MessageCircle size={16} className="pc-msg-thread-icon" aria-hidden="true" />
                          <span className="pc-msg-main">
                            <strong title={conversation.title}>{conversation.title}</strong>
                            <span className="pc-msg-preview">{preview}</span>
                          </span>
                          <time dateTime={conversation.updatedAt}>{relativeTime(conversation.updatedAt)}</time>
                          <ArrowUpRight size={15} className="pc-msg-chevron" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          ) : (
            <div className="pc-msg-empty">
              <MessageCircle size={28} strokeWidth={1.5} aria-hidden="true" />
              <strong>{t(query ? 'messages.noMatch' : 'messages.empty')}</strong>
              <p>
                {query
                  ? t('messages.tryAgain')
                  : t('messages.emptyHint')}
              </p>
              <button type="button" className="pc-msg-new" onClick={onNew}>
                <MessageCircle size={15} />
                {t('messages.start')}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
