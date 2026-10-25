import { Clapperboard, Heart, Tags, UserRound, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { VideoInterest, VideoProfile, ReelEventType } from '../../shared/reels';
import { relativeTime } from '../lib/format';
import './video-profile.css';

const ACTIONS: Record<ReelEventType, [string, string]> = {
  view: ['观看', 'Viewed'], watch: ['观看进度', 'Watch progress'],
  like: ['点赞', 'Liked'], unlike: ['取消点赞', 'Unliked'],
  save: ['收藏', 'Saved'], unsave: ['取消收藏', 'Unsaved'],
  follow: ['关注作者', 'Followed creator'], unfollow: ['取消关注', 'Unfollowed creator'],
  share: ['分享', 'Shared'], not_interested: ['不感兴趣', 'Not interested'],
  compare: ['查看比价', 'Compared product'],
};

function Interests({ title, items, english }: {
  title: string; items: VideoInterest[]; english: boolean;
}) {
  return (
    <div className="video-profile-interests">
      <h4>{title}</h4>
      {items.length ? <ul>
        {items.slice(0, 4).map((item) => <li key={item.id}>
          <span>{english ? item.labelEn : item.labelZh}</span>
          <span className="video-profile-track" aria-hidden="true"><i style={{ width: `${Math.min(100, item.share * 100)}%` }} /></span>
          <small>{Math.round(item.share * 100)}%</small>
        </li>)}
      </ul> : <p>{english ? 'Keep exploring to build your interests.' : '多看一些内容，兴趣会逐渐清晰。'}</p>}
    </div>
  );
}

export function VideoProfileCard({ profile, onReset, resetting }: {
  profile: VideoProfile;
  onReset: () => void;
  resetting: boolean;
}) {
  const { i18n, t } = useTranslation();
  const english = i18n.language === 'en';
  const copy = (zh: string, en: string) => english ? en : zh;
  return <section className="persona-card video-profile-card" aria-label={copy('视频兴趣画像', 'Video interests')}>
    <header className="persona-card-head">
      <span className="persona-card-icon tone-lilac"><Clapperboard size={17} /></span>
      <div>
        <h3>{copy('视频兴趣画像', 'Video interests')}</h3>
        <p>{copy('观看与互动会影响下一条推荐，近期兴趣更受重视。', 'Watch time and interactions shape your next recommendation, with more weight on recent interests.')}</p>
      </div>
    </header>
    <div className="video-profile-stats">
      {[
        [profile.views, copy('观看次数', 'Views')],
        [`${Math.round(profile.watchedMs / 1000)}s`, copy('有效观看', 'Active watch time')],
        [`${Math.round(profile.completionRate * 100)}%`, copy('完播率', 'Completion rate')],
        [profile.likes, copy('点赞', 'Likes')],
        [profile.saves, copy('收藏', 'Saved')],
        [profile.skips, copy('快速划走', 'Quick skips')],
      ].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </div>
    <div className="video-profile-grid">
      <Interests title={copy('偏好品类', 'Categories')} items={profile.categories} english={english} />
      <Interests title={copy('关注品牌', 'Brands')} items={profile.brands} english={english} />
    </div>
    <div className="video-profile-labels">
      <Tags size={14} aria-hidden="true" />
      <span>{copy('兴趣标签', 'Topics')}</span>
      {profile.topics.slice(0, 6).map((item) => <span className="video-profile-tag" key={item.id}>{english ? item.labelEn : item.labelZh}</span>)}
      {!profile.topics.length && <small>{copy('尚未形成明确标签', 'No clear topics yet')}</small>}
    </div>
    <div className="video-profile-labels">
      <UserRound size={14} aria-hidden="true" />
      <span>{copy('喜欢的作者', 'Creators you enjoy')}</span>
      {profile.creators.slice(0, 3).map((item) => <span className="video-profile-tag" key={item.id}>{english ? item.labelEn : item.labelZh}</span>)}
      {!profile.creators.length && <small>{copy('尚未形成明显偏好', 'No clear preference yet')}</small>}
    </div>
    {profile.recent.length > 0 && <details className="video-profile-history">
      <summary><Heart size={14} />{copy('最近观看与互动', 'Recent views and interactions')}</summary>
      <ul>{profile.recent.slice(0, 8).map((event, index) => <li key={`${event.reelId}-${event.createdAt}-${index}`}>
        <span>{event.title}</span>
        <small>{ACTIONS[event.type][english ? 1 : 0]} · {relativeTime(event.createdAt)}</small>
      </li>)}</ul>
    </details>}
    <div className="video-profile-footer">
      <p>{copy('点击“不感兴趣”会减少类似推荐。清空画像可重新开始；演示卡片的观看进度仅用于体验推荐。', '“Not interested” reduces similar recommendations. Clear your profile for a fresh start. Demo-card viewing progress is used to try the recommendations.')}</p>
      <button className="persona-reset" type="button" disabled={resetting} onClick={onReset}>
        <Trash2 size={14} />{t(resetting ? 'profile.resetting' : 'profile.reset')}
      </button>
    </div>
  </section>;
}
