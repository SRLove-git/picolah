import { uiText, localizeCopy } from '../lib/ui-copy';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowUpRight, CircleDot, HandHeart, Heart, Leaf, Moon, NotebookPen, Pause, Play, Shirt, Sparkles, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CapyView } from '../../shared/capybara';
import type { CapyExpression } from './CapyExpressionArt';
import type { CapyAction as Action } from '../lib/capy-motion';
import { capyRoomAction } from '../../shared/capy-room';
import { useCapyRoom } from '../lib/use-capy-room';
import { CapyAvatar } from './CapyAvatar';
import { Capybara } from './PicolahMark';
import { CapyHabitat, CapyHabitatHud, type OpenCapyPanel } from './CapyHabitat';
import napArt from '../assets/capy-room-v1/capy-nap.webp';
import './capy-companion.css';

const EXPRESSION: Record<Action, CapyExpression> = {
  idle: 'idle', pet: 'happy', feed: 'snack', play: 'playful', rest: 'sleepy', wake: 'happy', outfit: 'playful',
};
const COPY = {
  zh: {
    actions: ['摸摸头', '喂小叶子', '逗它玩', '小睡一下', '叫醒它'],
    moods: { idle: '等你来玩', happy: '被宠爱啦', snack: '吃得香香', playful: '开心加倍', sleepy: '做个好梦' },
    lines: {
      idle: ['陪我待一会儿吧，点点我就会回应。'],
      pet: ['嘿嘿，摸头是今天最喜欢的事。', '再靠近一点，给你一个软乎乎的贴贴。', '舒服得耳朵都要融化啦。'],
      feed: ['咔嚓咔嚓，这片小叶子好清甜。', '收到一份绿色的小快乐，谢谢你。'],
      play: ['接住！送你一颗今天的开心。', '你一逗我，我就忍不住笑。', '眨个眼，快乐就传给你啦。'],
      rest: ['呼……小声一点，我去梦里逛逛。'],
      wake: ['睡醒啦，伸个懒腰继续陪你。'],
      outfit: ['新造型上身，今天也要可可爱爱。'],
    },
    short: { idle: '摸摸我？', pet: '嘿嘿，喜欢！', feed: '咔嚓咔嚓～', play: '眨眼，接住快乐！', rest: '呼……', wake: '我醒啦！', outfit: '新造型，喜欢吗？' },
    petLabel: '摸摸卡皮巴拉', wakeLabel: '叫醒卡皮巴拉', explore: '陪卡皮玩',
    pause: '暂停动作', resume: '继续动作', controls: '和卡皮巴拉互动',
  },
  en: {
    actions: ['Head pat', 'Little snack', 'Play', 'Nap time', 'Wake up'],
    moods: { idle: 'Ready to play', happy: 'Feeling loved', snack: 'Happy munching', playful: 'Extra happy', sleepy: 'Sweet dreams' },
    lines: {
      idle: ['Stay a little. Tap me and say hello.'],
      pet: ['A head pat! My favourite little moment.', 'Scooting a little closer for a fluffy cuddle.', 'That feels so nice. Even my ears agree.'],
      feed: ['Crunch, crunch. What a lovely little leaf.', 'A little green treat! Thank you.'],
      play: ['Catch! A little spark of happy, just for you.', 'You always know how to make me grin.', 'One wink. A little happiness, passed along.'],
      rest: ['Shh… off for a tiny dream adventure.'],
      wake: ['A little stretch, and I’m back!'],
      outfit: ['New outfit, same fluffy me. How do I look?'],
    },
    short: { idle: 'A little head pat?', pet: 'Hehe. Love that!', feed: 'Crunch, crunch!', play: 'A wink for you!', rest: 'Zzz…', wake: 'I’m awake!', outfit: 'Like my new look?' },
    petLabel: 'Pet the capybara', wakeLabel: 'Wake the capybara', explore: 'Play with Capy',
    pause: 'Pause motion', resume: 'Resume motion', controls: 'Play with your capybara',
  },
} as const;

interface Props {
  view?: CapyView;
  size?: number;
  compact?: boolean;
  outfitVersion?: number;
  onExplore?: () => void;
  room?: boolean;
  onOpenPanel?: OpenCapyPanel;
  roomMenuOpen?: boolean;
}

/** Reactions are transient; shopping progress and earned outfits stay server-owned. */
export function CapyCompanion({ view, size = 300, compact = false, outfitVersion = 0, onExplore, room = false, onOpenPanel, roomMenuOpen = false }: Props) {
  const { i18n } = useTranslation();
  const en = !i18n.language.startsWith('zh');
  const copy = en ? localizeCopy(COPY.en) : COPY.zh;
  const { store, state: roomState } = useCapyRoom();
  const reaction = { action: capyRoomAction(roomState), variation: roomState.sequence };
  const [keyboard, setKeyboard] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const evening = roomState.evening;
  const [napReady, setNapReady] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const timer = useRef<number | undefined>(undefined);
  const follow = useRef<HTMLSpanElement>(null);
  const expression = reaction.action === 'pet' && reaction.variation % 3 === 2 ? 'playful' : EXPRESSION[reaction.action];
  const sleeping = expression === 'sleepy';
  // Keep the dressed, breathing rig while resting: the curled illustration
  // has no clothing layers and would otherwise make the selected outfit vanish.
  const dressedNap = room && sleeping && Boolean(view?.worn.some((item) => item.slot === 'body'));
  const napping = room && sleeping && napReady && !dressedNap;
  const night = evening || (room && sleeping);

  const clearTimers = useCallback(() => {
    window.clearTimeout(timer.current);
  }, []);

  const react = useCallback((action: Action, pointer = true) => {
    clearTimers();
    const events = { idle: 'PUT_AWAY', pet: 'PET', feed: 'FEED', play: 'CELEBRATE', rest: 'SLEEP', wake: 'WAKE', outfit: 'DRESS' } as const;
    store.send({ type: events[action] });
    setKeyboard(!pointer);
    if (follow.current) follow.current.style.transform = '';
  }, [clearTimers, store]);

  useEffect(() => {
    clearTimers();
    if (reaction.action !== 'rest' && reaction.action !== 'idle') {
      timer.current = window.setTimeout(() => store.send({ type: 'CLIP_FINISHED', sequence: reaction.variation }), 4200);
    }
    return clearTimers;
  }, [reaction.action, reaction.variation, clearTimers, store]);

  useEffect(() => {
    function visibility() {
      const isHidden = document.visibilityState === 'hidden';
      setHidden(isHidden);
      if (isHidden) {
        clearTimers();
        store.send({ type: 'CLIP_FINISHED', sequence: store.getSnapshot().sequence });
      }
    }
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { clearTimers(); document.removeEventListener('visibilitychange', visibility); };
  }, [clearTimers, store]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => { if (outfitVersion > 0) react('outfit'); }, [outfitVersion, react]);

  function lookAtPointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== 'mouse' || sleeping || paused || !follow.current ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-0.5, Math.min(0.5, (event.clientX - box.left) / box.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (event.clientY - box.top) / box.height - 0.5));
    follow.current.style.transform = `translate(${x * 8}px, ${y * 4}px) rotate(${x * 3}deg)`;
  }

  const lines = copy.lines[reaction.action];
  const ReactionIcon = sleeping ? Moon : reaction.action === 'feed' ? Leaf : expression === 'playful' ? Sparkles : Heart;
  const actions = [
    { action: 'pet', Icon: HandHeart, label: copy.actions[0] },
    { action: 'feed', Icon: Leaf, label: copy.actions[1] },
    { action: 'play', Icon: Sparkles, label: copy.actions[2] },
    { action: sleeping ? 'wake' : 'rest', Icon: sleeping ? Sun : Moon, label: copy.actions[sleeping ? 4 : 3] },
  ] as const;
  const roomActions = [
    { action: 'feed', Icon: Leaf, label: en ? uiText('Snack') : '喂食', accessible: copy.actions[1] },
    { action: 'play', Icon: CircleDot, label: en ? uiText('Play') : '玩耍', accessible: copy.actions[2] },
    { action: sleeping ? 'wake' : 'rest', Icon: sleeping ? Sun : Moon, label: en ? uiText(sleeping ? 'Wake' : 'Sleep') : (sleeping ? '起床' : '睡觉'), accessible: copy.actions[sleeping ? 4 : 3] },
  ] as const;
  const motion = { action: reaction.action, sequence: reaction.variation, playing: !paused && !keyboard && !hidden && !reduced && !napping && !roomMenuOpen };

  return <div className={`pc-companion ${compact ? 'is-compact' : ''} ${room ? 'is-room' : ''}`}
    data-expression={expression} data-action={reaction.action} data-stage={view?.stage.id}
    data-night={night} data-napping={napping} data-dressed-nap={dressedNap} data-still={paused || keyboard} data-paused={hidden || roomMenuOpen}>
    <p className={`pc-companion-speech ${compact ? 'pc-hero-bubble' : ''}`} role="status" aria-live="polite" aria-atomic="true">
      {compact || (room && reaction.action === 'idle') ? copy.short[reaction.action] : lines[reaction.variation % lines.length]}
    </p>
    <div className="pc-companion-scene">
      {room && <>
        <CapyHabitat sleeping={sleeping} night={night} sequence={reaction.variation} onInteract={react} onOpenPanel={onOpenPanel}
          onLight={(pointer) => { setKeyboard(!pointer); store.send({ type: 'TOGGLE_LIGHT' }); }} />
        {view && <CapyHabitatHud view={view} onOpenPanel={onOpenPanel} />}
      </>}
      {!compact && <span className="pc-companion-mood"><i aria-hidden="true" />{copy.moods[expression]}</span>}
        <button type="button" className="pc-companion-pause" aria-label={paused ? copy.resume : copy.pause}
          title={paused ? copy.resume : copy.pause} aria-pressed={paused} onClick={() => {
            setPaused((value) => !value);
            if (follow.current) follow.current.style.transform = '';
          }}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>
      <button type="button" className="pc-companion-touch" style={{ width: size }}
        aria-label={sleeping ? copy.wakeLabel : copy.petLabel}
        onPointerMove={lookAtPointer}
        onPointerLeave={() => { if (follow.current) follow.current.style.transform = ''; }}
        onClick={(event) => react(sleeping ? 'wake' : 'pet', event.detail > 0)}>
        <span className="pc-companion-follow" ref={follow} data-nap-hidden={napping}>
          <span className="pc-companion-pose">
            {view ? <CapyAvatar view={view} size={size} expression={expression} motion={motion} />
              : <Capybara size={size} expression={expression} motion={motion} />}
          </span>
        </span>
        {room && <span className="pc-room-nap" data-visible={napping} aria-hidden="true">
          <img src={napArt} alt="" draggable={false} onLoad={() => setNapReady(true)} onError={() => setNapReady(false)} />
        </span>}
        <span className="pc-companion-effects" aria-hidden="true" data-active={expression !== 'idle'}>
          <ReactionIcon className="pc-companion-effect is-one" size={compact ? 16 : 24} />
          <ReactionIcon className="pc-companion-effect is-two" size={compact ? 11 : 16} />
          {sleeping && <span className="pc-companion-zzz">z z z</span>}
        </span>
      </button>
    </div>
    {room && <div className="pc-room-dock" role="group" aria-label={en ? uiText("Capy's daily life") : '卡皮的日常'}>
      {roomActions.map(({ action, Icon, label, accessible }) => <button key={action} type="button"
        className={`pc-room-dock-button is-${action}`} aria-label={accessible} data-active={reaction.action === action}
        onClick={(event) => react(action, event.detail > 0)}>
        <span className="pc-room-dock-icon" aria-hidden="true"><Icon size={27} strokeWidth={2.1} /></span><span>{label}</span>
      </button>)}
      <button type="button" className="pc-room-dock-button is-wardrobe" aria-haspopup="dialog"
        aria-label={en ? uiText('Dress up Capy') : '给卡皮换装'} onClick={(event) => onOpenPanel?.('wardrobe', event.currentTarget, event.detail === 0)}>
        <span className="pc-room-dock-icon" aria-hidden="true"><Shirt size={27} strokeWidth={2.1} /></span><span>{en ? uiText('Dress up') : '换装'}</span>
      </button>
      <button type="button" className="pc-room-dock-button is-journal" aria-haspopup="dialog"
        aria-label={en ? uiText("Open Capy's diary") : '打开卡皮的日记'} onClick={(event) => onOpenPanel?.('journal', event.currentTarget, event.detail === 0)}>
        <span className="pc-room-dock-icon" aria-hidden="true"><NotebookPen size={27} strokeWidth={2.1} /></span><span>{en ? uiText('Journal') : '日记'}</span>
      </button>
    </div>}
    {!compact && !room && <div className="pc-companion-actions" role="group" aria-label={copy.controls}>
      {actions.map(({ action, Icon, label }) => <button key={action} type="button"
        data-active={reaction.action === action} onClick={(event) => react(action, event.detail > 0)}>
        <Icon size={19} strokeWidth={1.7} /><span>{label}</span>
      </button>)}
    </div>}
    {onExplore && <button type="button" className="pc-companion-explore" onClick={onExplore}>
      {copy.explore}<ArrowUpRight size={13} />
    </button>}
  </div>;
}
