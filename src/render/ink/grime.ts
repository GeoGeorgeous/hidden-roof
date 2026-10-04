// Grime on every surface, so big flat faces are never plain: rain streaks
// running down walls, stains, buffed patches (old paint rolled over in
// rectangles), hairline cracks on walls, and construction seams (panel
// joints on walls, expansion joints on floors; plain surfaces only, facades
// have their bands). All from the world position (no UVs, no decal meshes),
// and drawn the way a pen would: streaks in vertical strokes, stains and
// patches hatched, cracks and seams as broken one-pixel lines that fade out
// before they get dense, whatever the light. Paint goes on top of it.

/** Needs inkNoise() from ink/tone.ts. Returns masks: streak, stain, buffed patch, lines (cracks, seams) (0..1). */
export const GRIME_GLSL = /* glsl */ `
uniform float uGrime;
// A one-pixel line every period m along x (offset in periods), gone before lines get closer than ~8 px.
float inkSeam(float x, float period, float offset) {
  float fw = fwidth(x);
  float d = abs(fract(x / period + offset) - 0.5) * period;
  return (1.0 - smoothstep(0.4 * fw, 1.1 * fw, d)) * (1.0 - smoothstep(0.06, 0.14, fw / period));
}
/** plain: 1 for surfaces without facade bands (they get seams). */
vec4 inkGrime(vec3 p, vec3 n, float plain) {
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
  float fc = fwidth(c);
  float crack = (1.0 - smoothstep(0.3 * fc, fc, abs(c))) * smoothstep(0.62, 0.74, inkNoise(p * 0.21 + 7.0)) * wall * (1.0 - smoothstep(0.03, 0.08, fc));
  // All four seam sets every pixel (derivatives must not sit in a branch), then pick by face.
  float wallSeams = max(inkSeam(p.y, 2.0, 0.5), inkSeam(h, 2.0, 0.0));
  float floorSeams = max(inkSeam(p.x, 4.0, 0.0), inkSeam(p.z, 4.0, 0.0));
  float seams = mix(floorSeams, wallSeams, wall);
  // Broken, like a pen skipping.
  seams *= plain * step(0.3, inkNoise(p * 1.7 + 5.0)) * 0.85;
  return uGrime * vec4(streak, stain, buffed, max(crack, seams));
}
`;
