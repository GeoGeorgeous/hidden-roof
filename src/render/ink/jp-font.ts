// The Japanese font that ships with the game (public/fonts/neon-jp.woff2: Noto
// Sans JP Black, SIL OFL, a subset of kana, ASCII and some kanji). The system
// may have no CJK font at all, so lettering that uses real text loads this one.
// It arrives in the background: draw with the fallbacks at once, and again
// when onJpFont calls back.

export const JP_FAMILY = `'NeonJP', 'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif`;

const waiting: (() => void)[] = [];
const settled: (() => void)[] = [];
let state: 'idle' | 'loading' | 'loaded' | 'failed' = 'idle';

/** Run `redraw` once the font is loaded (at once if it already is; never if it failed). */
export function onJpFont(redraw: () => void) {
  start();
  if (state === 'loaded') redraw();
  else if (state === 'loading') waiting.push(redraw);
}

function start() {
  if (state !== 'idle') return;
  if (typeof FontFace === 'undefined') {
    state = 'failed';
    return;
  }
  state = 'loading';
  new FontFace('NeonJP', `url(${import.meta.env.BASE_URL}fonts/neon-jp.woff2)`, { weight: '900' })
    .load()
    .then((f) => {
      document.fonts.add(f);
      state = 'loaded';
      for (const cb of waiting.splice(0)) cb();
      for (const cb of settled.splice(0)) cb();
    })
    .catch((e) => {
      state = 'failed';
      console.warn('sign font failed to load, signs use a system font', e);
      waiting.length = 0;
      for (const cb of settled.splice(0)) cb();
    });
}

/**
 * Resolves once the font has loaded (or failed, or after `timeout` ms): lettering
 * that measures its text (small signs, shop signs) is drawn after this, so its
 * layout is final.
 */
export function jpFontReady(timeout = 3000) {
  start();
  if (state !== 'loading') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      const i = settled.indexOf(done);
      if (i >= 0) settled.splice(i, 1);
      resolve();
    };
    const timer = setTimeout(done, timeout);
    settled.push(done);
  });
}
