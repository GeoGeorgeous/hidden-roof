import type { PropDef } from './def';
import { M, Parts, type V3 } from './pieces';

// Rooftop equipment: water tank, vents, ducts, AC units, utility boxes, exhausts (pipes: pipes.ts).
// Free-standing props snap to 0.5 m; the utility box mounts on walls.

/** Water tank on a steel stand. */
export const watertower: PropDef = {
  type: 'watertower',
  label: 'Water tank',
  category: 'equipment',
  place: 'floor',
  snap: 0.5,
  build() {
    const p = new Parts();
    const legH = 3.6;
    const c = 1.3;
    for (const [x, z] of [[-c, -c], [c, -c], [-c, c], [c, c]]) p.detail([x - 0.12, 0, z - 0.12], [x + 0.12, legH, z + 0.12], M.steel);
    // Cross braces on each side.
    for (const [a, b] of [[[-c, -c], [c, -c]], [[c, -c], [c, c]], [[c, c], [-c, c]], [[-c, c], [-c, -c]]]) {
      p.rod([a[0], 0.3, a[1]], [b[0], legH - 0.3, b[1]], 0.03, M.steel);
      p.rod([b[0], 0.3, b[1]], [a[0], legH - 0.3, a[1]], 0.03, M.steel);
    }
    p.box([-2, legH, -2], [2, legH + 0.2, 2], M.steel);
    p.cyl([0, legH + 0.2, 0], 'y', 3.6, 1.8, M.wood, { paint: true, seg: 24 });
    p.cone([0, legH + 3.8, 0], 1.95, 1.1, M.steel);
    p.cyl([0, 0, 0.6], 'y', legH, 0.1, M.metal, { seg: 8 }); // outlet pipe
    return p.list;
  },
};

/** Vertical vent shaft with a louvered hood. */
export const ventshaft: PropDef = {
  type: 'ventshaft',
  label: 'Vent shaft',
  category: 'equipment',
  place: 'floor',
  snap: 0.5,
  build() {
    const [x, y, z] = [1.2, 2.4, 1.2];
    const p = new Parts();
    p.box([-x / 2, 0, -z / 2], [x / 2, y, z / 2], M.galv, { skip: ['+y'] });
    // Hood and its cap are paintable too: same base texture as the shaft, so they join its paint mesh.
    p.box([-x / 2 - 0.15, y, -z / 2 - 0.15], [x / 2 + 0.15, y + 0.3, z / 2 + 0.15], M.steel, { paint: true });
    p.box([-x / 2 - 0.05, y + 0.3, -z / 2 - 0.05], [x / 2 + 0.05, y + 0.38, z / 2 + 0.05], M.metal, { paint: true });
    for (let i = 0; i < 3; i++) {
      const ly = y - 0.25 - i * 0.18;
      p.detail([-x / 2 + 0.1, ly, -z / 2 - 0.04], [x / 2 - 0.1, ly + 0.06, -z / 2], M.steel, false);
    }
    return p.list;
  },
};

/** 2 m rectangular duct segment along x on low supports; chain them. */
export const duct: PropDef = {
  type: 'duct',
  label: 'Duct',
  category: 'equipment',
  place: 'floor',
  snap: 0.5,
  build() {
    const l = 2;
    const p = new Parts();
    const e = 0.5;
    p.box([-l / 2, e, -0.45], [l / 2, e + 0.7, 0.45], M.galv);
    const n = Math.max(1, Math.round(l / 1.5));
    for (let i = 0; i <= n; i++) {
      const x = -l / 2 + (l * i) / n;
      p.detail([x - 0.03, e - 0.04, -0.49], [x + 0.03, e + 0.74, 0.49], M.metal);
    }
    const legs = Math.max(1, Math.round(l / 2));
    for (let i = 0; i <= legs; i++) {
      const x = -l / 2 + 0.2 + ((l - 0.4) * i) / legs;
      for (const z of [-0.36, 0.36]) p.detail([x - 0.04, 0, z - 0.04], [x + 0.04, e, z + 0.04], M.steel);
      p.detail([x - 0.04, e - 0.06, -0.4], [x + 0.04, e, 0.4], M.steel);
    }
    return p.list;
  },
};

/** Small window-style AC unit on a stand. */
export const acSmall: PropDef = {
  type: 'ac_small',
  label: 'AC unit (small)',
  category: 'equipment',
  place: 'floor',
  snap: 0.5,
  build() {
    const p = new Parts();
    for (const x of [-0.35, 0.35]) p.detail([x - 0.04, 0, -0.2], [x + 0.04, 0.3, 0.2], M.steel);
    p.box([-0.45, 0.3, -0.22], [0.45, 1.0, 0.22], M.beige, { paint: true });
    p.cyl([0.15, 0.65, -0.25], 'z', 0.03, 0.24, M.dark, { paint: false, seg: 12 });
    fan(p, [0.15, 0.65, -0.262], 'z', 0.2, 0.012);
    p.emitter('fan', [0.15, 0.65, -0.3]);
    for (let i = 0; i < 4; i++) p.detail([-0.4, 0.4 + i * 0.12, -0.24], [-0.15, 0.44 + i * 0.12, -0.22], M.steel, false);
    return p.list;
  },
};

/**
 * Wall-mounted AC unit on two brackets, placed on the wall you aim at (centered
 * on the aim height). Solid and flat on top, so it works as a parkour step.
 */
export const acWall: PropDef = {
  type: 'ac_wall',
  label: 'AC unit (wall)',
  category: 'equipment',
  place: 'mount',
  snap: 0.5,
  hang: 0.3,
  build() {
    const p = new Parts();
    p.box([-0.45, 0, -0.62], [0.45, 0.6, -0.08], M.ac, { paint: true });
    for (const x of [-0.32, 0.32]) {
      p.detail([x - 0.02, -0.04, -0.6], [x + 0.02, 0, 0], M.steel, false);
      p.rod([x, -0.45, 0], [x, -0.04, -0.55], 0.018, M.steel);
      p.detail([x - 0.04, -0.5, -0.02], [x + 0.04, -0.4, 0], M.steel, false);
    }
    p.cyl([0.14, 0.3, -0.64], 'z', 0.02, 0.22, M.dark, { paint: false, collide: false, seg: 12 });
    fan(p, [0.14, 0.3, -0.648], 'z', 0.19, 0.008);
    p.cyl([0.14, 0.3, -0.67], 'z', 0.015, 0.05, M.steel, { paint: false, collide: false, seg: 8 });
    p.emitter('fan', [0.14, 0.3, -0.7]);
    for (let i = 0; i < 4; i++) p.detail([-0.4, 0.1 + i * 0.12, -0.64], [-0.15, 0.14 + i * 0.12, -0.62], M.steel, false);
    p.rod([0.38, 0, -0.12], [0.38, -0.7, -0.06], 0.012, M.cable);
    return p.list;
  },
};

/** Medium condenser with a top fan. Jumpable (1 m). */
export const acMedium: PropDef = {
  type: 'ac_medium',
  label: 'AC unit (medium)',
  category: 'equipment',
  place: 'floor',
  snap: 0.5,
  build() {
    const p = new Parts();
    p.box([-0.9, 0, -0.6], [0.9, 1.0, 0.6], M.ac);
    p.cyl([0, 1.0, 0], 'y', 0.06, 0.48, M.steel, { paint: false, seg: 16 });
    p.cyl([0, 1.0, 0], 'y', 0.08, 0.12, M.dark, { paint: false, seg: 8 });
    fan(p, [0, 1.072, 0], 'y', 0.44, 0.014);
    p.emitter('fan', [0, 1.1, 0]);
    for (let i = 0; i < 5; i++) p.detail([-0.8, 0.12 + i * 0.16, -0.62], [0.8, 0.16 + i * 0.16, -0.6], M.steel, false);
    return p.list;
  },
};

/** Large condenser on a skid with two fans. */
export const acLarge: PropDef = {
  type: 'ac_large',
  label: 'AC unit (large)',
  category: 'equipment',
  place: 'floor',
  snap: 0.5,
  build() {
    const p = new Parts();
    p.box([-1.7, 0, -1.2], [1.7, 0.15, 1.2], M.steel, { paint: true }); // skid, paintable with the body
    p.box([-1.6, 0.15, -1.1], [1.6, 1.8, 1.1], M.ac);
    for (const x of [-0.8, 0.8]) {
      p.cyl([x, 1.8, 0], 'y', 0.08, 0.62, M.steel, { paint: false, seg: 16 });
      p.cyl([x, 1.8, 0], 'y', 0.1, 0.14, M.dark, { paint: false, seg: 8 });
      fan(p, [x, 1.892, 0], 'y', 0.57, 0.016, x > 0 ? 1 : -1);
      p.emitter('fan', [x, 1.9, 0]);
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const y = 0.3 + i * 0.12;
        p.detail([s * 1.6 - 0.02, y, -0.9], [s * 1.6 + 0.02, y + 0.05, 0.9], M.steel, false);
      }
    }
    return p.list;
  },
};

/** Electrical cabinet. Edge prop: back on z = 0. */
export const utilitybox: PropDef = {
  type: 'utilitybox',
  label: 'Utility box',
  category: 'equipment',
  place: 'mount',
  snap: 0.5,
  build() {
    const p = new Parts();
    p.box([-0.6, 0, -0.5], [0.6, 1.8, 0], M.green);
    p.detail([-0.65, 1.8, -0.55], [0.65, 1.86, 0], M.steel); // ends at the wall: a cap reaching into it made the box unplaceable
    p.detail([-0.01, 0.1, -0.52], [0.01, 1.7, -0.5], M.steel, false);
    for (const x of [-0.1, 0.1]) p.detail([x - 0.02, 0.85, -0.55], [x + 0.02, 1.0, -0.5], M.metal, false);
    p.cyl([0.4, 1.86, -0.15], 'y', 1.2, 0.04, M.steel, { seg: 6, collide: false });
    return p.list;
  },
};

/** Exhaust pipe with a rain cap. */
export const exhaust: PropDef = {
  type: 'exhaust',
  label: 'Exhaust pipe',
  category: 'equipment',
  place: 'floor',
  snap: 0.5,
  build() {
    const h = 1.5;
    const p = new Parts();
    p.cyl([0, 0, 0], 'y', 0.08, 0.22, M.steel, { paint: false, seg: 10 });
    p.cyl([0, 0, 0], 'y', h, 0.12, M.metal, { seg: 10 });
    for (const a of [0, 2.1, 4.2]) p.rod([Math.cos(a) * 0.1, h - 0.02, Math.sin(a) * 0.1], [Math.cos(a) * 0.1, h + 0.14, Math.sin(a) * 0.1], 0.012, M.steel);
    p.cone([0, h + 0.12, 0], 0.3, 0.16, M.steel);
    p.emitter('smoke', [0, h + 0.32, 0], [0, 0.2, 0]);
    return p.list;
  },
};

/**
 * Four fan blades (two crossed bars) spinning around `axis` through `c`
 * (in the vertex shader, see Swing.spin), `r` long, `t` thick along the axis.
 */
function fan(p: Parts, c: V3, axis: 'y' | 'z', r: number, t: number, dir = 1) {
  const w = r * 0.28;
  p.swinging({ pivot: c, amp: 0, period: 1, axis, spin: true, dir, phase: c[0] * 3 }, () => {
    if (axis === 'y') {
      p.detail([c[0] - r, c[1] - t / 2, c[2] - w / 2], [c[0] + r, c[1] + t / 2, c[2] + w / 2], M.dark, false);
      p.detail([c[0] - w / 2, c[1] - t / 2, c[2] - r], [c[0] + w / 2, c[1] + t / 2, c[2] + r], M.dark, false);
    } else {
      p.detail([c[0] - r, c[1] - w / 2, c[2] - t / 2], [c[0] + r, c[1] + w / 2, c[2] + t / 2], M.dark, false);
      p.detail([c[0] - w / 2, c[1] - r, c[2] - t / 2], [c[0] + w / 2, c[1] + r, c[2] + t / 2], M.dark, false);
    }
  });
}

