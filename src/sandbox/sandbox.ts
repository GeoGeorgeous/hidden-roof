import * as THREE from 'three';
import GUI from 'lil-gui';

// R&D sandbox (exp/visual-sandbox): not for production. Prototype 1, "Living
// pigment": paint lives in a different dimension than the ink city.
//  - fresh paint is wet: glossy, deep, reflects a fake sky/neon environment
//    and the camera's own light, then dries over seconds into matte chalk
//  - paint glows in the shadows (emissive, HDR)
//  - chroma bloom in the final pass: the city is ink on paper, so anything
//    saturated is paint, and only paint blooms
//  - thick paint covers the ink outlines
// F6 cycles presets, F7 toggles the panel.

export const SBX = {
  on: true,
  // Wet to dry
  wet: 1.0,
  dryTime: 6.0,
  gloss: 1.6,
  wetDarken: 0.35,
  chalk: 0.25,
  // Glow
  glow: 0.6,
  glowShadowOnly: 0.8,
  // Bloom
  bloom: 1.2,
  bloomThreshold: 0.15,
  bloomRadius: 1.0,
  // Outlines
  paintCoversInk: 0.9,
};

type Preset = Partial<typeof SBX> & { name: string };
const PRESETS: Preset[] = [
  { name: 'LIVING PIGMENT', on: true, wet: 1, dryTime: 6, gloss: 1.6, glow: 0.6, bloom: 1.2, paintCoversInk: 0.9, chalk: 0.25 },
  { name: 'RADIOACTIVE', on: true, wet: 0.6, dryTime: 20, gloss: 0.8, glow: 2.2, glowShadowOnly: 0.3, bloom: 2.6, bloomRadius: 1.8, paintCoversInk: 1, chalk: 0 },
  { name: 'WET ENAMEL', on: true, wet: 1, dryTime: 60, gloss: 2.5, glow: 0.1, bloom: 0.5, paintCoversInk: 1, wetDarken: 0.5, chalk: 0 },
  { name: 'BONE DRY', on: true, wet: 0, glow: 0, bloom: 0.25, chalk: 0.6, paintCoversInk: 0.4 },
  { name: 'OFF (game as is)', on: false },
];

/** Recent paint hits: world xyz + time. Freshness (gloss) is read per pixel from these. */
export const FRESH_N = 48;
const fresh = Array.from({ length: FRESH_N }, () => new THREE.Vector4(0, -1e5, 0, -1e5));
let head = 0;
let clock = 0;
const last = new THREE.Vector3(1e9, 0, 0);

export const sbxUniforms = {
  uFresh: { value: fresh },
  /** time, dryTime, gloss, wet */
  uSbxWet: { value: new THREE.Vector4() },
  /** glow, glowShadowOnly, wetDarken, chalk */
  uSbxLook: { value: new THREE.Vector4() },
  uSbxOn: { value: 1 },
};

/** A paint hit at a world point (spray particle landing, marker...). Merged with the last if close. */
export function freshHit(p: THREE.Vector3) {
  const prev = fresh[(head + FRESH_N - 1) % FRESH_N];
  if (last.distanceToSquared(p) < 0.12 * 0.12 && clock - prev.w < 0.25) {
    prev.w = clock;
    return;
  }
  last.copy(p);
  fresh[head].set(p.x, p.y, p.z, clock);
  head = (head + 1) % FRESH_N;
}

export function syncSandbox(time: number) {
  clock = time;
  const u = sbxUniforms;
  u.uSbxOn.value = SBX.on ? 1 : 0;
  u.uSbxWet.value.set(time, SBX.dryTime, SBX.gloss, SBX.wet);
  u.uSbxLook.value.set(SBX.glow, SBX.glowShadowOnly, SBX.wetDarken, SBX.chalk);
}

/** Surface shader functions (needs cameraPosition, vWorldPos). */
export const SBX_PARS = /* glsl */ `
uniform vec4 uFresh[${FRESH_N}];
uniform vec4 uSbxWet;
uniform vec4 uSbxLook;
uniform float uSbxOn;
// 0 (dry) .. 1 (just sprayed) at p.
float sbxFresh(vec3 p) {
  float f = 0.0;
  for (int i = 0; i < ${FRESH_N}; i++) {
    vec4 h = uFresh[i];
    float age = uSbxWet.x - h.w;
    if (age > uSbxWet.y) continue;
    vec3 d = p - h.xyz;
    float near = exp(-dot(d, d) * 18.0);
    f = max(f, near * (1.0 - smoothstep(0.0, uSbxWet.y, age)));
  }
  return f;
}
// A fake night environment for wet reflections: a dark sky with a moon glow,
// a band of neon city light at the horizon, and a few vertical streaks.
vec3 sbxEnv(vec3 r) {
  float up = r.y;
  vec3 c = mix(vec3(0.02, 0.025, 0.04), vec3(0.08, 0.09, 0.14), smoothstep(-0.2, 0.8, up));
  float a = atan(r.z, r.x);
  float band = exp(-abs(up - 0.05) * 18.0);
  vec3 neon = 0.5 + 0.5 * cos(a * 3.0 + vec3(0.0, 2.1, 4.2));
  c += band * neon * 0.8;
  float streak = pow(max(0.0, sin(a * 23.0)), 40.0) * smoothstep(-0.1, 0.3, up) * (1.0 - smoothstep(0.3, 0.9, up));
  c += streak * vec3(1.0, 0.85, 0.6) * 2.0;
  c += pow(max(0.0, dot(r, normalize(vec3(0.4, 0.6, -0.5)))), 300.0) * 12.0;
  return c;
}
`;

/**
 * Applied to paintCol (the lit paint color) inside INK_FRAG: wet gloss, chalky
 * dry, glow in the dark. Needs light, pa, paintTex, vWorldN, vWorldPos.
 */
export const SBX_PAINT = /* glsl */ `
if (uSbxOn > 0.5 && pa > 0.0) {
  float fr = sbxFresh(vWorldPos) * uSbxWet.w;
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 N0 = normalize(vWorldN);
  // Wet paint is lumpy (orange peel): its highlights break up into streaks and sparkles.
  vec3 q = vWorldPos * 22.0;
  vec3 N = normalize(N0 + (vec3(inkNoise(q), inkNoise(q + 17.0), inkNoise(q + 41.0)) - 0.5) * 0.9 * fr);
  // Wet paint: deeper and more saturated, then a clearcoat on top.
  vec3 deep = paintTex.rgb * paintTex.rgb * 1.3;
  paintCol = mix(paintCol, deep * max(pl, 0.6), fr * uSbxLook.z);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, N), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 coat = sbxEnv(R) * (0.15 + fres);
  // Only the bright part of the reflection shows: a clearcoat, not a haze.
  coat = max(coat - 0.15, 0.0) * 1.6;
  // The spray can's own light: a tight highlight from the eye.
  float headlight = pow(max(dot(N, V), 0.0), 120.0) * 2.5;
  paintCol += (coat + headlight) * fr * uSbxWet.z;
  // Dry paint: chalky, a little lighter and flatter.
  paintCol = mix(paintCol, mix(paintCol, vec3(dot(paintCol, vec3(0.333))) * 1.1 + 0.08, 0.5), uSbxLook.w * (1.0 - fr));
  // Glow: pigment that ignores the dark.
  float dark = mix(1.0, 1.0 - smoothstep(0.1, 0.9, light), uSbxLook.y);
  paintCol += paintTex.rgb * uSbxLook.x * dark;
}
`;

// --- Chroma bloom (post) ---

const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class ChromaBloom {
  readonly a = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private b = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private bright = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null as THREE.Texture | null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.15 } },
    vertexShader: QUAD_VS,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
      vec3 key(vec2 uv) {
        vec3 c = texture2D(tColor, uv).rgb;
        float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
        float chroma = (mx - mn) / max(mx, 1e-3);
        return c * smoothstep(uThreshold, uThreshold + 0.3, chroma) * smoothstep(0.02, 0.2, mx);
      }
      void main() {
        vec2 o = uTexel;
        gl_FragColor = vec4((key(vUv + vec2(-o.x, -o.y)) + key(vUv + vec2(o.x, -o.y)) + key(vUv + vec2(-o.x, o.y)) + key(vUv + vec2(o.x, o.y))) * 0.25, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  private blur = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null as THREE.Texture | null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: QUAD_VS,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
        c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
        c += (texture2D(tSrc, vUv + uDir * 3.23).rgb + texture2D(tSrc, vUv - uDir * 3.23).rgb) * 0.07;
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private cam = new THREE.OrthographicCamera();

  setSize(w: number, h: number) {
    const bw = Math.max(1, Math.floor(w / 4));
    const bh = Math.max(1, Math.floor(h / 4));
    this.a.setSize(bw, bh);
    this.b.setSize(bw, bh);
  }

  render(r: THREE.WebGLRenderer, src: THREE.Texture, srcTexel: THREE.Vector2) {
    this.bright.uniforms.tColor.value = src;
    this.bright.uniforms.uTexel.value.copy(srcTexel).multiplyScalar(1.5);
    this.bright.uniforms.uThreshold.value = SBX.bloomThreshold;
    this.draw(r, this.bright, this.a);
    const tw = 1 / this.a.width;
    const th = 1 / this.a.height;
    for (let i = 0; i < 3; i++) {
      const s = SBX.bloomRadius * (1 + i);
      this.blur.uniforms.tSrc.value = this.a.texture;
      this.blur.uniforms.uDir.value.set(tw * s, 0);
      this.draw(r, this.blur, this.b);
      this.blur.uniforms.tSrc.value = this.b.texture;
      this.blur.uniforms.uDir.value.set(0, th * s);
      this.draw(r, this.blur, this.a);
    }
  }

  private draw(r: THREE.WebGLRenderer, m: THREE.Material, target: THREE.WebGLRenderTarget) {
    this.quad.material = m;
    r.setRenderTarget(target);
    r.render(this.quad, this.cam);
  }
}

// --- Panel and hotkeys ---

let gui: GUI | null = null;
let preset = 0;
const label = document.createElement('div');

function flash(text: string) {
  label.textContent = text;
  label.style.opacity = '1';
  setTimeout(() => (label.style.opacity = '0'), 1400);
}

function applyPreset(i: number) {
  preset = (i + PRESETS.length) % PRESETS.length;
  const { name, ...values } = PRESETS[preset];
  Object.assign(SBX, values);
  gui?.controllersRecursive().forEach((c) => c.updateDisplay());
  flash(`SANDBOX: ${name}`);
}

export function initSandbox() {
  Object.assign(label.style, {
    position: 'fixed', top: '40%', width: '100%', textAlign: 'center', font: 'bold 32px monospace',
    color: '#fff', textShadow: '0 0 12px #f0f', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.4s', zIndex: '9999',
  });
  document.body.appendChild(label);
  gui = new GUI({ title: 'SANDBOX · Living pigment (F6 preset, F7 hide)' });
  gui.domElement.style.zIndex = '9998';
  gui.add(SBX, 'on');
  const w = gui.addFolder('Wet → dry');
  w.add(SBX, 'wet', 0, 1);
  w.add(SBX, 'dryTime', 0.5, 60);
  w.add(SBX, 'gloss', 0, 4);
  w.add(SBX, 'wetDarken', 0, 1);
  w.add(SBX, 'chalk', 0, 1);
  const g = gui.addFolder('Glow');
  g.add(SBX, 'glow', 0, 4);
  g.add(SBX, 'glowShadowOnly', 0, 1);
  const b = gui.addFolder('Chroma bloom');
  b.add(SBX, 'bloom', 0, 5);
  b.add(SBX, 'bloomThreshold', 0, 0.9);
  b.add(SBX, 'bloomRadius', 0.3, 4);
  gui.add(SBX, 'paintCoversInk', 0, 1);
  gui.hide();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F6') {
      e.preventDefault();
      applyPreset(preset + 1);
    } else if (e.code === 'F7') {
      e.preventDefault();
      if (gui!._hidden) gui!.show();
      else gui!.hide();
    }
  });
}
