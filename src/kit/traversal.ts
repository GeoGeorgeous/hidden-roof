import type { PropDef } from './def';
import { M, Parts, type V3 } from './pieces';

// Ways across and down: a plank bridge over the gap between two roofs, and a
// window cleaner's gondola hanging off a roof's edge. Both are placed on the
// roof at its edge (their origin on the edge line), facing out (-z).

/** Rope sagging between two points, in `n` rods. */
function rope(p: Parts, a: V3, b: V3, sag: number, n = 8) {
  const at = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i < n; i++) p.rod(at(i / n), at((i + 1) / n), 0.012, M.cable);
}

/**
 * Plank bridge `adjust` m long (set with [ ]) from the roof you stand on,
 * out over the gap (-z): three boards on battens, the end battens resting on
 * the two roofs, half a meter onto each; a rope handline on one side between
 * two stakes. Place it with its origin on the roof's edge.
 */
export const plankBridge: PropDef = {
  type: 'plank_bridge',
  label: 'Plank bridge',
  category: 'access',
  place: 'floor',
  snap: 0.5,
  adjust: { label: 'LENGTH', unit: ' M', min: 2, max: 12, step: 0.5, initial: () => 3 },
  build({ adjust: len }) {
    const p = new Parts();
    const near = 0.5;
    const far = near - len;
    for (const [x0, x1] of [
      [-0.45, -0.155],
      [-0.145, 0.145],
      [0.155, 0.45],
    ]) {
      p.box([x0, 0.05, far], [x1, 0.1, near], M.wood, { paint: true });
    }
    // Battens: one resting on each roof, more in between every meter or so.
    const n = Math.max(1, Math.round(len - 1));
    for (let i = 0; i <= n; i++) {
      const z = near - 0.06 - ((len - 0.12) * i) / n;
      p.detail([-0.5, 0, z - 0.06], [0.5, 0.05, z + 0.06], M.wood);
    }
    // Handline on the +x side, from stake to stake.
    const top = 1.0;
    for (const z of [near - 0.15, far + 0.15]) p.detail([0.46, 0, z - 0.03], [0.52, top, z + 0.03], M.wood);
    rope(p, [0.49, top - 0.05, near - 0.15], [0.49, top - 0.05, far + 0.15], Math.min(0.25, len * 0.03));
    return p.list;
  },
};

/** I-beam along z from z0 to z1, its top at y, centered on x. */
function beamZ(p: Parts, x: number, z0: number, z1: number, y: number) {
  p.detail([x - 0.07, y - 0.02, z0], [x + 0.07, y, z1], M.steel);
  p.detail([x - 0.008, y - 0.22, z0], [x + 0.008, y - 0.02, z1], M.steel);
  p.detail([x - 0.07, y - 0.24, z0], [x + 0.07, y - 0.22, z1], M.steel);
}

/**
 * Window cleaner's gondola hanging `adjust` m (set with [ ]) below the roof
 * it is placed on. On the roof: two outrigger beams on four legs, reaching
 * 1.1 m out over the edge (and over a parapet), counterweights on their back
 * ends, a winch between them. Two cables run from sheaves at the beam tips down
 * to stirrups on the cradle: a 2 m deck with railings, the wall side lower.
 */
export const gondola: PropDef = {
  type: 'gondola',
  label: 'Gondola',
  category: 'scaffold',
  place: 'floor',
  snap: 0.5,
  adjust: { label: 'DROP', unit: ' M', min: 2, max: 24, step: 1, initial: () => 4 },
  build({ adjust: drop }) {
    const p = new Parts();
    const by = 1.65; // beam top: clear over a parapet
    const tip = -1.1;
    const back = 3;
    const cz = -0.95; // cables and cradle center line
    for (const x of [-0.85, 0.85]) {
      beamZ(p, x, tip, back, by);
      for (const z of [0.6, 2.6]) {
        p.detail([x - 0.05, 0.03, z - 0.05], [x + 0.05, by - 0.24, z + 0.05], M.steel);
        p.detail([x - 0.15, 0, z - 0.15], [x + 0.15, 0.03, z + 0.15], M.steel);
      }
      // Sheave under the tip.
      p.cyl([x - 0.04, by - 0.36, cz], 'x', 0.08, 0.1, M.metal, { paint: false, collide: false, seg: 12 });
    }
    for (const z of [0.6, 2.6]) p.detail([-0.78, by - 0.2, z - 0.05], [0.78, by - 0.06, z + 0.05], M.steel);
    p.detail([-0.78, by - 0.2, tip], [0.78, by - 0.06, tip + 0.1], M.steel);
    // Counterweights on a plate over the back ends.
    p.detail([-0.95, by, 2.35], [0.95, by + 0.02, 2.95], M.steel, false);
    for (let i = 0; i < 3; i++) {
      const skip = [...(i < 2 ? ['+y' as const] : []), ...(i > 0 ? ['-y' as const] : [])];
      p.box([-0.9, by + 0.02 + i * 0.2, 2.4], [0.9, by + 0.22 + i * 0.2, 2.9], M.concrete, { paint: true, skip });
    }
    // Winch on the roof between the beams; its cables run up to the beams and out along them.
    p.box([-0.45, 0, 1.3], [0.45, 0.35, 1.9], M.metal, { paint: true });
    p.cyl([-0.4, 0.55, 1.6], 'x', 0.8, 0.18, M.steel, { paint: false, seg: 16 });
    for (const x of [-0.42, 0.42]) p.detail([x - 0.02, 0.35, 1.5], [x + 0.02, 0.75, 1.7], M.steel, false);
    for (const s of [-1, 1]) {
      const x = s * 0.85;
      p.rod([s * 0.35, 0.72, 1.6], [x, by - 0.3, 0.6], 0.008, M.cable);
      p.rod([x, by - 0.3, 0.6], [x, by - 0.3, cz + 0.1], 0.008, M.cable);
    }
    // Cradle.
    const d = -drop;
    const z0 = cz - 0.35;
    const z1 = cz + 0.35;
    p.box([-1, d - 0.06, z0], [1, d, z1], M.metal, { paint: true });
    p.box([-1, d, z0 - 0.02], [1, d + 0.2, z0], M.metal, { paint: true });
    p.railing([-0.97, z0 + 0.03], [0.97, z0 + 0.03], d);
    for (const x of [-0.97, 0.97]) p.railing([x, z0 + 0.09], [x, z1 - 0.09], d);
    // Wall side: a knee-high rail between the ends, so you can climb in.
    p.detail([-0.94, d + 0.6, z1 - 0.06], [0.94, d + 0.64, z1 - 0.02], M.steel);
    for (const x of [-0.6, 0.6]) p.cyl([x, d + 0.15, z1], 'z', 0.12, 0.06, M.dark, { paint: false, collide: false, seg: 8 });
    // Stirrups at the ends hold the cables.
    for (const s of [-1, 1]) {
      const x = s * 0.85;
      p.rod([x, d, z0 + 0.05], [x, d + 1.9, cz], 0.025, M.steel);
      p.rod([x, d, z1 - 0.05], [x, d + 1.9, cz], 0.025, M.steel);
      p.rod([x, d + 1.9, cz], [x, by - 0.46, cz], 0.008, M.cable);
    }
    return p.list;
  },
};
