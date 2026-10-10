import { TAG_FONTS, type HintFont, type TagFont } from '../config';
import { FONT_FAMILIES, jpFontReady } from '../render/ink/jp-font';

// The fonts hints are painted in (T in build mode, HINT_FONTS): the pickup
// tags' three (jp-font.ts), and more from public/fonts (README.txt: who made
// each and its license), each loaded the first time it's picked. Only build
// mode loads them: hints reach players as paint.

/** The extra fonts: CSS family, and file in public/fonts. */
const EXTRA: Record<Exclude<HintFont, TagFont>, [family: string, file: string]> = {
  spraypaint: ['Rubik Spray Paint', 'rubik-spray-paint'],
  wetpaint: ['Rubik Wet Paint', 'rubik-wet-paint'],
  marker: ['Permanent Marker', 'permanent-marker'],
  blackops: ['Black Ops One', 'black-ops-one'],
  stencil: ['Saira Stencil One', 'saira-stencil-one'],
  bangers: ['Bangers', 'bangers'],
  dela: ['Dela Gothic One', 'dela-gothic-one'],
  reggae: ['Reggae One', 'reggae-one'],
  potta: ['Potta One', 'potta-one'],
  yusei: ['Yusei Magic', 'yusei-magic'],
};
/** Weights: the gothic is the neon signs' black, mono is bold to read as paint; the rest come in one. */
const WEIGHT: Partial<Record<HintFont, number>> = { mono: 700, gothic: 900 };

const isTag = (f: HintFont): f is TagFont => (TAG_FONTS as readonly string[]).includes(f);

/** Font `f` at `px` pixels, for a canvas. */
export const hintCss = (f: HintFont, px: number) => `${WEIGHT[f] ?? 400} ${px}px ${isTag(f) ? FONT_FAMILIES[f] : `'${EXTRA[f][0]}'`}`;

/** Its name, for the status line. */
export const hintFontName = (f: HintFont) => (isTag(f) ? f : EXTRA[f][0]).toUpperCase();

const loading = new Map<HintFont, Promise<void>>();
const loaded = new Set<HintFont>();

/** Font `f`, loaded (once; one that fails is drawn in a fallback, said in the console). */
export function hintFontReady(f: HintFont): Promise<void> {
  let p = loading.get(f);
  if (!p) {
    const load =
      f === 'gothic' ? jpFontReady()
      : isTag(f) ? document.fonts.load(hintCss(f, 32))
      : new FontFace(EXTRA[f][0], `url(${import.meta.env.BASE_URL}fonts/${EXTRA[f][1]}.woff2)`).load().then((face) => void document.fonts.add(face));
    p = Promise.resolve(load)
      .catch((e) => console.warn(`hint font ${f}: ${(e as Error).message}`))
      .then(() => void loaded.add(f));
    loading.set(f, p);
  }
  return p;
}

/** Whether hintFontReady(f) is done: drawn before, a hint would be in a fallback font. */
export const hintFontLoaded = (f: HintFont) => loaded.has(f);
