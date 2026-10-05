import { LIGHTS } from '../config';
import type { PropDef } from './def';
import { lens, M, Parts, type Mat, type V3 } from './pieces';
import { panelLettering } from './signs';

// Cables, antennas, signs, billboards, CCTV cameras.

/** Off: dark glass. On (camera following the player): emissive glow. */
const CCTV_LENS: Mat = { tex: 'flat', tint: '#3a4458', emissive: 6 };

/** Sagging cable from the wall you aim at, straight out for `span` meters. */
function cable(span: number): PropDef {
  return {
    type: `cable_${span}`,
    label: `Cable ${span} m`,
    category: 'details',
    place: 'mount',
    snap: 0.5,
    hang: 0,
    build() {
      const p = new Parts();
      p.sagCable(span, 0.04 * span + 0.15, 14, 0.015);
      p.detail([-0.06, -0.06, -0.12], [0.06, 0.06, 0], M.steel, false);
      p.detail([-0.06, -0.06, -span], [0.06, 0.06, -span + 0.12], M.steel, false);
      return p.list;
    },
  };
}
export const cable4 = cable(4);
export const cable8 = cable(8);
export const cable12 = cable(12);

/** Antenna mast with crossbars and guy wires. */
export const antenna: PropDef = {
  type: 'antenna',
  label: 'Antenna',
  category: 'details',
  place: 'floor',
  snap: 0.5,
  build() {
    const h = 5;
    const p = new Parts();
    p.detail([-0.2, 0, -0.2], [0.2, 0.05, 0.2], M.steel);
    p.cyl([0, 0, 0], 'y', h, 0.05, M.steel, { paint: false, seg: 6 });
    p.detail([-0.6, h - 0.6, -0.02], [0.6, h - 0.56, 0.02], M.steel, false);
    p.detail([-0.4, h - 1.1, -0.02], [0.4, h - 1.06, 0.02], M.steel, false);
    p.detail([-0.02, h - 0.9, -0.35], [0.02, h - 0.86, 0.35], M.steel, false);
    for (const a of [0, 2.094, 4.189]) {
      const x = Math.cos(a) * 0.95;
      const z = Math.sin(a) * 0.95;
      p.rod([0, h * 0.7, 0], [x, 0.05, z], 0.008, M.cable);
      p.detail([x - 0.05, 0, z - 0.05], [x + 0.05, 0.08, z + 0.05], M.steel, false);
    }
    return p.list;
  },
};

/** Flat wall sign: a 2 x 1 m lettered, paintable panel on brackets, centered on the aim point. */
export const sign: PropDef = {
  type: 'sign',
  label: 'Wall sign',
  category: 'signs',
  place: 'mount',
  snap: 0.5,
  hang: 0.5,
  build({ seed }) {
    const p = new Parts();
    p.box([-1, 0, -0.2], [1, 1, -0.1], panelLettering(seed, 2, 7), { paint: true });
    p.detail([-1.03, -0.03, -0.22], [1.03, 0, -0.08], M.steel);
    p.detail([-1.03, 1, -0.22], [1.03, 1.03, -0.08], M.steel);
    for (const x of [-0.7, 0.7]) p.detail([x - 0.03, 0.2, -0.1], [x + 0.03, 0.8, 0], M.steel, false);
    return p.list;
  },
};

/**
 * Billboard: 6 x 3 m lettered, paintable board on a frame, its face (+z) and lamps
 * turned outward like rooftop billboards. Access is unchanged: the ladder on
 * the back (-z) climbs to the rear catwalk; a walkway around the +x end leads
 * to the front catwalk in front of the face. Railings on every open edge.
 */
export const billboard: PropDef = {
  type: 'billboard',
  label: 'Billboard',
  category: 'signs',
  place: 'floor',
  snap: 0.5,
  build({ seed }) {
    const w = 6;
    const bh = 3;
    const p = new Parts();
    const deck = 2.4;
    const b0 = deck + 0.5; // above step height, so the frame isn't a ledge
    const b1 = b0 + bh;
    const hw = w / 2;
    const front = 1.12; // front catwalk edge
    const side = hw + 1.0; // side walkway edge
    p.box([-hw, b0, 0], [hw, b1, 0.12], panelLettering(seed, w / bh, 13), { paint: true });
    p.detail([-hw - 0.05, b1, -0.02], [hw + 0.05, b1 + 0.1, 0.14], M.steel);
    p.detail([-hw - 0.05, b0 - 0.1, -0.02], [hw + 0.05, b0, 0.14], M.steel);
    // Frame behind the board: posts through the rear catwalk, braces under it.
    for (const x of [-hw + 0.5, hw - 0.5]) p.detail([x - 0.08, 0, -0.18], [x + 0.08, b1 + 0.1, 0], M.steel);
    for (const x of [-hw + 1.4, hw - 1.4]) p.rod([x, 0, -1.4], [x, deck - 0.15, -0.18], 0.04, M.steel);
    // Rear catwalk (unchanged: the ladder arrives here) and its supports.
    p.box([-hw, deck - 0.1, -1.0], [hw, deck, 0], M.steel);
    for (const x of [-hw + 0.5, hw - 0.5]) p.rod([x, deck - 0.8, -0.18], [x, deck - 0.05, -0.95], 0.03, M.steel);
    const lx = -hw + 0.6;
    p.railing([-hw, -1.0], [lx - 0.4, -1.0], deck);
    p.railing([lx + 0.4, -1.0], [side, -1.0], deck);
    p.railing([-hw, -1.0], [-hw, 0], deck);
    p.ladder(lx, 0, -1.0, deck, 0.7);
    // Walkway around the +x end of the board.
    p.box([hw, deck - 0.1, -1.0], [side, deck, front], M.steel);
    p.railing([side, -1.0], [side, front], deck);
    p.rod([side - 0.1, 0, -0.5], [side - 0.1, deck - 0.1, -0.5], 0.04, M.steel, true);
    p.rod([side - 0.1, 0, 0.6], [side - 0.1, deck - 0.1, 0.6], 0.04, M.steel, true);
    // Front catwalk in front of the face.
    p.box([-hw, deck - 0.1, 0.12], [hw, deck, front], M.steel);
    for (const x of [-hw + 0.5, hw - 0.5]) p.rod([x, deck - 0.8, 0.12], [x, deck - 0.05, front - 0.05], 0.03, M.steel);
    p.railing([-hw, front], [side, front], deck);
    p.railing([-hw, 0.12], [-hw, front], deck);
    for (const x of [-w / 3, w / 3]) {
      p.rod([x, b1 + 0.1, 0.07], [x, b1 + 0.3, 0.92], 0.03, M.steel);
      p.detail([x - 0.2, b1 + 0.18, 0.82], [x + 0.2, b1 + 0.3, 1.07], lens(LIGHTS.billboardLamp.color), false);
      // Lamp aimed back down onto the face; it emits from its bottom face.
      p.light({ kind: 'billboardLamp', pos: [x, b1 + 0.175, 0.945] });
    }
    return p.list;
  },
};

/**
 * CCTV camera on a wall arm; the head slowly pans left and right. When the
 * player comes near it turns to follow, and its lens and a small spot
 * light switch on (CCTV and LIGHTS.cctv in config).
 */
export const cctv: PropDef = {
  type: 'cctv',
  label: 'CCTV camera',
  category: 'details',
  place: 'mount',
  snap: 0.5,
  hang: 0,
  build({ seed }) {
    const p = new Parts();
    p.detail([-0.07, -0.1, -0.03], [0.07, 0.1, 0], M.steel, false);
    p.rod([0, 0, -0.03], [0, 0, -0.29], 0.022, M.steel);
    p.detail([-0.03, -0.04, -0.35], [0.03, 0.03, -0.29], M.steel, false);
    const pan = { pivot: [0, 0, -0.32] as V3, amp: 0.75, period: 10, phase: seed * 1.7 };
    p.swinging({ ...pan, track: 'head' }, () => {
      p.detail([-0.065, -0.13, -0.6], [0.065, -0.04, -0.27], M.ac, false);
      p.detail([-0.08, -0.04, -0.63], [0.08, -0.02, -0.26], M.metal, false);
      p.detail([0.042, -0.06, -0.607], [0.056, -0.047, -0.6], { tex: 'flat', tint: '#ff2a2a', emissive: 1 }, false);
      p.light({ kind: 'cctv', pos: [0, -0.085, -0.645] });
    });
    // Dark glass that lights up while the camera follows the player.
    p.swinging({ ...pan, track: 'lens' }, () => {
      p.cyl([0, -0.085, -0.62], 'z', 0.02, 0.036, CCTV_LENS, { paint: false, collide: false, seg: 10 });
    });
    return p.list;
  },
};
