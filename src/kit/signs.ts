import type { PropDef } from './def';
import { M, Parts, type Mat } from './pieces';
import { signRect } from '../render/ink/glyphs';
import { lcg } from '../lcg';

// Lettered signs for the ink look (render/ink/glyphs.ts): every instance gets
// its own made-up lettering from its seed. The panels are paintable: paint
// covers the lettering like graffiti over an ad.

/** Lettering material: `count` glyphs, vertical or not, for this instance's seed. */
export function lettering(seed: number, count: number, vertical: boolean, latin = false): Mat {
  const rnd = lcg(seed * 977 + 13);
  return { tex: 'glyphs', tile: 1, tint: '#ffffff', letters: signRect(rnd, count, vertical, rnd() < 0.4, latin && rnd() < 0.5) };
}

/** Tall sign sticking out of the wall you aim at (lettering on both faces), on two brackets. */
export const bladeSign: PropDef = {
  type: 'blade_sign',
  label: 'Blade sign',
  category: 'signs',
  place: 'mount',
  snap: 0.5,
  hang: 2,
  build({ seed }) {
    const h = 4;
    const w = 1.2;
    const gap = 0.3;
    const p = new Parts();
    p.box([-0.1, 0, -gap - w], [0.1, h, -gap], lettering(seed, h / w, true), { paint: true });
    // Frame: steel caps top and bottom, an edge strip on the outer side.
    p.detail([-0.12, h, -gap - w - 0.02], [0.12, h + 0.06, -gap + 0.02], M.steel);
    p.detail([-0.12, -0.06, -gap - w - 0.02], [0.12, 0, -gap + 0.02], M.steel);
    p.detail([-0.12, 0, -gap - w - 0.06], [0.12, h, -gap - w], M.steel);
    for (const y of [0.4, h - 0.4]) {
      p.detail([-0.04, y - 0.04, -gap], [0.04, y + 0.04, 0], M.steel, false);
      p.rod([0, y + 0.6, 0], [0, y, -gap - w * 0.6], 0.015, M.steel);
    }
    return p.list;
  },
};

/** Flat shop sign on the wall: a lettered 3 x 0.9 m panel in a frame, two lamps on arms over it. */
export const shopSign: PropDef = {
  type: 'shop_sign',
  label: 'Shop sign',
  category: 'signs',
  place: 'mount',
  snap: 0.5,
  hang: 0.45,
  build({ seed }) {
    const w = 3;
    const h = 0.9;
    const p = new Parts();
    p.box([-w / 2, 0, -0.18], [w / 2, h, -0.06], lettering(seed, (w / h) * 0.8, false, true), { paint: true });
    p.detail([-w / 2 - 0.04, -0.04, -0.2], [w / 2 + 0.04, 0, -0.04], M.steel);
    p.detail([-w / 2 - 0.04, h, -0.2], [w / 2 + 0.04, h + 0.04, -0.04], M.steel);
    p.detail([-w / 2 - 0.04, 0, -0.2], [-w / 2, h, -0.04], M.steel, false);
    p.detail([w / 2, 0, -0.2], [w / 2 + 0.04, h, -0.04], M.steel, false);
    p.detail([-w / 2, 0.1, -0.06], [w / 2, h - 0.1, 0], M.steel, false);
    for (const x of [-w / 3, w / 3]) {
      p.rod([x, h + 0.04, -0.1], [x, h + 0.35, -0.55], 0.015, M.steel);
      p.detail([x - 0.1, h + 0.28, -0.62], [x + 0.1, h + 0.36, -0.48], M.steel, false);
    }
    return p.list;
  },
};
