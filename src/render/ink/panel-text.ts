import { JP_FAMILY } from './jp-font';
import { INK, PAPER, TextAtlas } from './text-atlas';
import type { UvRect } from './uv-rect';

// Real text for the lettered panels of the wall sign, billboard and sign tower
// (kit/signs.ts panelLettering), in the bundled font (jp-font.ts). Each text gets
// a cell the shape of its panel, on one text row (text-atlas.ts): ink on
// paper or paper on ink, one line, as big as the panel's width or 60% of its
// height allows, centered. Like all lettering it is drawn straight from the
// texture (LETTERS in ink/tone.ts).

/** Every cell is this tall (texels); its width follows the panel's aspect. */
const CELL_H = 128;

let atlas: TextAtlas | null = null;

export function panelAtlas() {
  return (atlas ??= new TextAtlas(1024, 1024, INK)).texture;
}

/**
 * Atlas rect of `text` on a panel `aspect` (width / height) in shape: ink on
 * paper, or (inverted) paper on ink. The panel shows all of it.
 */
export function panelRect(text: string, inverted: boolean, aspect: number): UvRect {
  panelAtlas();
  const a = atlas!;
  const w = Math.min(a.width, Math.max(CELL_H, Math.round(CELL_H * aspect)));
  const c = a.cell(`${inverted ? 1 : 0}|${w}|${text}`, w, CELL_H, (ctx, { x, y }) => {
    ctx.fillStyle = inverted ? PAPER : INK;
    ctx.fillRect(x, y, w, CELL_H);
    ctx.fillStyle = inverted ? INK : PAPER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${CELL_H * 0.6}px ${JP_FAMILY}`;
    // As big as 60% of the panel's height, or smaller to fit 88% of its width.
    const fit = Math.min(1, (w * 0.88) / Math.max(1, ctx.measureText(text).width));
    ctx.font = `900 ${CELL_H * 0.6 * fit}px ${JP_FAMILY}`;
    ctx.fillText(text, x + w / 2, y + CELL_H * 0.54);
  });
  return a.uv(c.x, c.y, c.x + c.w, c.y + c.h);
}
