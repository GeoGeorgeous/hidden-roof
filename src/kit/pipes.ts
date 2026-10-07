import { withVariants, type PropDef, type Variant } from './def';
import { WALL_H } from './structure';
import { M, Parts, type V3 } from './pieces';

// Modular pipes: every piece carries its pipe at the same height and ends it on
// the 0.5 m grid one meter from its origin, so pieces chain end to end into
// runs of any shape. Straight runs (2 m, along x), corners, risers out of the
// floor or a wall, and pipes going up into the roof above. The drain pipe is
// its own thing: a downpipe on a wall that stacks up storey by storey.

const Y = 0.35; // pipe center height
const R = 0.1;
const SEG = 10;

/** Bend: a knuckle where two pipe ends meet. */
function knuckle(p: Parts, x: number, y: number, z: number) {
  const k = R + 0.03;
  p.detail([x - k, y - k, z - k], [x + k, y + k, z + k], M.steel);
}

/** Low saddle support under the pipe at (x, z), across x or z. */
function support(p: Parts, x: number, z: number, acrossZ = true) {
  const [hx, hz] = acrossZ ? [0.04, 0.12] : [0.12, 0.04];
  p.detail([x - hx, 0, z - hz], [x + hx, Y - R, z + hz], M.steel);
}

/** 2 m straight pipe along x on small supports; chain them. */
const pipeRun: Variant = {
  id: 'run',
  label: 'run',
  build() {
    const p = new Parts();
    p.cyl([-1, Y, 0], 'x', 2, R, M.rust, { seg: SEG });
    for (const x of [-0.85, 0.85]) support(p, x, 0);
    return p.list;
  },
};

/** Corner: the run comes in along x (from -x) and leaves toward -z. */
const pipeCorner: Variant = {
  id: 'corner',
  label: 'corner',
  build() {
    const p = new Parts();
    p.cyl([-1, Y, 0], 'x', 1, R, M.rust, { seg: SEG });
    p.cyl([0, Y, -1], 'z', 1, R, M.rust, { seg: SEG });
    knuckle(p, 0, Y, 0);
    support(p, 0, 0);
    return p.list;
  },
};

/** Riser: comes up out of the floor and turns toward +x. */
const pipeFloor: Variant = {
  id: 'floor',
  label: 'from floor',
  build() {
    const p = new Parts();
    p.cyl([0, 0, 0], 'y', 0.04, R + 0.08, M.steel, { paint: false, seg: SEG });
    p.cyl([0, 0, 0], 'y', Y, R, M.rust, { seg: SEG });
    p.cyl([0, Y, 0], 'x', 1, R, M.rust, { seg: SEG });
    knuckle(p, 0, Y, 0);
    return p.list;
  },
};

/**
 * How far a pipe comes out of the wall at `pos` (facing `rot`) before it turns:
 * about half a meter, so its bend lands on the 0.5 m grid the floor pieces snap
 * to, whether the wall's face is on a grid line (a block) or 0.15 m off it (a
 * wall piece).
 */
function outToGrid(pos: V3, rot = 0) {
  // Out is -z turned `rot` quarter turns (level/build-prop.ts rotate): world x and z per meter out.
  const s = [0, -1, 0, 1][rot];
  const t = [-1, 0, 1, 0][rot];
  const [a, d] = s ? [pos[0], s] : [pos[2], t];
  const end = d > 0 ? Math.ceil((a + 0.35) / 0.5 - 1e-6) * 0.5 : Math.floor((a - 0.35) / 0.5 + 1e-6) * 0.5;
  return +Math.abs(end - a).toFixed(3);
}

/** Out of the wall you aim at, about half a meter out (to the floor grid), then along the wall toward +x (R flips it toward -x). */
const pipeWall: Variant = {
  id: 'wall',
  label: 'from wall',
  place: 'mount',
  build({ pos, rot }) {
    const p = new Parts();
    const z = -outToGrid(pos, rot);
    p.cyl([0, Y, -0.04], 'z', 0.04, R + 0.08, M.steel, { paint: false, seg: SEG });
    p.cyl([0, Y, z], 'z', -z, R, M.rust, { seg: SEG });
    p.cyl([0, Y, z], 'x', 1, R, M.rust, { seg: SEG });
    knuckle(p, 0, Y, z);
    support(p, 0, z);
    return p.list;
  },
};

/** The run comes in along x (from -x) and goes straight up into the roof or slab above. */
const pipeUp: Variant = {
  id: 'up',
  label: 'into roof',
  build() {
    const p = new Parts();
    p.cyl([-1, Y, 0], 'x', 1, R, M.rust, { seg: SEG });
    p.cyl([0, Y, 0], 'y', WALL_H - Y, R, M.rust, { seg: SEG });
    knuckle(p, 0, Y, 0);
    support(p, 0, 0);
    p.cyl([0, WALL_H - 0.04, 0], 'y', 0.04, R + 0.08, M.steel, { paint: false, seg: SEG });
    for (const y of [1.4, 2.6]) p.detail([-0.03, y, -R - 0.02], [0.03, y + 0.06, R + 0.02], M.steel, false);
    return p.list;
  },
};

/**
 * Downpipe on the wall you aim at, one storey (4 m) high. Stacked ones join
 * into one pipe: only the lowest has the shoe at the bottom, only the top one
 * the hopper head.
 */
export const drainPipe: PropDef = {
  type: 'drain_pipe',
  label: 'Drain pipe',
  category: 'pipes',
  place: 'mount',
  snap: 0.5,
  vSnap: 4,
  stacks: { above: true, below: true },
  build({ above, below }) {
    const p = new Parts();
    const r = 0.06;
    const z = -0.12;
    const y0 = below ? 0 : 0.25;
    const y1 = above ? 4 : 3.55;
    p.cyl([0, y0, z], 'y', y1 - y0, r, M.galv, { seg: 8 });
    // Brackets to the wall.
    for (const y of [1, 2.8]) p.detail([-r - 0.02, y, z - r - 0.02], [r + 0.02, y + 0.05, 0], M.steel, false);
    // Shoe: kicks the water out at the bottom.
    if (!below) {
      p.detail([-r - 0.01, 0.12, z - r - 0.01], [r + 0.01, 0.25, z + r + 0.01], M.steel, false);
      p.cyl([0, 0.12, z - 0.3], 'z', 0.3, r, M.galv, { seg: 8, collide: false });
    }
    // Hopper head that collects from the gutter.
    if (!above) {
      p.detail([-0.16, 3.55, -0.32], [0.16, 3.85, 0], M.galv);
      p.detail([-0.18, 3.85, -0.34], [0.18, 3.9, 0], M.steel, false);
    }
    return p.list;
  },
};

/** The modular pipe pieces. */
export const pipe = withVariants({ type: 'pipe', label: 'Pipe', category: 'pipes', place: 'floor', snap: 0.5 }, [pipeRun, pipeCorner, pipeFloor, pipeWall, pipeUp]);
