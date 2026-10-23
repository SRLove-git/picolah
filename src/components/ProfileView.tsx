import {
  BadgeCheck,
  Check,
  Database,
  Globe2,
  LogOut,
  Pencil,
  Settings2,
  Sparkles,
  Wallet,
} from 'lucide-react';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { COUNTRY_LIST, MARKETS } from '../../shared/types';
import { PRICE_MODES, priceModeMeta, relativeTime } from '../lib/format';
import { CountryFlag } from './CountryFlag';
import { UtilityBar } from './Controls';
import { PageHeader } from './PageHeader';
import { Capybara } from './PicolahMark';

interface ProfileViewProps {
  config: AppConfig | null;
  market: CountryCode;
  priceMode: PriceMode;
  conversationCount: number;
  unread: boolean;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  onOpenGateway: () => void;
  onOpenNotifications: () => void;
  onOpenSidebar: () => void;
  notify: (message: string) => void;
}

const PRICE_ICONS = {
  landed: Wallet,
  item: Sparkles,
  shipping: Globe2,
  history: Sparkles,
} as const;

export function ProfileView({
  config,
  market,
  priceMode,
  conversationCount,
  unread,
  onMarketChange,
  onPriceModeChange,
  onOpenGateway,
  onOpenNotifications,
  onOpenSidebar,
  notify,
}: ProfileViewProps) {
  const mode = priceModeMeta(priceMode);
  const marketInfo = MARKETS[market];
  const lastRun = config?.gateway.lastRun;

  return (
    <section className="pc-page pc-profile-page" aria-label="个人主页">
      <PageHeader
        eyebrow="PROFILE"
        title="个人主页"
        description="你的账号、比价偏好和价格库，都放在这里。"
        onOpenSidebar={onOpenSidebar}
      >
        <UtilityBar
          config={config}
          market={market}
          unread={unread}
          onOpenNotifications={onOpenNotifications}
          onOpenProfile={() => notify('你已经在个人主页啦')}
        />
      </PageHeader>

      <div className="pc-page-body pc-profile-body">
        <div className="pc-profile-cover">
          <div className="pc-profile-aurora" aria-hidden="true" />
          <span className="pc-profile-doodle pc-profile-doodle-1" aria-hidden="true">
            ✦
          </span>
          <span className="pc-profile-doodle pc-profile-doodle-2" aria-hidden="true">
            ✧
          </span>
          <span className="pc-profile-doodle pc-profile-doodle-3" aria-hidden="true">
            ♡
          </span>
          <div className="pc-profile-cover-art">
            <Capybara size={150} />
          </div>
          <div className="pc-profile-identity">
            <span className="pc-profile-avatar">
              <Capybara variant="face" size={84} />
              <i />
            </span>
            <div className="pc-profile-name">
              <h2>
                Picolah 工作区
                <BadgeCheck size={18} />
              </h2>
              <p>
                @picolah.sea · 东南亚比价工作台
              </p>
              <span className="pc-profile-bio">
                喜欢的东西，也值得多比一比。这里是我的六国价格库。
              </span>
            </div>
            <button
              type="button"
              className="pc-outline-button pc-profile-edit"
              onClick={() => notify('工作区资料暂存在本地，多设备同步还在路上')}
            >
              <Pencil size={14} />
              编辑资料
            </button>
          </div>

          <div className="pc-profile-stats">
            <span>
              <strong>{conversationCount}</strong>
              <small>次比价</small>
            </span>
            <span>
              <strong>{config?.gateway.markets ?? 6}</strong>
              <small>个市场</small>
            </span>
            <span>
              <strong>
                {config ? new Intl.NumberFormat('zh-CN').format(config.gateway.offers) : '—'}
              </strong>
              <small>条在售价</small>
            </span>
            <span>
              <strong>{config?.gateway.products ?? '—'}</strong>
              <small>件商品</small>
            </span>
          </div>
        </div>

        <div className="pc-profile-grid">
          <section className="pc-profile-card">
            <header>
              <span className="pc-profile-card-icon tone-pink">
                <Globe2 size={17} />
              </span>
              <div>
                <h3>默认市场</h3>
                <p>新比价会默认从这个市场开始。</p>
              </div>
            </header>
            <div className="pc-market-chips">
              {COUNTRY_LIST.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={`pc-market-chip ${item.code === market ? 'is-active' : ''}`}
                  onClick={() => onMarketChange(item.code)}
                >
                  <CountryFlag code={item.code} width={18} />
                  <span>
                    <strong>{item.nameZh}</strong>
                    <small>{item.currency}</small>
                  </span>
                  {item.code === market && <Check size={13} />}
                </button>
              ))}
            </div>
          </section>

          <section className="pc-profile-card">
            <header>
              <span className="pc-profile-card-icon tone-mint">
                <Wallet size={17} />
              </span>
              <div>
                <h3>默认价格口径</h3>
                <p>决定比价卡先按哪种价格排序。</p>
              </div>
            </header>
            <div className="pc-price-options">
              {PRICE_MODES.map((item) => {
                const Icon = PRICE_ICONS[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`pc-price-option ${item.id === priceMode ? 'is-active' : ''}`}
                    onClick={() => onPriceModeChange(item.id)}
                  >
                    <span className="pc-price-option-icon">
                      <Icon size={16} />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="pc-profile-note">
              价格按 <b>{marketInfo.currency}</b> 展示，不会自动换汇。
            </div>
          </section>

          <section className="pc-profile-card pc-profile-source">
            <header>
              <span className="pc-profile-card-icon tone-blue">
                <Database size={17} />
              </span>
              <div>
                <h3>爬虫数据源</h3>
                <p>独立爬虫同步价格，网站只读价格库。</p>
              </div>
              <span className={`pc-source-state ${config ? 'is-live' : ''}`}>
                <i />
                {config ? '在线' : '连接中'}
              </span>
            </header>
            <div className="pc-source-grid">
              <span>
                <small>同步接口</small>
                <strong>{config?.gateway.endpoint || '/api/ingest'}</strong>
              </span>
              <span>
                <small>上次同步</small>
                <strong>{lastRun ? relativeTime(lastRun.createdAt) : '等待首批数据'}</strong>
              </span>
              <span>
                <small>最新一批</small>
                <strong>
                  {lastRun ? `${lastRun.received} 收到 / ${lastRun.upserted} 更新` : '—'}
                </strong>
              </span>
              <span>
                <small>今日新增</small>
                <strong>{config?.gateway.todayOffers ?? '—'} 条</strong>
              </span>
            </div>
            <div className="pc-profile-card-actions">
              <button type="button" className="pc-primary-button" onClick={onOpenGateway}>
                <Settings2 size={14} />
                管理数据源
              </button>
              <span className="pc-source-safe">
                <Sparkles size={13} />
                只读价格库，不直接抓取平台页面
              </span>
            </div>
          </section>

          <section className="pc-profile-card pc-profile-account">
            <header>
              <span className="pc-profile-card-icon tone-lilac">
                <BadgeCheck size={17} />
              </span>
              <div>
                <h3>账号</h3>
                <p>当前登录的工作区。</p>
              </div>
            </header>
            <div className="pc-account-rows">
              <span>
                <small>工作区</small>
                <strong>Picolah 工作区</strong>
              </span>
              <span>
                <small>用户名</small>
                <strong>@picolah.sea</strong>
              </span>
              <span>
                <small>方案</small>
                <strong>
                  Beta <em>免费</em>
                </strong>
              </span>
              <span>
                <small>默认口径</small>
                <strong>{mode.label}</strong>
              </span>
            </div>
            <div className="pc-profile-card-actions">
              <button
                type="button"
                className="pc-outline-button"
                onClick={() => notify('工作区资料暂存在本地，多设备同步还在路上')}
              >
                <Pencil size={14} />
                编辑资料
              </button>
              <button
                type="button"
                className="pc-text-button is-danger"
                onClick={() => notify('这是本地演示工作区，退出登录暂未启用')}
              >
                <LogOut size={14} />
                退出登录
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
