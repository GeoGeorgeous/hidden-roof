import { PROFILE } from '../config';

// Spikes, for profiling mode (profiler.ts): every frame goes into a rolling
// buffer of the last few seconds, with the camera and the raw mouse input
// that came in for it. A spike (a frame that took far longer than those
// around it, the camera turning further in one frame than a hand would, one
// mouse event far larger than the rest, or F2 when you saw something) keeps
// that buffer and the second after it. Browser events that can upset the
// mouse (pointer lock lost or taken, focus, tab hidden, fullscreen) are
// logged and marked on their frame.

/** One frame, as the spike buffer keeps it. */
export interface FrameRecord {
  t: number;
  /** Real time since the last frame, and the frame's CPU time (ms). */
  ms: number;
  cpuMs: number;
  laps: Record<string, number>;
  /** All GPU passes (ms, smoothed), or null where the browser can't time it. */
  gpuMs: number | null;
  calls: number;
  state: string;
  pos: number[];
  /** Camera turn (degrees), and how far it turned since the last frame. */
  yaw: number;
  pitch: number;
  turn: number;
  /** Mouse movement that came in for this frame (px): the sum, how many events, the largest single one. */
  mouse: { dx: number; dy: number; events: number; largest: number };
  notes?: string[];
}

interface Spike {
  t: number;
  /** What set it off (and anything more that did before it closed), with when. */
  reasons: { t: number; why: string }[];
  pos: number[];
  yaw: number;
  pitch: number;
  /** The buffered seconds before it, and the second after. */
  frames: FrameRecord[];
}

const BROWSER_EVENTS: [EventTarget, string, () => string][] = [
  [document, 'pointerlockchange', () => (document.pointerLockElement ? 'pointer lock taken' : 'pointer lock lost')],
  [document, 'pointerlockerror', () => 'pointer lock refused'],
  [document, 'visibilitychange', () => `tab ${document.visibilityState}`],
  [document, 'fullscreenchange', () => (document.fullscreenElement ? 'fullscreen on' : 'fullscreen off')],
  [window, 'blur', () => 'window lost focus'],
  [window, 'focus', () => 'window focused'],
  [window, 'resize', () => `window resized to ${innerWidth}x${innerHeight}`],
];

export class SpikeCatcher {
  spikes: Spike[] = [];
  /** Spikes past PROFILE.maxSpikes: counted, not kept. */
  dropped = 0;
  /** Browser events, all of them. */
  events: { t: number; what: string }[] = [];
  private on = false;
  private started = 0;
  private ring: FrameRecord[] = [];
  private open: Spike | null = null;
  private openUntil = 0;
  private last: FrameRecord | null = null;
  private mouse = { dx: 0, dy: 0, events: 0, largest: 0 };
  private notes: string[] = [];
  private marked = false;

  constructor() {
    addEventListener(
      'mousemove',
      (e) => {
        if (!this.on || !document.pointerLockElement) return;
        const m = this.mouse;
        m.dx += e.movementX;
        m.dy += e.movementY;
        m.events++;
        m.largest = Math.max(m.largest, Math.hypot(e.movementX, e.movementY));
      },
      { passive: true },
    );
    for (const [target, type, what] of BROWSER_EVENTS) target.addEventListener(type, () => this.note(what()));
  }

  start(started: number) {
    this.on = true;
    this.started = started;
    this.spikes = [];
    this.events = [];
    this.dropped = 0;
    this.ring = [];
    this.open = null;
    this.last = null;
  }

  stop() {
    this.on = false;
    this.open = null;
  }

  /** F2: you saw something; keep the last seconds. */
  mark() {
    this.marked = true;
  }

  /** Once a frame, with the frame so far; `typicalMs` is the frame time of late (the last second's). */
  frame(rec: Omit<FrameRecord, 'turn' | 'mouse' | 'notes'>, typicalMs: number) {
    if (!this.on) return;
    const prev = this.last;
    const turn = prev ? Math.hypot(wrapDeg(rec.yaw - prev.yaw), rec.pitch - prev.pitch) : 0;
    const r: FrameRecord = { ...rec, turn: round(turn), mouse: { ...this.mouse, largest: round(this.mouse.largest) } };
    if (this.notes.length) r.notes = this.notes;
    this.mouse = { dx: 0, dy: 0, events: 0, largest: 0 };
    this.notes = [];
    this.last = r;
    this.ring.push(r);
    while (this.ring[0].t < r.t - PROFILE.spikeBefore) this.ring.shift();

    const why: string[] = [];
    if (this.marked) why.push('marked (F2)');
    if (prev && rec.ms > Math.max(PROFILE.hitchMinMs, PROFILE.hitchFactor * typicalMs)) why.push(`slow frame: ${round(rec.ms)} ms (typical ${round(typicalMs)})`);
    if (turn > PROFILE.jumpDegrees) why.push(`camera jump: ${round(turn)}° in one frame`);
    if (r.mouse.largest > PROFILE.mouseSpikePx) why.push(`mouse spike: one event of ${r.mouse.largest} px`);
    this.marked = false;
    for (const w of why) this.trigger(r, w);
    if (this.open && r.t > this.openUntil) this.open = null;
    else if (this.open && !this.open.frames.includes(r)) this.open.frames.push(r);
  }

  private trigger(r: FrameRecord, why: string) {
    // While one is open, more reasons join it; it still ends on time, and a later one starts its own.
    if (this.open) {
      this.open.reasons.push({ t: r.t, why });
      return;
    }
    if (this.spikes.length >= PROFILE.maxSpikes) {
      this.dropped++;
      return;
    }
    this.open = { t: r.t, reasons: [{ t: r.t, why }], pos: r.pos, yaw: r.yaw, pitch: r.pitch, frames: [...this.ring] };
    this.openUntil = r.t + PROFILE.spikeAfter;
    this.spikes.push(this.open);
  }

  private note(what: string) {
    if (!this.on) return;
    this.notes.push(what);
    this.events.push({ t: round((performance.now() - this.started) / 1000), what });
  }
}

const round = (v: number) => Math.round(v * 100) / 100;
const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
