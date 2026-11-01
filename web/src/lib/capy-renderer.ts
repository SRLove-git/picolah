import type { CapyExpression } from '../components/CapyExpressionArt';
import type { CapyPose } from './capy-motion';
import { CAPY_CLOTHING_FOREGROUND } from './capy-clothing';

type Images = Partial<Record<CapyExpression, HTMLImageElement>>;
export interface CapyWearable {
  image: HTMLImageElement;
  clothing?: boolean;
  layout: { x: number; y: number; scale: number; rotate?: number; width?: number; height?: number };
}

// One continuous mesh avoids cut-out seams. The same deformation is applied to
// every accessory, so glasses, flowers, wrists and bag charms stay attached.
const VERTEX = `
attribute vec2 aPosition;
attribute vec2 aUV;
uniform vec4 uPose;
uniform vec4 uDetail;
varying vec2 vUV;
vec2 turn(vec2 p, vec2 pivot, float angle) {
  float c = cos(angle), s = sin(angle);
  vec2 d = p - pivot;
  return pivot + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
}
float spot(vec2 p, vec2 center, vec2 radius) {
  vec2 d = (p - center) / radius;
  return exp(-dot(d, d) * 2.0);
}
void main() {
  vec2 p = aPosition;
  float head = 1.0 - smoothstep(305.0, 410.0, p.y);
  float chest = smoothstep(330.0, 440.0, p.y) * (1.0 - smoothstep(640.0, 750.0, p.y));
  p.x += (p.x - 400.0) * uDetail.w * chest;
  p.y -= 300.0 * uDetail.w * chest;
  float leftEar = spot(p, vec2(302.0, 94.0), vec2(51.0, 55.0));
  float rightEar = spot(p, vec2(543.0, 132.0), vec2(54.0, 57.0));
  p = mix(p, turn(p, vec2(318.0, 128.0), uDetail.x), leftEar);
  p = mix(p, turn(p, vec2(515.0, 165.0), -uDetail.x), rightEar);
  float muzzle = spot(p, vec2(327.0, 268.0), vec2(134.0, 75.0));
  p.y += uDetail.y * muzzle;
  p.x += uDetail.y * 0.22 * muzzle;
  float bag = spot(p, vec2(292.0, 552.0), vec2(172.0, 160.0));
  p.x += uDetail.z * bag;
  p.y += uDetail.z * 0.28 * bag;
  p = mix(p, turn(p, vec2(400.0, 355.0), uPose.x), head);
  p.y = 774.0 + (p.y - 774.0) * (1.0 + uPose.z);
  p.x = 400.0 + (p.x - 400.0) * (1.0 - uPose.z * 0.5);
  p = turn(p, vec2(400.0, 774.0), uPose.w);
  p.y += uPose.y;
  // Extra transparent space above/below the art accommodates hops and ears.
  gl_Position = vec4(p.x / 768.0 * 2.0 - 1.0, 1.0 - (p.y + 80.4) / 964.8 * 2.0, 0.0, 1.0);
  vUV = aUV;
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uEyes;
uniform float uMix;
uniform float uBlink;
varying vec2 vUV;
void main() {
  vec4 color = mix(texture2D(uFrom, vUV), texture2D(uTo, vUV), uMix);
  // Feathered, registered eyelids use the existing sleeping artwork; the rest
  // of the face stays unchanged during a blink.
  vec2 right = (vUV - vec2(0.603, 0.216)) / vec2(0.049, 0.045);
  vec2 left = (vUV - vec2(0.384, 0.174)) / vec2(0.035, 0.035);
  float r = (1.0 - smoothstep(0.5, 1.0, length(right))) * uBlink;
  float l = (1.0 - smoothstep(0.5, 1.0, length(left))) * uBlink;
  color = mix(color, texture2D(uEyes, vUV + vec2(-0.013, 0.016)), r);
  color = mix(color, texture2D(uEyes, vUV + vec2(-0.027, 0.025)), l);
  gl_FragColor = color;
}`;

/** A small WebGL 1 rig; unsupported/lost contexts leave the DOM artwork intact. */
export function createCapyRenderer(canvas: HTMLCanvasElement, images: Images, worn: CapyWearable[]) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl || !images.idle) return null;
  const buffers: WebGLBuffer[] = [];
  const textures: WebGLTexture[] = [];
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  if (!program) return null;
  function dispose() {
    buffers.forEach((buffer) => gl!.deleteBuffer(buffer));
    textures.forEach((texture) => gl!.deleteTexture(texture));
    shaders.forEach((shader) => gl!.deleteShader(shader));
    gl!.deleteProgram(program);
  }
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('No shader');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader unavailable');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Rig unavailable');
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const uniforms = Object.fromEntries(['uPose', 'uDetail', 'uFrom', 'uTo', 'uEyes', 'uMix', 'uBlink'].map((name) => [name, gl.getUniformLocation(program, name)]));
    const position = gl.getAttribLocation(program, 'aPosition');
    const uv = gl.getAttribLocation(program, 'aUV');

    function texture(image: HTMLImageElement | HTMLCanvasElement) {
      const value = gl!.createTexture();
      if (!value) throw new Error('Texture unavailable');
      textures.push(value);
      gl!.bindTexture(gl!.TEXTURE_2D, value);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, image);
      return value;
    }
    function mesh(columns: number, rows: number, place: (x: number, y: number) => number[]) {
      const vertices: number[] = [], indices: number[] = [];
      for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) vertices.push(...place(x / columns, y / rows), x / columns, y / rows);
      for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
        const i = y * (columns + 1) + x;
        indices.push(i, i + 1, i + columns + 1, i + 1, i + columns + 2, i + columns + 1);
      }
      const vertex = gl!.createBuffer(), index = gl!.createBuffer();
      if (!vertex || !index) throw new Error('Mesh unavailable');
      buffers.push(vertex, index);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, vertex);
      gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(vertices), gl!.STATIC_DRAW);
      gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, index);
      gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl!.STATIC_DRAW);
      return { vertex, index, count: indices.length };
    }
    const body = mesh(48, 50, (x, y) => [x * 768, y * 804]);
    const clothing = worn.find((item) => item.clothing);
    function dressed(image: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
      if (!clothing) return image;
      const plate = document.createElement('canvas');
      plate.width = 768; plate.height = 804;
      const paint = plate.getContext('2d');
      if (!paint) throw new Error('Clothing compositor unavailable');
      paint.drawImage(image, 0, 0, 768, 804);
      paint.drawImage(clothing.image, 0, 0, 768, 804);
      paint.save();
      paint.clip(new Path2D(CAPY_CLOTHING_FOREGROUND));
      paint.drawImage(image, 0, 0, 768, 804);
      paint.restore();
      return plate;
    }
    const art = Object.fromEntries(Object.entries(images).map(([name, image]) => [name, texture(dressed(image))])) as Record<CapyExpression, WebGLTexture>;
    const accessories = worn.filter((item) => !item.clothing).map(({ image, layout }) => {
      const angle = (layout.rotate ?? 0) * Math.PI / 180;
      return { texture: texture(image), mesh: mesh(10, 10, (u, v) => {
        const x = (u - 0.5) * (layout.width ?? 100) * layout.scale, y = (v - 0.5) * (layout.height ?? 100) * layout.scale;
        return [layout.x + x * Math.cos(angle) - y * Math.sin(angle), layout.y + x * Math.sin(angle) + y * Math.cos(angle)];
      }) };
    });
    function bindTexture(unit: number, value: WebGLTexture) {
      gl!.activeTexture(gl!.TEXTURE0 + unit);
      gl!.bindTexture(gl!.TEXTURE_2D, value);
    }
    function drawMesh(value: ReturnType<typeof mesh>) {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, value.vertex);
      gl!.enableVertexAttribArray(position);
      gl!.vertexAttribPointer(position, 2, gl!.FLOAT, false, 16, 0);
      gl!.enableVertexAttribArray(uv);
      gl!.vertexAttribPointer(uv, 2, gl!.FLOAT, false, 16, 8);
      gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, value.index);
      gl!.drawElements(gl!.TRIANGLES, value.count, gl!.UNSIGNED_SHORT, 0);
    }
    return {
      dispose,
      draw(pose: CapyPose, from: CapyExpression, to: CapyExpression, mix: number) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform4f(uniforms.uPose, pose.head, pose.lift, pose.stretch, pose.lean);
        gl.uniform4f(uniforms.uDetail, pose.ears, pose.chew, pose.bag, pose.breath);
        gl.uniform1i(uniforms.uFrom, 0);
        gl.uniform1i(uniforms.uTo, 1);
        gl.uniform1i(uniforms.uEyes, 2);
        bindTexture(0, art[from] ?? art.idle);
        bindTexture(1, art[to] ?? art.idle);
        bindTexture(2, art.sleepy ?? art.idle);
        gl.uniform1f(uniforms.uMix, mix);
        gl.uniform1f(uniforms.uBlink, art.sleepy && (to === 'idle' || to === 'snack') && mix === 1 ? pose.blink : 0);
        drawMesh(body);
        gl.uniform1f(uniforms.uBlink, 0);
        gl.uniform1f(uniforms.uMix, 1);
        for (const accessory of accessories) {
          bindTexture(0, accessory.texture);
          bindTexture(1, accessory.texture);
          drawMesh(accessory.mesh);
        }
      },
    };
  } catch {
    dispose();
    return null;
  }
}
