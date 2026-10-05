import { download, stamp } from './files';

// Screenshot (K): the game canvas as a PNG download. Call right after the
// frame is rendered, in the same frame: the renderer doesn't keep its drawing
// buffer (no preserveDrawingBuffer), and toBlob copies the canvas at the call.
// The HUD is HTML on top of the canvas, so it isn't in the picture.

export function saveScreenshot(canvas: HTMLCanvasElement, onSaved: () => void) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    download(blob, `roof-hidden-haus-${stamp(new Date())}.png`);
    onSaved();
  }, 'image/png');
}
