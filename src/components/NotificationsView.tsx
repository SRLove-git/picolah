import { useState } from 'react';
import {
  Bell,
  CheckCheck,
  Database,
  Heart,
  Sparkles,
  Tag,
  TrendingDown,
} from 'lucide-react';
import type { AppConfig, CountryCode } from '../../shared/types';
import { relativeTime } from '../lib/format';
import { UtilityBar } from './Controls';
import { PageHeader } from './PageHeader';

interface NotificationsViewProps {
  config: AppConfig | null;
  market: CountryCode;
  unread: boolean;
  onMarkRead: () => void;
  onAsk: (query: string) => void;
  onOpenProfile: () => void;
  onOpenGateway: () => void;
  onOpenReels: () => void;
  onOpenNotifications: () => void;
  onOpenSidebar: () => void;
}

type Filter = 'all' | 'price' | 'system';

export function NotificationsView({
  config,
  market,
  unread,
  onMarkRead,
  onAsk,
  onOpenProfile,
  onOpenGateway,
  onOpenReels,
  onOpenNotifications,
  onOpenSidebar,
}: NotificationsViewProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const lastRun = config?.gateway.lastRun;
  const notifications = [
    {
      id: 'xm5-drop',
      kind: 'price' as const,
      Icon: TrendingDown,
      tone: 'pink',
      title: 'Sony XM5 在新加坡降到了 S$389',
      body: '比 30 日低点还低 4%，目前 Shopee 官方店有货。',
      time: '12 分钟前',
      action: '去看这条比价',
      query: 'Sony WH-1000XM5 哪里买最便宜？',
      target: 'ask' as const,
    },
    {
      id: 'airpods-low',
      kind: 'price' as const,
      Icon: Tag,
      tone: 'mint',
      title: 'AirPods Pro 2 到达 30 日低点',
      body: 'Lazada 券后 S$279，比你上次查看时便宜了 S$20。',
      time: '1 小时前',
      action: '现在比一下',
      query: 'AirPods Pro 2 现在划算吗？',
      target: 'ask' as const,
    },
    {
      id: 'sync-run',
      kind: 'system' as const,
      Icon: Database,
      tone: 'blue',
      title: lastRun ? '价格库同步完成' : '价格库正在等待首次同步',
      body: lastRun
        ? `${lastRun.source} 本次收到 ${lastRun.received} 条报价，更新 ${lastRun.upserted} 条。`
        : '独立爬虫还没有推第一批报价，连上后这里会自动更新。',
      time: lastRun ? relativeTime(lastRun.createdAt) : '等待中',
      action: '查看数据源',
      query: '',
      target: 'gateway' as const,
    },
    {
      id: 'weekly',
      kind: 'system' as const,
      Icon: Sparkles,
      tone: 'lilac',
      title: '你的本周比价小结已生成',
      body: '这周你比较了 6 件商品，平均省下 11.4%。最常看的是耳机。',
      time: '昨天',
      action: '继续比价',
      query: 'Sony WH-1000XM5 哪里买最便宜？',
      target: 'ask' as const,
    },
    {
      id: 'follow',
      kind: 'system' as const,
      Icon: Heart,
      tone: 'peach',
      title: '你收藏的 Reels 更新了',
      body: 'Pico 比价所发布了「六国比价」新短片，里面有 XM5 的实测。',
      time: '2 天前',
      action: '去看 Reels',
      query: '',
      target: 'reels' as const,
    },
  ];

  const filtered =
    filter === 'all' ? notifications : notifications.filter((item) => item.kind === filter);

  return (
    <section className="pc-page pc-notifications-page" aria-label="通知">
      <PageHeader
        eyebrow="NOTIFICATIONS"
        title="通知"
        description="价格变化、同步进度和给你的一点小提醒。"
        onOpenSidebar={onOpenSidebar}
      >
        <UtilityBar
          config={config}
          market={market}
          unread={unread}
          onOpenNotifications={onOpenNotifications}
          onOpenProfile={onOpenProfile}
          onOpenMarket={onOpenProfile}
        />
      </PageHeader>

      <div className="pc-page-body pc-notifications-body">
        <div className="pc-notifications-bar">
          <div className="pc-filter-tabs" role="tablist" aria-label="通知筛选">
            {[
              { id: 'all' as const, label: '全部' },
              { id: 'price' as const, label: '价格提醒' },
              { id: 'system' as const, label: '系统' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                className={filter === tab.id ? 'is-active' : ''}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="pc-mark-read"
            onClick={onMarkRead}
            disabled={!unread}
          >
            <CheckCheck size={15} />
            {unread ? '全部已读' : '已全部读完'}
          </button>
        </div>

        <div className="pc-notification-list">
          {filtered.map(({ id, Icon, tone, title, body, time, action, query, kind, target }) => (
            <button
              key={id}
              type="button"
              className={`pc-notification ${unread && kind === 'price' ? 'is-unread' : ''}`}
              onClick={() => {
                onMarkRead();
                if (target === 'ask' && query) onAsk(query);
                else if (target === 'gateway') onOpenGateway();
                else if (target === 'reels') onOpenReels();
                else onOpenProfile();
              }}
            >
              <span className={`pc-notification-icon tone-${tone}`}>
                <Icon size={18} />
              </span>
              <span className="pc-notification-copy">
                <span className="pc-notification-title">
                  <strong>{title}</strong>
                  {unread && kind === 'price' && <i />}
                  <time>{time}</time>
                </span>
                <span className="pc-notification-body">{body}</span>
                <span className="pc-notification-action">{action}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="pc-notifications-foot">
          <Bell size={14} />
          <span>只推送价格库里的真实变动，不发营销消息。</span>
        </div>
      </div>
    </section>
  );
}
