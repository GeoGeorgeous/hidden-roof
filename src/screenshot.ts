import { download, stamp } from './files';

// Screenshot (K): the game canvas as a PNG download. Call right after the
// frame is rendered, in the same frame: the renderer doesn't keep its drawing
// buffer (no preserveDrawingBuffer), and drawImage copies the canvas at the call.
// The HUD is HTML on top of the canvas, so it isn't in the picture, except the
// other players' name tags (net/nameplates.ts): they're drawn in as shown.

export function saveScreenshot(canvas: HTMLCanvasElement, onSaved: () => void) {
  const shot = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
  const ctx = shot.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  drawNameplates(ctx, canvas);
  shot.toBlob((blob) => {
    if (!blob) return;
    download(blob, `roof-hidden-haus-${stamp(new Date())}.png`);
    onSaved();
  }, 'image/png');
}

/** Each name tag on screen, its box and text where it sits over the canvas, at the canvas's resolution. */
function drawNameplates(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const view = canvas.getBoundingClientRect();
  const scale = canvas.width / view.width;
  for (const tag of document.querySelectorAll<HTMLElement>('.nameplate')) {
    const r = tag.getBoundingClientRect();
    if (tag.hidden || !r.width) continue;
    const css = getComputedStyle(tag);
    const x = (r.left - view.left) * scale;
    const y = (r.top - view.top) * scale;
    ctx.fillStyle = css.backgroundColor;
    ctx.fillRect(x, y, r.width * scale, r.height * scale);
    ctx.font = `${css.fontWeight} ${parseFloat(css.fontSize) * scale}px ${css.fontFamily}`;
    if (css.letterSpacing !== 'normal') ctx.letterSpacing = `${parseFloat(css.letterSpacing) * scale}px`;
    ctx.fillStyle = css.color;
    ctx.textBaseline = 'middle';
    ctx.fillText(tag.textContent ?? '', x + parseFloat(css.paddingLeft) * scale, y + (r.height * scale) / 2);
  }
}
