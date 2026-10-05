// The Japanese font that ships with the game (public/fonts/neon-jp.woff2: Noto
// Sans JP Black, SIL OFL, a subset of kana, ASCII and some kanji). The system
// may have no CJK font at all, so lettering that uses real text loads this one.
// It arrives in the background: draw with the fallbacks at once, and again
// when onJpFont calls back.

export const JP_FAMILY = `'NeonJP', 'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif`;

const waiting: (() => void)[] = [];
let state: 'idle' | 'loading' | 'loaded' | 'failed' = 'idle';

/** Run `redraw` once the font is loaded (at once if it already is). */
export function onJpFont(redraw: () => void) {
  if (state === 'loaded') return redraw();
  waiting.push(redraw);
  if (state !== 'idle' || typeof FontFace === 'undefined') return;
  state = 'loading';
  new FontFace('NeonJP', `url(${import.meta.env.BASE_URL}fonts/neon-jp.woff2)`, { weight: '900' })
    .load()
    .then((f) => {
      document.fonts.add(f);
      state = 'loaded';
      for (const cb of waiting.splice(0)) cb();
    })
    .catch((e) => {
      state = 'failed';
      console.warn('sign font failed to load, signs use a system font', e);
    });
}
