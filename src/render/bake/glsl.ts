import * as THREE from 'three';

// Baked lamp light in the surface shader (see baker.ts):
//  - paintable surfaces read their lightmap, plus a flicker layer where neon reaches them
//  - decor reads the light baked into its vertices
// Both are added as irradiance, which three's Phong shades exactly like the
// diffuse part of a real spot light. A bake can't follow the view, so the
// nearest lamps also add their wet highlight (specular only) in a small loop
// that runs on wet pixels only.

export const HIGHLIGHT_MAX = 4;

/** Flicker values default: one steady slot. */
const STEADY = new THREE.DataTexture(new Float32Array([1]), 1, 1, THREE.RedFormat, THREE.FloatType);
STEADY.needsUpdate = true;
const vectors = <T>(make: () => T) => Array.from({ length: HIGHLIGHT_MAX }, make);

export const bakeUniforms = {
  /** Strength of baked lamp light (ATMOS.practical; 0 while LIGHTMAP is off). */
  uBakedScale: { value: 0 },
  /** Brightness of each neon flicker slot right now; slot 0 is steady (1). */
  uFlickerValues: { value: STEADY as THREE.Texture },
  /** Wet highlights: lamps in view space (three's spot convention: dir points back at the lamp). */
  uHiCount: { value: 0 },
  uHiPos: { value: vectors(() => new THREE.Vector3()) },
  uHiDir: { value: vectors(() => new THREE.Vector3()) },
  uHiColor: { value: vectors(() => new THREE.Vector3()) },
  /** cos outer, cos inner, range, decay. */
  uHiCone: { value: vectors(() => new THREE.Vector4()) },
};

const FLICKER_PARS = /* glsl */ `
uniform sampler2D uFlickerValues;
float flickerOf(float slot) { return texelFetch(uFlickerValues, ivec2(int(slot + 0.5), 0), 0).r; }
`;

export const BAKE_VERT_PARS = /* glsl */ `
attribute vec2 lightUv;
attribute vec3 baked;
attribute vec4 bakedFlicker;
${FLICKER_PARS}
varying vec2 vLightUv;
varying vec3 vBaked;
`;

export const BAKE_VERT = /* glsl */ `
vLightUv = lightUv;
vBaked = baked + bakedFlicker.rgb * flickerOf(bakedFlicker.a);
`;

export const BAKE_FRAG_PARS = /* glsl */ `
${FLICKER_PARS}
uniform sampler2D uLightmap;
uniform sampler2D uLightFlicker;
uniform float uLightFlickerOn;
uniform float uBakedScale;
uniform int uHiCount;
uniform vec3 uHiPos[${HIGHLIGHT_MAX}];
uniform vec3 uHiDir[${HIGHLIGHT_MAX}];
uniform vec3 uHiColor[${HIGHLIGHT_MAX}];
uniform vec4 uHiCone[${HIGHLIGHT_MAX}];
varying vec2 vLightUv;
varying vec3 vBaked;
`;

/** Goes right after three's lights (lights_fragment_maps), where `irradiance` and `material` exist. */
export const BAKE_FRAG = /* glsl */ `
{
  vec3 bakedLight = texture2D(uLightmap, vLightUv).rgb + vBaked;
  if (uLightFlickerOn > 0.5) {
    // The slot is read unfiltered from the nearest texel; the light itself is filtered.
    ivec2 size = textureSize(uLightFlicker, 0);
    float slot = texelFetch(uLightFlicker, clamp(ivec2(vLightUv * vec2(size)), ivec2(0), size - 1), 0).a;
    bakedLight += texture2D(uLightFlicker, vLightUv).rgb * flickerOf(slot);
  }
  irradiance += bakedLight * uBakedScale;
  if (material.specularStrength > 0.0) {
    for (int i = 0; i < ${HIGHLIGHT_MAX}; i++) {
      if (i >= uHiCount) break;
      vec3 toLamp = uHiPos[i] - geometryPosition;
      float d = length(toLamp);
      vec3 l = toLamp / d;
      float spot = getSpotAttenuation(uHiCone[i].x, uHiCone[i].y, dot(l, uHiDir[i]));
      if (spot <= 0.0) continue;
      vec3 c = uHiColor[i] * spot * getDistanceAttenuation(d, uHiCone[i].z, uHiCone[i].w) * saturate(dot(geometryNormal, l));
      reflectedLight.directSpecular += c * BRDF_BlinnPhong(l, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess) * material.specularStrength;
    }
  }
}
`;
