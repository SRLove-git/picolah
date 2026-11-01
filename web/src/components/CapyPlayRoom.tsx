import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Armchair, Bubbles, CircleDot, Leaf, Moon, Music2, NotebookPen, Pause, Play, Shirt, Sparkles, Sun, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CapyView } from '../../shared/capybara';
import type { CapyAction } from '../lib/capy-motion';
import type { CapyGame } from '../lib/capy-play';
import type { createCapyPlayScene } from '../lib/capy-play-scene';
import { CapyAvatar } from './CapyAvatar';
import { CapyHabitat, CapyHabitatHud, type OpenCapyPanel } from './CapyHabitat';
import './capy-companion.css';
import './capy-play.css';

const TOYS = [
  { id: 'ball' as const, Icon: CircleDot, name: ['追球球', 'Ball chase'], hint: ['把球抛到地毯上，卡皮会跑过去踢回来。', 'Toss it onto the rug. Capy will run over and kick it back.'], button: ['再抛一次', 'Toss again'], color: '#f7dfac' },
  { id: 'bubbles' as const, Icon: Bubbles, name: ['接泡泡', 'Bubble pop'], hint: ['吹一串泡泡，看卡皮伸爪、跳起来碰它们。', 'Blow some bubbles. Capy will reach up and jump to pop them.'], button: ['吹泡泡', 'Blow bubbles'], color: '#cbe4df' },
  { id: 'swing' as const, Icon: Armchair, name: ['荡秋千', 'Little swing'], hint: ['轻轻推一下，陪卡皮慢慢荡。', 'Give a gentle push and watch Capy sway.'], button: ['推一下', 'Give a push'], color: '#e4d5ed' },
  { id: 'dance' as const, Icon: Music2, name: ['扭扭舞', 'Happy dance'], hint: ['点一下换个舞步，一起扭扭、转个圈。', 'Tap for a new step, a wiggle and a little spin.'], button: ['换个舞步', 'New dance step'], color: '#efced3' },
];

export function CapyPlayRoom({ view, outfitVersion, onOpenPanel, roomMenuOpen }: {
  view: CapyView; outfitVersion: number; onOpenPanel: OpenCapyPanel; roomMenuOpen: boolean;
}) {
  const { i18n } = useTranslation(), en = i18n.language.startsWith('en'), language = en ? 1 : 0;
  const canvas = useRef<HTMLCanvasElement>(null), engine = useRef<ReturnType<typeof createCapyPlayScene> | null>(null);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [game, setGame] = useState<CapyGame | null>(null), [action, setAction] = useState<CapyAction>('idle');
  const [contacts, setContacts] = useState(0), [paused, setPaused] = useState(false), [evening, setEvening] = useState(false);
  const [toysOpen, setToysOpen] = useState(false), [instant, setInstant] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sleeping = action === 'rest', night = evening || sleeping;
  const controls = { playing: !paused && !roomMenuOpen && !toysOpen, reduced, night, worn: view.worn.map((item) => item.id) };
  const current = useRef(controls); current.current = controls;
  const toy = TOYS.find((item) => item.id === game);
  const initialOutfitVersion = useRef(outfitVersion);
  useEffect(() => {
    let disposed = false;
    void import('../lib/capy-play-scene').then(({ createCapyPlayScene }) => {
      if (disposed || !canvas.current) return;
      const scene = createCapyPlayScene(canvas.current, setContacts, setAction, setReady);
      engine.current = scene; scene.controls(current.current); setReady(true);
    }).catch(() => { if (!disposed) { setFailed(true); setReady(false); } });
    return () => { disposed = true; engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { engine.current?.controls(controls); }, [paused, roomMenuOpen, toysOpen, reduced, night, view.worn]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (initialOutfitVersion.current !== outfitVersion) { initialOutfitVersion.current = outfitVersion; if (!game) act('outfit'); }
  }, [outfitVersion]);
  function act(next: CapyAction) { setGame(null); setAction(next); setContacts(0); setPaused(false); engine.current?.action(next); }
  function play(next: CapyGame) { setGame(next); setAction('play'); setContacts(0); setPaused(false); engine.current?.game(next); setToysOpen(false); }
  function finish() { setGame(null); setAction('idle'); engine.current?.game(null); }
  const expression = sleeping ? 'sleepy' : action === 'feed' ? 'snack' : action === 'play' || action === 'outfit' ? 'playful' : action === 'pet' || action === 'wake' ? 'happy' : 'idle';
  const message = toy ? toy.hint[language] : sleeping ? (en ? 'A little dream, then more adventures.' : '先做一个小小的梦，睡醒再陪你玩。') : action === 'feed' ? (en ? 'Crunch, crunch. A tasty little leaf!' : '咔嚓咔嚓，小叶子真好吃。') : action === 'pet' ? (en ? 'Hehe. One more head pat?' : '嘿嘿，再摸摸头嘛。') : action === 'outfit' ? (en ? 'New outfit, ready to play!' : '穿好新衣服，准备出门玩！') : (en ? 'Pick a toy. Let’s play together!' : '挑个玩具，我们一起玩吧！');
  const interaction = toy ? toy.button[language] : sleeping ? (en ? 'Wake the capybara' : '叫醒卡皮巴拉') : (en ? 'Pet the capybara' : '摸摸卡皮巴拉');
  return <Dialog.Root open={toysOpen} onOpenChange={setToysOpen}>
    <div className="pc-companion is-room is-three-room" data-action={action} data-game={game ?? 'none'} data-expression={expression}
      data-night={night} data-paused={paused || roomMenuOpen || toysOpen} data-renderer={ready ? 'three' : failed ? 'fallback' : 'loading'}>
      <div className="pc-companion-scene">
        <CapyHabitat sleeping={sleeping} night={night} sequence={0} onInteract={(next) => act(next)} onOpenPanel={onOpenPanel} liveToys
          onLight={() => { if (sleeping) { act('wake'); setEvening(false); } else setEvening((value) => !value); }} />
        <CapyHabitatHud view={view} onOpenPanel={onOpenPanel} />
        <button type="button" className="pc-play-canvas-button" aria-label={interaction} disabled={!ready || paused}
          onClick={(event) => { if (!game) setAction(sleeping ? 'wake' : 'pet'); engine.current?.interact(event.detail ? event.clientX : undefined, event.detail ? event.clientY : undefined); }}>
          <canvas ref={canvas} className="pc-play-canvas" aria-hidden="true" />
        </button>
        {!ready && <div className="pc-play-loading-character" aria-hidden="true"><CapyAvatar view={view} size={360} expression={expression} /></div>}
        <p className="pc-companion-speech" role="status" aria-live="polite">{failed ? (en ? 'The toys could not open on this device. Your wardrobe and diary are still here.' : '这台设备暂时打不开互动玩具，衣橱和日记仍然可以使用。') : message}</p>
        <button type="button" className="pc-companion-pause" aria-label={paused ? (en ? 'Resume motion' : '继续动作') : (en ? 'Pause motion' : '暂停动作')}
          aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
        {toy && <div className="pc-play-controls" aria-label={en ? 'Toy controls' : '玩具操作'}>
          <span><toy.Icon size={17} /><strong>{toy.name[language]}</strong>{(game === 'ball' || game === 'bubbles') && <small aria-live="polite">{contacts} {en ? (game === 'ball' ? 'kicks' : 'pops') : (game === 'ball' ? '次踢回' : '个泡泡')}</small>}</span>
          <button type="button" onClick={() => engine.current?.interact()} disabled={paused || !ready}>{toy.button[language]}</button>
          <button type="button" className="pc-play-finish" onClick={finish} aria-label={en ? 'Put the toy away' : '收起玩具'}><X size={16} /></button>
        </div>}
      </div>
      <div className="pc-room-dock" role="group" aria-label={en ? "Capy's daily life" : '卡皮的日常'}>
        <button type="button" className="pc-room-dock-button is-feed" aria-label={en ? 'Little snack' : '喂小叶子'} onClick={() => act('feed')}><span className="pc-room-dock-icon"><Leaf size={27} /></span><span>{en ? 'Snack' : '喂食'}</span></button>
        <Dialog.Trigger className="pc-room-dock-button is-play" aria-label={en ? "Open Capy's toy box" : '打开卡皮的玩具箱'} onClick={(event) => setInstant(event.detail === 0)}>
          <span className="pc-room-dock-icon"><CircleDot size={27} /></span><span>{en ? 'Play' : '玩耍'}</span>
        </Dialog.Trigger>
        <button type="button" className={`pc-room-dock-button is-${sleeping ? 'wake' : 'rest'}`} aria-label={en ? (sleeping ? 'Wake up' : 'Nap time') : (sleeping ? '叫醒它' : '小睡一下')} onClick={() => act(sleeping ? 'wake' : 'rest')}>
          <span className="pc-room-dock-icon">{sleeping ? <Sun size={27} /> : <Moon size={27} />}</span><span>{en ? (sleeping ? 'Wake' : 'Sleep') : (sleeping ? '起床' : '睡觉')}</span>
        </button>
        <button type="button" className="pc-room-dock-button is-wardrobe" aria-haspopup="dialog" aria-label={en ? 'Dress up Capy' : '给卡皮换装'} onClick={(event) => onOpenPanel('wardrobe', event.currentTarget, event.detail === 0)}><span className="pc-room-dock-icon"><Shirt size={27} /></span><span>{en ? 'Dress up' : '换装'}</span></button>
        <button type="button" className="pc-room-dock-button is-journal" aria-haspopup="dialog" aria-label={en ? "Open Capy's diary" : '打开卡皮的日记'} onClick={(event) => onOpenPanel('journal', event.currentTarget, event.detail === 0)}><span className="pc-room-dock-icon"><NotebookPen size={27} /></span><span>{en ? 'Journal' : '日记'}</span></button>
      </div>
    </div>
    <Dialog.Portal>
      <Dialog.Backdrop className="pc-room-backdrop" data-instant={instant} />
      <Dialog.Viewport className="pc-room-modal-viewport">
        <Dialog.Popup className="pc-room-notebook pc-room-popup pc-toybox" data-instant={instant}>
          <header className="pc-room-notebook-head"><div><span className="pc-room-book-icon"><Sparkles size={22} /></span><Dialog.Title>{en ? "Capy's toy box" : '卡皮的玩具箱'}</Dialog.Title></div>
            <Dialog.Close className="pc-room-close" aria-label={en ? 'Back to Capy' : '回到卡皮'}><X size={20} /></Dialog.Close></header>
          <Dialog.Description className="pc-toybox-description">{en ? 'A little playtime, just the two of you.' : '挑一个喜欢的，陪卡皮玩一会儿。'}</Dialog.Description>
          <div className="pc-toybox-grid">{TOYS.map((item) => <button type="button" key={item.id} data-game-choice={item.id} disabled={!ready} onClick={() => play(item.id)}>
            <span style={{ background: item.color }}><item.Icon size={35} strokeWidth={1.7} /></span><strong>{item.name[language]}</strong><small>{item.hint[language]}</small>
          </button>)}</div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
