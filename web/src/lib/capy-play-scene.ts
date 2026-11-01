import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CAPY_CLOTHING_IDS, type CapyAccessoryId } from '../../shared/capybara';
import type { CapyAction } from './capy-motion';
import { createCapyModel } from './capy-three-model';
import { blowCapyBubbles, createCapyPlayState, pushCapySwing, resolveCapyContacts, setCapyGame, setCapyPlayAction, stepCapyPlay, throwCapyBall, type CapyGame } from './capy-play';

export interface CapyPlayControls { playing: boolean; reduced: boolean; night: boolean; worn: CapyAccessoryId[] }
export function createCapyPlayScene(canvas: HTMLCanvasElement, onContact: (count: number) => void, onAction?: (action: CapyAction) => void, onAvailable?: (available: boolean) => void) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.90;
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-3.6, 3.6, 2.4, -2.4, 0.1, 40);
  function makeEnvironment() {
    const room = new RoomEnvironment(), pmrem = new T.PMREMGenerator(renderer);
    const result = pmrem.fromScene(room, 0.08);
    scene.environment = result.texture; room.dispose(); pmrem.dispose(); return result;
  }
  let environment = makeEnvironment(); scene.environmentIntensity = 0.4;
  const fill = new T.HemisphereLight('#fff6e8', '#aa8665', 1.15); scene.add(fill);
  const sunlight = new T.DirectionalLight('#fff1db', 2.35); sunlight.position.set(-3.5, 7, 5); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024); sunlight.shadow.camera.left = -4; sunlight.shadow.camera.right = 4;
  sunlight.shadow.camera.top = 5; sunlight.shadow.camera.bottom = -3; sunlight.shadow.normalBias = 0.035; sunlight.shadow.radius = 2.5;
  scene.add(sunlight); const rim = new T.DirectionalLight('#ffe4b7', 1.35); rim.position.set(3, 4, -4); scene.add(rim);
  const bounceLight = new T.DirectionalLight('#fff6e7', 0.35); bounceLight.position.set(0, 2, 6); scene.add(bounceLight);
  const ground = new T.Mesh(new T.PlaneGeometry(20, 20), new T.ShadowMaterial({ color: '#795739', opacity: 0.25 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  const model = createCapyModel(); scene.add(model.root);
  const state = createCapyPlayState();
  const ball = new T.Group(); scene.add(ball);
  ['#efbb72', '#fff3cb', '#a9cfb5', '#fff3cb', '#e9a5aa', '#fff3cb'].forEach((color, index) => {
    const mesh = new T.Mesh(new T.SphereGeometry(state.ball.radius, 12, 18, index * Math.PI / 3, Math.PI / 3), new T.MeshStandardMaterial({ color, roughness: 0.64 }));
    mesh.castShadow = true; mesh.receiveShadow = true; ball.add(mesh);
  });
  const bubbleGeometry = new T.SphereGeometry(1, 20, 14), ringGeometry = new T.TorusGeometry(1, 0.025, 6, 32);
  const bubblePool = Array.from({ length: 6 }, (_, index) => {
    const group = new T.Group(); scene.add(group);
    const material = new T.MeshPhysicalMaterial({ color: ['#d5edf2', '#ebd5ee', '#e5eecb'][index % 3], transparent: true, opacity: 0.36, roughness: 0.14, metalness: 0.15, iridescence: 0.8, depthWrite: false });
    const sphere = new T.Mesh(bubbleGeometry, material); group.add(sphere);
    const ring = new T.Mesh(ringGeometry, new T.MeshBasicMaterial({ color: '#fff9ed', transparent: true, opacity: 0.7, depthWrite: false })); group.add(ring);
    const shine = new T.Mesh(bubbleGeometry, new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
    shine.scale.set(0.12, 0.22, 0.06); shine.position.set(-0.45, 0.4, 0.74); group.add(shine);
    group.visible = false; return { group, sphere, ring, shine, material };
  });
  const swing = new T.Group(), pivot = new T.Group(); scene.add(swing); swing.add(pivot); pivot.position.y = 3.4;
  const wood = new T.MeshStandardMaterial({ color: '#cba47b', roughness: 0.9 });
  const ropeMaterial = new T.MeshStandardMaterial({ color: '#ede0bd', roughness: 1 });
  const rod = (parent: T.Group, a: number[], b: number[], radius: number, material: T.Material) => {
    const start = new T.Vector3(...a as [number, number, number]), end = new T.Vector3(...b as [number, number, number]);
    const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, start.distanceTo(end), 12), material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), end.sub(start).normalize());
    mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  for (const side of [-1, 1]) {
    rod(swing, [side * 1.24, 0, -0.65], [side * 1.03, 3.4, 0], 0.075, wood);
    rod(swing, [side * 1.24, 0, 0.65], [side * 1.03, 3.4, 0], 0.075, wood);
    rod(pivot, [side * 0.65, 0, 0], [side * 0.65, -3.05, 0], 0.026, ropeMaterial);
  }
  rod(swing, [-1.16, 3.4, 0], [1.16, 3.4, 0], 0.09, wood);
  const seat = new T.Mesh(new T.BoxGeometry(1.5, 0.13, 0.7), new T.MeshStandardMaterial({ color: '#b8c9a3', roughness: 0.85 }));
  seat.position.y = -3.05; seat.castShadow = true; seat.receiveShadow = true; pivot.add(seat);
  const cushion = new T.Mesh(new T.SphereGeometry(1, 24, 12), new T.MeshStandardMaterial({ color: '#e9cfb4', roughness: 1 }));
  cushion.scale.set(0.68, 0.08, 0.33); cushion.position.y = -2.96; pivot.add(cushion);
  const danceFloor = new T.Mesh(new T.CylinderGeometry(0.95, 0.97, 0.05, 48), new T.MeshStandardMaterial({ color: '#e6c2c2', roughness: 0.95 }));
  danceFloor.position.y = 0.025; danceFloor.receiveShadow = true; scene.add(danceFloor);

  let controls: CapyPlayControls = { playing: true, reduced: false, night: false, worn: [] };
  let frame = 0, last = 0, accumulator = 0, disposed = false, visible = true, lost = false, frames = 0, reported = -1, metricsAt = -1;
  let reportedAction: CapyAction | null = null;
  const feet = [new T.Vector3(), new T.Vector3()], hands = [new T.Vector3(), new T.Vector3()];
  const swingPosition = new T.Vector3(), grips = [new T.Vector3(), new T.Vector3()];
  const transition = { time: -10, position: new T.Vector3(), rotation: new T.Quaternion(), scale: new T.Vector3(1, 1, 1) };
  function retarget() { transition.time = state.time; transition.position.copy(model.root.position); transition.rotation.copy(model.root.quaternion); transition.scale.copy(model.root.scale); }
  const ray = new T.Raycaster(), pointer = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), point = new T.Vector3();
  function pose() {
    const { actor: a, mode } = state;
    swing.visible = mode === 'swing'; danceFloor.visible = mode === 'dance'; ball.visible = mode === 'ball';
    pivot.rotation.x = state.swing.angle; pivot.updateMatrixWorld(true);
    const dance = mode === 'dance' ? a.settled : 0;
    const bounce = dance * Math.max(0, Math.sin(state.time * 5)) * 0.06;
    const settle = T.MathUtils.smoothstep(state.actionTime / 0.5, 0, 1);
    model.root.position.set(a.x, a.y + bounce - (state.action === 'rest' ? 0.14 * settle : 0), a.z);
    const outfitTurn = state.action === 'outfit' ? T.MathUtils.smoothstep(state.actionTime / 2, 0, 1) * Math.PI * 2 : 0;
    const spin = T.MathUtils.smoothstep((state.actionTime % 8 - 6) / 2, 0, 1) * Math.PI * 2;
    model.root.rotation.set(0, a.yaw * (1 - dance) + (Math.sin(state.time * 1.2) * 0.4 + spin) * dance + outfitTurn, 0);
    model.root.scale.setScalar(state.action === 'rest' ? 1 - 0.04 * settle : 1);
    if (mode === 'swing') {
      swingPosition.set(0, -3.28, 0); pivot.localToWorld(swingPosition);
      model.root.position.lerp(swingPosition, a.settled);
      model.root.rotation.set(state.swing.angle * a.settled, a.yaw * (1 - a.settled), 0);
      grips.forEach((grip, i) => { grip.set(i ? 0.65 : -0.65, -2.30, 0.12); pivot.localToWorld(grip); });
    }
    const blend = T.MathUtils.smoothstep((state.time - transition.time) / 0.35, 0, 1);
    if (blend < 1) {
      model.root.position.lerpVectors(transition.position, model.root.position, blend);
      model.root.quaternion.slerpQuaternions(transition.rotation, model.root.quaternion, blend);
      model.root.scale.lerpVectors(transition.scale, model.root.scale, blend);
    }
    model.pose(state, mode === 'swing' ? grips : undefined);
    model.feet.forEach((foot, i) => foot.getWorldPosition(feet[i])); model.hands.forEach((hand, i) => hand.getWorldPosition(hands[i]));
    ball.position.set(state.ball.x, state.ball.y, state.ball.z); ball.rotation.set(state.ball.spin * 0.3, 0, state.ball.spin);
    bubblePool.forEach((bubble, i) => {
      const b = state.bubbles[i]; bubble.group.visible = mode === 'bubbles' && Boolean(b); if (!b) return;
      bubble.group.position.set(b.x, b.y, b.z); bubble.group.scale.setScalar(b.radius * (b.popped >= 0 ? 1 + b.popped * 2.5 : 1));
      bubble.sphere.visible = bubble.shine.visible = b.popped < 0; bubble.material.opacity = 0.36;
      (bubble.ring.material as T.MeshBasicMaterial).opacity = b.popped < 0 ? 0.65 : Math.max(0, 1 - b.popped / 0.4);
      bubble.ring.quaternion.copy(camera.quaternion);
    });
    if (reported !== state.contacts) { reported = state.contacts; onContact(state.contacts); }
    if (reportedAction !== state.action) { reportedAction = state.action; onAction?.(state.action); }
  }
  function metrics() {
    canvas.dataset.mode = state.mode ?? 'idle'; canvas.dataset.action = state.action;
    canvas.dataset.contacts = String(state.contacts); canvas.dataset.frames = String(frames);
    canvas.dataset.actorX = state.actor.x.toFixed(3); canvas.dataset.actorY = state.actor.y.toFixed(3);
    canvas.dataset.yaw = model.root.rotation.y.toFixed(3); canvas.dataset.swingAngle = state.swing.angle.toFixed(3);
    canvas.dataset.geometry = String(renderer.info.render.triangles); canvas.dataset.drawCalls = String(renderer.info.render.calls);
    canvas.dataset.clothing = controls.worn.find((id) => CAPY_CLOTHING_IDS.some((clothing) => clothing === id)) ?? 'none';
    canvas.dataset.worn = controls.worn.join(',');
    canvas.dataset.running = String(active());
  }
  function render() { if (lost || disposed) return; pose(); renderer.render(scene, camera); frames++; if (state.time - metricsAt > 0.2 || !active()) { metricsAt = state.time; metrics(); } }
  function active() { return !disposed && !lost && visible && !document.hidden && controls.playing && !controls.reduced; }
  function stop() { cancelAnimationFrame(frame); frame = 0; last = 0; accumulator = 0; metrics(); }
  function tick(now: number) {
    frame = 0; if (!active()) return;
    if (last) accumulator += Math.min((now - last) / 1000, 0.05); last = now;
    while (accumulator >= 1 / 60) { stepCapyPlay(state, 1 / 60); pose(); resolveCapyContacts(state, feet, hands); accumulator -= 1 / 60; }
    render(); frame = requestAnimationFrame(tick);
  }
  function resume() { if (active()) { if (!frame) frame = requestAnimationFrame(tick); } else stop(); }
  function stillInteraction() {
    if (controls.reduced) {
      // Respect reduced motion while keeping the same contact simulation: show
      // the resulting pose instead of a moving camera, chase or swinging ride.
      for (let i = 0; i < 240; i++) { stepCapyPlay(state, 1 / 60); pose(); resolveCapyContacts(state, feet, hands); }
    }
    render(); resume();
  }
  const resize = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect; if (!width || !height || lost) return;
    const mobile = width < 600, worldHeight = mobile ? 6.2 : 5.25, aspect = width / height;
    model.detail(mobile ? 0.68 : 1);
    camera.left = -worldHeight * aspect / 2; camera.right = -camera.left; camera.top = worldHeight / 2; camera.bottom = -camera.top;
    camera.position.set(0.7, 5.5, 13); camera.lookAt(0, mobile ? 1.7 : 1.45, 0); camera.updateProjectionMatrix();
    state.bounds = Math.max(0.8, Math.min(2.3, -camera.left - 0.38));
    state.actor.x = T.MathUtils.clamp(state.actor.x, -state.bounds + 0.38, state.bounds - 0.38);
    state.ball.x = T.MathUtils.clamp(state.ball.x, -state.bounds, state.bounds);
    renderer.setSize(width, height, false); render();
  }); resize.observe(canvas);
  const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); }); visibility.observe(canvas);
  document.addEventListener('visibilitychange', resume);
  function contextLost(event: Event) { event.preventDefault(); lost = true; stop(); canvas.dataset.ready = 'false'; onAvailable?.(false); }
  function contextRestored() { environment.dispose(); environment = makeEnvironment(); lost = false; canvas.dataset.ready = 'true'; onAvailable?.(true); render(); resume(); }
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored);
  canvas.dataset.ready = 'true'; resume();
  return {
    controls(next: CapyPlayControls) { controls = next; model.outfit(next.worn); fill.intensity = next.night ? 0.8 : 1.15; sunlight.intensity = next.night ? 0.9 : 2.35; render(); metrics(); resume(); },
    game(mode: CapyGame | null) { retarget(); setCapyGame(state, mode); reported = -1; stillInteraction(); },
    action(action: CapyAction) { retarget(); setCapyPlayAction(state, action); stillInteraction(); },
    interact(clientX?: number, clientY?: number) {
      if (!controls.playing || lost) return;
      let x = state.bounds * 0.7, z = 0.7;
      if (clientX !== undefined && clientY !== undefined) {
        const box = canvas.getBoundingClientRect(); pointer.set((clientX - box.left) / box.width * 2 - 1, -(clientY - box.top) / box.height * 2 + 1);
        ray.setFromCamera(pointer, camera); if (ray.ray.intersectPlane(plane, point)) { x = point.x; z = point.z; }
      }
      if (state.mode === 'ball') throwCapyBall(state, x, z);
      else if (state.mode === 'bubbles') blowCapyBubbles(state, T.MathUtils.clamp(x, -1, 1));
      else if (state.mode === 'swing') pushCapySwing(state);
      else if (state.mode === 'dance') state.actionTime = Math.floor(state.actionTime / 8) * 8 + 6;
      else { retarget(); setCapyPlayAction(state, state.action === 'rest' ? 'wake' : 'pet'); }
      stillInteraction();
    },
    dispose() {
      disposed = true; stop(); resize.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', resume);
      canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      const geometries = new Set<T.BufferGeometry>([bubbleGeometry, ringGeometry]), materials = new Set<T.Material>();
      scene.traverse((object) => { const mesh = object as T.Mesh; if ((mesh as T.InstancedMesh).isInstancedMesh) (mesh as T.InstancedMesh).dispose(); if (mesh.geometry) geometries.add(mesh.geometry); if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m)); });
      geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); environment.dispose(); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
