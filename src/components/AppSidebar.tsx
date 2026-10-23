import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Clapperboard,
  Database,
  Home,
  Info,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  UserRound,
  X,
} from 'lucide-react';
import type { AppConfig, ConversationSummary } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { relativeTime } from '../lib/format';
import { CountryFlag } from './CountryFlag';
import { BrandLockup, Capybara } from './PicolahMark';

export type AppView =
  | 'home'
  | 'reels'
  | 'messages'
  | 'search'
  | 'notifications'
  | 'profile'
  | 'chat';

interface AppSidebarProps {
  view: AppView;
  conversations: ConversationSummary[];
  activeId: string | null;
  open: boolean;
  loading: boolean;
  config: AppConfig | null;
  unread: boolean;
  onNavigate: (view: AppView) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenGateway: () => void;
  onClose: () => void;
  notify: (message: string) => void;
}

const NAV = [
  { key: 'home' as const, label: '首页', Icon: Home },
  { key: 'reels' as const, label: 'Reels', Icon: Clapperboard },
  { key: 'messages' as const, label: '消息', Icon: MessageCircle },
  { key: 'search' as const, label: '搜索', Icon: Search },
  { key: 'notifications' as const, label: '通知', Icon: Bell },
];

export function AppSidebar({
  view,
  conversations,
  activeId,
  open,
  loading,
  config,
  unread,
  onNavigate,
  onSelect,
  onNew,
  onOpenGateway,
  onClose,
  notify,
}: AppSidebarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const activeKey = view === 'chat' ? 'messages' : view;

  useEffect(() => {
    if (!moreOpen) return;
    function handlePointer(event: MouseEvent) {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [moreOpen]);

  const recent = conversations.slice(0, 3);

  return (
    <aside className={`pc-sidebar ${open ? 'is-open' : ''}`} aria-label="主导航">
      <div className="pc-side-head">
        <BrandLockup
          size={23}
          onClick={() => {
            onNavigate('home');
          }}
        />
        <button className="pc-side-close" type="button" onClick={onClose} aria-label="关闭导航">
          <X size={18} />
        </button>
      </div>

      <nav className="pc-nav">
        {NAV.map(({ key, label, Icon }) => {
          const isActive = activeKey === key;
          return (
            <button
              key={key}
              type="button"
              className={`pc-nav-item ${isActive ? 'is-active' : ''}`}
              onClick={() => onNavigate(key)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="pc-nav-icon">
                <Icon size={21} strokeWidth={isActive ? 2.3 : 1.9} />
                {key === 'notifications' && unread && <i className="pc-nav-dot" />}
              </span>
              <span className="pc-nav-label">{label}</span>
              {key === 'messages' && conversations.length > 0 && (
                <span className="pc-nav-count">{conversations.length}</span>
              )}
              {key === 'reels' && <span className="pc-nav-new">NEW</span>}
            </button>
          );
        })}

        <button type="button" className="pc-nav-item pc-nav-create" onClick={onNew}>
          <span className="pc-nav-icon">
            <Plus size={21} strokeWidth={1.9} />
          </span>
          <span className="pc-nav-label">创建</span>
        </button>

        <button
          type="button"
          className={`pc-nav-item ${view === 'profile' ? 'is-active' : ''}`}
          onClick={() => onNavigate('profile')}
          aria-current={view === 'profile' ? 'page' : undefined}
        >
          <span className="pc-nav-icon">
            <UserRound size={21} strokeWidth={view === 'profile' ? 2.3 : 1.9} />
          </span>
          <span className="pc-nav-label">个人主页</span>
        </button>
      </nav>

      <div className="pc-side-recent">
        <div className="pc-side-section-head">
          <span>最近比价</span>
          <button type="button" onClick={() => onNavigate('messages')}>
            全部
          </button>
        </div>
        {loading && !conversations.length ? (
          <div className="pc-side-skeletons" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : recent.length ? (
          recent.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`pc-recent-item ${activeId === conversation.id && view === 'chat' ? 'is-active' : ''}`}
              onClick={() => onSelect(conversation.id)}
            >
              <span className="pc-recent-avatar">
                <Capybara variant="face" size={25} />
              </span>
              <span className="pc-recent-copy">
                <strong>{conversation.title}</strong>
                <small>
                  <CountryFlag code={conversation.market} width={11} />
                  {MARKETS[conversation.market]?.nameZh || conversation.market} ·{' '}
                  {relativeTime(conversation.updatedAt)}
                </small>
              </span>
            </button>
          ))
        ) : (
          <div className="pc-side-empty">
            <Capybara variant="face" size={36} />
            <span>还没有比价记录</span>
            <button type="button" onClick={onNew}>
              开始第一次比价
            </button>
          </div>
        )}
      </div>

      <div className="pc-side-bottom">
        <div className="pc-more-wrap" ref={moreRef}>
          <button
            type="button"
            className={`pc-nav-item pc-more-button ${moreOpen ? 'is-open' : ''}`}
            onClick={() => setMoreOpen((value) => !value)}
            aria-expanded={moreOpen}
          >
            <span className="pc-nav-icon">
              <MoreHorizontal size={21} />
            </span>
            <span className="pc-nav-label">更多</span>
          </button>
          {moreOpen && (
            <div className="pc-more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onNavigate('profile');
                }}
              >
                <Settings2 size={16} />
                <span>
                  <strong>账号设置</strong>
                  <small>市场、价格口径与工作区</small>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenGateway();
                }}
              >
                <Database size={16} />
                <span>
                  <strong>爬虫数据源</strong>
                  <small>
                    {config?.gateway.lastRun
                      ? `上次入库 ${relativeTime(config.gateway.lastRun.createdAt)}`
                      : '等待首批数据'}
                  </small>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  notify('⌘K 新建比价 · Enter 发送 · / 搜索对话');
                }}
              >
                <Info size={16} />
                <span>
                  <strong>快捷键</strong>
                  <small>查看常用操作</small>
                </span>
              </button>
              <div className="pc-more-foot">
                Picolah · 购物之前 PICO 一下
              </div>
            </div>
          )}
        </div>

        <button type="button" className="pc-account-card" onClick={() => onNavigate('profile')}>
          <span className="pc-account-avatar">
            <Capybara variant="face" size={34} />
            <i />
          </span>
          <span className="pc-account-copy">
            <strong>Picolah 工作区</strong>
            <small>@picolah.sea</small>
          </span>
          <span className="pc-plan-tag">BETA</span>
        </button>
      </div>
    </aside>
  );
}
