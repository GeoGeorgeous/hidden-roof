import { withVariants } from './def';
import { M, Parts, type Mat } from './pieces';
import { neonRect } from '../render/ink/neon-text';
import { ENGLISH, fitting, JAPANESE } from '../render/ink/slogans';
import { sloganVariants, word } from './lettering';

// Lettered signs for the ink look: every sign shows a real slogan
// (render/ink/slogans.ts), one per variant (kit/lettering.ts).
// The panels are paintable: paint covers the lettering like graffiti over an ad.

/** Tall sign sticking out of the wall you aim at (lettering on both faces), on two brackets. */
export const bladeSign = withVariants({ type: 'blade_sign', label: 'Blade sign', category: 'signs', place: 'mount', snap: 0.5, hang: 2 }, sloganVariants(fitting(JAPANESE, 9), (s) => {
  const h = 4;
  const w = 1.2;
  const gap = 0.3;
  const p = new Parts();
  // A column of Japanese, one character under another.
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
}));

/**
 * Roof letters: a short slogan in big channel letters standing on the roof,
 * the way company names stand on Tokyo roofs. Each letter is its own 1 m
 * lettered panel (paintable) on a dark box, on a steel frame of rails and
 * posts with braces back down to the roof.
 */
export const roofLetters = withVariants({ type: 'roof_letters', label: 'Roof letters', category: 'signs', place: 'floor', snap: 0.5 }, sloganVariants([...fitting(JAPANESE, 6), ...fitting(ENGLISH, 7)], (s) => {
  const h = 1;
  const y0 = 0.5;
  const gap = 0.08;
  const chars = Array.from(s.text);
  const letters = chars.map((c) => word(c, s.inverted, h));
  const w = letters.reduce((sum, l) => sum + l.width, 0) + gap * (chars.length - 1);
  const p = new Parts();
  let x = -w / 2;
  for (const l of letters) {
    p.box([x, y0, -0.12], [x + l.width, y0 + h, -0.1], l.mat, { paint: true });
    p.detail([x + 0.03, y0 + 0.03, -0.1], [x + l.width - 0.03, y0 + h - 0.03, 0.04], M.dark);
    x += l.width + gap;
  }
  // Frame behind the letters: two rails, posts every ~1.5 m on base plates, braces back to the roof.
  const ends = w / 2 + 0.1;
  for (const y of [y0 + 0.1, y0 + h - 0.1]) p.detail([-ends, y, 0.04], [ends, y + 0.06, 0.1], M.steel);
  const n = Math.max(1, Math.ceil((2 * ends) / 1.5));
  for (let i = 0; i <= n; i++) {
    const px = -ends + (2 * ends * i) / n;
    p.detail([px - 0.04, 0.02, 0.1], [px + 0.04, y0 + h, 0.18], M.steel);
    p.detail([px - 0.12, 0, 0.02], [px + 0.12, 0.02, 0.26], M.steel, false);
    p.rod([px, y0 + h - 0.1, 0.18], [px, 0.02, 1.1], 0.025, M.steel);
  }
  return p.list;
}));
