import { Bookmark, ChevronRight, Clock3, Heart, Menu, Play, RefreshCw, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CountryCode, PriceMode, ShoppingProfile } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { getProfile } from '../lib/api';
import { accountActivity, type ActivityTab } from '../lib/account-activity';
import { relativeTime } from '../lib/format';
import { useSession } from '../lib/session';
import { AccountSettings } from './AccountSettings';
import { CountryFlag } from './CountryFlag';
import { Capybara } from './PicolahMark';
import './account-center.css';

interface AccountViewProps {
  market: CountryCode;
  priceMode: PriceMode;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  onOpenSidebar: () => void;
  onOpenProfile: () => void;
  onOpenReels: () => void;
  onOpenHome: () => void;
  onAsk: (query: string) => void;
  notify: (message: string) => void;
}

type CenterTab = ActivityTab | 'settings';
const TABS = [
  { id: 'watched', zh: '看过', en: 'Watched', Icon: Play },
  { id: 'likes', zh: '点赞', en: 'Liked', Icon: Heart },
  { id: 'saved', zh: '收藏', en: 'Saved', Icon: Bookmark },
  { id: 'browsing', zh: '浏览', en: 'History', Icon: Clock3 },
  { id: 'settings', zh: '设置', en: 'Settings', Icon: Settings2 },
] as const;

export function AccountView({ market, priceMode, onMarketChange, onPriceModeChange,
  onOpenSidebar, onOpenProfile, onOpenReels, onOpenHome, onAsk, notify }: AccountViewProps) {
  const { i18n } = useTranslation();
  const { user } = useSession();
  const english = i18n.language.startsWith('en');
  const copy = (zh: string, en: string) => english ? en : zh;
  const [tab, setTab] = useState<CenterTab>('watched');
  const [profile, setProfile] = useState<ShoppingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setProfile(null);
    getProfile().then((value) => { if (active) setProfile(value); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, refresh]);

  function selectTab(next: CenterTab, focus = false) {
    setTab(next);
    if (focus) tabButtons.current[TABS.findIndex((item) => item.id === next)]?.focus();
  }

  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    selectTab(TABS[next].id, true);
  }

  const items = tab === 'settings' ? [] : accountActivity(profile, tab, english);
  const metrics = [
    { tab: 'watched' as const, count: profile?.video?.views ?? 0, label: copy('次观看', 'views') },
    { tab: 'likes' as const, count: profile?.video?.likes ?? 0, label: copy('个点赞', 'likes') },
    { tab: 'saved' as const, count: profile?.video?.saves ?? 0, label: copy('个收藏', 'saved') },
  ];
  const activeTab = TABS.find((item) => item.id === tab)!;
  const EmptyIcon = activeTab.Icon;
  const name = user?.displayName?.trim() || 'Pico';
  const marketName = english ? MARKETS[market].nameEn : MARKETS[market].nameZh;

  return <section className="pc-page pc-account-center" aria-label={copy('个人中心', 'Your space')}>
    <header className="account-toolbar">
      <button type="button" className="account-icon-button account-menu" aria-label={copy('打开导航', 'Open navigation')} onClick={onOpenSidebar}><Menu size={21} /></button>
      <h1>{copy('个人中心', 'Your space')}</h1>
      <button type="button" className="account-icon-button" aria-label={copy('刷新个人记录', 'Refresh activity')} disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={18} /></button>
    </header>

    <div className="account-content">
      <div className="account-identity">
        <div className="account-avatar" role="img" aria-label={copy('Picolah 卡通头像', 'Picolah cartoon avatar')}><Capybara variant="face" size={128} /></div>
        <div className="account-intro">
          <div className="account-name-row"><h2>{name}</h2><span className="account-member-label">{copy(user ? 'Picolah 成员' : '本机访客', user ? 'Picolah member' : 'Guest on this browser')}</span></div>
          {user?.email && <p className="account-email">{user.email}</p>}
          <div className="account-stats" aria-label={copy('我的互动', 'Your interactions')}>
            {metrics.map((metric) => <button key={metric.tab} type="button" onClick={() => selectTab(metric.tab, true)}>
              <strong>{loading || failed ? '—' : metric.count.toLocaleString(english ? 'en-US' : 'zh-CN')}</strong><span>{metric.label}</span>
            </button>)}
          </div>
          <div className="account-context"><CountryFlag code={market} width={18} /><span>{marketName} · {MARKETS[market].currency}</span>
            {(profile?.video?.topics ?? []).slice(0, 2).map((topic) => <span className="account-interest" key={topic.id}>{english ? topic.labelEn : topic.labelZh}</span>)}
          </div>
          <div className="account-actions">
            <button className="account-button account-button-primary" type="button" onClick={() => selectTab('settings', true)}><Settings2 size={15} />{copy('偏好设置', 'Preferences')}</button>
            <button className="account-button" type="button" onClick={onOpenProfile}><Sparkles size={15} />{copy('查看画像', 'Your interests')}</button>
          </div>
        </div>
      </div>

      <div className="account-tabs" role="tablist" aria-label={copy('个人内容', 'Your content')}>
        {TABS.map(({ id, zh, en, Icon }, index) => <button key={id} type="button" ref={(element) => { tabButtons.current[index] = element; }}
          id={`account-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="account-panel" tabIndex={tab === id ? 0 : -1}
          onClick={() => selectTab(id)} onKeyDown={(event) => tabKey(event, index)}><Icon size={17} /><span>{english ? en : zh}</span></button>)}
      </div>

      <div id="account-panel" role="tabpanel" tabIndex={0} aria-labelledby={`account-tab-${tab}`} className="account-panel">
        {tab === 'settings' ? <AccountSettings market={market} priceMode={priceMode} onMarketChange={onMarketChange} onPriceModeChange={onPriceModeChange} notify={notify} />
          : loading ? <div className="account-loading" role="status"><span />{copy('正在读取个人记录…', 'Loading your activity…')}</div>
            : failed ? <div className="account-empty" role="status"><RefreshCw size={28} /><h3>{copy('暂时无法读取记录', 'Activity is unavailable')}</h3><p>{copy('请稍后重试。', 'Please try again in a moment.')}</p><button className="account-button" onClick={() => setRefresh((value) => value + 1)}>{copy('重试', 'Try again')}</button></div>
              : <>
                <div className="account-section-head"><h3>{copy('最近记录', 'Recent activity')}<span>{items.length}</span></h3><span>{copy('仅展示最近同步的记录', 'Showing recently synced activity')}</span></div>
                {items.length ? <div className="account-post-grid">
                  {items.map((item, index) => <article className="account-post" key={item.id}>
                    <div className={`account-post-cover account-post-tone-${index % 4}`}>
                      <span className="account-post-kind">{copy(item.kind === 'video' ? '动画短片' : '购物足迹', item.kind === 'video' ? 'ANIMATED REEL' : 'SHOPPING')}</span>
                      <span className="account-post-symbol" aria-hidden="true">{item.kind === 'video' ? <Play size={16} fill="currentColor" /> : <Clock3 size={17} />}</span>
                      <Capybara size={124} />
                      <strong>{item.reel?.productName || copy('Pico 一下', 'A little Pico')}</strong>
                    </div>
                    <div className="account-post-caption"><h4>{item.title}</h4><p>{item.reel?.handle || copy('比价记录', 'Comparison')}<span>·</span>{relativeTime(item.createdAt)}</p>
                      {item.reel && <button type="button" aria-label={`${copy('比价', 'Compare')} ${item.reel.productName}`} onClick={() => onAsk(item.reel!.query)}>{copy('查看比价', 'Compare prices')}<ChevronRight size={13} /></button>}
                    </div>
                  </article>)}
                </div> : <div className="account-empty"><span className="account-empty-icon"><EmptyIcon size={30} strokeWidth={1.4} /></span>
                  <h3>{copy('这里还没有近期记录', 'No recent activity here')}</h3><p>{copy(tab === 'saved' ? '遇到喜欢的短片，点一下收藏。' : tab === 'likes' ? '给喜欢的短片一颗心，下次更容易找到。' : tab === 'browsing' ? '比较过的商品，会在这里留下足迹。' : '从一条感兴趣的短片开始。', tab === 'saved' ? 'Save a Reel to keep it close.' : tab === 'likes' ? 'Like a Reel to find it again later.' : tab === 'browsing' ? 'Your recent comparisons will appear here.' : 'Start with a Reel that catches your eye.')}</p>
                  <button className="account-button account-button-primary" onClick={tab === 'browsing' ? onOpenHome : onOpenReels}>{tab === 'browsing' ? copy('去比价', 'Start comparing') : copy('探索短视频', 'Explore Reels')}<ChevronRight size={15} /></button>
                </div>}
                <p className="account-private-note"><ShieldCheck size={13} />{copy('记录用于个性化推荐，可在画像页清空。', 'Activity personalizes your feed. Clear it from Your interests.')}</p>
              </>}
      </div>
    </div>
  </section>;
}
