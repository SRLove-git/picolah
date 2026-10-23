import { useMemo, useState } from 'react';
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
    <section className="pc-page pc-messages-page" aria-label="消息">
      <PageHeader
        eyebrow="MESSAGES"
        title="消息"
        description="每一段对话，都是一次认真比过的价。"
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
                placeholder="搜索对话"
                aria-label="搜索对话"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="清除搜索">
                  <X size={13} />
                </button>
              )}
            </label>
            <button type="button" className="pc-primary-button" onClick={onNew}>
              <Plus size={15} />
              新比价
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
                  <div className="pc-msg-group-head">{group.label}</div>
                  {group.items.map((conversation) => {
                    const marketInfo = MARKETS[conversation.market] || MARKETS.SG;
                    const preview = stripMarkdown(conversation.preview || '还没有回复');
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
                            {marketInfo.nameZh}
                            <i />
                            {marketInfo.currency}
                            <i />
                            价格库比价
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
                <strong>{query ? '没有找到这段对话' : '还没有比价记录'}</strong>
                <p>
                  {query
                    ? '换个关键词试试，或者直接开始一段新的比价。'
                    : '说说想买什么，Picolah 会帮你把六个市场的价格摊开。'}
                </p>
                <button type="button" className="pc-primary-button" onClick={onNew}>
                  <MessageCircle size={15} />
                  开始比价
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
            <h3>想比点什么？</h3>
            <p>一句话、一张图，就能把六个市场的到手价一起看清。</p>
            <button type="button" className="pc-primary-button is-wide" onClick={onNew}>
              <Plus size={15} />
              发起新比价
            </button>
            <div className="pc-msg-tips">
              <span>
                <Sparkles size={12} />
                支持语音和图片
              </span>
              <span>
                <Sparkles size={12} />
                自动算运费和券
              </span>
            </div>
          </div>

          <button type="button" className="pc-msg-source-card" onClick={onOpenGateway}>
            <span className={`pc-source-dot ${config ? 'is-live' : ''}`} />
            <span>
              <strong>{config ? '价格库在线' : '正在连接价格库'}</strong>
              <small>
                {config
                  ? `${config.gateway.markets} 个市场 · ${new Intl.NumberFormat('zh-CN').format(
                      config.gateway.offers,
                    )} 条在售价`
                  : '独立爬虫 · 稍后自动重试'}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        </aside>
      </div>
    </section>
  );
}
