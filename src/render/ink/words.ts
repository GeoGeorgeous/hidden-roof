import type { UvRect } from './uv-rect';
import { JP_FAMILY } from './jp-font';
import { INK, PAPER, TextAtlas } from './text-atlas';

// Real words for small signs (exit, high voltage, name plates), unlike the
// wide panels of the big ones (panel-text.ts). Each sign's own text (typed
// in build mode, saved in the level) gets a 64 px row the first time it's
// used (text-atlas.ts): ink on paper, or paper on ink. Drawn like sign
// lettering: straight from the texture, not lit (LETTERS in ink/tone.ts).

const W = 1024;
const ROW = 64;
const SIZE = ROW * 0.72;
const font = (px: number) => `bold ${px}px Impact, 'Arial Narrow', ${JP_FAMILY}`;
/** Space around a word, in rows (fractions of its height). */
const PAD = 0.35;
/** Longest text a sign takes. */
export const MAX_TEXT = 24;

let atlas: TextAtlas | null = null;

export function wordAtlas() {
  return (atlas ??= new TextAtlas(W, ROW * 32, PAPER)).texture;
}

/** The row holding this text, drawn on first use; its data is the drawn width (px). */
function rowOf(text: string, inverted: boolean) {
  wordAtlas();
  return atlas!.cell<number>(`${inverted ? 1 : 0}|${text}`, W, ROW, (ctx, { y }) => {
    ctx.fillStyle = inverted ? INK : PAPER;
    ctx.fillRect(0, y, W, ROW);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Long texts shrink to fit the row.
    ctx.font = font(SIZE);
    const px = Math.min(SIZE, (SIZE * (W - 2 * PAD * ROW)) / Math.max(1, ctx.measureText(text).width));
    ctx.font = font(px);
    ctx.fillStyle = inverted ? PAPER : INK;
    ctx.fillText(text, W / 2, y + ROW * 0.54);
    return ctx.measureText(text).width;
  });
}

/**
 * Atlas rect of a sign's text, centered, `aspect` wide (width / height) or
 * wider if the text needs it. Returns the rect and the aspect it got: make the
 * sign face that shape so the text isn't stretched.
 */
export function wordRect(text: string, inverted: boolean, aspect: number): { rect: UvRect; aspect: number } {
  const row = rowOf(text.slice(0, MAX_TEXT), inverted);
  const a = Math.min(W / ROW, Math.max(aspect, row.data / ROW + 2 * PAD));
  const half = (a * ROW) / 2;
  return { rect: atlas!.uv(W / 2 - half, row.y, W / 2 + half, row.y + ROW), aspect: a };
}
