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

/** Each name tag on screen, as shown: its boxes, and each text in its own font and color where it sits, at the canvas's resolution. */
function drawNameplates(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const view = canvas.getBoundingClientRect();
  const scale = canvas.width / view.width;
  ctx.textBaseline = 'middle';
  for (const tag of document.querySelectorAll<HTMLElement>('.nameplate')) {
    if (tag.hidden) continue;
    ctx.globalAlpha = parseFloat(getComputedStyle(tag).opacity);
    for (const el of tag.querySelectorAll<HTMLElement>('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const css = getComputedStyle(el);
      const x = (r.left - view.left) * scale;
      const y = (r.top - view.top) * scale;
      if (css.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        ctx.fillStyle = css.backgroundColor;
        ctx.fillRect(x, y, r.width * scale, r.height * scale);
      }
      if (el.children.length || !el.textContent) continue;
      ctx.font = `${css.fontWeight} ${parseFloat(css.fontSize) * scale}px ${css.fontFamily}`;
      ctx.letterSpacing = css.letterSpacing === 'normal' ? '0px' : `${parseFloat(css.letterSpacing) * scale}px`;
      ctx.fillStyle = css.color;
      ctx.fillText(el.textContent, x + parseFloat(css.paddingLeft) * scale, y + (r.height * scale) / 2);
    }
  }
  ctx.globalAlpha = 1;
}
