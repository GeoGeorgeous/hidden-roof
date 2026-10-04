// Grime on every surface, so big flat faces are never plain: rain streaks
// running down walls, stains, buffed patches (old paint rolled over in
// rectangles) and hairline cracks. All from the world position (no UVs, no
// decal meshes), and drawn the way a pen would: streaks in vertical strokes,
// stains and patches hatched, cracks as solid hairlines, whatever the light.
// Paint goes on top of it.

/** Needs inkNoise() from ink/tone.ts. Returns masks: streak, stain, buffed patch, crack (0..1). */
export const GRIME_GLSL = /* glsl */ `
uniform float uGrime;
vec4 inkGrime(vec3 p, vec3 n) {
  vec3 an = abs(n);
  float wall = 1.0 - step(max(an.x, an.z), an.y);
  float h = an.x > an.z ? p.z : p.x;
  float depth = an.x > an.z ? p.x : p.z;
  float streak = smoothstep(0.66, 0.72, inkNoise(vec3(h * 2.3, p.y * 0.1, depth * 0.3))) * wall;
  float stain = smoothstep(0.7, 0.74, inkNoise(p * 0.33 + 11.0));
  vec2 q = vec2(h, p.y) / vec2(2.6, 1.9);
  vec2 f = fract(q);
  float pick = fract(sin(dot(floor(q), vec2(41.3, 289.1))) * 15731.7);
  float buffed = step(0.88, pick) * step(0.12, f.x) * step(f.x, 0.86) * step(0.18, f.y) * step(f.y, 0.78) * wall;
  float c = inkNoise(p * 0.9 + 3.0) - 0.5;
  float crack = (1.0 - smoothstep(0.0, fwidth(c) * 1.2 + 0.003, abs(c))) * smoothstep(0.58, 0.72, inkNoise(p * 0.21 + 7.0));
  return uGrime * vec4(streak, stain, buffed, crack);
}
`;
