import { SIGN_TEXT } from '../config';
import type { Variant } from './def';
import type { Mat, Piece } from './pieces';
import { panelRect } from '../render/ink/panel-text';
import { wordRect } from '../render/ink/words';
import { ENGLISH, fitting, JAPANESE } from '../render/ink/slogans';

// Lettering materials for the signs (signs.ts, small-signs.ts, details.ts,
// steel.ts): a real slogan (render/ink/slogans.ts), one per variant, or the
// sign's own words, as a rect of a text atlas (render/ink/*-text.ts, words.ts).

/** A slogan, and whether it is drawn paper on ink. */
interface Slogan {
  text: string;
  inverted: boolean;
}

/** One variant per slogan of `pool`, named by it; every other one is drawn paper on ink. */
export function sloganVariants(pool: string[], build: (s: Slogan) => Piece[]): Variant[] {
  return pool.map((text, i) => ({ id: text, label: text, build: () => build({ text, inverted: i % 2 === 0 }) }));
}

/** The slogans for a `w` m wide panel: Japanese or English, one line, short enough for its characters to stay SIGN_TEXT.minCharWidth wide. */
export const panelSlogans = (w: number) => fitting([...JAPANESE, ...ENGLISH], Math.floor(w / SIGN_TEXT.minCharWidth));

/** Lettering for a `w` x `h` m panel showing a slogan. */
export function panelLettering(s: Slogan, w: number, h: number): Mat {
  return { tex: 'panelText', tile: 1, tint: '#ffffff', letters: panelRect(s.text, s.inverted, w / h) };
}

/** A word on a sign face `h` high: its material and the width that keeps it unstretched (at least `minW`). */
export function word(w: string, inverted: boolean, h: number, minW = 0) {
  const { rect, aspect } = wordRect(w, inverted, minW / h);
  const mat: Mat = { tex: 'words', tile: 1, tint: '#ffffff', letters: rect };
  return { mat, width: h * aspect };
}
