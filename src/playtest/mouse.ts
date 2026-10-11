import { PLAYTEST } from '../config';
import { round, Samples } from './probe';

// The playtest's view of the mouse (docs/playtest.md, Mouse; docs/backlog.md,
// "Mouse spikes snap the camera"): one `mousemove` far larger than the ones
// around it, seen from the side, without touching input.ts. Each window: events,
// the largest move, how they spaced and how many came per frame. A spike (over
// PLAYTEST.mouseSpikePx and over 3x the largest of the last 8) is sent whole,
// with what came before it, when it came (since the lock, the frame, the
// previous event) and what the browser knew, to tell the known Chromium kinds
// apart (a lone value mid-flick, one right after the lock is taken).

const RECENT = 8;

export interface MouseSpike {
  /** performance.now() when it came, the move (px), and how far it is above the largest of the last 8. */
  at: number;
  dx: number;
  dy: number;
  px: number;
  ratio: number;
  /** The magnitudes just before it, oldest first, and the time (ms) since the previous event. */
  before: number[];
  sinceLast: number;
  /** Since the lock was taken, and since the window got focus back (ms; -1: not seen since the page loaded). */
  sinceLock: number;
  sinceFocus: number;
  /** Events handled in each of the last frames (newest last), and in the current one so far. */
  perFrame: number[];
  inFrame: number;
  /** The frame it came in: the last frame's interval (ms), and the event's own timestamp against the clock (ms the browser held it). */
  frameMs: number;
  held: number;
  buttons: number;
  shift: boolean;
}

export class MouseWatch {
  /** A spike, whole. */
  onSpike: (s: MouseSpike) => void = () => {};
  private recent = new Float64Array(RECENT);
  private n = 0;
  private lastStamp = 0;
  private lockAt = -Infinity;
  private focusAt = -Infinity;
  private frames = [0, 0, 0, 0];
  private inFrame = 0;
  private frameMs = 0;
  private win = { events: 0, maxPx: 0, over: 0, spikes: 0, sent: 0, afterLock: 0, locks: 0, unlocks: 0, maxPerFrame: 0 };
  private spacing = new Samples();
  private held = new Samples();

  constructor() {
    window.addEventListener('mousemove', (e) => this.move(e), { passive: true, capture: true });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) (this.lockAt = performance.now(), this.win.locks++);
      else this.win.unlocks++;
      this.n = 0;
    });
    window.addEventListener('focus', () => (this.focusAt = performance.now()));
  }

  private move(e: MouseEvent) {
    if (!document.pointerLockElement) return;
    const now = performance.now();
    const px = Math.hypot(e.movementX, e.movementY);
    const w = this.win;
    w.events++;
    this.inFrame++;
    if (px > w.maxPx) w.maxPx = px;
    if (px > PLAYTEST.mouseSpikePx) w.over++;
    const sinceLast = this.lastStamp ? e.timeStamp - this.lastStamp : 0;
    if (this.lastStamp) this.spacing.add(sinceLast);
    this.lastStamp = e.timeStamp;
    this.held.add(Math.max(0, now - e.timeStamp));
    let top = 0;
    const known = Math.min(this.n, RECENT);
    for (let i = 0; i < known; i++) top = Math.max(top, this.recent[i]);
    // The same two kinds the backlog's fix would drop: a lone value over several times the recent largest, and one just after the lock.
    const lone = px > PLAYTEST.mouseSpikePx && px > 3 * top;
    const afterLock = px > PLAYTEST.mouseLockPx && now - this.lockAt < PLAYTEST.mouseLockMs;
    if (lone || afterLock) {
      w.spikes++;
      if (afterLock) w.afterLock++;
      if (w.sent++ < PLAYTEST.mouseSpikesPerWindow) {
        const before = Array.from({ length: known }, (_, k) => round(this.recent[(this.n - known + k) % RECENT]));
        this.onSpike({
          at: Math.round(now),
          dx: e.movementX,
          dy: e.movementY,
          px: round(px),
          ratio: top ? round(px / top) : 0,
          before,
          sinceLast: round(sinceLast),
          sinceLock: Number.isFinite(this.lockAt) ? Math.round(now - this.lockAt) : -1,
          sinceFocus: Number.isFinite(this.focusAt) ? Math.round(now - this.focusAt) : -1,
          perFrame: [...this.frames],
          inFrame: this.inFrame,
          frameMs: round(this.frameMs),
          held: round(Math.max(0, now - e.timeStamp)),
          buttons: e.buttons,
          shift: e.shiftKey,
        });
      }
    }
    this.recent[this.n++ % RECENT] = px;
  }

  /** Once a frame, with its interval (ms). */
  frame(interval: number) {
    this.frames.shift();
    this.frames.push(this.inFrame);
    if (this.inFrame > this.win.maxPerFrame) this.win.maxPerFrame = this.inFrame;
    this.inFrame = 0;
    this.frameMs = interval;
  }

  /** The window's numbers, cleared. */
  take() {
    const w = this.win;
    const out = { events: w.events, maxPx: round(w.maxPx), over: w.over, spikes: w.spikes, afterLock: w.afterLock, locks: w.locks, unlocks: w.unlocks, maxPerFrame: w.maxPerFrame, spacing: this.spacing.summary(), held: this.held.summary() };
    this.win = { events: 0, maxPx: 0, over: 0, spikes: 0, sent: 0, afterLock: 0, locks: 0, unlocks: 0, maxPerFrame: 0 };
    this.spacing.clear();
    this.held.clear();
    return out;
  }
}
