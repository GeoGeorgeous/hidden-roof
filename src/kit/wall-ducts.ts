import { withVariants, type Variant } from './def';
import { M, Parts } from './pieces';

// Air ducts along the wall you aim at, centered on the aim height: rectangular
// (0.8 m out from the wall, 0.6 m high) or round (0.6 m across), standing off
// the wall on angle brackets. Pieces chain end to end like the pipes: runs are
// 2 m along the wall, elbows turn up. Their tops are flat enough to walk on.

const OUT = 0.1; // gap to the wall
const D = 0.8; // rectangular: depth out from the wall
const H = 0.6; // rectangular: height
const R = 0.3; // round: radius
const UP = 1.4; // an elbow's rise above the duct

/** Angle bracket under a duct at x: a plate on the wall, an arm under the duct, a strut between them. */
function bracket(p: Parts, x: number, depth: number) {
  p.detail([x - 0.05, -0.4, -0.02], [x + 0.05, 0, 0], M.steel);
  p.detail([x - 0.025, -0.05, -depth - 0.05], [x + 0.025, 0, -0.02], M.steel);
  p.rod([x, -0.36, -0.03], [x, -0.05, -depth + 0.05], 0.02, M.steel);
}

/** Flange frame round a rectangular duct's end, across x at `x` (`dir`: which way it faces). */
function flangeX(p: Parts, x: number, dir: number) {
  const [a, b] = dir > 0 ? [x - 0.04, x] : [x, x + 0.04];
  p.detail([a, -0.03, -OUT - D - 0.03], [b, H + 0.03, -OUT + 0.03], M.steel);
}

const rectRun: Variant['build'] = () => {
  const p = new Parts();
  p.box([-1, 0, -OUT - D], [1, H, -OUT], M.galv, { paint: true, skip: ['-x', '+x'] });
  flangeX(p, -1, -1);
  flangeX(p, 1, 1);
  for (const x of [-0.6, 0.6]) bracket(p, x, OUT + D);
  return p.list;
};

/** Comes in along the wall from -x and turns up, ending UP above the duct in a flange. */
const rectElbow: Variant['build'] = () => {
  const p = new Parts();
  const w = H; // the riser is as wide as the duct is high
  p.box([-1, 0, -OUT - D], [w / 2, H, -OUT], M.galv, { paint: true, skip: ['-x'] });
  p.box([-w / 2, H, -OUT - D], [w / 2, H + UP, -OUT], M.galv, { paint: true, skip: ['-y', '+y'] });
  flangeX(p, -1, -1);
  p.detail([-w / 2 - 0.03, H + UP, -OUT - D - 0.03], [w / 2 + 0.03, H + UP + 0.04, -OUT + 0.03], M.steel);
  bracket(p, -0.6, OUT + D);
  bracket(p, 0, OUT + D);
  // A strap holding the riser to the wall.
  p.detail([-w / 2 - 0.03, H + UP - 0.3, -OUT - D - 0.03], [w / 2 + 0.03, H + UP - 0.25, 0], M.steel, false);
  return p.list;
};

/** Ring flange round a round duct along x at `x`. */
const ring = (p: Parts, x: number, axis: 'x' | 'y' = 'x', y = R) => (axis === 'x' ? p.cyl([x - 0.02, y, -OUT - R], 'x', 0.04, R + 0.04, M.steel, { paint: false, collide: false, seg: 16 }) : p.cyl([0, y - 0.02, -OUT - R], 'y', 0.04, R + 0.04, M.steel, { paint: false, collide: false, seg: 16 }));

const roundRun: Variant['build'] = () => {
  const p = new Parts();
  p.cyl([-1, R, -OUT - R], 'x', 2, R, M.galv, { seg: 16 });
  for (const x of [-0.98, 0.98]) ring(p, x);
  for (const x of [-0.6, 0.6]) {
    bracket(p, x, OUT + 2 * R);
    p.detail([x - 0.03, -0.02, -OUT - 2 * R], [x + 0.03, 0.04, -OUT], M.steel, false);
  }
  return p.list;
};

/** Round elbow: in along the wall from -x, turning up UP above the duct. */
const roundElbow: Variant['build'] = () => {
  const p = new Parts();
  const k = R + 0.02;
  p.cyl([-1, R, -OUT - R], 'x', 1 - k, R, M.galv, { seg: 16 });
  p.detail([-k, 0, -OUT - R - k], [k, 2 * R, -OUT - R + k], M.galv);
  p.cyl([0, 2 * R, -OUT - R], 'y', UP, R, M.galv, { seg: 16 });
  ring(p, -0.98);
  ring(p, 0, 'y', 2 * R + UP - 0.02);
  bracket(p, -0.6, OUT + 2 * R);
  bracket(p, 0, OUT + 2 * R);
  return p.list;
};

export const wallDuct = withVariants({ type: 'wall_duct', label: 'Wall duct', category: 'hvac', place: 'mount', snap: 0.5, hang: 0.3 }, [
  { id: 'run', label: 'run', build: rectRun },
  { id: 'elbow', label: 'elbow', build: rectElbow },
  { id: 'round_run', label: 'round run', build: roundRun },
  { id: 'round_elbow', label: 'round elbow', build: roundElbow },
]);
