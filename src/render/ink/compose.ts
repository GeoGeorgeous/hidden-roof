import * as THREE from 'three';
import { lcg } from '../../lcg';

// Final pass of the ink look (see post.ts): pen outlines found in the depth
// buffer, paper grain, then linear -> sRGB.
//
// Outlines: the depth buffer holds 1/z (affine in screen space for any
// plane), so on a flat surface it changes linearly from pixel to pixel and
// its second difference is zero. Where it isn't, there is an edge: a
// silhouette (depth jumps; drawn on the near side only, so lines stay one
// pixel) or a crease where two faces meet. The test is relative to the
// pixel's own depth, so it works at any distance; lines thin out with
// distance (INK.outlineFade) so far, dense structures don't turn into a
// black mass. The view model's depth is squashed into [0, VIEW_DEPTH]
// (see post.ts) and stretched back here.

export const VIEW_DEPTH = 0.01;

/**
 * Paper, precomputed (the final pass reads it instead of hashing noise per
 * pixel): R fine tooth, G soft blotches, B fibers, A slow wobble field.
 * Tiles every 256 px; G and A are smooth, so stretched lookups don't show it.
 */
export function paperTexture() {
  const N = 256;
  const rnd = lcg(5150);
  const white = new Float32Array(N * N).map(() => rnd());
  const smooth = (cell: number, seed: number) => {
    const g = (cx: number, cy: number) => white[(((cy * 31 + seed) % N) * N + ((cx * 17 + seed * 7) % N)) % (N * N)];
    return (x: number, y: number) => {
      const fx = x / cell;
      const fy = y / cell;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const n = N / cell;
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (a: number, b: number) => g(((a % n) + n) % n, ((b % n) + n) % n);
      return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
    };
  };
  const blot = smooth(32, 3);
  const wobble = smooth(16, 11);
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      data[i] = white[y * N + x] * 255;
      data[i + 1] = blot(x, y) * 255;
      data[i + 2] = white[(x * 7 + y * 131) % (N * N)] * 255;
      data[i + 3] = wobble(x, y) * 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export const composeShader = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tVol;
uniform vec2 uVolTexel;
uniform float uVolOn;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform vec3 uInkColor;
uniform float uOutline;
uniform float uCrease;
uniform float uOutlineFade;
uniform float uWobble;
uniform float uGrain;
uniform sampler2D tPaper;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uBalance;
varying vec2 vUv;

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// 1/z (view distance) at a uv; the view model's squashed depth is stretched back.
float invZ(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  if (d < ${VIEW_DEPTH}) d /= ${VIEW_DEPTH};
  return (uFar - (uFar - uNear) * d) / (uNear * uFar); // -1 / perspectiveDepthToViewZ
}

// Edge strength at uv: second differences of 1/z in four directions; c returns the pixel's 1/z.
float edge(vec2 uv, out float c) {
  c = invZ(uv);
  float e = 0.0;
  vec2 dirs[4];
  dirs[0] = vec2(1.0, 0.0);
  dirs[1] = vec2(0.0, 1.0);
  dirs[2] = vec2(1.0, 1.0);
  dirs[3] = vec2(1.0, -1.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = dirs[i] * uTexel;
    float a = invZ(uv + o);
    float b = invZ(uv - o);
    float lap = (a + b - 2.0 * c) / c;
    // Near side of a depth jump: silhouette (the far side has lap > 0).
    float sil = smoothstep(0.02, 0.06, -lap);
    // Crease: a bend without a jump; a little lighter.
    float crease = smoothstep(0.0015, 0.004, abs(lap) * uCrease) * (1.0 - smoothstep(0.02, 0.06, lap)) * 0.75;
    e = max(e, max(sil, crease));
  }
  return e;
}

void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  if (uVolOn > 0.5) {
    float depth = texture2D(tDepth, vUv).r;
    // 4 bilinear taps = a soft 4x4 filter that hides the dither of the raymarch.
    vec2 o = uVolTexel * 0.5;
    vec3 vol = texture2D(tVol, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tVol, vUv + vec2(o.x, -o.y)).rgb
             + texture2D(tVol, vUv + vec2(-o.x, o.y)).rgb + texture2D(tVol, vUv + vec2(o.x, o.y)).rgb;
    c += vol * 0.25 * step(${VIEW_DEPTH}, depth);
  }
  // Wobbly pen: sample the edges a little off, along a slow noise field.
  vec2 px = vUv / uTexel;
  vec2 wob = (vec2(texture2D(tPaper, px / 1100.0).a, texture2D(tPaper, px / 1100.0 + 0.5).a) - 0.5) * 4.0 * uWobble;
  float iz;
  float e = edge(vUv + wob * uTexel, iz);
  e *= uOutline * exp(-1.0 / (iz * uOutlineFade));
  c = mix(c, uInkColor, clamp(e, 0.0, 1.0));

  c *= exp2(uExposure) * uBalance;
  c = toSRGB(max(c, 0.0));
  // Paper: fine tooth + soft blotches + fibers.
  float tooth = texture2D(tPaper, (floor(px) + 0.5) / 256.0).r - 0.5;
  float blot = texture2D(tPaper, px / 2700.0).g + 0.5 * texture2D(tPaper, px / 640.0 + 0.3).g - 0.75;
  float fiber = texture2D(tPaper, vec2(px.x / 1500.0, px.y / 50.0)).b - 0.5;
  c *= 1.0 + uGrain * (0.035 * tooth + 0.05 * blot + 0.02 * fiber);
  c = (c - 0.5) * uContrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
