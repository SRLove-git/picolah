import * as T from 'three';

/** Combed, tapered fibres, instanced once per body part. The coat has volume
 * from every viewing angle and follows the same joint as the underlying skin. */
export function createCapyFur() {
  const geometry = new T.CylinderGeometry(0.015, 1, 1, 3, 1, true);
  geometry.translate(0, 0.5, 0);
  const position = geometry.getAttribute('position'), tint = [];
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    position.setX(i, position.getX(i) + y * y * 0.22);
    const value = 0.89 + y * 0.15;
    tint.push(value, value, value);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(tint, 3));
  geometry.computeVertexNormals();
  const material = new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1 });
  // All fibres share the coat's smooth normal field. Cylinder facet normals
  // make subpixel hairs flicker like sand; the combed surface stays soft.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute vec3 furSurfaceNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\ntransformedNormal = normalize(normalMatrix * furSurfaceNormal);');
  };
  material.customProgramCacheKey = () => 'capy-combed-fur-v1';
  const coats: { mesh: T.InstancedMesh; count: number }[] = [];
  let seed = 8173;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const normal = new T.Vector3(), comb = new T.Vector3(), direction = new T.Vector3();
  const point = new T.Vector3(), up = new T.Vector3(0, 1, 0), quaternion = new T.Quaternion();
  const matrix = new T.Matrix4(), scale = new T.Vector3(), color = new T.Color();

  function coat(skin: T.Mesh, count: number, length: number, base: string, options: { pear?: boolean; fine?: boolean; chest?: boolean } = {}) {
    const mesh = new T.InstancedMesh(geometry.clone(), material, count);
    mesh.name = 'Combed plush fibres'; mesh.userData.fur = true;
    const surfaceNormals = new Float32Array(count * 3);
    const baseColor = new T.Color(base), pale = new T.Color('#cfac7d');
    for (let i = 0; i < count; i++) {
      const y = random() * 2 - 1, theta = random() * Math.PI * 2, radius = Math.sqrt(1 - y * y);
      normal.set(Math.cos(theta) * radius, y, Math.sin(theta) * radius); point.copy(normal);
      if (options.pear) { point.x *= 1 - y * 0.15; point.z *= 1 - y * 0.12; }
      point.multiplyScalar(0.998);
      // Hair falls along the surface instead of pointing out like needles.
      comb.set((random() - 0.5) * 0.35, -1, 0.15);
      comb.addScaledVector(normal, -comb.dot(normal));
      if (comb.lengthSq() < 0.02) comb.set(0, 0, 1);
      comb.normalize(); direction.copy(normal).multiplyScalar(0.65).addScaledVector(comb, 0.76).normalize();
      // Gentle directional light variation reveals strands without hard speckle.
      const bend = 0.10 + random() * 0.24;
      surfaceNormals.set([normal.x + comb.x * bend, normal.y + comb.y * bend, normal.z + comb.z * bend], i * 3);
      quaternion.setFromUnitVectors(up, direction);
      const strand = length * (0.7 + random() * 0.6), width = (options.fine ? 0.0017 : 0.0030) * (0.7 + random() * 0.6);
      scale.set(width, strand, width); matrix.compose(point, quaternion, scale); mesh.setMatrixAt(i, matrix);
      color.copy(baseColor);
      if (options.chest) {
        const patch = Math.exp(-((point.x / 0.57) ** 4 + ((point.y - 0.03) / 0.78) ** 4)) * T.MathUtils.smoothstep(point.z, 0.45, 0.85);
        color.lerp(pale, patch * 0.76);
      }
      color.multiplyScalar(0.94 + random() * 0.12); mesh.setColorAt(i, color);
    }
    mesh.geometry.setAttribute('furSurfaceNormal', new T.InstancedBufferAttribute(surfaceNormals, 3));
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.castShadow = false; mesh.receiveShadow = false;
    skin.add(mesh); coats.push({ mesh, count }); return mesh;
  }
  return {
    coat,
    detail(amount: number) { for (const { mesh, count } of coats) mesh.count = Math.ceil(count * T.MathUtils.clamp(amount, 0.55, 1)); },
    get count() { return coats.reduce((sum, { mesh }) => sum + (mesh.visible ? mesh.count : 0), 0); },
  };
}
