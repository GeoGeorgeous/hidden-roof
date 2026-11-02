// Where the game view is on the page (CSS px): the whole window, or capture
// mode's fixed frame within it (capture/captureMode.ts). What is placed over
// the view where things are on screen (name tags, pickup tags, the tool tags)
// is placed in it.

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const whole: Rect = { left: 0, top: 0, width: 0, height: 0 };
let frame: Rect | null = null;

/** Capture mode's fixed frame, or null: the view is the whole window again. */
export const setFrame = (r: Rect | null) => (frame = r);

export function viewRect(): Rect {
  if (frame) return frame;
  whole.width = window.innerWidth;
  whole.height = window.innerHeight;
  return whole;
}

/** A point projected to normalized device coordinates (-1..1), in CSS px on the page. */
export function onPage(x: number, y: number) {
  const r = viewRect();
  return { x: r.left + (x * 0.5 + 0.5) * r.width, y: r.top + (0.5 - y * 0.5) * r.height };
}
