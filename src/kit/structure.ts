import type { PropDef } from './def';
import { M, Parts, type Mat } from './pieces';

// Modular architecture on the 2 m x 4 m grid.
// Edge pieces (walls, parapets) are 1.7 m long and centered on a grid line;
// the level adds a joint post at every grid intersection where they meet, so
// straight runs and corners close without gaps or overlapping faces.

export const WALL_H = 3.7; // + 0.3 floor slab = one 4 m module
const T = 0.15; // half wall thickness
const L = 0.85; // half length of edge pieces

const FACADE: Mat = { tex: 'facadeA', tile: 8 };

/**
 * Building block: 2x2 m column from the roof down to the street. Top 4 m are
 * paintable. Stacked on another block it is one 4 m storey, so blocks pile up
 * level by level like Minecraft blocks.
 */
export const building: PropDef = {
  type: 'building',
  label: 'Building block',
  category: 'structure',
  place: 'cell',
  snap: 2,
  anchorTop: true,
  stacks: { below: true },
  build({ below }) {
    const p = new Parts();
    p.box([-1, -0.3, -1], [1, 0, 1], M.roof, { paint: true, skip: ['-y'] });
    p.box([-1, -4, -1], [1, -0.3, 1], M.plaster, { paint: true, skip: ['+y', '-y'] });
    if (!below) p.box([-1, -100, -1], [1, -4, 1], FACADE, { paint: false, skip: ['+y'] });
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

export const wall: PropDef = {
  type: 'wall',
  label: 'Wall',
  category: 'structure',
  place: 'edge',
  snap: 2,
  joint: 'wall',
  build() {
    const p = new Parts();
    p.box([-L, 0, -T], [L, WALL_H, T], M.plaster, { paint: true });
    return p.list;
  },
};

/** Wall with a cornice ledge on its front side. */
export const wallLedge: PropDef = {
  type: 'wall_ledge',
  label: 'Wall with ledge',
  category: 'structure',
  place: 'edge',
  snap: 2,
  joint: 'wall',
  build() {
    const p = new Parts();
    p.box([-L, 0, -T], [L, WALL_H, T], M.plaster, { paint: true });
    p.box([-1, WALL_H - 0.35, -T - 0.35], [1, WALL_H - 0.05, -T], M.concrete);
    return p.list;
  },
};

/** Corner pilaster on a grid intersection. */
export const corner: PropDef = {
  type: 'corner',
  label: 'Corner',
  category: 'structure',
  place: 'vertex',
  snap: 2,
  build() {
    const p = new Parts();
    p.box([-0.22, 0, -0.22], [0.22, WALL_H, 0.22], M.concrete, { paint: true });
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
  build() {
    const p = new Parts();
    p.box([-L, 0, -T], [L, 1.02, T], M.concrete, { paint: true });
    p.detail([-0.8, 1.02, -0.2], [0.8, 1.1, 0.2], M.galv);
    return p.list;
  },
};

/** Wall with a closed metal door (front side -z). */
export const door: PropDef = {
  type: 'door',
  label: 'Door',
  category: 'structure',
  place: 'edge',
  snap: 2,
  joint: 'wall',
  build() {
    const p = new Parts();
    const w = 0.5;
    const h = 2.2;
    p.box([-L, 0, -T], [-w, WALL_H, T], M.plaster, { paint: true });
    p.box([w, 0, -T], [L, WALL_H, T], M.plaster, { paint: true });
    p.box([-w, h, -T], [w, WALL_H, T], M.plaster, { paint: true });
    p.box([-w, 0, -0.05], [w, h, 0.05], M.door, { paint: true });
    for (const z of [-T - 0.04, T]) {
      p.detail([-w - 0.06, 0, z], [-w, h + 0.06, z + 0.04], M.steel);
      p.detail([w, 0, z], [w + 0.06, h + 0.06, z + 0.04], M.steel);
      p.detail([-w, h, z], [w, h + 0.06, z + 0.04], M.steel);
    }
    p.detail([0.3, 1.0, -0.1], [0.4, 1.05, -0.05], M.steel, false);
    return p.list;
  },
};

/** Wall with a dark glass window. */
export const windowWall: PropDef = {
  type: 'window',
  label: 'Window',
  category: 'structure',
  place: 'edge',
  snap: 2,
  joint: 'wall',
  build() {
    const p = new Parts();
    const w = 0.6;
    const y0 = 1.0;
    const y1 = 2.4;
    p.box([-L, 0, -T], [-w, WALL_H, T], M.plaster, { paint: true });
    p.box([w, 0, -T], [L, WALL_H, T], M.plaster, { paint: true });
    p.box([-w, 0, -T], [w, y0, T], M.plaster, { paint: true });
    p.box([-w, y1, -T], [w, WALL_H, T], M.plaster, { paint: true });
    p.detail([-w, y0, -0.02], [w, y1, 0.02], M.glass);
    p.detail([-0.02, y0, -0.04], [0.02, y1, 0.04], M.steel);
    p.detail([-w - 0.05, y0 - 0.04, -T - 0.08], [w + 0.05, y0 + 0.03, T + 0.08], M.concrete); // sill (not coplanar with the wall)
    return p.list;
  },
};
