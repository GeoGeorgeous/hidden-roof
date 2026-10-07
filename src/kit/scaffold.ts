import { V_MODULE, withVariants, type Variant } from './def';
import { M, Parts } from './pieces';

// Steel to climb and stand on: scaffolding bays, platforms on columns, ledges
// cantilevered off walls. Everything that is raised shows what holds it up,
// and every deck has railings.

/** Scaffolding: a bay is one 2 m lift; bays stack by it. */
const LIFT = 2;
/** Standards (the posts) stand this far from the cell's center, so bays side by side keep 0.1 m apart. */
const POST = 0.95;
/** Scaffold tube radius. */
const TUBE = 0.024;
/** The top bay's guardrail runs this far from the center, inside the standards: a bay stacked on top clears it. */
const GUARD = 0.9;

/** A guardrail on the top deck along one side, between the corner posts: top rail, knee rail and toe board (at: the side's line). */
function guardSide(p: Parts, along: 'x' | 'z', at: number) {
  const b = GUARD - 0.025;
  for (const [y0, y1] of [
    [LIFT + 1, LIFT + 1.05],
    [LIFT + 0.5, LIFT + 0.54],
  ]) {
    if (along === 'x') p.detail([-b, y0, at - 0.025], [b, y1, at + 0.025], M.steel);
    else p.detail([at - 0.025, y0, -b], [at + 0.025, y1, b], M.steel);
  }
  // The toe board stands just inside the rails.
  const t = at - Math.sign(at) * 0.04;
  if (along === 'x') p.box([-b, LIFT, t - 0.012], [b, LIFT + 0.15, t + 0.012], M.wood, { paint: true });
  else p.box([t - 0.012, LIFT, -b + 0.04], [t + 0.012, LIFT + 0.15, b - 0.04], M.wood, { paint: true });
}

/**
 * One scaffolding bay: four standards on base plates and sole boards (the
 * lowest bay), ledgers and a plank deck at the top with a hatch the ladder
 * inside climbs through (or, without a ladder, a whole deck), diagonal braces
 * on the long faces. The top bay has a guardrail on its long sides and on
 * `ends` of its ends (0: a run, joined side by side; 1: the -x end; 2: both).
 */
function bay(ends: 0 | 1 | 2, ladder: boolean) {
  return ({ above, below }: { above: boolean; below: boolean }) => {
    const p = new Parts();
    const y0 = below ? 0 : 0.05;
    if (!below) {
      for (const x of [-POST, POST]) p.box([x - 0.05, 0, -1], [x + 0.05, 0.04, 1], M.wood, { paint: true });
      for (const x of [-POST, POST]) for (const z of [-POST, POST]) p.detail([x - 0.05, 0.04, z - 0.05], [x + 0.05, 0.05, z + 0.05], M.steel, false);
    }
    for (const x of [-POST, POST]) for (const z of [-POST, POST]) p.cyl([x, y0, z], 'y', LIFT - y0, TUBE, M.galv, { paint: false, seg: 6 });
    // Ledgers under the deck, all round.
    const ly = LIFT - 0.08;
    for (const z of [-POST, POST]) p.cyl([-POST, ly, z], 'x', 2 * POST, TUBE, M.galv, { paint: false, collide: false, seg: 6 });
    for (const x of [-POST, POST]) p.cyl([x, ly, -POST], 'z', 2 * POST, TUBE, M.galv, { paint: false, collide: false, seg: 6 });
    // Braces on the long faces, one each way.
    p.rod([-POST, y0, -POST], [POST, ly, -POST], TUBE, M.galv);
    p.rod([POST, y0, POST], [-POST, ly, POST], TUBE, M.galv);
    // Deck: four planks along x; with a ladder, the two at the back leave its hatch (x > 0.2).
    const bands = [-POST, -0.48, -0.005, 0.475, POST];
    for (let i = 0; i < 4; i++) {
      const x1 = i < 2 || !ladder ? POST : 0.2;
      p.box([-POST, LIFT - 0.05, bands[i] + 0.005], [x1, LIFT, bands[i + 1] - 0.005], M.wood, { paint: true });
    }
    // Ladder up through the hatch, its back on the rear ledger; grab rails above it only on the top bay.
    if (ladder) p.ladder(0.55, 0, POST, LIFT, 0.5, !above);
    if (!above) {
      for (const x of [-GUARD, GUARD]) for (const z of [-GUARD, GUARD]) p.detail([x - 0.025, LIFT, z - 0.025], [x + 0.025, LIFT + 1.05, z + 0.025], M.steel);
      guardSide(p, 'x', -GUARD);
      guardSide(p, 'x', GUARD);
      if (ends > 0) guardSide(p, 'z', -GUARD);
      if (ends > 1) guardSide(p, 'z', GUARD);
    }
    return p.list;
  };
}

/** Modular scaffolding: 2 x 2 m bays, 2 m high, stacked and joined side by side; bays can leave out the ladder. */
export const scaffolding = withVariants({ type: 'scaffolding', label: 'Scaffolding', category: 'scaffold', place: 'cell', snap: 2, vSnap: LIFT, stacks: { above: true, below: true, across: true } }, [
  { id: 'single', label: 'railed ends', build: bay(2, true) },
  { id: 'end', label: 'one end', build: bay(1, true) },
  { id: 'run', label: 'open ends', build: bay(0, true) },
  { id: 'single_deck', label: 'railed ends, no ladder', build: bay(2, false) },
  { id: 'end_deck', label: 'one end, no ladder', build: bay(1, false) },
  { id: 'run_deck', label: 'open ends, no ladder', build: bay(0, false) },
]);

/** I-beam along x from x0 to x1 under a deck whose underside is at y: web and bottom flange (the deck is its top flange). */
function beamX(p: Parts, x0: number, x1: number, y: number, z: number) {
  p.detail([x0, y - 0.3, z - 0.008], [x1, y, z + 0.008], M.steel);
  p.detail([x0, y - 0.32, z - 0.08], [x1, y - 0.3, z + 0.08], M.steel);
}

/** Secondary I-beam along z between the x beams, shallower so its flange never meets theirs. */
function beamZ(p: Parts, z0: number, z1: number, y: number, x: number) {
  p.detail([x - 0.008, y - 0.26, z0], [x + 0.008, y, z1], M.steel);
  p.detail([x - 0.07, y - 0.28, z0], [x + 0.07, y - 0.26, z1], M.steel);
}

/** I-section column from its base plate up to `top`. */
function column(p: Parts, x: number, z: number, top: number) {
  p.detail([x - 0.2, 0, z - 0.2], [x + 0.2, 0.03, z + 0.2], M.steel);
  for (const [bx, bz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) p.detail([x + bx - 0.02, 0.03, z + bz - 0.02], [x + bx + 0.02, 0.07, z + bz + 0.02], M.steel, false);
  p.detail([x - 0.1, 0.03, z - 0.1], [x + 0.1, top, z - 0.085], M.steel);
  p.detail([x - 0.1, 0.03, z + 0.085], [x + 0.1, top, z + 0.1], M.steel);
  p.detail([x - 0.008, 0.03, z - 0.085], [x + 0.008, top, z + 0.085], M.steel);
}

/** Columns along one side: 0.15 m in from each end, and one in the middle of a 4 m side. */
const lines = (size: number) => (size > 2 ? [-size / 2 + 0.15, 0, size / 2 - 0.15] : [-size / 2 + 0.15, size / 2 - 0.15]);

/**
 * Platform `w` x `d` m on steel columns, its deck `h` m up (adjusted with [ ]):
 * a steel deck on I-beams, I-section columns on base plates under every beam
 * crossing, X braces between them, railings round the deck and a ladder up the front.
 */
function platform(w: number, d: number): Variant['build'] {
  return ({ adjust: h }) => {
    const p = new Parts();
    const hw = w / 2;
    const hd = d / 2;
    const under = h - 0.08;
    p.box([-hw, under, -hd], [hw, h, hd], M.metal, { paint: true });
    const xs = lines(w);
    const zs = lines(d);
    for (const z of zs) beamX(p, -hw, hw, under, z);
    for (const x of xs) for (let i = 0; i + 1 < zs.length; i++) beamZ(p, zs[i] + 0.008, zs[i + 1] - 0.008, under, x);
    const top = under - 0.32;
    for (const x of xs) for (const z of zs) column(p, x, z, top);
    if (top > 1.2) {
      const brace = (a: [number, number], b: [number, number]) => {
        p.rod([a[0], 0.35, a[1]], [b[0], top - 0.1, b[1]], 0.018, M.steel);
        p.rod([b[0], 0.35, b[1]], [a[0], top - 0.1, a[1]], 0.018, M.steel);
      };
      for (const z of [zs[0], zs[zs.length - 1]]) for (let i = 0; i + 1 < xs.length; i++) brace([xs[i], z], [xs[i + 1], z]);
      for (const x of [xs[0], xs[xs.length - 1]]) for (let i = 0; i + 1 < zs.length; i++) brace([x, zs[i]], [x, zs[i + 1]]);
    }
    // Railings round the deck, open at the ladder on the front.
    const e = 0.05;
    const lx = w > 2 ? -1 : 0;
    p.railing([-hw + e, -hd + e], [lx - 0.45, -hd + e], h);
    p.railing([lx + 0.45, -hd + e], [hw - e, -hd + e], h);
    p.railing([-hw + e, hd - e], [hw - e, hd - e], h);
    // The sides start past the corner posts of the front and back.
    for (const x of [-hw + e, hw - e]) p.railing([x, -hd + e + 0.06], [x, hd - e - 0.06], h);
    p.ladder(lx, 0, -hd, h, 0.6);
    return p.list;
  };
}

export const platformOnColumns = withVariants(
  {
    type: 'platform',
    label: 'Platform',
    category: 'scaffold',
    place: 'cell',
    snap: 2,
    adjust: { label: 'HEIGHT', unit: ' M', min: 1, max: 8, step: 0.5, initial: () => V_MODULE },
  },
  [
    { id: 'small', label: '2 × 2 m', footprint: [2, 2], build: platform(2, 2) },
    { id: 'wide', label: '4 × 2 m', footprint: [4, 2], build: platform(4, 2) },
    { id: 'large', label: '4 × 4 m', footprint: [4, 4], build: platform(4, 4) },
  ],
);

/**
 * A walkway 2 m long, 0.9 m deep, cantilevered off the wall you aim at (its
 * deck at the aim height) on two angle brackets; a railing on its outer side
 * and, unless it is part of a run, on both ends.
 */
function ledge(ends: boolean): Variant['build'] {
  return () => {
    const p = new Parts();
    const d = 0.9;
    p.box([-1, -0.06, -d + 0.04], [1, 0, -0.02], M.metal, { paint: true });
    p.detail([-1, -0.16, -d], [1, 0, -d + 0.04], M.steel);
    for (const x of [-0.75, 0.75]) {
      p.detail([x - 0.06, -0.75, -0.02], [x + 0.06, 0, 0], M.steel);
      p.detail([x - 0.025, -0.16, -d + 0.04], [x + 0.025, -0.06, -0.02], M.steel);
      p.rod([x, -0.7, -0.03], [x, -0.16, -d + 0.12], 0.025, M.steel);
    }
    p.railing([-0.97, -d + 0.04], [0.97, -d + 0.04], 0);
    // The end railings start past the outer one's corner posts.
    if (ends) for (const x of [-0.97, 0.97]) p.railing([x, -d + 0.1], [x, -0.08], 0);
    return p.list;
  };
}

export const ledgeOnBrackets = withVariants({ type: 'ledge', label: 'Wall ledge', category: 'scaffold', place: 'mount', snap: 0.5, hang: 0 }, [
  { id: 'single', label: 'railed ends', build: ledge(true) },
  { id: 'run', label: 'open ends', build: ledge(false) },
]);
