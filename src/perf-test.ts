import { PERF_TEST } from './config.ts';
import { fasterGpuHow, type GpuInfo, type Os } from './gpu-name.ts';

// The performance test (Settings → Performance test, and npm run bench): a
// camera flying a fixed path over the roof for about 10 s with the player's
// settings (render/title-view.ts), the GPU timer on only then. It measures
// frame intervals (average and 1% low fps), the CPU time a frame takes before
// its draw calls (a GPU that falls behind stalls the draw calls, which would
// read as slow code), GPU time and draw calls, live while it runs; then a
// tier from the fps and a tip: what limits the frame rate, and what to change.
// Nothing measures otherwise, and nothing is kept. main.ts feeds it frames;
// perf-test-page.ts is its UI.
// No DOM here: tested in Node (scripts/perf-test.test.mjs).

/** Median, 95th and 99th percentile (ms). */
export interface Spread {
  p50: number;
  p95: number;
  p99: number;
}

export interface PerfResult {
  fps: number;
  /** 1% low: the fps of the slowest 1% of frames. */
  low: number;
  frames: number;
  frameMs: Spread;
  cpuMs: Spread;
  /** Null without a GPU timer (Firefox, Safari) or when no frame could be timed. */
  gpuMs: Spread | null;
  /** Draw calls a frame (average). */
  calls: number;
}

/** What the test needs of the GPU timer (src/debug/gpu-timer.ts). */
export interface FrameTimer {
  readonly supported: boolean;
  enabled: boolean;
  readonly frame: number;
  onFrame: ((frame: number, ms: number) => void) | null;
}

/** While it runs: how far it is (0..1), and the last PERF_TEST.liveSeconds' fps, CPU and GPU ms and draw calls (null before the first measured frame). */
export interface Live {
  progress: number;
  fps: number | null;
  cpuMs: number | null;
  gpuMs: number | null;
  calls: number | null;
}

interface Run {
  /** rAF time of its first frame; NaN before it. */
  started: number;
  last: number;
  /** The timer's frame number when measuring began (-1: warming up), and when it ended. */
  fromFrame: number;
  toFrame: number;
  /** When measuring ended (rAF time): the GPU's last results are awaited until gpuWait after it. */
  ended: number;
  intervals: number[];
  cpu: number[];
  gpu: number[];
  calls: number[];
  /** The timer's state before, put back after. */
  timerWas: boolean;
  done: (r: PerfResult | null) => void;
}

export class PerfTest {
  private run: Run | null = null;
  // Plain fields, not parameter properties: Node runs this file as it is (type stripping).
  private timer: FrameTimer;

  constructor(timer: FrameTimer) {
    this.timer = timer;
  }

  /** Drawing the test's view: main draws its flight and nothing of play. */
  get running() {
    return this.run !== null;
  }

  /** Starts measuring with the next frame; the result once done, null when stopped first (stop). */
  start(): Promise<PerfResult | null> {
    this.stop();
    return new Promise((done) => {
      this.run = { started: NaN, last: NaN, fromFrame: -1, toFrame: -1, ended: NaN, intervals: [], cpu: [], gpu: [], calls: [], timerWas: this.timer.enabled, done };
      this.timer.onFrame = (frame, ms) => {
        const r = this.run;
        if (r && r.fromFrame >= 0 && frame >= r.fromFrame && (r.toFrame < 0 || frame < r.toFrame)) r.gpu.push(ms);
      };
    });
  }

  /** Esc: no result. */
  stop() {
    this.finish(null);
  }

  /** How far through the run a frame at rAF time `time` is (0..1): where the camera is on its path. */
  progress(time: number) {
    const r = this.run;
    if (!r || Number.isNaN(r.started)) return 0;
    return Math.min(1, (time - r.started) / 1000 / (PERF_TEST.warmup + PERF_TEST.seconds));
  }

  /** The numbers so far, for the popup while it runs; null when not running. */
  live(): Live | null {
    const r = this.run;
    if (!r) return null;
    // The frames of the last liveSeconds.
    let n = 0;
    for (let ms = 0; n < r.intervals.length && ms < PERF_TEST.liveSeconds * 1000; n++) ms += r.intervals[r.intervals.length - 1 - n];
    const mean = (list: number[], k = n) => (k && list.length ? list.slice(-k).reduce((a, v) => a + v, 0) / Math.min(k, list.length) : null);
    const ms = mean(r.intervals);
    return { progress: this.progress(r.last), fps: ms && 1000 / ms, cpuMs: mean(r.cpu), gpuMs: mean(r.gpu), calls: mean(r.calls) };
  }

  /** Before a frame's draw calls: the GPU timer runs while the test does (the F3 panel turns it off otherwise). */
  beforeDraw() {
    if (this.run) this.timer.enabled = true;
  }

  /** After a frame is drawn: `time` its rAF time, `cpuMs` its CPU time before the draw calls, `calls` its draw calls. */
  frame(time: number, cpuMs: number, calls: number) {
    const r = this.run;
    if (!r) return;
    if (Number.isNaN(r.started)) r.started = time;
    const t = (time - r.started) / 1000;
    if (r.fromFrame < 0) {
      // Warming up; the next frame is the first measured (the timer counts this one as drawn once polled).
      if (t >= PERF_TEST.warmup) r.fromFrame = this.timer.frame;
    } else if (r.toFrame < 0) {
      r.intervals.push(time - r.last);
      r.cpu.push(cpuMs);
      r.calls.push(calls);
      if (t >= PERF_TEST.warmup + PERF_TEST.seconds) {
        r.toFrame = this.timer.frame;
        r.ended = time;
      }
    }
    r.last = time;
    // Measured: done once every measured frame's GPU time is in, or the wait is over.
    if (r.toFrame >= 0 && (!this.timer.supported || r.gpu.length >= r.intervals.length || time - r.ended >= PERF_TEST.gpuWait * 1000)) this.finish(result(r));
  }

  private finish(res: PerfResult | null) {
    const r = this.run;
    if (!r) return;
    this.run = null;
    this.timer.onFrame = null;
    this.timer.enabled = r.timerWas;
    r.done(res);
  }
}

function result(r: Run): PerfResult {
  const total = r.intervals.reduce((a, v) => a + v, 0);
  const slowest = [...r.intervals].sort((a, b) => b - a).slice(0, Math.ceil(r.intervals.length / 100));
  return {
    fps: (r.intervals.length * 1000) / Math.max(1, total),
    low: (slowest.length * 1000) / Math.max(1, slowest.reduce((a, v) => a + v, 0)),
    frames: r.intervals.length,
    frameMs: spread(r.intervals),
    cpuMs: spread(r.cpu),
    gpuMs: r.gpu.length ? spread(r.gpu) : null,
    calls: Math.round(r.calls.reduce((a, v) => a + v, 0) / Math.max(1, r.calls.length)),
  };
}

export function spread(list: number[]): Spread {
  const s = [...list].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

export type Browser = 'chrome' | 'edge' | 'safari' | 'other';

/** This browser, for where its power saver is: Edge and Chrome by name (other Chromium browsers read as other), Safari. */
export function browserOf(ua: string): Browser {
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\/|Brave|Vivaldi|YaBrowser|SamsungBrowser/.test(ua)) return 'other';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && !/Chromium|Firefox/.test(ua)) return 'safari';
  return 'other';
}

/** The settings a test ran with (Settings.tested): the popup shows them, and the tip's advice follows them. */
export interface TestedSettings {
  /** "1920×1080": the size drawn. */
  size: string;
  volumetrics: string;
  paint: string;
  city: string;
  volOff: boolean;
  volHigh: boolean;
  /** The next lower Resolution's scale (2: "1/2"), null at the lowest. */
  nextScale: number | null;
  cityLow: boolean;
}

/** Where the test ran: the GPU, the OS and browser, FRAME RATE (0 = Max) and the settings. */
export interface PerfContext {
  gpu: GpuInfo;
  os: Os;
  browser: Browser;
  maxFps: number;
  settings: TestedSettings;
}

/** The tier slider's steps, from the average fps. */
export const TIERS = ['Stutters', 'Playable', 'Smooth', 'Very smooth'];

/** How far along the tier slider an average fps is (0..1): straight between PERF_TEST.tierFps' points. */
export function tierShare(fps: number) {
  const p = PERF_TEST.tierFps;
  const step = 1 / (p.length - 1);
  if (fps <= p[0]) return 0;
  for (let i = 1; i < p.length; i++) if (fps <= p[i]) return (i - 1 + (fps - p[i - 1]) / (p[i] - p[i - 1])) * step;
  return 1;
}

/** The TIERS index of an average fps as shown, rounded: under 30 Stutters, 30–60 Playable, 60–100 Smooth, 100 and over Very smooth. */
export function tierOf(fps: number) {
  return Math.min(TIERS.length - 1, Math.floor(tierShare(Math.round(fps)) * TIERS.length));
}

/** What to change: a lead (what limits the frame rate) and the advice. */
export function perfTip(r: PerfResult, c: PerfContext): { lead: string; more: string } {
  const s = c.settings;
  const frame = r.frameMs.p50;
  const cpu = r.cpuMs.p50;
  const gpu = r.gpuMs?.p50;
  // Frames further apart than GPU and CPU need: the display's refresh, FRAME RATE or a power saver holds them.
  const idle = Math.min(frame, PERF_TEST.cappedMs) * PERF_TEST.idleShare;
  const held = gpu !== undefined && gpu < idle && cpu < idle;
  if (held && c.maxFps && Math.abs(frame - 1000 / c.maxFps) < 1000 / c.maxFps / 10) return { lead: `Your Frame rate setting holds the game at ${c.maxFps} FPS.`, more: 'The processor and video card have time to spare: Frame rate Max runs it faster.' };
  if (held && frame >= PERF_TEST.cappedMs) return { lead: `Something holds the game at ${Math.round(r.fps)} FPS: the processor and video card have time to spare.`, more: powerSaver(c) };
  if (held || tierOf(r.fps) === TIERS.length - 1) return { lead: 'Room to spare.', more: s.volHigh ? 'Even the highest settings run smoothly.' : 'Volumetrics can go a step higher.' };
  if (gpu === undefined) return { lead: "This browser doesn't time the video card.", more: 'Lower Volumetrics first, then Resolution or City detail.' };
  if (gpu > cpu * PERF_TEST.limitRatio) {
    const more = !s.volOff ? 'Lower Volumetrics first, then Resolution.' : s.nextScale ? `Resolution 1/${s.nextScale} would help most.` : 'Everything it draws is already at its lowest.';
    // A laptop's browser may draw on its built-in GPU while a faster one idles: how to switch.
    return { lead: 'The video card is the limit.', more: [more, c.gpu.integrated ? fasterGpuHow(c.os) : null].filter(Boolean).join(' ') };
  }
  if (cpu > gpu * PERF_TEST.limitRatio) return { lead: 'The processor is the limit.', more: s.cityLow ? 'Closing other tabs may help.' : 'Lower City detail first.' };
  return { lead: 'The processor and video card are evenly loaded.', more: 'Lower Resolution or City detail.' };
}

function powerSaver(c: PerfContext) {
  if (c.browser === 'chrome') return "Likely Chrome's Energy Saver: turn it off in chrome://settings/performance.";
  if (c.browser === 'edge') return "Likely Edge's efficiency mode: turn it off in edge://settings/system.";
  if (c.os === 'mac') return 'Likely Low Power Mode: turn it off in System Settings → Battery.';
  return "Likely your browser's or system's power saver: turn it off, or plug in.";
}
