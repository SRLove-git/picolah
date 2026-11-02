import { CAPY_CLOTHING_IDS, type CapyAccessoryId } from '../../shared/capybara';
import { capyRoomAction, type CapyRoomStore } from '../../shared/capy-room';
import { createCapyFramePlayer, CAPY_ART_UNIT } from './capy-frame-player';
import { wornArtwork } from '../components/CapyAccessoryArt';
import { blowCapyBubbles, createCapyPlayState, pushCapySwing, resolveCapyContacts, setCapyGame, setCapyPlayAction, stepCapyPlay, throwCapyBall, type Point3 } from './capy-play';
export interface CapyPlayControls { playing: boolean; reduced: boolean; night: boolean; worn: CapyAccessoryId[] }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Canvas 2D sequence player. State transitions arrive as events; physics uses fixed steps. */
export function createCapyPlayScene(canvas: HTMLCanvasElement, store: CapyRoomStore, onContact: (count: number) => void, onAvailable?: (available: boolean) => void) {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Canvas unavailable');
  const ctx = context;
  const state = createCapyPlayState();
  let controls: CapyPlayControls = { playing: true, reduced: false, night: false, worn: [] };
  let disposed = false, visible = true, lost = false, frame = 0, last = 0, accumulator = 0, frames = 0, reported = -1;
  let width = 1, height = 1, scale = 1, ratio = 1, stateKey = '', sequence = 0;
  let staticTimer: ReturnType<typeof setTimeout> | undefined, staticStarted = 0;
  const accessories = new Map<string, HTMLImageElement>();
  let layers: ReturnType<typeof wornArtwork> = [];
  const player = createCapyFramePlayer(available => { if (!disposed) { onAvailable?.(available); render(); resume(); } });
  const active = () => !disposed && !lost && visible && !document.hidden && controls.playing && player.ready;
  const moving = () => active() && !controls.reduced;
  const project = (p: Point3) => ({ x: width / 2 + p.x * scale, y: height * .83 - p.y * scale + p.z * scale * .32 });
  function actor() {
    const a = state.actor, swing = state.mode === 'swing' ? a.settled : 0;
    return { x: a.x, y: a.y + swing * (3.4 - Math.cos(state.swing.angle) * 3.05 - .24), z: a.z + swing * Math.sin(state.swing.angle) * 3.05 };
  }
  function contacts() {
    const meta = player.metadata(state, controls.reduced); if (!meta) return;
    const a = actor();
    const world = (p: Point3) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z + .3 });
    resolveCapyContacts(state, meta.feet.map(world), meta.hands.map(world));
  }
  function circle(x: number, y: number, radius: number, fill: string | CanvasGradient) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  function line(a: Point3, b: Point3, color: string, thickness: number) {
    const p = project(a), q = project(b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = color; ctx.lineWidth = thickness * scale; ctx.lineCap = 'round'; ctx.stroke();
  }
  function ellipse(p: Point3, rx: number, ry: number, color: string) { const q = project(p); ctx.beginPath(); ctx.ellipse(q.x, q.y, rx * scale, ry * scale, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
  function swing() {
    const angle = state.swing.angle, bottom = { y: 3.4 - Math.cos(angle) * 3.05, z: Math.sin(angle) * 3.05 };
    for (const side of [-1, 1]) {
      line({ x: side * 1.24, y: 0, z: -.65 }, { x: side * 1.03, y: 3.4, z: 0 }, '#c4a17e', .12);
      line({ x: side * 1.24, y: 0, z: .65 }, { x: side * 1.03, y: 3.4, z: 0 }, '#d8b58a', .13);
      line({ x: side * .65, y: 3.4, z: 0 }, { x: side * .65, ...bottom }, '#f4e6c7', .035);
    }
    line({ x: -1.16, y: 3.4, z: 0 }, { x: 1.16, y: 3.4, z: 0 }, '#b79371', .14);
    ellipse({ x: 0, ...bottom }, .8, .17, '#9bb58d');
    ellipse({ x: 0, y: bottom.y + .06, z: bottom.z }, .72, .12, '#efdbbf');
  }
  function ball() {
    const b = state.ball, p = project(b), r = b.radius * scale;
    ellipse({ x: b.x, y: 0, z: b.z }, .25, .07, '#63462729');
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(b.spin);
    for (const [i, color] of ['#efbb72', '#fff3cb', '#a9cfb5', '#fff3cb', '#e9a5aa', '#fff3cb'].entries()) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, i * Math.PI / 3, (i + 1) * Math.PI / 3); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    const light = ctx.createRadialGradient(-r * .35, -r * .35, r * .1, 0, 0, r);
    light.addColorStop(0, '#ffffff60'); light.addColorStop(.6, '#ffffff00'); light.addColorStop(1, '#77513145'); circle(0, 0, r, light); ctx.restore();
  }
  function bubbles() {
    for (const b of state.bubbles) {
      const p = project(b), pop = b.popped >= 0, radius = b.radius * scale * (pop ? 1 + b.popped * 2.5 : 1);
      ctx.save(); ctx.globalAlpha = pop ? Math.max(0, 1 - b.popped / .4) : 1;
      if (!pop) {
        const gradient = ctx.createRadialGradient(p.x - radius * .3, p.y - radius * .3, radius * .05, p.x, p.y, radius);
        gradient.addColorStop(0, '#ffffff0a'); gradient.addColorStop(.8, '#cef2e744'); gradient.addColorStop(1, '#efc5e59e'); circle(p.x, p.y, radius, gradient);
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.strokeStyle = '#fffaf1c7'; ctx.lineWidth = 1.5; ctx.stroke();
      if (!pop) { ctx.beginPath(); ctx.arc(p.x, p.y, radius * .72, Math.PI * 1.12, Math.PI * 1.48); ctx.strokeStyle = '#ffffffd9'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawAccessories() {
    const meta = player.metadata(state, controls.reduced); if (!meta) return;
    for (const layer of layers) {
      const img = accessories.get(layer.src); if (!img?.complete || !img.naturalWidth) continue;
      const key = layer.id === 'watch' ? 'hand' : layer.id === 'sneaker' ? 'feet' : layer.layout.y < 300 ? 'head' : layer.layout.y > 480 ? 'bag' : 'chest';
      const anchor = meta.anchors[key]; if (!anchor) continue;
      const dx = (layer.layout.x - (key === 'hand' ? 265 : anchor.origin[0])) * CAPY_ART_UNIT * anchor.scale;
      const dy = (layer.layout.y - (key === 'hand' ? 426 : anchor.origin[1])) * CAPY_ART_UNIT * anchor.scale;
      ctx.save(); ctx.translate(anchor.x * scale, -anchor.y * scale); ctx.rotate(anchor.angle); ctx.translate(dx * scale, dy * scale); ctx.rotate((layer.layout.rotate ?? 0) * Math.PI / 180);
      const size = 100 * layer.layout.scale * CAPY_ART_UNIT * scale * anchor.scale;
      ctx.drawImage(img, -size / 2, -size / 2, size, size); ctx.restore();
    }
  }
  function metrics() {
    Object.assign(canvas.dataset, {
      engine: 'canvas2d-sequence', loading: String(player.loading), ready: String(player.ready && !lost), mode: state.mode ?? 'idle', action: state.action,
      contacts: String(state.contacts), frames: String(frames), actorX: state.actor.x.toFixed(3), actorY: state.actor.y.toFixed(3),
      swingAngle: state.swing.angle.toFixed(3), worn: controls.worn.join(','), character: 'original-image', source: player.source,
      artState: player.variant, animation: player.animation, clip: player.key, cacheSize: String(player.cacheSize),
      clothing: controls.worn.find(id => CAPY_CLOTHING_IDS.some(clothing => clothing === id)) ?? 'none', running: String(moving()),
    });
  }
  function render() {
    if (disposed || lost) return;
    player.update(state); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    const a = actor(), p = project(a);
    ellipse({ x: a.x, y: 0, z: a.z }, .64, .12, '#69462125');
    if (state.mode === 'swing') swing();
    if (state.mode === 'dance') ellipse({ x: 0, y: .02, z: 0 }, 1, .3, '#e7bfc6a0');
    ctx.save(); ctx.translate(p.x, p.y);
    // Whole-body dance placement is composited over the original animated frame.
    if (state.mode === 'dance' && !controls.reduced) ctx.rotate(Math.sin(state.time * 4) * .035 * state.actor.settled);
    player.draw(ctx, state, scale, controls.reduced); drawAccessories(); ctx.restore();
    if (state.action === 'rest') {
      ctx.save(); ctx.fillStyle = '#aa9bbb'; ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const drift = controls.reduced ? 0 : Math.sin(state.time * Math.PI / 2.4 - i * .7) * 3;
        ctx.font = `600 ${12 + i * 3}px system-ui`;
        ctx.fillText('z', p.x + scale * (.7 + i * .16), p.y - scale * (2.5 + i * .2) + drift);
      }
      ctx.restore();
    }
    if (state.mode === 'ball') ball(); if (state.mode === 'bubbles') bubbles();
    frames++; if (reported !== state.contacts) { reported = state.contacts; onContact(state.contacts); } metrics();
  }
  function stop() {
    cancelAnimationFrame(frame); frame = 0; last = 0; accumulator = 0;
    if (staticTimer) { clearTimeout(staticTimer); staticTimer = undefined; state.actionTime += (performance.now() - staticStarted) / 1000; }
    metrics();
  }
  function complete() { store.send({ type: 'CLIP_FINISHED', sequence }); }
  function tick(now: number) {
    frame = 0; if (!moving()) return;
    if (last) accumulator += Math.min((now - last) / 1000, .05); last = now;
    while (accumulator >= 1 / 60) {
      const actionTime = state.actionTime;
      stepCapyPlay(state, 1 / 60); player.update(state);
      // A cold atlas must not consume the gesture while the previous pose is
      // still visible. Start its full reaction when the matching art is ready.
      if (!state.mode && player.loading) state.actionTime = actionTime;
      contacts(); accumulator -= 1 / 60;
      if (!state.mode && state.action !== 'idle' && state.action !== 'rest' && state.actionTime >= 4.2) complete();
    }
    render(); frame = requestAnimationFrame(tick);
  }
  function resume() {
    if (moving()) { if (staticTimer) stop(); if (!frame) frame = requestAnimationFrame(tick); }
    else {
      stop();
      if (active() && !player.loading && controls.reduced && !state.mode && state.action !== 'idle' && state.action !== 'rest') {
        const id = sequence; staticStarted = performance.now();
        staticTimer = setTimeout(() => { staticTimer = undefined; store.send({ type: 'CLIP_FINISHED', sequence: id }); }, Math.max(0, 4.2 - state.actionTime) * 1000);
      }
    }
  }
  function stillInteraction() {
    if (controls.reduced && state.mode) for (let i = 0; i < 240; i++) { stepCapyPlay(state, 1 / 60); contacts(); }
    render(); resume();
  }
  function synchronize() {
    const room = store.getSnapshot(), action = capyRoomAction(room), mode = room.activity.type === 'playing' ? room.activity.toy : null;
    const nextKey = `${room.sequence}:${action}:${mode}`;
    if (nextKey === stateKey) return;
    stop(); stateKey = nextKey; sequence = room.sequence;
    if (mode) setCapyGame(state, mode); else setCapyPlayAction(state, action);
    player.update(state); stillInteraction();
  }
  const unsubscribe = store.subscribe(synchronize);
  const unevent = store.onEvent((event, room) => {
    if (event.type !== 'INTERACT' || room.activity.type !== 'playing' || !controls.playing) return;
    let x: number | undefined, z: number | undefined;
    if (event.x !== undefined && event.y !== undefined) { const rect = canvas.getBoundingClientRect(); x = (event.x - rect.left - width / 2) / scale; z = (event.y - rect.top - height * .83) / (scale * .32); }
    switch (room.activity.toy) {
      case 'ball': throwCapyBall(state, x, z); break;
      case 'bubbles': blowCapyBubbles(state, x); break;
      case 'swing': pushCapySwing(state); break;
      case 'dance': state.time += Math.PI / 4; break;
    }
    stillInteraction();
  });
  const resize = new ResizeObserver(([entry]) => {
    if (disposed || !entry.contentRect.width || !entry.contentRect.height) return;
    width = entry.contentRect.width; height = entry.contentRect.height;
    ratio = Math.min(window.devicePixelRatio || 1, 2); scale = height / (width < 600 ? 6.2 : 5.25);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    state.bounds = clamp(width / scale / 2 - .65, .8, 2.3);
    state.actor.x = clamp(state.actor.x, -state.bounds + .38, state.bounds - .38); state.ball.x = clamp(state.ball.x, -state.bounds, state.bounds);
    render();
  }); resize.observe(canvas);
  const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); }); visibility.observe(canvas);
  document.addEventListener('visibilitychange', resume);
  function contextLost(event: Event) { event.preventDefault(); lost = true; stop(); onAvailable?.(false); }
  function contextRestored() { lost = false; onAvailable?.(player.ready); render(); resume(); }
  canvas.addEventListener('contextlost', contextLost); canvas.addEventListener('contextrestored', contextRestored);
  synchronize();
  return {
    controls(next: CapyPlayControls) {
      const changed = next.worn.join(',') !== controls.worn.join(','); controls = next;
      if (changed) {
        player.outfit(next.worn); layers = wornArtwork(next.worn.map(id => ({ id }))).filter(layer => !layer.clothing);
        for (const layer of layers) if (!accessories.has(layer.src)) {
          const img = new Image(); accessories.set(layer.src, img); img.onload = () => { if (!disposed) render(); }; img.src = layer.src;
        }
      }
      render(); resume();
    },
    dispose() { disposed = true; stop(); unsubscribe(); unevent(); resize.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', resume); canvas.removeEventListener('contextlost', contextLost); canvas.removeEventListener('contextrestored', contextRestored); player.dispose(); accessories.forEach(img => { img.onload = null; img.src = ''; }); accessories.clear(); },
  };
}
