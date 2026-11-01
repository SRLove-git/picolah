import * as T from 'three';
import type { CapyAccessoryId, CapyClothingId } from '../../shared/capybara';
import type { CapyPlayState, Point3 } from './capy-play';

/** A small articulated model. Every visible body part and outfit is geometry;
 * no character billboards, image planes or expression textures are used. */
export function createCapyModel() {
  const root = new T.Group(), torso = new T.Group(), head = new T.Group();
  root.name = 'Capy articulated character'; root.add(torso); torso.add(head); head.position.set(0, 1.91, 0);
  const sphere = new T.SphereGeometry(1, 24, 16);
  // The broad, softly squared head and long muzzle are capybara features.
  // Shape the vertices themselves so the silhouette also holds up in profile.
  const softBox = sphere.clone();
  const positions = softBox.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const rounded = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.76);
    positions.setXYZ(i, rounded(positions.getX(i)), rounded(positions.getY(i)), rounded(positions.getZ(i)));
  }
  softBox.computeVertexNormals();
  const materials = new Map<string, T.MeshStandardMaterial>();
  function material(color: string, roughness = 0.88) {
    const key = `${color}:${roughness}`;
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness }));
    return materials.get(key)!;
  }
  const fur = '#b98354', muzzle = '#cda075', cream = '#f7e5c6', paw = '#795139', ink = '#402820';
  function blob(parent: T.Object3D, color: string, position: number[], scale: number[], roughness = 0.88) {
    const mesh = new T.Mesh(sphere, material(color, roughness));
    mesh.position.set(position[0], position[1], position[2]); mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function tube(parent: T.Object3D, color: string, points: number[][], radius = 0.025) {
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p as [number, number, number])));
    const mesh = new T.Mesh(new T.TubeGeometry(curve, 20, radius, 6, false), material(color));
    mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function torus(parent: T.Object3D, color: string, radius: number, width: number, pos: number[], scale = [1, 1, 1]) {
    const mesh = new T.Mesh(new T.TorusGeometry(radius, width, 8, 32), material(color));
    mesh.position.set(...pos as [number, number, number]); mesh.scale.set(...scale as [number, number, number]);
    parent.add(mesh); mesh.castShadow = true; return mesh;
  }
  function star(parent: T.Object3D, color: string, x: number, y: number, z: number, radius = 0.07) {
    const shape = new T.Shape();
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? radius * 0.46 : radius;
      if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    shape.closePath();
    const mesh = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false }), material(color));
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  const body = blob(torso, fur, [0, 1.02, 0], [0.64, 0.79, 0.47]);
  const belly = blob(torso, '#bd8b60', [0, 0.96, 0.40], [0.43, 0.49, 0.10]);
  blob(head, fur, [0, 0.10, 0.02], [0.65, 0.49, 0.53]).geometry = softBox;
  blob(head, muzzle, [0, -0.055, 0.48], [0.54, 0.31, 0.41]).geometry = softBox;
  for (const side of [-1, 1]) {
    blob(head, paw, [side * 0.16, 0.09, 0.887], [0.047, 0.032, 0.022], 0.55).rotation.z = side * 0.3;
    blob(head, '#d09a82', [side * 0.50, -0.07, 0.66], [0.075, 0.045, 0.018]);
  }
  tube(head, '#926749', [[0, 0.04, 0.892], [0, -0.09, 0.895], [0, -0.20, 0.875]], 0.01);
  const mouth = tube(head, ink, [[-0.24, -0.17, 0.86], [-0.12, -0.22, 0.884], [0, -0.20, 0.885], [0.12, -0.22, 0.884], [0.24, -0.17, 0.86]], 0.012);
  const openMouth = blob(head, '#5d302a', [0, -0.235, 0.865], [0.15, 0.09, 0.045]);
  const tongue = blob(head, '#eaa39a', [0, -0.27, 0.905], [0.085, 0.03, 0.012]);
  const ears: T.Group[] = [], eyes: T.Group[] = [], eyelids: T.Mesh[] = [];
  for (const side of [-1, 1]) {
    const ear = new T.Group(); head.add(ear); ear.position.set(side * 0.55, 0.51, -0.12); ear.rotation.z = -side * 0.25; ear.scale.setScalar(0.73);
    blob(ear, fur, [0, 0, 0], [0.19, 0.22, 0.12]); blob(ear, '#e2a18c', [0, 0, 0.095], [0.115, 0.15, 0.035]); ears.push(ear);
    const eye = new T.Group(); eye.position.set(side * 0.49, 0.30, 0.49); eye.scale.setScalar(0.78); head.add(eye);
    blob(eye, '#fff8e6', [0, 0, 0], [0.105, 0.13, 0.052], 0.25);
    blob(eye, '#462b21', [side * -0.012, 0, 0.038], [0.082, 0.105, 0.052], 0.13);
    blob(eye, '#ffffff', [-0.027, 0.038, 0.08], [0.026, 0.031, 0.014], 0.15);
    blob(eye, '#fff8e6', [0.03, -0.03, 0.08], [0.011, 0.013, 0.008], 0.2); eyes.push(eye);
    eyelids.push(tube(head, ink, [[side * 0.49 - 0.065, 0.30, 0.52], [side * 0.49, 0.275, 0.54], [side * 0.49 + 0.065, 0.30, 0.52]], 0.014));
    tube(head, paw, [[side * 0.49 - 0.065, 0.43, 0.45], [side * 0.49, 0.447, 0.47], [side * 0.49 + 0.065, 0.43, 0.45]], 0.015);
  }
  const horn = new T.Group(); horn.position.set(0, 0.57, 0.02); horn.rotation.z = -0.08; head.add(horn);
  const rainbow = ['#c4afe6', '#9bcbe8', '#a8d7bb', '#f3df8c', '#f3b6b8'];
  rainbow.forEach((color, i) => {
    const geometry = new T.CylinderGeometry(Math.max(0.006, 0.145 - (i + 1) * 0.028), 0.145 - i * 0.028, 0.105, 24);
    const mesh = new T.Mesh(geometry, material(color, 0.43)); mesh.position.y = i * 0.105; horn.add(mesh); mesh.castShadow = true;
  });

  const arms: T.Group[] = [], legs: T.Group[] = [], hands: T.Object3D[] = [], feet: T.Object3D[] = [];
  const clothing = new Map<CapyClothingId, T.Group[]>();
  const accessories = new Map<CapyAccessoryId, T.Group>();
  for (const side of [-1, 1]) {
    const arm = new T.Group(); arm.position.set(side * 0.6, 1.48, 0); torso.add(arm); arms.push(arm);
    blob(arm, fur, [0, -0.22, 0.025], [0.21, 0.36, 0.23]);
    const hand = blob(arm, paw, [0, -0.51, 0.06], [0.19, 0.18, 0.21]); hands.push(hand);
    const leg = new T.Group(); leg.position.set(side * 0.32, 0.46, 0); torso.add(leg); legs.push(leg);
    blob(leg, fur, [0, -0.12, 0], [0.24, 0.31, 0.25]);
    const foot = blob(leg, paw, [0, -0.31, 0.13], [0.255, 0.15, 0.30]); feet.push(foot);
    for (let toe = -1; toe <= 1; toe++) blob(leg, '#b07c54', [toe * 0.105, -0.31, 0.36], [0.06, 0.075, 0.06]);
  }

  const colors: Record<CapyClothingId, string> = {
    'strawberry-dress': '#e79ba9', 'mint-overalls': '#a6c9ac', 'cream-hoodie': '#f3e4c9',
    'duck-raincoat': '#f4ce66', 'star-pajamas': '#b9a4d8', 'sailor-shirt': '#9cbdd1',
  };
  for (const [id, color] of Object.entries(colors) as [CapyClothingId, string][]) {
    const group = new T.Group(); torso.add(group); clothing.set(id, [group]); group.visible = false;
    const bib = id === 'mint-overalls' || id === 'strawberry-dress';
    if (bib) blob(group, fur, [0, 1.43, 0], [0.56, 0.32, 0.44]);
    blob(group, color, [0, bib ? 0.86 : 1.04, 0], [0.665, bib ? 0.61 : 0.76, 0.505]);
    if (bib) {
      blob(group, color, [0, 1.32, 0.44], [0.37, 0.28, 0.09]);
      for (const side of [-1, 1]) {
        tube(group, color, [[side * 0.32, 1.2, 0.48], [side * 0.35, 1.65, 0.28], [side * 0.34, 1.6, -0.2]], 0.07);
        blob(group, cream, [side * 0.33, 1.41, 0.54], [0.055, 0.055, 0.025]);
      }
    } else {
      const collar = torus(group, cream, 0.36, 0.055, [0, 1.67, 0], [1.35, 0.95, 1]); collar.rotation.x = Math.PI / 2;
      arms.forEach((arm) => {
        const sleeve = new T.Group(); arm.add(sleeve); sleeve.visible = false; clothing.get(id)!.push(sleeve);
        const long = id !== 'sailor-shirt';
        blob(sleeve, color, [0, long ? -0.21 : -0.11, 0.02], [0.23, long ? 0.31 : 0.21, 0.255]);
        const cuff = torus(sleeve, cream, 0.205, 0.033, [0, long ? -0.42 : -0.23, 0.04]); cuff.rotation.x = Math.PI / 2;
      });
    }
    if (id === 'strawberry-dress') {
      const skirt = new T.Mesh(new T.CylinderGeometry(0.57, 0.85, 0.62, 40, 2, true), material(color));
      skirt.position.y = 0.58; skirt.scale.z = 0.78; skirt.castShadow = true; group.add(skirt);
      const hem = torus(group, cream, 0.82, 0.045, [0, 0.27, 0], [1, 0.78, 1]); hem.rotation.x = Math.PI / 2;
      blob(group, '#d96a75', [0.09, 1.33, 0.54], [0.095, 0.11, 0.035]);
      blob(group, '#7d9a60', [0.09, 1.43, 0.55], [0.07, 0.03, 0.02]);
    }
    if (id === 'mint-overalls' || id === 'star-pajamas') legs.forEach((leg) => {
      const pants = new T.Group(); leg.add(pants); pants.visible = false; clothing.get(id)!.push(pants);
      blob(pants, color, [0, -0.07, 0], [0.26, 0.22, 0.27]);
    });
    if (id === 'mint-overalls') {
      for (let petal = 0; petal < 6; petal++) blob(group, cream, [Math.sin(petal * Math.PI / 3) * 0.065, 1.3 + Math.cos(petal * Math.PI / 3) * 0.065, 0.56], [0.035, 0.035, 0.018]);
      blob(group, '#e5bd65', [0, 1.3, 0.58], [0.033, 0.033, 0.02]);
    }
    if (id === 'cream-hoodie' || id === 'duck-raincoat') {
      blob(group, color, [0, 1.63, -0.2], [0.49, 0.25, 0.35]);
      blob(group, color, [0, 0.91, 0.48], [0.34, 0.20, 0.055]);
      if (id === 'cream-hoodie') {
        blob(group, paw, [0.13, 0.94, 0.545], [0.10, 0.09, 0.03]);
        for (const side of [-1, 1]) blob(group, paw, [0.13 + side * 0.075, 1.02, 0.54], [0.038, 0.04, 0.03]);
      } else {
        for (const y of [1.4, 1.15, 0.9]) blob(group, cream, [0, y, 0.515], [0.045, 0.045, 0.027]);
        blob(group, cream, [0.28, 1.34, 0.5], [0.085, 0.07, 0.025]);
        blob(group, '#e7a345', [0.35, 1.37, 0.52], [0.035, 0.025, 0.02]);
      }
    }
    if (id === 'star-pajamas') for (const [x, y] of [[-0.26, 1.35], [0.3, 1.22], [0.05, 0.95], [-0.37, 0.78], [0.35, 0.63]]) star(group, cream, x, y, 0.505, 0.065);
    if (id === 'sailor-shirt') {
      for (const y of [0.65, 0.9, 1.16, 1.4]) {
        const stripe = torus(group, cream, 0.65, 0.052, [0, y, 0], [1, 0.77, 1]); stripe.rotation.x = Math.PI / 2;
      }
      tube(group, cream, [[-0.32, 1.62, 0.35], [0, 1.34, 0.54], [0.32, 1.62, 0.35]], 0.06);
    }
  }

  function accessory(id: CapyAccessoryId, parent = torso) { const group = new T.Group(); parent.add(group); group.visible = false; accessories.set(id, group); return group; }
  const headphones = accessory('headphones', head);
  tube(headphones, '#a4b9cf', [[-0.65, 0.25, 0], [-0.66, 0.65, -0.06], [0, 0.83, -0.12], [0.66, 0.65, -0.06], [0.65, 0.25, 0]], 0.075);
  for (const side of [-1, 1]) blob(headphones, '#e4cdd8', [side * 0.68, 0.23, 0], [0.13, 0.23, 0.19]);
  const earbuds = accessory('earbuds', head); for (const side of [-1, 1]) blob(earbuds, cream, [side * 0.63, 0.29, 0.19], [0.06, 0.13, 0.055]);
  const shades = accessory('sunglasses', head);
  for (const side of [-1, 1]) blob(shades, '#57616f', [side * 0.43, 0.24, 0.52], [0.16, 0.13, 0.05], 0.15);
  tube(shades, '#caaa70', [[-0.29, 0.28, 0.54], [0, 0.31, 0.58], [0.29, 0.28, 0.54]], 0.025);
  const flower = accessory('flower', head);
  for (let i = 0; i < 5; i++) blob(flower, '#eeb2b8', [0.52 + Math.sin(i * Math.PI * 0.4) * 0.09, 0.58 + Math.cos(i * Math.PI * 0.4) * 0.09, 0.18], [0.065, 0.065, 0.03]);
  blob(flower, '#f4d58b', [0.52, 0.58, 0.22], [0.05, 0.05, 0.02]);
  const scarf = accessory('scarf'); torus(scarf, '#d88b92', 0.39, 0.105, [0, 1.64, 0], [1.1, 0.8, 1]).rotation.x = Math.PI / 2;
  blob(scarf, '#d88b92', [0.22, 1.34, 0.49], [0.12, 0.27, 0.065]);
  const medal = accessory('medal'); tube(medal, '#8aa9c2', [[-0.26, 1.69, 0.29], [0, 1.2, 0.55], [0.26, 1.69, 0.29]], 0.032); blob(medal, '#ecc66e', [0, 1.16, 0.56], [0.12, 0.12, 0.025], 0.35);
  const watch = accessory('watch', arms[0]); torus(watch, '#9bb8b0', 0.18, 0.04, [0, -0.4, 0.04]).rotation.x = Math.PI / 2; blob(watch, cream, [-0.15, -0.4, 0.16], [0.07, 0.07, 0.045]);
  const sneakers = accessory('sneaker');
  // Shoes attach to feet, so they share each walking/kicking leg transform.
  const shoeParts: T.Group[] = [];
  for (const leg of legs) { const shoe = new T.Group(); leg.add(shoe); shoeParts.push(shoe); blob(shoe, '#e6b8ba', [0, -0.30, 0.17], [0.27, 0.17, 0.32]); }
  // Small keepsakes become physical pins on the backpack, leaving hands free.
  for (const [index, id] of (['phone', 'serum', 'airfryer', 'speaker', 'coffee'] as const).entries()) {
    const pin = accessory(id); blob(pin, ['#9bbbd1', '#e3b8d2', '#d2c3b2', '#aebbd2', '#b98d68'][index], [-0.28 + index * 0.14, 0.85 + (index % 2) * 0.1, -0.47], [0.07, 0.09, 0.045]);
  }
  const leaf = new T.Group(); arms[1].add(leaf); leaf.position.set(0, -0.53, 0.21);
  blob(leaf, '#91b772', [0, 0.12, 0], [0.13, 0.24, 0.025]); tube(leaf, '#597c41', [[0, -0.08, 0.01], [0, 0.29, 0.01]], 0.012);
  const direction = new T.Vector3(), local = new T.Vector3(), down = new T.Vector3(0, -1, 0), target = new T.Quaternion();
  const mouthWorld = new T.Vector3();
  function reach(arm: T.Group, point: Point3, amount = 1) {
    local.set(point.x, point.y, point.z); torso.worldToLocal(local); direction.copy(local).sub(arm.position).normalize();
    target.setFromUnitVectors(down, direction);
    arm.quaternion.slerp(target, amount);
  }
  return {
    root, torso, head, arms, legs, hands, feet,
    outfit(worn: CapyAccessoryId[]) {
      // Covered body surfaces must not poke through the curved garment shell.
      // Bibs retain their own exposed upper chest; sleeves stay on the arm rig.
      const dressed = worn.some((id) => clothing.has(id as CapyClothingId));
      body.visible = belly.visible = !dressed;
      for (const [id, groups] of clothing) groups.forEach((g) => { g.visible = worn.includes(id); });
      for (const [id, group] of accessories) group.visible = worn.includes(id);
      shoeParts.forEach((g) => { g.visible = sneakers.visible; });
    },
    pose(state: CapyPlayState, swingGrip?: Point3[]) {
      const a = state.actor, t = state.time, action = state.action, running = a.speed > 0.05;
      const sleepy = action === 'rest', happy = action === 'pet' || action === 'play' || action === 'wake' || action === 'outfit';
      const blink = sleepy || (t % 5.4 > 4.95 && t % 5.4 < 5.1);
      eyes.forEach((eye) => { eye.visible = !blink; }); eyelids.forEach((eye) => { eye.visible = blink; });
      mouth.visible = !happy; openMouth.visible = happy; tongue.visible = happy;
      const breath = Math.sin(t * (sleepy ? 1.35 : 1.8)) * 0.008;
      torso.scale.set(1 + breath, 1 - breath * 0.4, 1 + breath);
      torso.rotation.x = sleepy ? 0.12 : 0;
      torso.rotation.z = state.mode === 'dance' ? Math.sin(t * 5) * 0.11 : sleepy ? 0.04 : 0;
      head.rotation.set(sleepy ? 0.16 : action === 'feed' ? Math.sin(t * 14) * 0.025 : Math.sin(t * 1.1) * 0.025, 0, action === 'pet' ? Math.sin(t * 4) * 0.07 : 0);
      ears.forEach((ear, i) => { ear.rotation.z = (i ? -1 : 1) * (0.25 + Math.sin(t * 2.4) * 0.035); });
      arms.forEach((arm, i) => {
        arm.rotation.set(running ? Math.sin(a.gait + i * Math.PI) * 0.36 : -0.13, 0, (i ? 1 : -1) * 0.14);
        if (sleepy) arm.rotation.x = -0.55;
        if (state.mode === 'dance') { arm.rotation.z = (i ? 1 : -1) * (0.8 + Math.sin(t * 5 + i) * 0.45); arm.rotation.x = -0.4; }
      });
      legs.forEach((leg, i) => {
        const gait = a.gait + i * Math.PI;
        leg.position.y = 0.46 + (running ? Math.max(0, Math.sin(gait)) * 0.12 : 0);
        leg.rotation.x = running ? Math.sin(gait) * 0.48 : 0;
        if (state.mode === 'swing') leg.rotation.x = -0.95 + Math.sin(t * 2) * 0.08;
        if (sleepy) leg.rotation.x = -1.05;
        if (state.mode === 'dance') leg.rotation.x = Math.sin(t * 5 + i * Math.PI) * 0.23;
      });
      if (a.kick >= 0) legs[1].rotation.x = a.kick < 0.12 ? a.kick / 0.12 * 0.28 : -Math.sin(Math.min(1, (a.kick - 0.12) / 0.4) * Math.PI) * 1.15;
      root.updateMatrixWorld(true);
      if (state.mode === 'bubbles' && state.target) {
        local.set(state.target.x, state.target.y, state.target.z); torso.worldToLocal(local);
        const arm = local.x < 0 ? arms[0] : arms[1]; reach(arm, state.target);
        head.rotation.x = -0.14;
      }
      if (swingGrip) arms.forEach((arm, i) => reach(arm, swingGrip[i]));
      if (action === 'feed') {
        mouthWorld.set(0.12, -0.06, 0.9); head.localToWorld(mouthWorld); reach(arms[1], mouthWorld);
      }
      leaf.visible = action === 'feed';
      if (action === 'wake') arms.forEach((arm, i) => { arm.rotation.z = (i ? 1 : -1) * 2.2 * Math.max(0, Math.sin(Math.min(state.actionTime / 2, 1) * Math.PI)); });
      root.updateMatrixWorld(true);
    },
  };
}
