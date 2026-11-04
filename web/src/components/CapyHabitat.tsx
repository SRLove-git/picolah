import { uiText, uiTemplate } from '../lib/ui-copy';
import { Armchair, Leaf, Moon, Shirt, Sprout, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import type { CapyView } from '../../shared/capybara';
import type { CapyAction } from '../lib/capy-motion';
import roomDay from '../assets/capy-room-v1/room-day.webp';
import roomMobile from '../assets/capy-room-v1/room-mobile.webp';

export type CapyRoomPanel = 'wardrobe' | 'tryon' | 'growth' | 'journal' | 'purchases';
export type OpenCapyPanel = (panel: CapyRoomPanel, trigger: HTMLButtonElement, keyboard: boolean) => void;

/** Furniture is actionable; the generated room is only the decorative plate. */
export function CapyHabitat({ sleeping, night, sequence, onLight, onInteract, onOpenPanel, liveToys = false }: {
  sleeping: boolean;
  night: boolean;
  sequence: number;
  onLight: (pointer: boolean) => void;
  onInteract: (action: CapyAction, pointer: boolean) => void;
  onOpenPanel?: OpenCapyPanel;
  liveToys?: boolean;
}) {
  const { i18n } = useTranslation();
  const en = !i18n.language.startsWith('zh');
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  return <>
    <picture className="pc-room-background" aria-hidden="true">
      {!portraitFailed && <source media="(max-width: 720px)" srcSet={roomMobile} />}
      <img src={roomDay} alt="" draggable={false} fetchPriority="high" style={{ opacity: backgroundFailed ? 0 : 1 }}
        onError={(event) => {
          if (event.currentTarget.currentSrc.endsWith(roomMobile)) setPortraitFailed(true);
          else setBackgroundFailed(true);
        }} />
    </picture>
    <span className="pc-room-evening" aria-hidden="true" />
    <span className="pc-room-window-glow" aria-hidden="true" />
    <button type="button" className="pc-room-light" aria-pressed={night}
      aria-label={en ? uiText(night ? 'Turn on daylight' : 'Switch to evening') : (night ? '打开日光' : '切换夜晚')}
      title={en ? uiText(night ? 'Daylight' : 'Evening') : (night ? '日光' : '夜晚')}
      onClick={(event) => onLight(event.detail > 0)}>{night ? <Sun size={16} /> : <Moon size={16} />}</button>
    <button type="button" className="pc-room-hotspot is-bed"
      aria-label={en ? uiText(sleeping ? 'Wake Capy at the bed' : 'Rest at the little bed') : (sleeping ? '在小床叫醒卡皮' : '到小床休息')}
      onClick={(event) => onInteract(sleeping ? 'wake' : 'rest', event.detail > 0)}>
      <span className="pc-room-hotspot-dot"><Armchair size={15} /></span>
      <span className="pc-room-hotspot-label">{en ? uiText(sleeping ? 'Wake up' : 'Cozy bed') : (sleeping ? '起床啦' : '休息一下')}</span>
    </button>
    <button type="button" className="pc-room-hotspot is-table"
      aria-label={en ? uiText('Feed Capy at the snack table') : '在小餐台喂卡皮'}
      onClick={(event) => onInteract('feed', event.detail > 0)}>
      <span className="pc-room-hotspot-dot"><Leaf size={15} /></span>
      <span className="pc-room-hotspot-label">{en ? uiText('Snack table') : '开饭啦'}</span>
    </button>
    <button type="button" className="pc-room-hotspot is-wardrobe"
      aria-label={en ? uiText('Open the wardrobe') : '打开衣橱'} aria-haspopup="dialog"
      onClick={(event) => onOpenPanel?.('wardrobe', event.currentTarget, event.detail === 0)}>
      <span className="pc-room-hotspot-dot"><Shirt size={15} /></span>
      <span className="pc-room-hotspot-label">{en ? uiText('Dress up') : '换个造型'}</span>
    </button>
    {!liveToys && <button type="button" className="pc-room-toy" aria-label={en ? uiText('Play with the ball') : '和卡皮玩小球'}
      onClick={(event) => onInteract('play', event.detail > 0)}>
      <span key={sequence} className="pc-room-ball" aria-hidden="true" />
    </button>}
    {!liveToys && <span key={`snack-${sequence}`} className="pc-room-snack-trail" aria-hidden="true"><Leaf size={24} /><Leaf size={16} /></span>}
  </>;
}

export function CapyHabitatHud({ view, onOpenPanel }: { view: CapyView; onOpenPanel?: OpenCapyPanel }) {
  const { t, i18n } = useTranslation();
  const en = !i18n.language.startsWith('zh');
  return <div className="pc-room-hud">
    <button type="button" className="pc-room-level" aria-haspopup="dialog"
      aria-label={en ? uiTemplate`See Capy's growth, level ${view.level}` : `查看卡皮的成长，等级 ${view.level}`}
      onClick={(event) => onOpenPanel?.('growth', event.currentTarget, event.detail === 0)}>
      <span className="pc-room-level-icon" aria-hidden="true"><Sprout size={20} /></span>
      <span className="pc-room-hud-title"><strong>Lv.{view.level}</strong><span>{en ? uiText('Growing up') : '成长日记'}</span></span>
    </button>
    <div className="pc-capy-meter" role="progressbar" aria-valuemin={0} aria-valuemax={view.span}
      aria-valuenow={view.into} aria-label={t('capybara.xp', { into: view.into, span: view.span })}>
      <span style={{ width: `${Math.round(view.progress * 100)}%` }} />
    </div>
  </div>;
}
