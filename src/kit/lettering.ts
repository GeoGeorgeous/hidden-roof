import { SIGN_TEXT } from '../config';
import type { Mat } from './pieces';
import { panelRect } from '../render/ink/panel-text';
import { wordRect } from '../render/ink/words';
import { ENGLISH, fitting, JAPANESE } from '../render/ink/slogans';
import { lcg } from '../lcg';

// Lettering materials for the signs (signs.ts, small-signs.ts, details.ts,
// steel.ts): a real slogan per instance seed (render/ink/slogans.ts), or the
// sign's own words, as a rect of a text atlas (render/ink/*-text.ts, words.ts).

/** A slogan for this seed from `pool` (not empty, see `fitting`), and whether it is drawn paper on ink. */
export function slogan(seed: number, pool: string[]) {
  const rnd = lcg(seed * 977 + 13);
  return { text: pool[Math.floor(rnd() * pool.length)], inverted: rnd() < 0.4 };
}

/** Lettering for a `w` x `h` m panel: a slogan, Japanese or English, one line, short enough for its characters to stay SIGN_TEXT.minCharWidth wide. */
export function panelLettering(seed: number, w: number, h: number): Mat {
  const s = slogan(seed, fitting([...JAPANESE, ...ENGLISH], Math.floor(w / SIGN_TEXT.minCharWidth)));
  return { tex: 'panelText', tile: 1, tint: '#ffffff', letters: panelRect(s.text, s.inverted, w / h) };
}

/** A word on a sign face `h` high: its material and the width that keeps it unstretched (at least `minW`). */
export function word(w: string, inverted: boolean, h: number, minW = 0) {
  const { rect, aspect } = wordRect(w, inverted, minW / h);
  const mat: Mat = { tex: 'words', tile: 1, tint: '#ffffff', letters: rect };
  return { mat, width: h * aspect };
}
