import * as T from 'three';
import type { CapyAccessoryId, CapyClothingId } from '../../shared/capybara';
import type { CapyPlayState, Point3 } from './capy-play';
import { createCapyFur } from './capy-fur';

/** A small articulated model. Every visible body part and outfit is geometry;
 * no character billboards, image planes or expression textures are used. */
export function createCapyModel() {
  const root = new T.Group(), torso = new T.Group(), head = new T.Group();
  root.name = 'Capy articulated character'; root.add(torso); torso.add(head); head.position.set(0, 1.91, 0);
  const sphere = new T.SphereGeometry(1, 24, 16);
  const smoothSphere = new T.SphereGeometry(1, 48, 32), pear = smoothSphere.clone();
  const furCoat = createCapyFur(), armCoats: T.InstancedMesh[] = [], armSkins: T.Mesh[] = [], legCoats: T.InstancedMesh[] = [];
  const positions = pear.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    positions.setX(i, positions.getX(i) * (1 - y * 0.15));
    positions.setZ(i, positions.getZ(i) * (1 - y * 0.12));
  }
  pear.computeVertexNormals();
  const materials = new Map<string, T.MeshStandardMaterial>();
  function material(color: string, roughness = 0.88) {
    const key = `${color}:${roughness}`;
    if (!materials.has(key)) materials.set(key, roughness > 0.8
      ? new T.MeshPhysicalMaterial({ color, roughness, sheen: 0.45, sheenRoughness: 0.95, sheenColor: '#efd2a9' })
      : new T.MeshPhysicalMaterial({ color, roughness, clearcoat: roughness < 0.3 ? 0.85 : 0, clearcoatRoughness: 0.12 }));
    return materials.get(key)!;
  }
  const fur = '#a9602b', muzzle = '#ba8d59', cream = '#f1dec1', paw = '#5d4030', ink = '#51382b';
  function blob(parent: T.Object3D, color: string, position: number[], scale: number[], roughness = 0.88) {
    const mesh = new T.Mesh(sphere, material(color, roughness));
    mesh.position.set(position[0], position[1], position[2]); mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true; mesh.receiveShadow = false; parent.add(mesh); return mesh;
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
  const body = blob(torso, fur, [0, 1.02, 0], [0.65, 0.80, 0.49]); body.geometry = pear;
  const chestColors: number[] = [], chestTone = new T.Color(), baseTone = new T.Color(fur), paleTone = new T.Color('#cfac7d');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const patch = Math.exp(-((x / 0.57) ** 4 + ((y - 0.03) / 0.78) ** 4)) * T.MathUtils.smoothstep(z, 0.45, 0.85);
    chestTone.copy(baseTone).lerp(paleTone, patch * 0.76); chestColors.push(chestTone.r, chestTone.g, chestTone.b);
  }
  pear.setAttribute('color', new T.Float32BufferAttribute(chestColors, 3));
  body.material = body.material.clone(); body.material.color.set('#ffffff'); body.material.vertexColors = true;
  furCoat.coat(body, 22000, 0.085, '#b87335', { pear: true, chest: true });
  const skull = blob(head, fur, [0, 0.14, 0], [0.68, 0.60, 0.55]); skull.geometry = smoothSphere;
  furCoat.coat(skull, 18000, 0.082, '#bd783b');
  const face = blob(head, muzzle, [0, -0.16, 0.42], [0.55, 0.38, 0.38]); face.geometry = smoothSphere;
  furCoat.coat(face, 4200, 0.04, '#c79e6b', { fine: true });
  const nose = blob(head, '#856247', [0, 0.04, 0.70], [0.36, 0.28, 0.22], 0.93); nose.geometry = smoothSphere;
  furCoat.coat(nose, 3800, 0.05, '#977151', { fine: true });
  for (const side of [-1, 1]) {
    const lip = blob(head, '#856247', [side * 0.16, -0.13, 0.69], [0.22, 0.22, 0.22]); lip.geometry = smoothSphere;
    furCoat.coat(lip, 1400, 0.04, '#977151', { fine: true });
  }
  for (const side of [-1, 1]) {
    blob(head, '#463026', [side * 0.24, 0.115, 0.862], [0.045, 0.025, 0.026], 0.57).rotation.z = side * 0.5;
    for (let w = 0; w < 3; w++) tube(head, '#e7c9a2', [[side * 0.40, -0.06 - w * 0.055, 0.69], [side * 0.58, -0.07 - w * 0.07, 0.70], [side * 0.76, -0.11 - w * 0.10, 0.65]], 0.0026);
  }
  tube(head, '#77563f', [[0, 0.10, 0.916], [0, -0.10, 0.915], [0, -0.31, 0.82]], 0.007);
  const mouth = tube(head, ink, [[-0.44, -0.13, 0.69], [-0.34, -0.31, 0.77], [0, -0.365, 0.79], [0.34, -0.31, 0.77], [0.44, -0.13, 0.69]], 0.010);
  const openMouth = blob(head, '#5d302a', [0, -0.355, 0.80], [0.11, 0.06, 0.027]);
  const tongue = blob(head, '#dca098', [0, -0.38, 0.824], [0.065, 0.025, 0.012]);
  const ears: T.Group[] = [], eyes: T.Group[] = [], eyelids: T.Mesh[] = [];
  for (const side of [-1, 1]) {
    const ear = new T.Group(); head.add(ear); ear.position.set(side * 0.59, 0.55, -0.06); ear.rotation.z = -side * 0.35;
    const outer = blob(ear, '#a36d3e', [0, 0, 0], [0.17, 0.20, 0.115]); furCoat.coat(outer, 550, 0.12, '#ba874f');
    blob(ear, '#bd8274', [0, 0, 0.085], [0.105, 0.135, 0.043]); ears.push(ear);
    const eye = new T.Group(); eye.position.set(side * 0.41, 0.31, 0.435); head.add(eye);
    blob(eye, '#765136', [0, 0.005, -0.015], [0.145, 0.166, 0.075]);
    blob(eye, '#fff0dc', [0, 0, 0.016], [0.117, 0.137, 0.050], 0.19);
    blob(eye, '#714123', [side * -0.011, -0.005, 0.065], [0.101, 0.120, 0.035], 0.12);
    blob(eye, '#24180f', [-side * 0.008, 0.008, 0.097], [0.055, 0.076, 0.021], 0.10);
    blob(eye, '#ffffff', [-0.031, 0.045, 0.115], [0.027, 0.029, 0.009], 0.12);
    blob(eye, '#efd0a5', [0.031, -0.042, 0.107], [0.012, 0.015, 0.007], 0.17); eyes.push(eye);
    tube(eye, '#503524', [[-0.115, 0.02, 0.04], [-0.075, 0.112, 0.06], [0, 0.145, 0.065], [0.10, 0.09, 0.05]], 0.010);
    eyelids.push(tube(head, ink, [[side * 0.41 - 0.1, 0.31, 0.48], [side * 0.41, 0.285, 0.52], [side * 0.41 + 0.1, 0.31, 0.48]], 0.011));
    tube(head, paw, [[side * 0.41 - 0.09, 0.50, 0.39], [side * 0.41, 0.535, 0.40], [side * 0.41 + 0.08, 0.50, 0.39]], 0.013);
  }
  const horn = new T.Group(); horn.position.set(0, 0.80, 0.01); horn.rotation.z = -0.08; horn.scale.setScalar(0.8); head.add(horn);
  const rainbow = ['#b597dc', '#78b3e4', '#83c99a', '#efd16f', '#ed9d9f'];
  const hornGeometry = new T.ConeGeometry(0.145, 0.53, 48, 24);
  hornGeometry.translate(0, 0.21, 0);
  const hornColors: number[] = [], hornVertices = hornGeometry.getAttribute('position');
  for (let i = 0; i < hornVertices.count; i++) {
    const progress = T.MathUtils.clamp((hornVertices.getY(i) + 0.055) / 0.53, 0, 1) * 4;
    const color = new T.Color(rainbow[Math.floor(progress)]).lerp(new T.Color(rainbow[Math.min(4, Math.floor(progress) + 1)]), progress % 1);
    hornColors.push(color.r, color.g, color.b);
  }
  hornGeometry.setAttribute('color', new T.Float32BufferAttribute(hornColors, 3));
  const hornMesh = new T.Mesh(hornGeometry, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 })); horn.add(hornMesh);
  const spiral = Array.from({ length: 81 }, (_, i) => { const u = i / 80, r = (1 - u) * 0.145; return [Math.sin(u * Math.PI * 7) * r, -0.05 + u * 0.52, Math.cos(u * Math.PI * 7) * r]; });
  tube(horn, '#f3d7c5', spiral, 0.009);


  const arms: T.Group[] = [], legs: T.Group[] = [], hands: T.Object3D[] = [], feet: T.Object3D[] = [];
  const clothing = new Map<CapyClothingId, T.Group[]>();
  const accessories = new Map<CapyAccessoryId, T.Group>();
  for (const side of [-1, 1]) {
    const arm = new T.Group(); arm.position.set(side * 0.6, 1.48, 0); torso.add(arm); arms.push(arm);
    const upper = blob(arm, fur, [0, -0.22, 0.025], [0.22, 0.36, 0.24]);
    armSkins.push(upper); armCoats.push(furCoat.coat(upper, 2200, 0.125, '#b5793c'));
    const hand = blob(arm, paw, [0, -0.51, 0.06], [0.19, 0.18, 0.21]); hands.push(hand);
    const leg = new T.Group(); leg.position.set(side * 0.32, 0.46, 0); torso.add(leg); legs.push(leg);
    const thigh = blob(leg, fur, [0, -0.12, 0], [0.24, 0.31, 0.25]); legCoats.push(furCoat.coat(thigh, 1200, 0.12, '#a86c35'));
    const foot = blob(leg, paw, [0, -0.31, 0.13], [0.255, 0.15, 0.30]); feet.push(foot);
    for (let toe = -1; toe <= 1; toe++) blob(leg, '#624332', [toe * 0.105, -0.31, 0.36], [0.06, 0.075, 0.06]);
  }

  const colors: Record<CapyClothingId, string> = {
    'strawberry-dress': '#e79ba9', 'mint-overalls': '#a6c9ac', 'cream-hoodie': '#f3e4c9',
    'duck-raincoat': '#f4ce66', 'star-pajamas': '#b9a4d8', 'sailor-shirt': '#9cbdd1',
  };
  for (const [id, color] of Object.entries(colors) as [CapyClothingId, string][]) {
    const group = new T.Group(); torso.add(group); clothing.set(id, [group]); group.visible = false;
    const bib = id === 'mint-overalls' || id === 'strawberry-dress';
    if (bib) { const chest = blob(group, fur, [0, 1.43, 0], [0.56, 0.32, 0.44]); furCoat.coat(chest, 1000, 0.09, '#cc914f'); }
    const garment = blob(group, color, [0, bib ? 0.86 : 1.04, 0], [0.665, bib ? 0.61 : 0.76, 0.505]); garment.geometry = smoothSphere;
    if (id === 'cream-hoodie') furCoat.coat(garment, 6500, 0.035, color, { fine: true });
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
        const fabric = blob(sleeve, color, [0, long ? -0.20 : -0.11, 0.02], [0.24, long ? 0.36 : 0.23, 0.265]); fabric.geometry = smoothSphere;
        if (id === 'cream-hoodie') furCoat.coat(fabric, 1100, 0.06, color, { fine: true });
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
  const joints = [torso, head, ...ears, ...arms, ...legs];
  const previous = joints.map(joint => ({ rotation: joint.quaternion.clone(), position: joint.position.clone() }));
  let poseTime = -1, smile = 0, closedEyes = 0, reachSide = 1, reachId = -1;
  const ease = (value: number) => T.MathUtils.smoothstep(value, 0, 1);
  function reach(arm: T.Group, point: Point3, amount = 1) {
    local.set(point.x, point.y, point.z); torso.worldToLocal(local); direction.copy(local).sub(arm.position).normalize();
    target.setFromUnitVectors(down, direction);
    arm.quaternion.slerp(target, amount);
  }
  return {
    root, torso, head, arms, legs, hands, feet, detail: furCoat.detail,
    outfit(worn: CapyAccessoryId[]) {
      // Covered body surfaces must not poke through the curved garment shell.
      // Bibs retain their own exposed upper chest; sleeves stay on the arm rig.
      const dressed = worn.some((id) => clothing.has(id as CapyClothingId));
      body.visible = !dressed;
      armSkins.forEach(skin => { skin.visible = !worn.some(id => ['cream-hoodie', 'duck-raincoat', 'star-pajamas'].includes(id)); });
      armCoats.forEach((coat) => { coat.visible = !worn.some(id => ['cream-hoodie', 'duck-raincoat', 'star-pajamas', 'sailor-shirt'].includes(id)); });
      legCoats.forEach(coat => { coat.visible = !worn.some(id => ['mint-overalls', 'star-pajamas', 'sneaker'].includes(id)); });
      for (const [id, groups] of clothing) groups.forEach((g) => { g.visible = worn.includes(id); });
      for (const [id, group] of accessories) group.visible = worn.includes(id);
      shoeParts.forEach((g) => { g.visible = sneakers.visible; });
    },
    pose(state: CapyPlayState, swingGrip?: Point3[]) {
      const a = state.actor, t = state.time, action = state.action;
      if (poseTime === t) { root.updateMatrixWorld(true); return; }
      const dt = poseTime < 0 ? 1 : Math.min(0.05, t - poseTime), blend = 1 - Math.exp(-18 * dt); poseTime = t;
      const sleepy = action === 'rest', dance = state.mode === 'dance' ? a.settled : 0;
      const seated = state.mode === 'swing' ? a.settled : 0;
      const happy = action === 'pet' || action === 'play' || action === 'wake' || action === 'outfit';
      const blinkTime = t % 5.8, blink = blinkTime > 4.9 && blinkTime < 5.12 ? Math.sin((blinkTime - 4.9) / 0.22 * Math.PI) : 0;
      closedEyes += ((sleepy ? 1 : blink) - closedEyes) * (1 - Math.exp(-36 * dt));
      eyes.forEach((eye) => { eye.scale.y = Math.max(0.025, 1 - closedEyes); eye.visible = closedEyes < 0.92; });
      eyelids.forEach((eye) => { eye.visible = closedEyes >= 0.92; });
      smile += ((happy ? 1 : 0) - smile) * blend;
      mouth.visible = true; openMouth.visible = tongue.visible = smile > 0.03;
      openMouth.scale.y = 0.075 * Math.max(0.01, smile); tongue.scale.y = 0.025 * Math.max(0.01, smile);
      const breath = Math.sin(t * (sleepy ? 1.35 : 1.8)) * 0.006;
      const crouch = a.anticipation >= 0 ? Math.sin(a.anticipation / 0.18 * Math.PI / 2) : 0;
      const landing = a.landing > 0 ? Math.sin(a.landing / 0.28 * Math.PI) : 0;
      torso.scale.set(1 + breath + (crouch + landing) * 0.016, 1 - breath * 0.4 - (crouch + landing) * 0.025, 1 + breath);
      torso.position.y = -(crouch * 0.07 + landing * 0.09) + Math.cos(a.gait * 2) * 0.012 * a.walk;
      torso.rotation.set(sleepy ? 0.12 : a.speed * 0.035 + crouch * 0.04, 0,
        Math.sin(a.gait) * 0.025 * a.walk - a.turn * a.speed * 0.012 + Math.sin(t * 5) * 0.075 * dance);
      head.rotation.set(sleepy ? 0.16 : action === 'feed' ? Math.sin(t * 11) * 0.018 : Math.sin(t * 1.1) * 0.018 - a.speed * 0.025,
        T.MathUtils.clamp(a.turn * 0.065, -0.18, 0.18), action === 'pet' ? Math.sin(state.actionTime * 3.4) * 0.065 : -Math.sin(a.gait) * 0.012 * a.walk);
      ears.forEach((ear, i) => { ear.rotation.z = (i ? -1 : 1) * (0.35 + Math.sin(t * 2.1 - 0.4) * 0.018 + a.vy * 0.018 + landing * 0.06); });
      arms.forEach((arm, i) => {
        arm.rotation.set(Math.sin(a.gait + i * Math.PI + 0.35) * 0.32 * a.walk - 0.13 * (1 - a.walk), 0, (i ? 1 : -1) * (0.12 + crouch * 0.08));
        if (sleepy) arm.rotation.x = -0.55;
        arm.rotation.z += (i ? 1 : -1) * (0.65 + Math.sin(t * 5 + i * 0.7) * 0.32) * dance;
        arm.rotation.x -= 0.32 * dance;
      });
      legs.forEach((leg, i) => {
        // A long planted phase and a short lifted return keep paws grounded.
        const phase = (a.gait / (Math.PI * 2) + i * 0.5) % 1, stance = phase < 0.62;
        const step = stance ? phase / 0.62 : (phase - 0.62) / 0.38;
        const stride = stance ? 0.2375 * (1 - step * 2) : 0.2375 * (-1 + ease(step) * 2);
        const lift = stance ? 0 : Math.sin(step * Math.PI) * 0.13;
        leg.position.set((i ? 1 : -1) * 0.32, 0.46 + lift * a.walk - torso.position.y, stride * a.walk);
        leg.rotation.set((stance ? 0 : Math.sin(step * Math.PI) * 0.16) * a.walk - 0.95 * seated, 0, 0);
        if (a.y > 0) leg.rotation.x -= Math.min(0.45, a.y * 0.7);
        if (sleepy) leg.rotation.x = -1.05;
        leg.rotation.x += Math.sin(t * 5 + i * Math.PI) * 0.20 * dance;
        leg.position.y += Math.max(0, Math.sin(t * 5 + i * Math.PI)) * 0.06 * dance;
      });
      if (a.kick >= 0) legs[1].rotation.x = a.kick < 0.15 ? ease(a.kick / 0.15) * 0.3 : -Math.sin(Math.min(1, (a.kick - 0.15) / 0.45) * Math.PI) * 1.18;
      root.updateMatrixWorld(true);
      if (state.mode === 'bubbles' && state.target) {
        local.set(state.target.x, state.target.y, state.target.z); torso.worldToLocal(local);
        const id = 'id' in state.target ? Number(state.target.id) : -1;
        if (id !== reachId) { reachSide = local.x < 0 ? 0 : 1; reachId = id; }
        reach(arms[reachSide], state.target, ease((1.6 - Math.hypot(local.x, local.z)) / 0.8));
        head.rotation.x = -0.12; head.rotation.y += T.MathUtils.clamp(local.x * 0.16, -0.18, 0.18);
      } else reachId = -1;
      if (swingGrip) arms.forEach((arm, i) => reach(arm, swingGrip[i], seated));
      if (action === 'feed') {
        mouthWorld.set(0.12, -0.06, 0.9); head.localToWorld(mouthWorld); reach(arms[1], mouthWorld);
      }
      leaf.visible = action === 'feed';
      if (action === 'wake') arms.forEach((arm, i) => { arm.rotation.z = (i ? 1 : -1) * 2.2 * Math.max(0, Math.sin(Math.min(state.actionTime / 2, 1) * Math.PI)); });
      // Retarget the current joint pose. Physics and rendering can request the
      // same timestamp; blending must advance only once per simulation step.
      joints.forEach((joint, i) => {
        previous[i].rotation.slerp(joint.quaternion, blend); joint.quaternion.copy(previous[i].rotation);
        previous[i].position.lerp(joint.position, blend); joint.position.copy(previous[i].position);
      });
      root.updateMatrixWorld(true);
    },
  };
}
