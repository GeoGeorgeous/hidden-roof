// Screenshot (K): the game canvas as a PNG download. Call right after the
// frame is rendered, in the same frame: the renderer doesn't keep its drawing
// buffer (no preserveDrawingBuffer), and toBlob copies the canvas at the call.
// The HUD is HTML on top of the canvas, so it isn't in the picture.

export function saveScreenshot(canvas: HTMLCanvasElement, onSaved: () => void) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `taggin-${stamp(new Date())}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    onSaved();
  }, 'image/png');
}

/** 2026-10-04 18:31:05 -> 20261004-183105 */
function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
