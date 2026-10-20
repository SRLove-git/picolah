import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Database,
  MessageSquare,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { AppConfig, ConversationSummary } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { dayGroup, relativeTime, stripMarkdown, truncate } from '../lib/format';
import { Brand } from './Logo';
import { CountryFlag } from './CountryFlag';

interface SidebarProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  open: boolean;
  loading: boolean;
  config: AppConfig | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenGateway: () => void;
  onClose: () => void;
}

const GROUP_ORDER = ['今天', '昨天', '更早'] as const;

export function Sidebar({
  conversations,
  activeId,
  open,
  loading,
  config,
  onSelect,
  onNew,
  onOpenGateway,
  onClose,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) => {
      return (
        conversation.title.toLowerCase().includes(needle) ||
        conversation.preview.toLowerCase().includes(needle)
      );
    });
  }, [conversations, query]);

  const groups = useMemo(() => {
    return GROUP_ORDER.map((label) => ({
      label,
      items: filtered.filter((conversation) => dayGroup(conversation.updatedAt) === label),
    })).filter((group) => group.items.length > 0);
  }, [filtered]);

  const lastRun = config?.gateway.lastRun;
  const gatewayStatus = !config
    ? '正在连接'
    : lastRun
      ? `上次入库 ${relativeTime(lastRun.createdAt)}`
      : '等待首批数据';

  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="对话历史">
      <div className="sidebar-head">
        <Brand />
        <span className="beta-pill">SEA</span>
        <button className="side-add" type="button" onClick={onNew} aria-label="新对话" title="新对话 · ⌘K">
          <Plus size={15} strokeWidth={2} />
        </button>
        <button className="sidebar-close" onClick={onClose} aria-label="关闭侧边栏">
          <X size={17} />
        </button>
      </div>

      <div className="sidebar-section-head">
        <span>对话记录</span>
        <span>{conversations.length}</span>
      </div>

      <div className="sidebar-search">
        <Search size={15} strokeWidth={1.9} />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索对话"
          aria-label="搜索对话"
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQuery('')}
            aria-label="清除搜索"
          >
            <X size={13} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>

      <div className="conversation-scroll">
        {loading && !conversations.length ? (
          <div className="sidebar-skeletons" aria-hidden="true">
            {[86, 70, 92, 62].map((width, index) => (
              <div className="sidebar-skeleton" key={index}>
                <span style={{ width }} />
                <span style={{ width: `${width - 22}%` }} />
              </div>
            ))}
          </div>
        ) : groups.length ? (
          groups.map((group) => (
            <section className="conversation-group" key={group.label}>
              <div className="conversation-group-label">{group.label}</div>
              {group.items.map((conversation) => {
                const market = MARKETS[conversation.market] || MARKETS.SG;
                const preview = stripMarkdown(conversation.preview || '还没有回复');
                return (
                  <button
                    type="button"
                    className={`conversation-item ${activeId === conversation.id ? 'is-active' : ''}`}
                    key={conversation.id}
                    onClick={() => onSelect(conversation.id)}
                  >
                    <div className="conversation-top">
                      <span className="conversation-title">{conversation.title}</span>
                      <span className="conversation-time">{relativeTime(conversation.updatedAt)}</span>
                    </div>
                    <div className="conversation-sub">
                      <CountryFlag code={conversation.market} width={13} />
                      <span className="conversation-market-code">{market.code}</span>
                      <span className="dot-separator" />
                      <span className="conversation-preview">{truncate(preview, 42)}</span>
                    </div>
                  </button>
                );
              })}
            </section>
          ))
        ) : query ? (
          <div className="sidebar-empty">
            <Search size={22} />
            <p>没有找到相关对话</p>
            <span>换个关键词试试</span>
          </div>
        ) : (
          <div className="sidebar-empty">
            <MessageSquare size={22} />
            <p>还没有对话</p>
            <span>问一个商品，就能开始比价</span>
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <button type="button" className="gateway-card" onClick={onOpenGateway}>
          <span className="gateway-icon">
            <Database size={17} strokeWidth={1.9} />
            <span className="live-dot" />
          </span>
          <span className="gateway-copy">
            <span className="gateway-title">
              爬虫数据源
              <span className="gateway-ready">就绪</span>
            </span>
            <span className="gateway-sub">{gatewayStatus}</span>
          </span>
          <ArrowUpRight className="gateway-arrow" size={15} />
        </button>

        <div className="workspace-card">
          <span className="workspace-avatar">
            <span>P</span>
            <span className="avatar-status" />
          </span>
          <span className="workspace-copy">
            <span className="workspace-name">Picolah 工作区</span>
            <span className="workspace-sub">6 个市场 · 独立价格库</span>
          </span>
          <span className="plan-pill">BETA</span>
        </div>
      </div>
    </aside>
  );
}
