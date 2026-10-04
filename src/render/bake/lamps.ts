import { ATMOS, LIGHTMAP, LIGHTS } from '../../config';
import { syncAnchor, type LightAnchor } from '../../level/build-prop';
import type { Occluders } from './occluders';

// Lamp light at a point, computed the way three.js shades a spot light (cone
// smoothstep, distance falloff with a smooth cutoff at the range, N·L), so the
// bake matches the real lights it replaces. Shadows come from the occluder grid.

export interface Lamp {
  x: number;
  y: number;
  z: number;
  /** Aim, unit length. */
  dx: number;
  dy: number;
  dz: number;
  /** Color x intensity (linear; ATMOS.practical is applied in the shader). */
  r: number;
  g: number;
  b: number;
  range: number;
  cosOuter: number;
  cosInner: number;
  shadows: boolean;
  /** Neon flicker slot (0 = steady), see LightBaker. */
  slot: number;
  /** Id of the prop it belongs to (its own colliders don't shadow it). */
  owner: number;
}

export function makeLamp(a: LightAnchor, owner: number, slot: number): Lamp {
  syncAnchor(a);
  const s = LIGHTS[a.kind];
  const angle = Math.min(s.spread, 1.55);
  return {
    x: a.pos.x,
    y: a.pos.y,
    z: a.pos.z,
    dx: a.dir.x,
    dy: a.dir.y,
    dz: a.dir.z,
    r: a.color.r * s.intensity,
    g: a.color.g * s.intensity,
    b: a.color.b * s.intensity,
    range: s.range,
    cosOuter: Math.cos(angle),
    cosInner: Math.cos(angle * (1 - s.softness)),
    shadows: LIGHTMAP.shadows && s.shadows,
    slot,
    owner,
  };
}

/** Shadow rays start this far off the surface. */
const LIFT = 0.03;

/**
 * Light reaching point p (normal n) from `lamps`, into `out`: steady r, g, b,
 * then flickering r, g, b and the flicker slot that dominates (all neon light
 * at the point dips with that one sign). `self`: owner id of the lit prop.
 */
export function lightAt(px: number, py: number, pz: number, nx: number, ny: number, nz: number, lamps: Lamp[], occluders: Occluders, self: number, out: Float32Array) {
  out.fill(0);
  const decay = ATMOS.lightDecay;
  const ox = px + nx * LIFT;
  const oy = py + ny * LIFT;
  const oz = pz + nz * LIFT;
  let best = 0;
  for (const l of lamps) {
    let lx = l.x - px;
    let ly = l.y - py;
    let lz = l.z - pz;
    const d2 = lx * lx + ly * ly + lz * lz;
    if (d2 >= l.range * l.range || d2 < 1e-8) continue;
    const d = Math.sqrt(d2);
    lx /= d;
    ly /= d;
    lz /= d;
    const ndl = nx * lx + ny * ly + nz * lz;
    if (ndl <= 0) continue;
    const cos = -(lx * l.dx + ly * l.dy + lz * l.dz);
    if (cos <= l.cosOuter) continue;
    let spot = l.cosInner - l.cosOuter < 1e-6 ? 1 : (cos - l.cosOuter) / (l.cosInner - l.cosOuter);
    spot = spot >= 1 ? 1 : spot * spot * (3 - 2 * spot);
    const q = d2 / (l.range * l.range);
    const cut = 1 - q * q;
    const w = (ndl * spot * cut * cut) / Math.max(Math.pow(d, decay), 0.01);
    if (l.shadows && occluders.blocked(ox, oy, oz, l.x, l.y, l.z, l.owner, self)) continue;
    if (!l.slot) {
      out[0] += l.r * w;
      out[1] += l.g * w;
      out[2] += l.b * w;
      continue;
    }
    out[3] += l.r * w;
    out[4] += l.g * w;
    out[5] += l.b * w;
    const strength = (l.r + l.g + l.b) * w;
    if (strength > best) {
      best = strength;
      out[6] = l.slot;
    }
  }
}
