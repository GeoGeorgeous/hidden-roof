import { SIGN_TEXT } from '../config';
import type { PropDef } from './def';
import { M, Parts, type Mat } from './pieces';
import { panelRect } from '../render/ink/panel-text';
import { neonRect } from '../render/ink/neon-text';
import { ENGLISH, fitting, JAPANESE } from '../render/ink/slogans';
import { lcg } from '../lcg';
import { word } from './small-signs';

// Lettered signs for the ink look: every sign shows a real slogan
// (render/ink/slogans.ts) picked by its instance's seed. The panels are
// paintable: paint covers the lettering like graffiti over an ad.

/** A slogan for this seed from `pool` (not empty, see `fitting`), and whether it is drawn paper on ink. */
function slogan(seed: number, pool: string[]) {
  const rnd = lcg(seed * 977 + 13);
  return { text: pool[Math.floor(rnd() * pool.length)], inverted: rnd() < 0.4 };
}

/** Lettering for a `w` x `h` m panel: a slogan, Japanese or English, one line, short enough for its characters to stay SIGN_TEXT.minCharWidth wide. */
export function panelLettering(seed: number, w: number, h: number): Mat {
  const s = slogan(seed, fitting([...JAPANESE, ...ENGLISH], Math.floor(w / SIGN_TEXT.minCharWidth)));
  return { tex: 'panelText', tile: 1, tint: '#ffffff', letters: panelRect(s.text, s.inverted, w / h) };
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
    // A column of Japanese, one character under another.
    const s = slogan(seed, fitting(JAPANESE, 9));
    const letters: Mat = { tex: 'neonText', tile: 1, tint: '#ffffff', letters: neonRect(s.text, s.inverted, w / h) };
    p.box([-0.1, 0, -gap - w], [0.1, h, -gap], letters, { paint: true });
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

/** Flat shop sign on the wall: a lettered 0.9 m panel (3 m or as wide as its slogan) in a frame, two lamps on arms over it. */
export const shopSign: PropDef = {
  type: 'shop_sign',
  label: 'Shop sign',
  category: 'signs',
  place: 'mount',
  snap: 0.5,
  hang: 0.45,
  build({ seed }) {
    const h = 0.9;
    // As wide as its slogan, at least 3 m.
    const s = slogan(seed, [...fitting(JAPANESE, 9), ...fitting(ENGLISH, 17)]);
    const t = word(s.text, s.inverted, h, 3);
    const w = t.width;
    const p = new Parts();
    p.box([-w / 2, 0, -0.18], [w / 2, h, -0.06], t.mat, { paint: true });
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
