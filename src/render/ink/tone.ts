import * as THREE from 'three';
import { ATMOS, INK } from '../../config';
import { lcg } from '../../lcg';

// The ink look in the surface shader: every lit pixel gets a tone (how much
// light reaches it x how dark its material is), and the tone picks the ink:
//  - paper (no lines) above INK.paperTone
//  - hatching (one diagonal) below it, cross-hatching below INK.hatchTone
//  - solid ink below INK.blackTone
// Hatch lines are laid out in world space (no UVs: the direction comes from
// the face normal), so they stick to surfaces, but their spacing is picked in
// octaves so that on screen it stays about INK.hatchPx pixels at any distance:
// far away a wall is still hatched, never a gray smear or moire. Lines are
// box-filtered with their screen footprint, so they never alias.
// Then distance (and the low clouds) fade the ink into paper, and the city
// below INK.voidTop sinks into black. Paint keeps its color (see INK_FRAG).

const LUM = 'vec3(0.2126, 0.7152, 0.0722)';

/**
 * Value noise for the shader as a small tiling 3D texture: one filtered fetch
 * per lookup instead of hashing eight lattice corners (the ink shader needs
 * half a dozen noise values per pixel). One texel per meter at scale 1.
 */
const NOISE = 32;
function noiseTexture() {
  const data = new Uint8Array(NOISE ** 3);
  const rnd = lcg(91);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rnd() * 256);
  const t = new THREE.Data3DTexture(data, NOISE, NOISE, NOISE);
  t.format = THREE.RedFormat;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export const inkUniforms = {
  uInkNoise: { value: noiseTexture() },
  uPaper: { value: new THREE.Color(INK.paper) },
  /** Sky dome color (sky.ts). */
  uSky: { value: new THREE.Color(INK.sky) },
  /** What things fade into above the cloud base. */
  uCloudInk: { value: new THREE.Color(INK.cloud) },
  uInkColor: { value: new THREE.Color(INK.ink) },
  uInkExposure: { value: INK.exposure },
  /** paper, hatch and black tone steps, tone noise. */
  uTones: { value: new THREE.Vector4() },
  /** hatch spacing (px), line width (fraction of the spacing). */
  uHatch: { value: new THREE.Vector2() },
  /** void top and bottom heights. */
  uVoid: { value: new THREE.Vector2() },
  /** paint light multiplier, minimum, hatch strength. */
  uPaintInk: { value: new THREE.Vector3() },
  /** Colored light: strength of the tint (INK.tint). */
  uInkTint: { value: INK.tint },
  /** Fade into paper per meter (ATMOS.fogDensity). */
  uFade: { value: ATMOS.fogDensity },
};

export function syncInkUniforms() {
  const u = inkUniforms;
  u.uPaper.value.set(INK.paper);
  u.uSky.value.set(INK.sky);
  u.uCloudInk.value.set(INK.cloud);
  u.uInkColor.value.set(INK.ink);
  u.uInkExposure.value = INK.exposure;
  u.uTones.value.set(INK.paperTone, INK.hatchTone, INK.blackTone, INK.toneNoise);
  u.uHatch.value.set(INK.hatchPx, INK.hatchWidth);
  u.uVoid.value.set(INK.voidTop, Math.min(INK.voidBottom, INK.voidTop - 1));
  u.uPaintInk.value.set(INK.paintLight, INK.paintMin, INK.paintHatch);
  u.uFade.value = ATMOS.fogDensity;
  u.uInkTint.value = INK.tint;
}
syncInkUniforms();

/** Uniforms and functions; needs `cameraPosition` (three provides it). */
export const INK_PARS = /* glsl */ `
uniform vec3 uPaper;
uniform vec3 uInkColor;
uniform vec3 uCloudInk;
uniform float uInkExposure;
uniform vec4 uTones;
uniform vec2 uHatch;
uniform vec2 uVoid;
uniform vec3 uPaintInk;
uniform float uFade;
uniform float uInkTint;

uniform highp sampler3D uInkNoise;
// Value noise in 0..1, one lattice cell per unit (a tiling 3D texture, see noiseTexture).
float inkNoise(vec3 p) {
  return texture(uInkNoise, (p + 0.5) / ${NOISE}.0).r;
}

// Lines of width w (fraction of the period) at every integer u, box-filtered
// over fw (the pixel's footprint in u): the exact ink coverage of the pixel.
float inkLinesF(float u, float w) { return floor(u) * w + min(fract(u), w); }
float inkLines(float u, float w, float fw) {
  fw = max(fw, 1e-4);
  return (inkLinesF(u + 0.5 * fw, w) - inkLinesF(u - 0.5 * fw, w)) / fw;
}

// Parallel lines across world coordinate x (meters), about uHatch.x pixels
// apart on screen: two octaves of world-space spacing, blended. j bends
// the lines a little (in periods): a hand, not a ruler.
float inkHatch(float x, float w, float j) {
  float px = max(fwidth(x), 1e-6);
  float lg = log2(px * uHatch.x);
  float o = floor(lg);
  float p1 = exp2(o);
  float a = inkLines(x / p1 + j, w, px / p1);
  float b = inkLines(x / (2.0 * p1) + j * 0.5, w, px / (2.0 * p1));
  return mix(a, b, lg - o);
}

// Tone of a lit pixel: light (irradiance, the material's color divided out)
// x the material's gray, + highlights and emission.
float inkLight(vec3 albedo, vec3 diffuseLight) {
  return dot(diffuseLight * PI / max(albedo, vec3(1e-3)), ${LUM});
}
float inkSink(vec3 p) {
  return smoothstep(0.0, 1.0, (uVoid.x - p.y) / (uVoid.x - uVoid.y));
}
float inkTone(vec3 albedo, float light, vec3 specular, vec3 emissive, vec3 p) {
  float a = pow(max(dot(albedo, ${LUM}), 0.0), 0.4545);
  float v = a * light * uInkExposure + 2.0 * dot(specular, ${LUM}) + dot(emissive, ${LUM});
  return v * (1.0 - inkSink(p));
}

// The two hatch layers for a face: a diagonal, then for cross-hatching
// vertical strokes on walls (like the drawn facades) and the other diagonal
// on floors.
vec2 inkHatches(vec3 p, vec3 n) {
  vec3 an = abs(n);
  float floorFace = step(max(an.x, an.z), an.y);
  float h = an.x > an.z ? p.z : p.x;
  float xa = mix(h + p.y, p.x + p.z, floorFace) * 0.7071;
  float xb = mix(h, (p.x - p.z) * 0.7071, floorFace);
  float j = (inkNoise(p * 0.9) - 0.5) * 0.5;
  return vec2(inkHatch(xa, uHatch.y, j), inkHatch(xb, uHatch.y, -j));
}

// Ink coverage (0 = paper, 1 = solid ink) for a tone.
float inkCover(float v, vec2 hatch, vec3 p) {
  v += (inkNoise(p * 1.7) - 0.5) * 2.0 * uTones.w;
  float a = hatch.x * step(v, uTones.x);
  float b = hatch.y * step(v, uTones.y);
  return max(1.0 - (1.0 - a) * (1.0 - b), step(v, uTones.z));
}

// How much of the drawing survives distance (1 = all, 0 = paper). The void
// doesn't fade: far down stays black however far away. It fades the tone,
// not the ink (inkFade): far away black turns into cross-hatching, then
// hatching, then paper, like a pen drawing gets lighter with distance; ink
// never turns gray.
float inkKeep(vec3 p) {
  float d = length(p - cameraPosition);
  float fd = uFade * d;
  return mix(exp(-fd * fd), 1.0, inkSink(p));
}
// The low clouds: how far into them a point is (0 = below, 1 = gone in INK.cloud's color).
float inkCloud(vec3 p, float cloudBase, float cloudFade) {
  return smoothstep(cloudBase, cloudBase + cloudFade, p.y);
}
float inkFade(float tone, float keep) {
  return mix(uTones.x * 1.5 + 0.1, tone, keep);
}
`;

/**
 * Replaces three's opaque_fragment in the surface shader. Needs the surface
 * shader's albedo (diffuseColor), paint (paintTex, pa), grime (ink/grime.ts),
 * lights and varyings.
 */
export const INK_FRAG = /* glsl */ `
{
  vec3 inkP = vWorldPos;
  float light = inkLight(diffuseColor.rgb, reflectedLight.directDiffuse + reflectedLight.indirectDiffuse);
  float tone = inkTone(diffuseColor.rgb, light, reflectedLight.directSpecular, totalEmissiveRadiance, inkP);
  vec2 hatch = inkHatches(inkP, vWorldN);
  float keep = inkKeep(inkP);
  vec4 grime = inkGrime(inkP, vWorldN, 1.0 - step(0.5, vFacade.x));
  float dirt = max(max(hatch.y * grime.x, hatch.x * grime.y), max(max(hatch.x, hatch.y) * grime.z * 0.8, grime.w));
  vec3 col = mix(uPaper, uInkColor, max(inkCover(inkFade(tone, keep), hatch, inkP), dirt * smoothstep(0.35, 0.65, keep)));
  // Colored lamps (LIGHTS[kind].tint): their hue, relative to the light on the surface, tints paper and ink alike.
  col *= 1.0 + clamp(bakedChroma / max(light, 0.15), -0.8, 0.8) * uInkTint;
#ifdef LETTERS
  // Sign lettering skips the light: ink where the lettering atlas is dark, paper
  // elsewhere, so a sign reads in any light (shadow, night). Fades with distance.
  float glyph = dot(baseTex.rgb, ${LUM});
  float gw = max(fwidth(glyph), 1e-3);
  col = mix(uPaper, uInkColor, max((1.0 - smoothstep(0.5 - gw, 0.5 + gw, glyph)) * smoothstep(0.35, 0.65, keep), inkSink(inkP)));
  // Neon lettering (emissive, flickering): takes the hue of its lamp (vTint, like the walls it lights), and a dip in the tube turns it off.
  if (vEmissiveV > 0.0) {
    float tl = max(dot(vTint, ${LUM}), 0.02);
    col *= 1.0 + clamp((vTint - tl) / tl, -0.8, 0.8) * uInkTint * 2.0;
    col = mix(uInkColor, col, smoothstep(0.35, 0.6, vEmissiveV));
  }
#endif
  // Paint: its own color, lit but never black; hatched a little in the dark.
  float pl = clamp(light * uPaintInk.x, uPaintInk.y, 1.0);
  float paintDark = step(light * uInkExposure * 0.7, uTones.y) * hatch.x * uPaintInk.z;
  vec3 paintCol = mix(paintTex.rgb * pl, uInkColor, paintDark);
  col = mix(col, mix(uPaper, paintCol, 0.4 + 0.6 * keep), pa);
  col = mix(col, uCloudInk, inkCloud(inkP, uCloudBase, uCloudFade));
  if (uShowPaintable > 0.5) {
    if (uPaintable > 0.5) col = mix(col, vec3(0.15, 1.0, 0.55), 0.3 + 0.2 * hiStripe);
    else col *= 0.45;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Ink for three's Lambert / Phong materials (the hands and the can in the view
 * model): same tones, no paint. `keepColor` materials (the can's label shows
 * the paint color) keep their color and only darken.
 */
export function inkify(m: THREE.MeshLambertMaterial | THREE.MeshPhongMaterial, keepColor = false) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, inkUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vInkPos;\nvarying vec3 vInkN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInkPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvInkN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vInkPos;\nvarying vec3 vInkN;\n${INK_PARS}`)
      .replace(
        '#include <opaque_fragment>',
        keepColor
          ? `float light = inkLight(diffuseColor.rgb, reflectedLight.directDiffuse + reflectedLight.indirectDiffuse);
             gl_FragColor = vec4(diffuseColor.rgb * clamp(light * uPaintInk.x, uPaintInk.y, 1.0), 1.0);`
          : `float light = inkLight(diffuseColor.rgb, reflectedLight.directDiffuse + reflectedLight.indirectDiffuse);
             float tone = inkTone(diffuseColor.rgb, light, vec3(0.0), totalEmissiveRadiance, vInkPos);
             gl_FragColor = vec4(mix(uPaper, uInkColor, inkCover(tone, inkHatches(vInkPos, vInkN), vInkPos)), 1.0);`,
      );
  };
  m.customProgramCacheKey = () => (keepColor ? 'ink-keep' : 'ink');
  return m;
}
