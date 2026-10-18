import { PERF_TEST } from './config.ts';
import { fasterGpuHow, type GpuInfo, type Os } from './gpu-name.ts';

// The performance test (Settings → Performance test, and npm run bench): the
// pause menu's city view drawn for a few seconds with the player's settings,
// the GPU timer on only then. It measures frame intervals, the CPU time a
// frame takes before its draw calls (a GPU that falls behind stalls the draw
// calls, which would read as slow code), GPU time and draw calls, then says
// in one message what limits the frame rate. Nothing measures otherwise, and
// nothing is kept. main.ts feeds it frames; perf-test-page.ts is its UI.
// No DOM here: tested in Node (scripts/perf-test.test.mjs).

/** Median, 95th and 99th percentile (ms). */
export interface Spread {
  p50: number;
  p95: number;
  p99: number;
}

export interface PerfResult {
  fps: number;
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
  calls: number;
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

  /** Drawing the test's view: main draws the city view and nothing of play. */
  get running() {
    return this.run !== null;
  }

  /** Starts measuring with the next frame; the result once done, null when stopped first (stop). */
  start(): Promise<PerfResult | null> {
    this.stop();
    return new Promise((done) => {
      this.run = { started: NaN, last: NaN, fromFrame: -1, toFrame: -1, ended: NaN, intervals: [], cpu: [], gpu: [], calls: 0, timerWas: this.timer.enabled, done };
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
      r.calls += calls;
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
  return {
    fps: (r.intervals.length * 1000) / Math.max(1, total),
    frames: r.intervals.length,
    frameMs: spread(r.intervals),
    cpuMs: spread(r.cpu),
    gpuMs: r.gpu.length ? spread(r.gpu) : null,
    calls: Math.round(r.calls / Math.max(1, r.intervals.length)),
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

/** Where the test ran: the GPU, the OS and browser, and FRAME RATE (0 = Max). */
export interface PerfContext {
  gpu: GpuInfo;
  os: Os;
  browser: Browser;
  maxFps: number;
}

/** The one message: a line, and what to do (if anything). Never "lower RESOLUTION". */
export function perfMessage(r: PerfResult, c: PerfContext): { lead: string; more?: string } {
  const frame = r.frameMs.p50;
  const cpu = r.cpuMs.p50;
  if (!r.gpuMs) return { lead: "GPU time isn't available in this browser.", more: 'The numbers are frames a second and CPU time only.' };
  const gpu = r.gpuMs.p50;
  // Frames far apart while neither side is busy: something holds the frame rate.
  const idle = PERF_TEST.cappedMs * PERF_TEST.idleShare;
  if (frame >= PERF_TEST.cappedMs && gpu < idle && cpu < idle) {
    if (c.maxFps && Math.abs(frame - 1000 / c.maxFps) < 1000 / c.maxFps / 10) return { lead: `Your Frame rate setting holds the game at ${c.maxFps} fps.`, more: 'The GPU and CPU have time to spare: Frame rate Max runs it faster.' };
    return { lead: `Something holds the game at ${Math.round(r.fps)} fps: the GPU and CPU have time to spare.`, more: powerSaver(c) };
  }
  if (c.gpu.integrated) return { lead: `${c.gpu.name} is built into the processor${gpu > PERF_TEST.slowMs ? ', and it is the limit' : ''}.`, more: fasterGpuHow(c.os) ?? undefined };
  if (gpu > PERF_TEST.slowMs) return { lead: 'Your GPU is the limit.', more: `It takes ${gpu.toFixed(1)} ms a frame: ${Math.floor(1000 / gpu)} fps at most.` };
  if (cpu > PERF_TEST.slowMs) return { lead: 'Your CPU is the limit.', more: `It takes ${cpu.toFixed(1)} ms a frame: ${Math.floor(1000 / cpu)} fps at most.` };
  return { lead: 'Runs well.' };
}

function powerSaver(c: PerfContext) {
  if (c.browser === 'chrome') return "Likely Chrome's Energy Saver: turn it off in chrome://settings/performance.";
  if (c.browser === 'edge') return "Likely Edge's efficiency mode: turn it off in edge://settings/system.";
  if (c.os === 'mac') return 'Likely Low Power Mode: turn it off in System Settings → Battery.';
  return "Likely your browser's or system's power saver: turn it off, or plug in.";
}

/** "GPU 12.3 ms · CPU 4.1 ms · 58 fps" (medians). */
export function perfNumbers(r: PerfResult) {
  return [r.gpuMs ? `GPU ${r.gpuMs.p50.toFixed(1)} ms` : null, `CPU ${r.cpuMs.p50.toFixed(1)} ms`, `${Math.round(r.fps)} fps`].filter(Boolean).join(' · ');
}
