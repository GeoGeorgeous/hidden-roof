import type { UvRect } from './uv-rect';
import { JP_FAMILY } from './jp-font';
import { INK, PAPER, TextAtlas } from './text-atlas';

// Real words for small signs (exit, high voltage, name plates), unlike the
// wide panels of the big ones (panel-text.ts). Each sign's own text (typed
// in build mode, saved in the level) gets a 64 px row the first time it's
// used (text-atlas.ts): ink on paper, or paper on ink. Drawn like sign
// lettering: straight from the texture, not lit (LETTERS in ink/tone.ts).
// A sign's size comes from a fixed width table (ADVANCE), never from measuring
// the installed fonts, so every machine builds the same sign geometry; the
// text is drawn to fit inside that width.

const W = 1024;
const ROW = 64;
const SIZE = ROW * 0.72;
/** The bundled font only (jp-font.ts): signs look the same on every machine. */
const font = (px: number) => `900 ${px}px ${JP_FAMILY}`;
/** Space around a word, in rows (fractions of its height). */
const PAD = 0.35;
/** Longest text a sign takes. */
export const MAX_TEXT = 24;
/**
 * Advance widths of printable ASCII (32..126) per 100 px in the bundled font
 * (jp-font.ts, Noto Sans JP Black), as Chrome sets it; anything else is a full em.
 */
const ADVANCE = [
  23, 40, 63, 61, 61, 99, 77, 35, 40, 40, 53, 61, 35, 38, 35, 39, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 35, 35, 61, 61, 61, 54, 104, 66, 70, 67, 73, 63, 60, 73, 77, 35, 59, 71, 60, 88, 76, 79, 69, 79, 71, 64, 64, 76, 64, 94, 66, 61,
  62, 40, 39, 40, 61, 57, 64, 61, 66, 54, 66, 60, 40, 62, 66, 32, 32, 63, 33, 99, 66, 64, 66, 66, 46, 51, 45, 65, 61, 90, 60, 60, 53, 40, 31, 40, 61,
];

/** Width of `text` at `px`, by the table: the same on every machine, whatever fonts it has. */
function textWidth(text: string, px: number) {
  let w = 0;
  for (const ch of text) w += ADVANCE[ch.charCodeAt(0) - 32] ?? 100;
  return (w * px) / 100;
}

let atlas: TextAtlas | null = null;

export function wordAtlas() {
  return (atlas ??= new TextAtlas(W, ROW * 32, PAPER)).texture;
}

/** The row holding this text, drawn on first use; its data is the text's width by the table (px). */
function rowOf(text: string, inverted: boolean) {
  wordAtlas();
  return atlas!.cell<number>(`${inverted ? 1 : 0}|${text}`, W, ROW, (ctx, { y }) => {
    ctx.fillStyle = inverted ? INK : PAPER;
    ctx.fillRect(0, y, W, ROW);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Long texts shrink to fit the row.
    const px = Math.min(SIZE, (SIZE * (W - 2 * PAD * ROW)) / Math.max(1, textWidth(text, SIZE)));
    const width = textWidth(text, px);
    // A fallback wider than the table (before the bundled font loads, or if it fails) shrinks to fit the width.
    ctx.font = font(px);
    ctx.font = font(px * Math.min(1, width / Math.max(1, ctx.measureText(text).width)));
    ctx.fillStyle = inverted ? PAPER : INK;
    ctx.fillText(text, W / 2, y + ROW * 0.54);
    return width;
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
