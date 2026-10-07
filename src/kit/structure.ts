import { withVariants, type PropDef, type Variant } from './def';
import { finishOf } from './finishes';
import { GRAY, M, Parts, type Mat } from './pieces';
import { FACADES } from '../render/ink/facade';

// Modular architecture on the 2 m x 4 m grid.
// Edge pieces (walls, parapets) are 1.7 m long and centered on a grid line;
// the level adds a joint post at every grid intersection where they meet, so
// straight runs and corners close without gaps or overlapping faces.

export const WALL_H = 3.7; // + 0.3 floor slab = one 4 m module
const T = 0.15; // half wall thickness
const L = 0.85; // half length of edge pieces

/** The tall facade under a building's top storey: ribbon windows (drawn in the shader). */
const FACADE: Mat = { tex: 'flat', tint: GRAY[3], facade: FACADES.ribbon };

/**
 * Building block: 2x2 m column from the roof down to the street. Top 4 m are
 * paintable. With another block anywhere below it, it is one 4 m storey, so
 * blocks pile up level by level like Minecraft blocks.
 */
const fullBlock: Variant = {
  id: 'full',
  label: 'full',
  anchorTop: true,
  stacks: { below: true },
  build({ below, finish }) {
    const p = new Parts();
    p.box([-1, -0.3, -1], [1, 0, 1], M.roof, { paint: true, skip: ['-y'] });
    p.box([-1, -4, -1], [1, -0.3, 1], finishOf(finish, 'wall', M.plaster), { paint: true, skip: ['+y', '-y'] });
    if (!below) p.box([-1, -100, -1], [1, -4, 1], FACADE, { paint: false, skip: ['+y'] });
    return p.list;
  },
};

/** Half block: a building block's 2 x 2 m footprint, half a storey (2 m) high, standing on the floor. Stacks by 2 m. */
const halfBlock: Variant = {
  id: 'half',
  label: 'half',
  vSnap: 2,
  build({ finish }) {
    const p = new Parts();
    p.box([-1, 0, -1], [1, 1.7, 1], finishOf(finish, 'wall', M.plaster), { paint: true, skip: ['+y'] });
    p.box([-1, 1.7, -1], [1, 2, 1], M.roof, { paint: true, skip: ['-y'] });
    return p.list;
  },
};

/** Floor slab: 2x2 m, 0.3 m thick, top at the module level. */
export const slab: PropDef = {
  type: 'slab',
  label: 'Floor slab',
  category: 'structure',
  place: 'cell',
  snap: 2,
  anchorTop: true,
  build() {
    const p = new Parts();
    p.box([-1, -0.3, -1], [1, 0, 1], M.roof, { paint: true });
    return p.list;
  },
};

const plainWall: Variant = {
  id: 'plain',
  label: 'plain',
  build({ finish }) {
    const face = finishOf(finish, 'wall', M.plaster);
    const p = new Parts();
    p.box([-L, 0, -T], [L, WALL_H, T], face, { paint: true });
    return p.list;
  },
};

/** Wall with a cornice ledge on its front side. */
const wallLedge: Variant = {
  id: 'ledge',
  label: 'ledge',
  build({ finish }) {
    const face = finishOf(finish, 'wall', M.plaster);
    const p = new Parts();
    p.box([-L, 0, -T], [L, WALL_H, T], face, { paint: true });
    p.box([-1, WALL_H - 0.35, -T - 0.35], [1, WALL_H - 0.05, -T], M.concrete, { paint: true });
    return p.list;
  },
};

export const parapet: PropDef = {
  type: 'parapet',
  label: 'Parapet',
  category: 'structure',
  place: 'edge',
  snap: 2,
  joint: 'parapet',
  finishes: ['wall'],
  build({ finish }) {
    const p = new Parts();
    p.box([-L, 0, -T], [L, 1.02, T], finishOf(finish, 'wall', M.concrete), { paint: true });
    p.box([-0.8, 1.02, -0.2], [0.8, 1.1, 0.2], M.galv, { paint: true }); // coping
    return p.list;
  },
};

const DOOR_W = 0.5; // half width
const DOOR_H = 2.2;

/** Wall with a closed metal door (front side -z). */
const door: Variant = {
  id: 'door',
  label: 'door',
  build({ finish }) {
    const p = doorFrame(finishOf(finish, 'wall', M.plaster));
    const w = DOOR_W;
    const h = DOOR_H;
    p.box([-w, 0, -0.05], [w, h, 0.05], M.door, { paint: true });
    p.detail([0.3, 1.0, -0.1], [0.4, 1.05, -0.05], M.steel, false);
    return p.list;
  },
};

/** Wall with its door standing open outward (toward the front, -z): a way inside. */
const doorOpen: Variant = {
  id: 'open',
  label: 'open door',
  build({ finish }) {
    const p = doorFrame(finishOf(finish, 'wall', M.plaster));
    const w = DOOR_W;
    const leaf = 2 * w - 0.04;
    // Hinged at the -x jamb, swung 90° out.
    p.box([-w, 0.02, -T - leaf], [-w + 0.08, DOOR_H - 0.02, -T], M.door, { paint: true });
    p.detail([-w + 0.08, 1.0, -T - leaf + 0.1], [-w + 0.13, 1.05, -T - leaf + 0.2], M.steel, false);
    return p.list;
  },
};

/** Wall (`face`) around a door opening, with the steel frame on both faces. */
function doorFrame(face: Mat) {
  const p = new Parts();
  const w = DOOR_W;
  const h = DOOR_H;
  p.box([-L, 0, -T], [-w, WALL_H, T], face, { paint: true });
  p.box([w, 0, -T], [L, WALL_H, T], face, { paint: true });
  p.box([-w, h, -T], [w, WALL_H, T], face, { paint: true });
  for (const z of [-T - 0.04, T]) {
    p.detail([-w - 0.06, 0, z], [-w, h + 0.06, z + 0.04], M.steel);
    p.detail([w, 0, z], [w + 0.06, h + 0.06, z + 0.04], M.steel);
    p.detail([-w, h, z], [w, h + 0.06, z + 0.04], M.steel);
  }
  return p;
}

/** Wall with a dark glass window. */
const windowWall: Variant = {
  id: 'window',
  label: 'window',
  build({ finish }) {
    const face = finishOf(finish, 'wall', M.plaster);
    const p = new Parts();
    const w = 0.6;
    const y0 = 1.0;
    const y1 = 2.4;
    p.box([-L, 0, -T], [-w, WALL_H, T], face, { paint: true });
    p.box([w, 0, -T], [L, WALL_H, T], face, { paint: true });
    p.box([-w, 0, -T], [w, y0, T], face, { paint: true });
    p.box([-w, y1, -T], [w, WALL_H, T], face, { paint: true });
    p.detail([-w, y0, -0.02], [w, y1, 0.02], M.glass);
    p.detail([-0.02, y0, -0.04], [0.02, y1, 0.04], M.steel);
    p.detail([-w - 0.05, y0 - 0.04, -T - 0.08], [w + 0.05, y0 + 0.03, T + 0.08], M.concrete); // sill (not coplanar with the wall)
    return p.list;
  },
};

/** Building blocks: a full storey down to the street, or a half one. */
export const building = withVariants({ type: 'building', label: 'Block', category: 'structure', place: 'cell', snap: 2, finishes: ['wall'] }, [fullBlock, halfBlock]);

/** Walls: plain, with a ledge, a window or a door. */
export const wall = withVariants({ type: 'wall', label: 'Wall', category: 'structure', place: 'edge', snap: 2, joint: 'wall', finishes: ['wall'] }, [plainWall, wallLedge, windowWall, door, doorOpen]);

/** Plinth body (`mat`, or its wall finish) `w` x `d` m and `h` high, with an optional cap 4 cm over its edges. */
function plinthBlock(w: number, d: number, h: number, mat: Mat, cap = 0): Variant['build'] {
  return ({ finish }) => {
    const p = new Parts();
    p.box([-w / 2, 0, -d / 2], [w / 2, h - cap, d / 2], finishOf(finish, 'wall', mat), { paint: true, skip: cap ? ['+y'] : [] });
    if (cap) p.box([-w / 2 - 0.04, h - cap, -d / 2 - 0.04], [w / 2 + 0.04, h, d / 2 + 0.04], M.concrete, { paint: true });
    return p.list;
  };
}

/**
 * Squat supports for tanks, AC units and platforms. The pad is a step (under
 * the player's step height), the others a jump; all are paintable and take a
 * wall finish (F) like walls.
 */
export const plinth = withVariants({ type: 'plinth', label: 'Plinth', category: 'structure', place: 'floor', snap: 0.5, finishes: ['wall'] }, [
  { id: 'pad', label: 'pad', build: plinthBlock(2, 2, 0.3, M.concrete) },
  { id: 'block', label: 'block', build: plinthBlock(1, 1, 0.6, M.concrete) },
  { id: 'beam', label: 'beam', build: plinthBlock(2, 0.5, 0.45, M.concrete) },
  { id: 'brick', label: 'brick', build: plinthBlock(1, 1, 0.8, M.brick, 0.08) },
]);
