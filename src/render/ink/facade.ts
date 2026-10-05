// Facades as texture: tower sides drawn as rhythmic bands (black slots between
// pale strips, like a barcode), computed in the surface shader from the world
// position, so they need no UVs and line up across neighboring buildings.
// Each band is box-filtered by its screen footprint: far away a facade turns
// into its average tone (which the ink then hatches), never into moire.
// A piece picks its pattern per vertex (Mat.facade), so any number of styles
// share one material and one draw call.

/** [style, floor height (m), slot fraction 0..1, column spacing (m)]; style 0 = plain. */
export type Facade = [number, number, number, number];

const FACADE_STYLES = {
  /** Ribbon windows: a black band per floor, thin pale mullions. */
  ribbon: 1,
  /** Vertical fins: pale strips and black gaps, a pale line per floor. */
  fins: 2,
  /** Punched windows: a black window per floor and column, a few lit (paper). */
  grid: 3,
  /** Dense horizontal slats (louvers, vents, parking decks), framed every column. */
  slats: 4,
} as const;

/** Ready-made facades. */
export const FACADES = {
  ribbon: [FACADE_STYLES.ribbon, 3.5, 0.45, 1.6],
  ribbonTight: [FACADE_STYLES.ribbon, 3.2, 0.62, 1.1],
  fins: [FACADE_STYLES.fins, 3.6, 0.55, 0.9],
  finsWide: [FACADE_STYLES.fins, 4, 0.4, 1.8],
  grid: [FACADE_STYLES.grid, 3.4, 0.5, 2.2],
  gridDense: [FACADE_STYLES.grid, 3, 0.6, 1.4],
  slats: [FACADE_STYLES.slats, 3.6, 0.5, 4],
} satisfies Record<string, Facade>;

/** Needs inkLines() from ink/tone.ts. Returns how much of the pixel is black slot (0..1). */
export const FACADE_GLSL = /* glsl */ `
uniform float uLitWindows;
float facadeHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
float facadeInk(vec4 f, vec3 p, vec3 n) {
  vec3 an = abs(n);
  float s = (an.x > an.z ? p.z : p.x) / max(f.w, 0.01);
  float t = p.y / max(f.y, 0.01);
  // Derivatives first, outside any branch.
  float fs = fwidth(s);
  float ft = fwidth(t);
  if (f.x < 0.5 || an.y > max(an.x, an.z)) return 0.0; // plain, or not a wall
  if (f.x < 1.5) {
    return inkLines(t, f.z, ft) * (1.0 - inkLines(s, 0.07, fs));
  } else if (f.x < 2.5) {
    return inkLines(s, f.z, fs) * (1.0 - inkLines(t, 0.07, ft));
  } else if (f.x < 3.5) {
    float lit = step(facadeHash(floor(vec2(s, t))), uLitWindows);
    return inkLines(t, f.z, ft) * inkLines(s, 0.55, fs) * (1.0 - lit);
  }
  float slats = inkLines(t * 7.0, f.z, ft * 7.0);
  return slats * (1.0 - inkLines(s, 0.04, fs)) * (1.0 - inkLines(t, 0.08, ft));
}
`;
