import { withVariants, type PropDef } from './def';
import { M, Parts } from './pieces';

// Roof-edge railings, chain-link fences and traffic cones. Railings and fences
// are edge props: 2 m sections on grid lines, their posts the level's joints
// (level/joints.ts), so runs and corners close by themselves.

/** Top rail at 1.1 m and a knee rail, with a post in the middle (a plain railing). */
function simpleRailing() {
  const p = new Parts();
  p.detail([-0.97, 1.05, -0.03], [0.97, 1.1, 0.03], M.steel);
  p.detail([-0.97, 0.5, -0.02], [0.97, 0.54, 0.02], M.steel);
  p.detail([-0.03, 0, -0.03], [0.03, 1.05, 0.03], M.steel);
  return p.list;
}

/** Guardrail standing on the floor at `y`: tube rails, a middle post on a base plate and, for a roof, a toe board. */
function guardRailing(y: number, toeBoard: boolean) {
  return () => {
    const p = new Parts();
    // Top rail 1.1 m high, like every railing; knee rail half way.
    for (const h of [1.076, 0.55]) p.cyl([-0.97, y + h, 0], 'x', 1.94, 0.024, M.galv, { paint: false, seg: 8 });
    p.detail([-0.08, y, -0.08], [0.08, y + 0.02, 0.08], M.steel, false);
    p.cyl([0, y + 0.02, 0], 'y', 1.056, 0.024, M.galv, { paint: false, seg: 8 });
    if (toeBoard) p.box([-0.97, y, -0.012], [0.97, y + 0.15, 0.012], M.metal, { paint: true });
    return p.list;
  };
}

/** Railing sections for roof edges: plain, a guardrail with a toe board, or one bolted on top of a parapet (1.1 m). */
export const railing = withVariants({ type: 'railing', label: 'Railing', category: 'barriers', place: 'edge', snap: 2, joint: 'railing' }, [
  { id: 'simple', label: 'simple', build: simpleRailing },
  { id: 'guard', label: 'guardrail', build: guardRailing(0, true) },
  { id: 'parapet', label: 'on parapet', joint: 'parapetRail', build: guardRailing(1.1, false) },
]);

/**
 * Cheap chain-link fence, 2 m high: wire mesh (see-through, never painted) in
 * four strips that hang a little unevenly from a sagging top rail, a tension
 * wire along the bottom. Its round posts are the joints.
 */
export const fence: PropDef = {
  type: 'fence',
  label: 'Chain-link fence',
  category: 'barriers',
  place: 'edge',
  snap: 2,
  joint: 'fence',
  build() {
    const p = new Parts();
    p.rod([-0.96, 1.95, 0], [0, 1.87, 0], 0.02, M.galv);
    p.rod([0, 1.87, 0], [0.96, 1.95, 0], 0.02, M.galv);
    p.rod([-0.96, 0.1, 0], [0.96, 0.14, 0], 0.006, M.cable);
    // Mesh strips: tops follow the sagging rail, bottoms uneven.
    const strips: [number, number][] = [
      [0.06, 1.9],
      [0.11, 1.84],
      [0.13, 1.83],
      [0.08, 1.88],
    ];
    strips.forEach(([y0, y1], i) => {
      const x0 = -0.96 + i * 0.48;
      p.box([x0, y0, -0.006], [x0 + 0.48, y1, 0.006], M.chain, { paint: false });
    });
    return p.list;
  },
};

/** Traffic cone on its square rubber base, a light reflective band round it (the world is gray; paint gives the color). */
export const trafficCone: PropDef = {
  type: 'traffic_cone',
  label: 'Traffic cone',
  category: 'barriers',
  place: 'floor',
  snap: 0.5,
  build() {
    const p = new Parts();
    const r = (y: number) => 0.16 - (0.13 * (y - 0.03)) / 0.68;
    p.detail([-0.19, 0, -0.19], [0.19, 0.03, 0.19], M.dark);
    for (const [y0, y1, mat] of [
      [0.03, 0.36, M.metal],
      [0.36, 0.5, M.paper],
      [0.5, 0.71, M.metal],
    ] as const) {
      p.cyl([0, y0, 0], 'y', y1 - y0, r(y0), mat, { r2: r(y1), paint: false, seg: 16 });
    }
    return p.list;
  },
};
