import { withVariants, type PropDef } from './def';
import { M, Parts, type V3 } from './pieces';
import { panelLettering, panelSlogans, sloganVariants } from './lettering';
import { lcg } from '../lcg';

// Steel and clutter for packed rooftops: lattice masts and sign towers with
// diagonal bracing, tanks on legs, roof debris. Posts and
// tanks collide; bracing is decor (thin rods).

/** X-braced lattice between four corner posts (square, side `w`), panels `step` high. */
function lattice(p: Parts, w: number, h: number, step: number, top = w) {
  const n = Math.max(1, Math.round(h / step));
  const at = (i: number, t: number): V3 => {
    const hw = (w + (top - w) * t) / 2;
    return [i === 0 || i === 3 ? -hw : hw, h * t, i < 2 ? -hw : hw];
  };
  for (let i = 0; i < 4; i++) {
    p.rod(at(i, 0), at(i, 1), 0.05, M.steel, true);
    const j = (i + 1) % 4;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      p.rod(at(i, t1), at(j, t1), 0.025, M.steel);
      p.rod(k % 2 ? at(i, t0) : at(j, t0), k % 2 ? at(j, t1) : at(i, t1), 0.018, M.steel);
    }
  }
}

/** Tall lattice mast with crossarms and a dish. */
export const latticeMast: PropDef = {
  type: 'lattice_mast',
  label: 'Lattice mast',
  category: 'rooftop',
  place: 'floor',
  snap: 0.5,
  build() {
    const h = 10;
    const p = new Parts();
    p.detail([-0.6, 0, -0.6], [0.6, 0.15, 0.6], M.steel);
    lattice(p, 1, h, 1, 0.3);
    for (const y of [h - 2, h - 0.8]) p.detail([-0.9, y, -0.03], [0.9, y + 0.05, 0.03], M.steel, false);
    p.rod([0, h, 0], [0, h + 2.5, 0], 0.03, M.steel);
    p.cyl([0, h - 3.2, -0.3], 'z', 0.15, 0.45, M.galv, { paint: false, collide: false, seg: 12 });
    return p.list;
  },
};

/** Sign tower: a lattice frame carrying a lettered 4 x 2 m panel (paintable) facing -z. */
export const signTower = withVariants({ type: 'sign_tower', label: 'Sign tower', category: 'signs', place: 'floor', snap: 0.5 }, sloganVariants(panelSlogans(4), (s) => {
  const h = 4;
  const p = new Parts();
  lattice(p, 1.6, h, 1.3);
  p.box([-2, h, -1.0], [2, h + 2, -0.85], panelLettering(s, 4, 2), { paint: true });
  p.detail([-2.04, h + 2, -1.02], [2.04, h + 2.05, -0.83], M.steel);
  // Frame behind the panel, braced back onto the lattice top.
  for (const x of [-1.8, -0.6, 0.6, 1.8]) p.rod([x, h, -0.85], [x, h + 2, -0.85], 0.03, M.steel);
  p.rod([-1.8, h + 0.2, -0.85], [1.8, h + 1.8, -0.85], 0.02, M.steel);
  p.rod([-1.8, h + 1.8, -0.85], [1.8, h + 0.2, -0.85], 0.02, M.steel);
  for (const x of [-0.8, 0.8]) p.rod([x, h, 0.8], [x, h + 1.6, -0.85], 0.025, M.steel);
  return p.list;
}));

/** Two tanks on a lattice stand, side by side along x. */
export const tankPair: PropDef = {
  type: 'tank_pair',
  label: 'Tanks on stand',
  category: 'rooftop',
  place: 'floor',
  snap: 0.5,
  build() {
    const p = new Parts();
    const legH = 2;
    for (const cx of [-1.1, 1.1]) {
      for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) p.detail([cx + x - 0.06, 0, z - 0.06], [cx + x + 0.06, legH, z + 0.06], M.steel);
      p.rod([cx - 0.7, 0.2, -0.7], [cx + 0.7, legH - 0.2, -0.7], 0.02, M.steel);
      p.rod([cx + 0.7, 0.2, 0.7], [cx - 0.7, legH - 0.2, 0.7], 0.02, M.steel);
      p.box([cx - 0.95, legH, -0.95], [cx + 0.95, legH + 0.12, 0.95], M.steel);
      p.cyl([cx, legH + 0.12, 0], 'y', 2.2, 0.9, M.galv, { paint: true, seg: 16 });
      p.cone([cx, legH + 2.32, 0], 0.95, 0.4, M.steel);
    }
    p.rod([-1.1, legH + 1.8, 0.9], [1.1, legH + 1.8, 0.9], 0.05, M.metal);
    p.ladder(0, 0, -0.95, legH + 0.12, 0.5);
    return p.list;
  },
};

/** A pile of roof debris: crates, buckets and dark slabs, laid out by `seed` (one fixed seed per variant). */
function pile(seed: number) {
  const rnd = lcg(seed * 31 + 7);
  const p = new Parts();
  for (let i = 0, n = 3 + Math.floor(rnd() * 4); i < n; i++) {
    const x = (rnd() - 0.5) * 1.6;
    const z = (rnd() - 0.5) * 1.6;
    const k = rnd();
    if (k < 0.4) {
      const s = 0.2 + rnd() * 0.2;
      p.detail([x - s, 0, z - s * 0.8], [x + s, s * 1.4, z + s * 0.8], rnd() < 0.5 ? M.wood : M.beige, false);
    } else if (k < 0.75) {
      p.cyl([x, 0, z], 'y', 0.3 + rnd() * 0.15, 0.15 + rnd() * 0.06, rnd() < 0.5 ? M.metal : M.galv, { paint: false, collide: false, seg: 8 });
    } else {
      p.detail([x - 0.3, 0, z - 0.22], [x + 0.3, 0.25, z + 0.22], M.dark, false);
    }
  }
  return p.list;
}

/** Roof debris: a few piles to choose from, each laid out so no two crates or slabs overlap (their faces would flicker). */
export const debris = withVariants({ type: 'debris', label: 'Roof debris', category: 'rooftop', place: 'floor', snap: 0.5 }, [
  { id: 'crates', label: 'crates', build: () => pile(82) },
  { id: 'buckets', label: 'buckets', build: () => pile(11) },
  { id: 'mixed', label: 'mixed', build: () => pile(6) },
  { id: 'scrap', label: 'scrap', build: () => pile(46) },
]);
