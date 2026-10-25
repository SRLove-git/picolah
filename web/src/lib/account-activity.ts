import { REELS, type Reel } from '../../shared/reels';
import type { ShoppingProfile } from '../../shared/types';

export type ActivityTab = 'watched' | 'likes' | 'saved' | 'browsing';
export interface AccountActivity {
  id: string;
  title: string;
  createdAt: string;
  reel?: Reel;
  kind: 'video' | 'comparison' | 'offer_click';
}

/** The profile API exposes recent snapshots, not a complete activity archive. */
export function accountActivity(profile: ShoppingProfile | null, tab: ActivityTab, english: boolean): AccountActivity[] {
  if (!profile) return [];
  if (tab === 'browsing') return profile.recent.map((event) => ({
    id: event.id, title: english ? event.titleEn : event.titleZh,
    createdAt: event.createdAt, kind: event.type,
  }));
  const types = tab === 'watched' ? ['view', 'watch'] : tab === 'likes' ? ['like', 'unlike'] : ['save', 'unsave'];
  const seen = new Set<string>();
  return [...(profile.video?.recent ?? [])]
    .filter((event) => types.includes(event.type))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((event) => {
      if (seen.has(event.reelId)) return false;
      seen.add(event.reelId);
      return true;
    })
    .filter((event) => event.type !== 'unlike' && event.type !== 'unsave')
    .map((event) => {
      const reel = REELS.find((item) => item.id === event.reelId);
      return { id: event.reelId, title: english && reel ? reel.productName : event.title,
        createdAt: event.createdAt, reel, kind: 'video' };
    });
}
