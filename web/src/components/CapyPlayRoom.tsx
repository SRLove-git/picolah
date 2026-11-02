import { uiText } from '../lib/ui-copy';
import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Armchair, Bubbles, CircleDot, Leaf, Moon, Music2, NotebookPen, Pause, Play, Shirt, Sparkles, Sun, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CapyView } from '../../shared/capybara';
import { capyRoomAction, type CapyRoomEvent } from '../../shared/capy-room';
import { useCapyRoom } from '../lib/use-capy-room';
import type { CapyAction } from '../lib/capy-motion';
import type { CapyGame } from '../lib/capy-play';
import type { createCapyPlayScene } from '../lib/capy-play-scene';
import { capyArtwork, capyArtState } from '../lib/capy-action-art';
import { CAPY_CLOTHING_FACE, CAPY_EXPRESSION_ART, capyFace } from '../lib/capy-face';
import { wornArtwork } from './CapyAccessoryArt';
import { CapyHabitat, CapyHabitatHud, type OpenCapyPanel } from './CapyHabitat';
import './capy-companion.css';
import './capy-play.css';

const TOYS = [
  { id: 'ball' as const, Icon: CircleDot, name: ['追球球', 'Ball chase'], hint: ['把球抛到地毯上，卡皮会跑过去踢回来。', 'Toss it onto the rug. Capy will run over and kick it back.'], button: ['再抛一次', 'Toss again'], color: '#f7dfac' },
  { id: 'bubbles' as const, Icon: Bubbles, name: ['接泡泡', 'Bubble pop'], hint: ['吹一串泡泡，看卡皮伸爪、跳起来碰它们。', 'Blow some bubbles. Capy will reach up and jump to pop them.'], button: ['吹泡泡', 'Blow bubbles'], color: '#cbe4df' },
  { id: 'swing' as const, Icon: Armchair, name: ['荡秋千', 'Little swing'], hint: ['轻轻推一下，陪卡皮慢慢荡。', 'Give a gentle push and watch Capy sway.'], button: ['推一下', 'Give a push'], color: '#e4d5ed' },
  { id: 'dance' as const, Icon: Music2, name: ['扭扭舞', 'Happy dance'], hint: ['点一下换个舞步，一起摇摇头、扭扭身子。', 'Tap for a new step, a head bob and a little wiggle.'], button: ['换个舞步', 'New dance step'], color: '#efced3' },
];

/** Share the same bag-free artwork while sequence frames load or are unavailable. */
function CapyRoomStill({ view, action, game }: { view: CapyView; action: CapyAction; game: CapyGame | null }) {
  const art = capyArtwork(view.worn.map(item => item.id), capyArtState(action, game));
  const scale = art.rig.scale;
  const mask = useId(), gradient = `${mask}-gradient`, face = capyFace(action, game);
  const { x, y, rx, ry, solid } = CAPY_CLOTHING_FACE;
  return <svg viewBox="0 0 768 804" width="360" className="pc-play-still" aria-hidden="true"
    data-art={art.variant === 'dressed' || art.variant === 'shopping' ? 'fitted-character' : 'action-character'} data-art-state={art.variant}>
    <g transform={`translate(400 774) scale(${scale}) translate(-400 -774)`}>
      <defs>
        <radialGradient id={gradient}><stop offset={`${solid * 100}%`} stopColor="white" /><stop offset="100%" stopColor="white" stopOpacity="0" /></radialGradient>
        <mask id={mask}><ellipse cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${gradient})`} /></mask>
      </defs>
      <image href={art.src} width="768" height="804" />
      {art.variant !== 'sleep' && face !== 'idle' && <image href={CAPY_EXPRESSION_ART[face]} width="768" height="804" mask={`url(#${mask})`} />}
      {wornArtwork(view.worn).filter(layer => !layer.clothing).map(({ id, src, layout }) => {
        const x = layout.x + (id === 'watch' ? art.rig.hands[0][0] - 265 : 0);
        const y = layout.y + (id === 'watch' ? art.rig.hands[0][1] - 426 : scale < 1 ? art.rig.headY - 355 : 0);
        return <g key={id} transform={`translate(${x} ${y}) rotate(${layout.rotate ?? 0}) scale(${layout.scale})`}>
          <image href={src} x="-50" y="-50" width="100" height="100" />
        </g>;
      })}
    </g>
  </svg>;
}

export function CapyPlayRoom({ view, outfitVersion, onOpenPanel, roomMenuOpen }: {
  view: CapyView; outfitVersion: number; onOpenPanel: OpenCapyPanel; roomMenuOpen: boolean;
}) {
  const { i18n } = useTranslation(), en = !i18n.language.startsWith('zh'), language = en ? 1 : 0;
  const canvas = useRef<HTMLCanvasElement>(null), engine = useRef<ReturnType<typeof createCapyPlayScene> | null>(null);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const { store, state: roomState, sync, retry } = useCapyRoom();
  const action = capyRoomAction(roomState), game = roomState.activity.type === 'playing' ? roomState.activity.toy : null;
  const [contacts, setContacts] = useState(0), [paused, setPaused] = useState(false);
  const evening = roomState.evening;
  const [toysOpen, setToysOpen] = useState(false), [instant, setInstant] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sleeping = action === 'rest', night = evening || sleeping;
  const controls = { playing: !paused && !roomMenuOpen && !toysOpen, reduced, night, worn: view.worn.map((item) => item.id) };
  const current = useRef(controls); current.current = controls;
  const toy = TOYS.find((item) => item.id === game);
  const initialOutfitVersion = useRef(outfitVersion);
  useEffect(() => {
    let disposed = false; setReady(false); setFailed(false);
    void import('../lib/capy-play-scene').then(({ createCapyPlayScene }) => {
      if (disposed || !canvas.current) return;
      const scene = createCapyPlayScene(canvas.current, store, setContacts, available => { setReady(available); setFailed(!available); });
      engine.current = scene; scene.controls(current.current);
    }).catch(() => { if (!disposed) { setFailed(true); setReady(false); } });
    return () => { disposed = true; engine.current?.dispose(); engine.current = null; };
  }, [store]);
  useEffect(() => { engine.current?.controls(controls); }, [paused, roomMenuOpen, toysOpen, reduced, night, view.worn]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (initialOutfitVersion.current !== outfitVersion) { initialOutfitVersion.current = outfitVersion; if (!game) act('outfit'); }
  }, [outfitVersion]);
  function send(event: CapyRoomEvent) { setPaused(false); store.send(event); }
  function act(next: CapyAction) {
    const events = { idle: 'PUT_AWAY', pet: 'PET', feed: 'FEED', rest: 'SLEEP', wake: 'WAKE', outfit: 'DRESS', play: 'PET' } as const;
    send({ type: events[next] });
  }
  function play(next: CapyGame) { send({ type: 'PLAY', toy: next }); setToysOpen(false); }
  function finish() { send({ type: 'PUT_AWAY' }); }
  const expression = sleeping ? 'sleepy' : action === 'feed' ? 'snack' : action === 'play' || action === 'outfit' ? 'playful' : action === 'pet' || action === 'wake' ? 'happy' : 'idle';
  const message = toy ? uiText(toy.hint[language]) : sleeping ? (en ? uiText('A little dream, then more adventures.') : '先做一个小小的梦，睡醒再陪你玩。') : action === 'feed' ? (en ? uiText('Crunch, crunch. A tasty little leaf!') : '咔嚓咔嚓，小叶子真好吃。') : action === 'pet' ? (en ? uiText('Hehe. One more head pat?') : '嘿嘿，再摸摸头嘛。') : action === 'outfit' ? (en ? uiText('New outfit, ready to play!') : '穿好新衣服，准备出门玩！') : (en ? uiText('Pick a toy. Let’s play together!') : '挑个玩具，我们一起玩吧！');
  const interaction = toy ? uiText(toy.button[language]) : sleeping ? (en ? uiText('Wake the capybara') : '叫醒卡皮巴拉') : (en ? uiText('Pet the capybara') : '摸摸卡皮巴拉');
  return <Dialog.Root open={toysOpen} onOpenChange={setToysOpen}>
    <div className="pc-companion is-room is-frame-room" data-action={action} data-game={game ?? 'none'} data-expression={expression}
      data-night={night} data-sync={sync} data-paused={paused || roomMenuOpen || toysOpen} data-renderer={ready ? 'frames' : failed ? 'fallback' : 'loading'}>
      <div className="pc-companion-scene">
        <CapyHabitat sleeping={sleeping} night={night} sequence={0} onInteract={(next) => act(next)} onOpenPanel={onOpenPanel} liveToys
          onLight={() => send({ type: 'TOGGLE_LIGHT' })} />
        <CapyHabitatHud view={view} onOpenPanel={onOpenPanel} />
        <button type="button" className="pc-play-canvas-button" aria-label={interaction} disabled={!ready || paused}
          onClick={(event) => store.send({ type: 'INTERACT', x: event.detail ? event.clientX : undefined, y: event.detail ? event.clientY : undefined })}>
          <canvas ref={canvas} className="pc-play-canvas" aria-hidden="true" />
        </button>
        {!ready && <div className="pc-play-loading-character" aria-hidden="true"><CapyRoomStill view={view} action={action} game={game} /></div>}
        {(!toy || failed) && <p className="pc-companion-speech" role="status" aria-live="polite">{failed ? (en ? uiText('The toys could not open on this device. Your wardrobe and diary are still here.') : '这台设备暂时打不开互动玩具，衣橱和日记仍然可以使用。') : message}</p>}
        <button type="button" className="pc-companion-pause" aria-label={paused ? (en ? uiText('Resume motion') : '继续动作') : (en ? uiText('Pause motion') : '暂停动作')}
          aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
        {sync === 'error' && <button type="button" className="pc-room-save-retry" onClick={retry} aria-live="polite">{en ? uiText('Room not saved · Retry') : '房间未保存 · 重试'}</button>}
        {toy && <div className="pc-play-controls" aria-label={en ? uiText('Toy controls') : '玩具操作'}>
          <span><toy.Icon size={17} /><strong>{uiText(toy.name[language])}</strong>{(game === 'ball' || game === 'bubbles') && <small aria-live="polite">{contacts} {en ? uiText(game === 'ball' ? 'kicks' : 'pops') : (game === 'ball' ? '次踢回' : '个泡泡')}</small>}</span>
          <button type="button" onClick={() => store.send({ type: 'INTERACT' })} disabled={paused || !ready}>{uiText(toy.button[language])}</button>
          <button type="button" className="pc-play-finish" onClick={finish} aria-label={en ? uiText('Put the toy away') : '收起玩具'}><X size={16} /></button>
        </div>}
      </div>
      <div className="pc-room-dock" role="group" aria-label={en ? uiText("Capy's daily life") : '卡皮的日常'}>
        <button type="button" className="pc-room-dock-button is-feed" aria-label={en ? uiText('Little snack') : '喂小叶子'} onClick={() => act('feed')}><span className="pc-room-dock-icon"><Leaf size={27} /></span><span>{en ? uiText('Snack') : '喂食'}</span></button>
        <Dialog.Trigger className="pc-room-dock-button is-play" aria-label={en ? uiText("Open Capy's toy box") : '打开卡皮的玩具箱'} onClick={(event) => setInstant(event.detail === 0)}>
          <span className="pc-room-dock-icon"><CircleDot size={27} /></span><span>{en ? uiText('Play') : '玩耍'}</span>
        </Dialog.Trigger>
        <button type="button" className={`pc-room-dock-button is-${sleeping ? 'wake' : 'rest'}`} aria-label={en ? uiText(sleeping ? 'Wake up' : 'Nap time') : (sleeping ? '叫醒它' : '小睡一下')} onClick={() => act(sleeping ? 'wake' : 'rest')}>
          <span className="pc-room-dock-icon">{sleeping ? <Sun size={27} /> : <Moon size={27} />}</span><span>{en ? uiText(sleeping ? 'Wake' : 'Sleep') : (sleeping ? '起床' : '睡觉')}</span>
        </button>
        <button type="button" className="pc-room-dock-button is-wardrobe" aria-haspopup="dialog" aria-label={en ? uiText('Dress up Capy') : '给卡皮换装'} onClick={(event) => onOpenPanel('wardrobe', event.currentTarget, event.detail === 0)}><span className="pc-room-dock-icon"><Shirt size={27} /></span><span>{en ? uiText('Dress up') : '换装'}</span></button>
        <button type="button" className="pc-room-dock-button is-journal" aria-haspopup="dialog" aria-label={en ? uiText("Open Capy's diary") : '打开卡皮的日记'} onClick={(event) => onOpenPanel('journal', event.currentTarget, event.detail === 0)}><span className="pc-room-dock-icon"><NotebookPen size={27} /></span><span>{en ? uiText('Journal') : '日记'}</span></button>
      </div>
    </div>
    <Dialog.Portal>
      <Dialog.Backdrop className="pc-room-backdrop" data-instant={instant} />
      <Dialog.Viewport className="pc-room-modal-viewport">
        <Dialog.Popup className="pc-room-notebook pc-room-popup pc-toybox" data-instant={instant}>
          <header className="pc-room-notebook-head"><div><span className="pc-room-book-icon"><Sparkles size={22} /></span><Dialog.Title>{en ? uiText("Capy's toy box") : '卡皮的玩具箱'}</Dialog.Title></div>
            <Dialog.Close className="pc-room-close" aria-label={en ? uiText('Back to Capy') : '回到卡皮'}><X size={20} /></Dialog.Close></header>
          <Dialog.Description className="pc-toybox-description">{en ? uiText('A little playtime, just the two of you.') : '挑一个喜欢的，陪卡皮玩一会儿。'}</Dialog.Description>
          <div className="pc-toybox-grid">{TOYS.map((item) => <button type="button" key={item.id} data-game-choice={item.id} disabled={!ready} onClick={() => play(item.id)}>
            <span style={{ background: item.color }}><item.Icon size={35} strokeWidth={1.7} /></span><strong>{uiText(item.name[language])}</strong><small>{uiText(item.hint[language])}</small>
          </button>)}</div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
