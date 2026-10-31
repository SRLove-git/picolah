import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MessageCircle, Plus, Search, X } from 'lucide-react';
import type { ConversationSummary } from '../../shared/types';
import { dayGroup, relativeTime, stripMarkdown, truncate } from '../lib/format';
import { PageHeader } from './PageHeader';
import { Capybara } from './PicolahMark';

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
        conversation.preview.toLowerCase().includes(needle),
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
      />

      <div className="pc-page-body pc-messages-body">
        <div className="pc-msg-panel">
          <div className="pc-msg-toolbar">
            <label className="pc-msg-search">
              <Search size={16} />
              <input
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
            <button type="button" className="pc-primary-button" onClick={onNew}>
              <Plus size={15} />
              {t('messages.new')}
            </button>
          </div>

          <div className="pc-msg-list">
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
              groups.map((group) => (
                <div className="pc-msg-group" key={group.label}>
                  <div className="pc-msg-group-head">
                    {t(group.label === '今天' ? 'messages.today' : group.label === '昨天' ? 'messages.yesterday' : 'messages.earlier')}
                  </div>
                  {group.items.map((conversation) => {
                    const preview = stripMarkdown(conversation.preview || t('messages.noReply'));
                    return (
                      <button
                        type="button"
                        className="pc-msg-row"
                        key={conversation.id}
                        onClick={() => onSelect(conversation.id)}
                      >
                        <span className="pc-msg-main">
                          <span className="pc-msg-row-top">
                            <strong>{conversation.title}</strong>
                            <time>{relativeTime(conversation.updatedAt)}</time>
                          </span>
                          <span className="pc-msg-preview">{truncate(preview, 72)}</span>
                          <span className="pc-msg-meta">
                            {t('messages.comparison')}
                          </span>
                        </span>
                        <ChevronRight size={17} className="pc-msg-chevron" />
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="pc-msg-empty">
                <Capybara size={92} />
                <strong>{t(query ? 'messages.noMatch' : 'messages.empty')}</strong>
                <p>
                  {query
                    ? t('messages.tryAgain')
                    : t('messages.emptyHint')}
                </p>
                <button type="button" className="pc-primary-button" onClick={onNew}>
                  <MessageCircle size={15} />
                  {t('messages.start')}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </section>
  );
}
