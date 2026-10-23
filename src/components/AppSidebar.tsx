import { Database, Home, MessageCircle, Settings, X } from 'lucide-react';
import type { AppConfig, ConversationSummary } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { relativeTime } from '../lib/format';
import { CountryFlag } from './CountryFlag';
import { BrandLockup, Capybara } from './PicolahMark';

export type AppView = 'home' | 'messages' | 'profile' | 'chat';

interface AppSidebarProps {
  view: AppView;
  conversations: ConversationSummary[];
  activeId: string | null;
  open: boolean;
  loading: boolean;
  config: AppConfig | null;
  onNavigate: (view: AppView) => void;
  onSelect: (id: string) => void;
  onOpenGateway: () => void;
  onClose: () => void;
}

const NAV = [
  { key: 'home' as const, label: '首页', Icon: Home },
  { key: 'messages' as const, label: '消息', Icon: MessageCircle },
];

export function AppSidebar({
  view,
  conversations,
  activeId,
  open,
  loading,
  config,
  onNavigate,
  onSelect,
  onOpenGateway,
  onClose,
}: AppSidebarProps) {
  const activeKey = view === 'chat' ? 'messages' : view;
  const offers = config?.gateway.offers;

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
              </span>
              <span className="pc-nav-label">{label}</span>
              {key === 'messages' && conversations.length > 0 && (
                <span className="pc-nav-count">{conversations.length}</span>
              )}
            </button>
          );
        })}

        <button type="button" className="pc-nav-item" onClick={onOpenGateway}>
          <span className="pc-nav-icon">
            <Database size={21} strokeWidth={1.9} />
          </span>
          <span className="pc-nav-label">数据源</span>
        </button>

        <button
          type="button"
          className={`pc-nav-item ${view === 'profile' ? 'is-active' : ''}`}
          onClick={() => onNavigate('profile')}
          aria-current={view === 'profile' ? 'page' : undefined}
        >
          <span className="pc-nav-icon">
            <Settings size={21} strokeWidth={view === 'profile' ? 2.3 : 1.9} />
          </span>
          <span className="pc-nav-label">设置</span>
        </button>
      </nav>

      <div className="pc-side-recent">
        <div className="pc-side-section-head">
          <span>最近对话</span>
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
        ) : conversations.length ? (
          <div className="pc-side-recent-list">
            {conversations.map((conversation) => (
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
            ))}
          </div>
        ) : (
          <div className="pc-side-empty">
            <Capybara variant="face" size={36} />
            <span>还没有比价记录</span>
            <button type="button" onClick={() => onNavigate('home')}>
              开始第一次比价
            </button>
          </div>
        )}
      </div>

      <footer className="pc-side-foot">
        <span className={`pc-side-live ${config ? 'is-live' : ''}`}>
          <i />
          {config ? '价格库在线' : '正在连接'}
        </span>
        <small>
          {config
            ? `${config.gateway.markets} 个市场 · ${new Intl.NumberFormat('zh-CN').format(offers ?? 0)} 条在售价`
            : 'PICOLAH · BETA'}
        </small>
      </footer>
    </aside>
  );
}
