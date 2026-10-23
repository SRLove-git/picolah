import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MessageCircle, Plus, Search, Sparkles, X } from 'lucide-react';
import type { AppConfig, ConversationSummary } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { dayGroup, relativeTime, stripMarkdown, truncate } from '../lib/format';
import { CountryFlag } from './CountryFlag';
import { PageHeader } from './PageHeader';
import { Capybara } from './PicolahMark';

interface MessagesViewProps {
  conversations: ConversationSummary[];
  loading: boolean;
  config: AppConfig | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenGateway: () => void;
  onOpenSidebar: () => void;
}

const GROUP_ORDER = ['今天', '昨天', '更早'] as const;

export function MessagesView({
  conversations,
  loading,
  config,
  onSelect,
  onNew,
  onOpenGateway,
  onOpenSidebar,
}: MessagesViewProps) {
  const { t, i18n } = useTranslation();
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
        eyebrow="MESSAGES"
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
                    <span className="pc-skeleton-avatar" />
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
                    const marketInfo = MARKETS[conversation.market] || MARKETS.SG;
                    const preview = stripMarkdown(conversation.preview || t('messages.noReply'));
                    return (
                      <button
                        type="button"
                        className="pc-msg-row"
                        key={conversation.id}
                        onClick={() => onSelect(conversation.id)}
                      >
                        <span className="pc-msg-avatar">
                          <Capybara variant="face" size={44} />
                        </span>
                        <span className="pc-msg-main">
                          <span className="pc-msg-row-top">
                            <strong>{conversation.title}</strong>
                            <time>{relativeTime(conversation.updatedAt)}</time>
                          </span>
                          <span className="pc-msg-preview">{truncate(preview, 72)}</span>
                          <span className="pc-msg-meta">
                            <CountryFlag code={conversation.market} width={13} />
                            {i18n.language === 'en' ? marketInfo.nameEn : marketInfo.nameZh}
                            <i />
                            {marketInfo.currency}
                            <i />
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

        <aside className="pc-msg-aside">
          <div className="pc-msg-new-card">
            <div className="pc-msg-new-art">
              <Capybara size={112} />
            </div>
            <span className="pc-eyebrow">NEW PICO</span>
            <h3>{t('messages.promptTitle')}</h3>
            <p>{t('messages.promptBody')}</p>
            <button type="button" className="pc-primary-button is-wide" onClick={onNew}>
              <Plus size={15} />
              {t('messages.launch')}
            </button>
            <div className="pc-msg-tips">
              <span>
                <Sparkles size={12} />
                {t('messages.media')}
              </span>
              <span>
                <Sparkles size={12} />
                {t('messages.calculate')}
              </span>
            </div>
          </div>

          <button type="button" className="pc-msg-source-card" onClick={onOpenGateway}>
            <span className={`pc-source-dot ${config ? 'is-live' : ''}`} />
            <span>
              <strong>{t(config ? 'messages.online' : 'messages.connecting')}</strong>
              <small>
                {config
                  ? t('messages.marketOffers', {
                      markets: config.gateway.markets,
                      offers: new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'zh-CN').format(config.gateway.offers),
                    })
                  : t('messages.retry')}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        </aside>
      </div>
    </section>
  );
}
