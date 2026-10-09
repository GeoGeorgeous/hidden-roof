import { withVariants, type Variant } from './def';
import { M, Parts, type V3 } from './pieces';

// Steel stairs to get up a level or over pipes and parapets, and skylights to
// cross. Steel stairs are 1 m wide on two stringers, with open grating treads
// (20 cm risers on 24 cm treads), handrails both sides and a landing on posts.

const RISE = 0.2;
const TREAD = 0.24;
const HW = 0.5; // half width
/** Every railing stands this far out, the stair rails and the landing's alike, so they line up where they meet. */
const RAIL_X = HW + 0.04;

/** A flight of `n` treads from (z0, y0) going up toward `dir` (-1: -z, 1: +z): treads, stringers, handrails. */
function flight(p: Parts, z0: number, y0: number, n: number, dir: number) {
  for (let i = 1; i <= n; i++) {
    const z = z0 + dir * TREAD * (i - 1);
    const y = y0 + RISE * i;
    p.box([-HW, y - 0.04, Math.min(z, z + dir * TREAD)], [HW, y, Math.max(z, z + dir * TREAD)], M.metal);
  }
  const top: V3 = [0, y0 + RISE * n, z0 + dir * TREAD * n];
  for (const x of [-RAIL_X, RAIL_X]) {
    p.rod([x, y0, z0], [x, top[1] - 0.05, top[2]], 0.05, M.steel);
    p.detail([x - 0.08, 0, z0 - 0.08], [x + 0.08, 0.02, z0 + 0.08], M.steel, false);
    p.stairRail([x, y0 + RISE, z0 + (dir * TREAD) / 2], [x, top[1], top[2] - (dir * TREAD) / 2]);
  }
}

/** Landing from z0 to z1 at height h on two posts at its far edge `zPost`; railings on its sides. */
function landing(p: Parts, z0: number, z1: number, h: number, zPost: number) {
  const [a, b] = [Math.min(z0, z1), Math.max(z0, z1)];
  p.box([-HW - 0.04, h - 0.05, a], [HW + 0.04, h, b], M.metal);
  for (const x of [-HW + 0.04, HW - 0.04]) {
    p.detail([x - 0.04, 0.02, zPost - 0.04], [x + 0.04, h - 0.05, zPost + 0.04], M.steel);
    p.detail([x - 0.1, 0, zPost - 0.1], [x + 0.1, 0.02, zPost + 0.1], M.steel, false);
  }
  for (const x of [-RAIL_X, RAIL_X]) p.railing([x, a + 0.06], [x, b - 0.06], h);
}

/** Up a whole storey (4 m) toward the front, onto a landing at the front edge: step off it onto the next roof. */
const storey: Variant['build'] = () => {
  const p = new Parts();
  const n = 4 / RISE;
  flight(p, 3, 0, n, -1);
  landing(p, 3 - n * TREAD, -3, 4, -2.9);
  return p.list;
};

/** Up half a storey (2 m), onto a landing at the front edge. */
const half: Variant['build'] = () => {
  const p = new Parts();
  const n = 2 / RISE;
  flight(p, 1.6, 0, n, -1);
  landing(p, 1.6 - n * TREAD, -2, 2, -1.9);
  return p.list;
};

/** Step-over: up 1.2 m, across a platform over a grid line (a parapet, a railing, pipes), down the other side. */
const crossover: Variant['build'] = () => {
  const p = new Parts();
  const n = 1.2 / RISE;
  const run = n * TREAD;
  flight(p, 0.35 + run, 0, n, -1);
  flight(p, -0.35 - run, 0, n, 1);
  p.box([-HW - 0.04, 1.15, -0.35], [HW + 0.04, 1.2, 0.35], M.metal);
  for (const z of [-0.3, 0.3]) for (const x of [-HW + 0.04, HW - 0.04]) p.detail([x - 0.04, 0.02, z - 0.04], [x + 0.04, 1.15, z + 0.04], M.steel);
  for (const x of [-RAIL_X, RAIL_X]) p.railing([x, -0.29], [x, 0.29], 1.2);
  return p.list;
};

export const steelStair = withVariants({ type: 'steel_stair', label: 'Steel stair', category: 'access', place: 'cell', snap: 2 }, [
  { id: 'storey', label: 'one storey', footprint: [2, 6], build: storey },
  { id: 'half', label: 'half storey', footprint: [2, 4], build: half },
  { id: 'crossover', label: 'step-over', footprint: [2, 4], build: crossover },
]);

/** A skylight's curb (`w` x `d`, 0.3 m, paintable) and its frame round the top. */
function curb(p: Parts, w: number, d: number) {
  const [hw, hd] = [w / 2, d / 2];
  p.box([-hw, 0, -hd], [hw, 0.3, hd], M.concrete, { paint: true, skip: ['+y'] });
  const f = 0.06;
  p.detail([-hw, 0.3, -hd], [hw, 0.36, -hd + f], M.steel);
  p.detail([-hw, 0.3, hd - f], [hw, 0.36, hd], M.steel);
  p.detail([-hw, 0.3, -hd + f], [-hw + f, 0.36, hd - f], M.steel);
  p.detail([hw - f, 0.3, -hd + f], [hw, 0.36, hd - f], M.steel);
  return f;
}

/** Flat glazed skylight `w` x `d`: glass panes between steel bars every ~0.75 m along its length. Low enough to step onto and walk across. */
function flatSkylight(w: number, d: number): Variant['build'] {
  return () => {
    const p = new Parts();
    const f = curb(p, w, d);
    const [hw, hd] = [w / 2, d / 2];
    p.box([-hw + f, 0.3, -hd + f], [hw - f, 0.34, hd - f], M.glass);
    const n = Math.max(1, Math.round(d / 0.75));
    for (let i = 1; i < n; i++) {
      const z = -hd + (d * i) / n;
      p.detail([-hw + f, 0.34, z - 0.02], [hw - f, 0.37, z + 0.02], M.steel, false);
    }
    return p.list;
  };
}

/** Dome skylight on a square curb: an acrylic bubble in three steps. A jump, not a step. */
const domeSkylight: Variant['build'] = () => {
  const p = new Parts();
  curb(p, 1.2, 1.2);
  p.box([-0.54, 0.3, -0.54], [0.54, 0.34, 0.54], M.glass);
  for (const [y, h, r0, r1] of [
    [0.34, 0.12, 0.5, 0.44],
    [0.46, 0.1, 0.44, 0.3],
    [0.56, 0.05, 0.3, 0.05],
  ]) {
    p.cyl([0, y, 0], 'y', h, r0, M.glass, { r2: r1, paint: false, seg: 16 });
  }
  return p.list;
};

export const skylight = withVariants({ type: 'skylight', label: 'Skylight', category: 'rooftop', place: 'floor', snap: 0.5 }, [
  { id: 'square', label: '1.5 m', build: flatSkylight(1.5, 1.5) },
  { id: 'long', label: '1 × 3 m', build: flatSkylight(1, 3) },
  { id: 'dome', label: 'dome', build: domeSkylight },
]);
