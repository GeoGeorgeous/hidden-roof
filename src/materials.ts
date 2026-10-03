import * as THREE from 'three';
import { PAINT, RENDER } from './config';

// One small unlit-ish shader for everything: tiled base texture (world-aligned,
// same texel density as paint), paint atlas on top, simple sun + sky lighting, fog.

export const SKY = {
  horizon: new THREE.Color('#f2b38a'),
  zenith: new THREE.Color('#5a7fc0'),
  fog: new THREE.Color('#e8b394'),
  sunDir: new THREE.Vector3(0.45, 0.5, 0.74).normalize(),
  sunColor: new THREE.Color('#ffe2c0'),
  ambient: new THREE.Color('#aab4d8'),
};

const EMPTY_PAINT = new THREE.DataTexture(new Uint8Array(4), 1, 1);
EMPTY_PAINT.needsUpdate = true;

const vertexShader = /* glsl */ `
attribute vec2 baseUv;
varying vec2 vUv;
varying vec2 vBaseUv;
varying vec3 vNormal;
varying float vDist;
uniform float uBaseScale;
void main() {
  vUv = uv;
  vBaseUv = baseUv * uBaseScale;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uBase;
uniform sampler2D uPaint;
uniform vec3 uTint;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlphaSteps;
uniform float uEmissive;
varying vec2 vUv;
varying vec2 vBaseUv;
varying vec3 vNormal;
varying float vDist;
void main() {
  vec3 base = texture2D(uBase, vBaseUv).rgb * uTint;
  vec4 paint = texture2D(uPaint, vUv);
  float a = paint.a;
  if (uAlphaSteps > 0.0) a = ceil(a * uAlphaSteps - 0.15) / uAlphaSteps;
  vec3 col = mix(base, paint.rgb, clamp(a, 0.0, 1.0));
  vec3 n = normalize(vNormal);
  float sun = max(dot(n, uSunDir), 0.0);
  float sky = 0.8 + 0.2 * n.y;
  vec3 light = uAmbient * sky + uSunColor * sun * 0.9;
  vec3 lit = mix(col * light, col, uEmissive);
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(lit, uFogColor, fog), 1.0);
  #include <colorspace_fragment>
}
`;

export interface SurfaceMaterialOptions {
  base: THREE.Texture;
  tint?: THREE.ColorRepresentation;
  /** Meters covered by one repeat of the base texture. */
  tileMeters?: number;
  emissive?: number;
}

export function makeSurfaceMaterial(opts: SurfaceMaterialOptions): THREE.ShaderMaterial {
  const tile = opts.tileMeters ?? (opts.base.image as HTMLCanvasElement).width / PAINT.texelsPerMeter;
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uBase: { value: opts.base },
      uPaint: { value: EMPTY_PAINT },
      uBaseScale: { value: 1 / tile },
      uTint: { value: new THREE.Color(opts.tint ?? '#ffffff') },
      uSunDir: { value: SKY.sunDir },
      uSunColor: { value: SKY.sunColor },
      uAmbient: { value: SKY.ambient },
      uFogColor: { value: SKY.fog },
      uFogNear: { value: RENDER.fogNear },
      uFogFar: { value: RENDER.fogFar },
      uAlphaSteps: { value: PAINT.alphaSteps },
      uEmissive: { value: opts.emissive ?? 0 },
    },
  });
}

// ---------------------------------------------------------------------------
// Procedural base textures. Small canvases, nearest filtering, repeat wrapping.

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(w: number, h: number, seed: number, paint: Painter): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx, w, h, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, base: number, amp: number) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] * base + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] * base + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] * base + n));
  }
  ctx.putImageData(img, 0, 0);
}

function build() {
  const concrete = canvasTexture(32, 32, 1, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#c9c2b8';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, rnd, 1, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, h - 1, w, 1); // panel seam every 2 m
    ctx.fillRect(w - 1, 0, 1, h);
  });

  const roof = canvasTexture(32, 32, 2, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#8d8a86';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, rnd, 1, 26);
    ctx.fillStyle = 'rgba(40,30,30,0.18)';
    ctx.fillRect(0, h - 1, w, 1);
    ctx.fillRect(w - 1, 0, 1, h);
  });

  const brick = canvasTexture(16, 16, 3, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#c4b6aa';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let col = -1; col < 2; col++) {
        const v = 170 + Math.floor(rnd() * 30);
        ctx.fillStyle = `rgb(${v + 25},${v - 40},${v - 60})`;
        ctx.fillRect(col * 8 + off, row * 4, 7, 3);
      }
    }
    noise(ctx, w, h, rnd, 1, 10);
  });

  const metal = canvasTexture(16, 16, 4, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#b5bcc0';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(x, 0, 1, h);
    }
    noise(ctx, w, h, rnd, 1, 10);
  });

  const paper = canvasTexture(32, 32, 5, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#ece6da';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 1, h);
    noise(ctx, w, h, rnd, 1, 8);
  });

  const wood = canvasTexture(16, 32, 7, (ctx, w, h, rnd) => {
    for (let x = 0; x < w; x += 3) {
      const v = 120 + Math.floor(rnd() * 40);
      ctx.fillStyle = `rgb(${v + 30},${v},${v - 40})`;
      ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, 0, 1, h);
    }
    ctx.fillStyle = '#4a4440';
    ctx.fillRect(0, 6, w, 1); // iron bands
    ctx.fillRect(0, 22, w, 1);
    noise(ctx, w, h, rnd, 1, 14);
  });

  const plain = canvasTexture(8, 8, 6, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, rnd, 1, 12);
  });

  // Facade for far buildings: one window cell per 4x4 m (tile 8 m, 16x16 px).
  const facade = (seed: number, wall: string, lit: number) =>
    canvasTexture(32, 32, seed, (ctx, w, h, rnd) => {
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const on = rnd() < lit;
          ctx.fillStyle = on ? (rnd() < 0.5 ? '#ffd890' : '#ffe9b8') : rnd() < 0.5 ? '#3a4660' : '#2c3348';
          ctx.fillRect(x + 1, y + 1, 2, 2);
        }
      }
    });

  return {
    concrete,
    roof,
    brick,
    metal,
    paper,
    plain,
    wood,
    facadeA: facade(10, '#8f8a96', 0.25),
    facadeB: facade(11, '#a69580', 0.18),
    facadeC: facade(12, '#6f7486', 0.3),
  };
}

let cache: ReturnType<typeof build> | null = null;
export function textures() {
  return (cache ??= build());
}
