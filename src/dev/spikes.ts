import { PROFILE } from '../config';

// Spikes, for profiling mode (profiler.ts): every frame goes into a rolling
// buffer of the last few seconds, with the camera and the raw mouse input
// that came in for it. A spike (a frame that took far longer than those
// around it, the camera turning further in one frame than a hand would, one
// mouse event far larger than the rest, or F2 when you saw something) keeps
// that buffer and the second after it. Browser events that can upset the
// mouse (pointer lock lost or taken, focus, tab hidden, fullscreen) are
// logged and marked on their frame. A mouse spike also keeps the trail of the
// last raw events, as the page got them three ways (mousemove, pointermove
// with its coalesced events, pointerrawupdate), to tell a bad value from the
// OS from one the browser made.

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
  /** On a mouse spike: the raw events around it, oldest first. */
  trail?: TrailEvent[];
  notes?: string[];
}

/** One raw input event. */
interface TrailEvent {
  /** Which listener saw it: mousemove, pointermove or pointerrawupdate. */
  on: 'mouse' | 'pointer' | 'raw';
  /** Ms before the end of the frame it came in for. */
  ago: number;
  dx: number;
  dy: number;
  /** Ms between the event's own time stamp and the page getting it. */
  lag: number;
  /** A pointermove: its coalesced events' movements, kept only for a big one. */
  coalesced?: number[][];
  /** A pointermove: how many events it stands for. */
  n?: number;
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
  /** The last PROFILE.mouseTrail events of each kind, with when the page got them (performance.now). */
  private trail: Record<TrailEvent['on'], (TrailEvent & { at: number })[]> = { mouse: [], pointer: [], raw: [] };
  /** When the pointer lock was last taken (performance.now), or null. */
  private lockedAt: number | null = null;
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
        this.keep('mouse', e);
      },
      { passive: true },
    );
    // The same motion as pointer events: coalesced ones show whether a big value was one hardware event or a sum.
    const pointer = (type: string, on: TrailEvent['on']) =>
      addEventListener(
        type,
        (ev) => {
          if (!this.on || !document.pointerLockElement) return;
          const e = ev as PointerEvent;
          const events = on === 'pointer' ? e.getCoalescedEvents?.() ?? [] : [];
          const big = [e, ...events].some((c) => Math.hypot(c.movementX, c.movementY) > PROFILE.mouseSpikePx);
          this.keep(on, e, on === 'pointer' ? { n: events.length, coalesced: big ? events.map((c) => [c.movementX, c.movementY]) : undefined } : {});
        },
        { passive: true },
      );
    pointer('pointermove', 'pointer');
    pointer('pointerrawupdate', 'raw');
    for (const [target, type, what] of BROWSER_EVENTS) target.addEventListener(type, () => this.note(what()));
    document.addEventListener('pointerlockchange', () => (this.lockedAt = document.pointerLockElement ? performance.now() : null));
  }

  private keep(on: TrailEvent['on'], e: MouseEvent, more: Partial<TrailEvent> = {}) {
    const at = performance.now();
    const ring = this.trail[on];
    ring.push({ on, ago: 0, at, dx: e.movementX, dy: e.movementY, lag: at - e.timeStamp, ...more });
    if (ring.length > PROFILE.mouseTrail) ring.shift();
  }

  /** The raw events kept so far, oldest first, timed back from `now`. */
  private snapshot(now: number): TrailEvent[] {
    return Object.values(this.trail)
      .flat()
      .sort((a, b) => a.at - b.at)
      .map(({ at, ...e }) => ({ ...e, ago: round(now - at), lag: round(e.lag) }));
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
    this.trail = { mouse: [], pointer: [], raw: [] };
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
    if (r.mouse.largest > PROFILE.mouseSpikePx) r.trail = this.snapshot(performance.now());
    this.mouse = { dx: 0, dy: 0, events: 0, largest: 0 };
    this.notes = [];
    this.last = r;
    this.ring.push(r);
    while (this.ring[0].t < r.t - PROFILE.spikeBefore) this.ring.shift();

    const why: string[] = [];
    if (this.marked) why.push('marked (F2)');
    if (prev && rec.ms > Math.max(PROFILE.hitchMinMs, PROFILE.hitchFactor * typicalMs)) why.push(`slow frame: ${round(rec.ms)} ms (typical ${round(typicalMs)})`);
    if (turn > PROFILE.jumpDegrees) why.push(`camera jump: ${round(turn)}° in one frame`);
    if (r.mouse.largest > PROFILE.mouseSpikePx) {
      const since = this.lockedAt === null ? '' : `, ${round((performance.now() - this.lockedAt) / 1000)} s after the lock`;
      why.push(`mouse spike: one event of ${r.mouse.largest} px${since}`);
    }
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
