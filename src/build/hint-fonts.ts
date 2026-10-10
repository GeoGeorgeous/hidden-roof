import type { HintFont } from '../config';
import { FONT_FAMILIES } from '../render/ink/jp-font';

// The fonts hints are painted in (T in build mode, HINT_FONTS): the HUD's
// mono (jp-font.ts), and more from public/fonts (README.txt: who made each and
// its license), each loaded the first time it's picked. Only build mode loads
// them: hints reach players as paint.

/** The fonts from files: CSS family, file in public/fonts, and the weight it's in. */
const EXTRA: Record<Exclude<HintFont, 'mono'>, [family: string, file: string, weight: number]> = {
  marker: ['Permanent Marker', 'permanent-marker', 400],
  bangers: ['Bangers', 'bangers', 400],
};
/** Mono is drawn bold, to read as paint. */
const weight = (f: HintFont) => (f === 'mono' ? 700 : EXTRA[f][2]);

/** Font `f` at `px` pixels, for a canvas. */
export const hintCss = (f: HintFont, px: number) => `${weight(f)} ${px}px ${f === 'mono' ? FONT_FAMILIES.mono : `'${EXTRA[f][0]}'`}`;

/** Its name, for the status line. */
export const hintFontName = (f: HintFont) => (f === 'mono' ? f : EXTRA[f][0]).toUpperCase();

const loading = new Map<HintFont, Promise<void>>();
const loaded = new Set<HintFont>();

/** Font `f`, loaded (once; one that fails is drawn in a fallback, said in the console). */
export function hintFontReady(f: HintFont): Promise<void> {
  let p = loading.get(f);
  if (!p) {
    // Mono is the system's: nothing to load.
    const load =
      f === 'mono' ? undefined
      : new FontFace(EXTRA[f][0], `url(${import.meta.env.BASE_URL}fonts/${EXTRA[f][1]}.woff2)`, { weight: `${EXTRA[f][2]}` }).load().then((face) => void document.fonts.add(face));
    p = Promise.resolve(load)
      .catch((e) => console.warn(`hint font ${f}: ${(e as Error).message}`))
      .then(() => void loaded.add(f));
    loading.set(f, p);
  }
  return p;
}

/** Whether hintFontReady(f) is done: drawn before, a hint would be in a fallback font. */
export const hintFontLoaded = (f: HintFont) => loaded.has(f);
