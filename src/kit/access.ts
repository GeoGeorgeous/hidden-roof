import type { PropDef } from './def';
import { M, Parts } from './pieces';

// Stairs, ladders, fire escapes, railings, floor hatches and the player's
// stepladder. Every walkable piece has railings.

/** Concrete stairs: 2 m wide, rising one 4 m module over 4 m toward the front (-z). */
export const stairs: PropDef = {
  type: 'stairs',
  label: 'Stairs',
  category: 'access',
  place: 'cell',
  snap: 2,
  footprint: [2, 4],
  build() {
    const p = new Parts();
    const n = 16;
    const step = 4 / n;
    // One column per step, all paintable (sides, treads, risers). The floor face
    // is never seen and each column's back is covered by the taller next one.
    for (let i = 0; i < n; i++) {
      p.box([-1, 0, 2 - step * (i + 1)], [1, step * (i + 1), 2 - step * i], M.concrete, { paint: true, skip: i < n - 1 ? ['-z', '-y'] : ['-y'] });
    }
    for (const x of [-0.94, 0.94]) p.stairRail([x, step, 2 - step / 2], [x, 4, -2 + step / 2]);
    return p.list;
  },
};

/** 4 m wall ladder; stack them for taller walls. */
export const ladder: PropDef = {
  type: 'ladder',
  label: 'Ladder',
  category: 'access',
  place: 'mount',
  snap: 0.5,
  vSnap: 4,
  build() {
    const p = new Parts();
    p.ladder(0, 0, 0, 4, 0.7);
    return p.list;
  },
};

/** Railing segment on a grid line; posts come from the joints. */
export const railing: PropDef = {
  type: 'railing',
  label: 'Railing',
  category: 'access',
  place: 'edge',
  snap: 2,
  joint: 'railing',
  build() {
    const p = new Parts();
    p.detail([-0.97, 1.05, -0.03], [0.97, 1.1, 0.03], M.steel);
    p.detail([-0.97, 0.5, -0.02], [0.97, 0.54, 0.02], M.steel);
    p.detail([-0.03, 0, -0.03], [0.03, 1.05, 0.03], M.steel);
    return p.list;
  },
};

/**
 * One floor (4 m) of fire escape against a wall. Stack pieces to go higher:
 * the lane and direction alternate with height, and the top landing closes its
 * open side only when nothing is stacked above.
 */
export const fireescape: PropDef = {
  type: 'fireescape',
  label: 'Fire escape',
  category: 'access',
  place: 'mount',
  snap: 0.5,
  vSnap: 4,
  stacks: { above: true },
  build({ pos, above }) {
    const p = new Parts();
    const odd = (((Math.round(pos[1] / 4) % 2) + 2) % 2) === 1;
    const outer = [-2.6, -1.3] as const;
    const inner = [-1.3, 0] as const;
    const [z0, z1] = odd ? inner : outer;
    const dir = odd ? -1 : 1;
    const n = 16;
    const run = 4 / n;
    for (let i = 0; i < n; i++) {
      const xa = dir > 0 ? -2 + run * i : 2 - run * (i + 1);
      const top = (4 * (i + 1)) / n;
      p.detail([xa, top - 0.05, z0 + 0.02], [xa + run, top, z1 - 0.02], M.steel);
    }
    for (const z of [z0 + 0.04, z1 - 0.04]) {
      p.stairRail([-2 * dir, 4 / n, z], [2 * dir, 4, z]);
      p.rod([-2 * dir, 0, z], [2 * dir, 4, z], 0.04, M.steel); // stringer
    }
    // Landing at the top end, spanning both lanes.
    const la = dir > 0 ? 2 : -3;
    const lb = la + 1;
    p.box([la, 3.92, -2.6], [lb, 4, 0], M.steel, { paint: false });
    p.railing([la, -2.6], [lb, -2.6], 4);
    const ex = dir > 0 ? lb : la;
    p.railing([ex, -2.6], [ex, 0], 4);
    if (!above) {
      const [c0, c1] = odd ? outer : inner;
      const ix = dir > 0 ? la : lb;
      p.railing([ix, c0], [ix, c1], 4);
    }
    p.rod([ex, 4, -2.6], [ex, 5.6, 0], 0.025, M.steel); // hanger into the wall
    return p.list;
  },
};

/** Maintenance hatch in the floor: a low curb and a steel lid (both paintable), hinges at the back. */
export const hatch: PropDef = {
  type: 'hatch',
  label: 'Floor hatch',
  category: 'access',
  place: 'floor',
  snap: 0.5,
  build() {
    const p = new Parts();
    p.box([-0.55, 0, -0.55], [0.55, 0.22, 0.55], M.concrete, { paint: true, skip: ['+y'] });
    p.box([-0.65, 0.22, -0.65], [0.65, 0.3, 0.65], M.metal, { paint: true });
    for (const x of [-0.35, 0.35]) p.detail([x - 0.08, 0.2, 0.65], [x + 0.08, 0.3, 0.7], M.steel, false);
    p.detail([-0.15, 0.3, -0.52], [0.15, 0.34, -0.46], M.steel, false);
    return p.list;
  },
};

/** Stepladder geometry (prop-local): legs stand `foot` in front and behind, leaning in to the top cap (topFront..topBack). */
export const STEPLADDER = { height: 1.2, foot: 0.45, topFront: -0.14, topBack: 0.14, halfWidth: 0.26 };

/**
 * The player's stepladder (a pickup, placed in play; see tools/ladder-tool.ts):
 * a small A-frame like the pickup model, two treads up the front (-z) and a top
 * cap to stand on to reach high walls. Climbed like a wall ladder, from the front.
 */
export const stepladder: PropDef = {
  type: 'stepladder',
  label: 'Stepladder',
  category: 'access',
  place: 'floor',
  snap: 0.01,
  build() {
    const { height: h, foot: f, topFront, topBack, halfWidth: w } = STEPLADDER;
    const top = h - 0.05;
    const front = (y: number) => -f + ((topFront + f) * y) / top;
    const back = (y: number) => f + ((topBack - f) * y) / top;
    const p = new Parts();
    for (const x of [-w, w]) {
      p.rod([x, 0, -f], [x, top, topFront], 0.022, M.galv, true);
      p.rod([x, 0, f], [x, top, topBack], 0.022, M.galv, true);
      // Spreader between front and back, and rubber feet.
      p.rod([x, 0.5, front(0.5)], [x, 0.5, back(0.5)], 0.01, M.steel);
      for (const z of [-f, f]) p.detail([x - 0.035, 0, z - 0.045], [x + 0.035, 0.03, z + 0.045], M.dark, false);
    }
    // Treads (decor: the climb volume does the climbing, so they never snag).
    for (const y of [0.4, 0.8]) {
      const z = front(y);
      p.detail([-w, y - 0.02, z - 0.06], [w, y + 0.02, z + 0.06], M.metal, false);
    }
    p.box([-w - 0.02, top, topFront - 0.02], [w + 0.02, h, topBack + 0.02], M.metal, { paint: false });
    // Climbed from the front, like a wall ladder; the volume reaches over the
    // cap's edge so you step onto it at the top.
    p.list.push({ k: 'climb', min: [-w, 0, -f - 0.45], max: [w, h + 0.3, topFront], normal: [0, 0, -1] });
    return p.list;
  },
};
