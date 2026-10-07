import { withVariants, type Variant } from './def';
import { M, Parts, type V3 } from './pieces';

// Modular cable runs: a bundle of three cables lying on the floor or clipped
// up a wall. Like the pipes, every piece ends its bundle 1 m from its origin
// (floor pieces) or at a storey's top and bottom (wall pieces), so pieces
// chain end to end on the 0.5 m grid: straight, corner, floor-to-wall bend,
// and wall runs that stack storey by storey. Cables never collide: you walk
// over them.

const STRANDS = [-0.05, 0, 0.05]; // offsets across the bundle
const R = 0.018;
const Y = R; // lying on the floor
const WZ = -0.04; // clipped to the wall, this far out

/** One rod chain per strand; `at(d)` gives a strand's polyline for offset d. */
function bundle(p: Parts, at: (d: number) => V3[]) {
  for (const d of STRANDS) {
    const pts = at(d);
    for (let i = 1; i < pts.length; i++) p.rod(pts[i - 1], pts[i], R, M.cable);
  }
}

/** Floor clip across a bundle running along x (or z). */
function floorClip(p: Parts, x: number, z: number, alongX: boolean) {
  const [hx, hz] = alongX ? [0.025, 0.09] : [0.09, 0.025];
  p.detail([x - hx, 0, z - hz], [x + hx, 2 * R + 0.012, z + hz], M.steel, false);
}

/** Wall clip across a vertical bundle at height y. */
function wallClip(p: Parts, y: number) {
  p.detail([-0.09, y, WZ - R - 0.012], [0.09, y + 0.04, 0], M.steel, false);
}

/** 2 m of cable bundle on the floor, along x. */
const cableFloor: Variant = {
  id: 'floor',
  label: 'floor',
  build() {
    const p = new Parts();
    bundle(p, (d) => [[-1, Y, d], [1, Y, d]]);
    for (const x of [-0.5, 0.5]) floorClip(p, x, 0, true);
    return p.list;
  },
};

/** Floor corner: comes in along x (from -x) and leaves toward -z, cut at 45°. */
const cableCorner: Variant = {
  id: 'corner',
  label: 'corner',
  build() {
    const p = new Parts();
    const c = 0.3; // chamfer
    const k = Math.SQRT2 - 1;
    bundle(p, (d) => [[-1, Y, d], [-c + d * k, Y, d], [d, Y, -c + d * k], [d, Y, -1]]);
    floorClip(p, -0.6, 0, true);
    floorClip(p, 0, -0.6, false);
    return p.list;
  },
};

/** From the floor up the wall you aim at: 1 m along the floor toward you, then up one storey. */
const cableUp: Variant = {
  id: 'up',
  label: 'floor to wall',
  place: 'mount',
  vSnap: 4,
  build() {
    const p = new Parts();
    bundle(p, (d) => [[d, Y, -1], [d, Y, -0.2], [d, 0.18, WZ], [d, 4, WZ]]);
    floorClip(p, 0, -0.6, false);
    for (const y of [1.2, 2.6]) wallClip(p, y);
    return p.list;
  },
};

/** One storey of cable bundle up the wall you aim at; stacks with itself and sits on a floor-to-wall piece. */
const cableWall: Variant = {
  id: 'wall',
  label: 'wall',
  place: 'mount',
  vSnap: 4,
  build() {
    const p = new Parts();
    bundle(p, (d) => [[d, 0, WZ], [d, 4, WZ]]);
    for (const y of [0.6, 2, 3.4]) wallClip(p, y);
    return p.list;
  },
};

/** The modular cable run pieces. */
export const cableRun = withVariants({ type: 'cable_run', label: 'Cable run', category: 'cables', place: 'floor', snap: 0.5 }, [cableFloor, cableCorner, cableUp, cableWall]);
