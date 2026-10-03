import type { PropDef } from './def';
import { M, Parts } from './pieces';

// Stairs, ladders, fire escapes and railings. Every walkable piece has railings.

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
