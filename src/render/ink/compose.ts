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
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uBalance;
varying vec2 vUv;

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}

// 1/z (view distance) at a uv; the view model's squashed depth is stretched back.
float invZ(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  if (d < ${VIEW_DEPTH}) d /= ${VIEW_DEPTH};
  return (uFar - (uFar - uNear) * d) / (uNear * uFar); // -1 / perspectiveDepthToViewZ
}

// Edge strength at uv: second differences of 1/z in four directions.
float edge(vec2 uv) {
  float c = invZ(uv);
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
  float depth = texture2D(tDepth, vUv).r;
  if (uVolOn > 0.5) {
    // 4 bilinear taps = a soft 4x4 filter that hides the dither of the raymarch.
    vec2 o = uVolTexel * 0.5;
    vec3 vol = texture2D(tVol, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tVol, vUv + vec2(o.x, -o.y)).rgb
             + texture2D(tVol, vUv + vec2(-o.x, o.y)).rgb + texture2D(tVol, vUv + vec2(o.x, o.y)).rgb;
    c += vol * 0.25 * step(${VIEW_DEPTH}, depth);
  }
  // Wobbly pen: sample the edges a little off, along a slow noise field.
  vec2 px = vUv / uTexel;
  vec2 wob = (vec2(noise2(px * 0.035), noise2(px * 0.035 + 17.3)) - 0.5) * 2.0 * uWobble;
  float e = edge(vUv + wob * uTexel);
  float dist = 1.0 / invZ(vUv);
  e *= uOutline * exp(-dist / uOutlineFade);
  c = mix(c, uInkColor, clamp(e, 0.0, 1.0));

  c *= exp2(uExposure) * uBalance;
  c = toSRGB(max(c, 0.0));
  // Paper: fine tooth + soft blotches; ink gets dry-brush specks.
  float tooth = hash12(floor(px)) - 0.5;
  float blot = noise2(px * 0.012) + 0.5 * noise2(px * 0.05) - 0.75;
  float fiber = noise2(vec2(px.x * 0.02, px.y * 0.6)) - 0.5;
  c *= 1.0 + uGrain * (0.035 * tooth + 0.05 * blot + 0.02 * fiber);
  c = (c - 0.5) * uContrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
