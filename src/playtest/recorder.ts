import { PLAYTEST } from '../config';
import { Histogram, probe, round, Samples } from './probe';

// The playtest's frame numbers (docs/playtest.md, Frame and CPU, GPU and
// rendering, Spray particles): each frame adds its times and counts to fixed
// buffers; once a window they become percentiles, histograms and the worst
// frame, whole. Long animation frames (Chromium) say what held the main thread
// that the game's own laps can't see.

/** The game loop's sections, as F3 laps them (main.ts). */
const LAPS = ['player', 'lights', 'world', 'tools', 'net', 'tags', 'level', 'bake', 'paint + hud', 'render'] as const;

/** One frame as the game loop hands it over. */
export interface FrameIn {
  /** Since the last frame, and the CPU time of this one (ms). */
  interval: number;
  cpu: number;
  /** GPU ms (smoothed) per pass, or null where it can't be measured. */
  gpu: Record<string, number> | null;
  calls: number;
  triangles: number;
  uploads: number;
  uploadBytes: number;
  ownParticles: number;
  otherParticles: number;
  /** Other players shown, and on screen. */
  shown: number;
  inView: number;
  messages: number;
  programs: number;
  playing: boolean;
}

/** A frame's lap ends (ms since the frame began), in LAPS order. */
const lapEnds = new Float64Array(LAPS.length);

export class FrameRecorder {
  private interval = new Samples();
  private cpu = new Samples();
  private gpu = new Samples();
  private calls = new Samples();
  private triangles = new Samples();
  private uploadBytes = new Samples();
  private particles = { own: new Samples(), others: new Samples() };
  private sprayers = new Samples();
  private inView = new Samples();
  private laps = LAPS.map(() => new Samples());
  private hist = new Histogram(PLAYTEST.frameBuckets);
  private over = { 33: 0, 50: 0, 100: 0 };
  private notPlaying = 0;
  private skipped = 0;
  private gpuPasses: Record<string, number> = {};
  private uploads = 0;
  private worst: Record<string, unknown> | null = null;
  private worstMs = 0;
  private frameStart = 0;
  /** A visibility change since the last frame: that interval spans the time hidden, not a frame. */
  private hiddenGap = false;
  private loaf = { n: 0, total: 0, blocking: 0, longest: null as Record<string, unknown> | null };
  /** A hitch to send: the recorder only notes it, playtest.ts sends it after the frame. */
  hitch: Record<string, unknown> | null = null;

  constructor() {
    document.addEventListener('visibilitychange', () => (this.hiddenGap = true));
    this.observeLongFrames();
  }

  /** The frame starts (performance.now()). */
  begin(t0: number) {
    this.frameStart = t0;
    lapEnds.fill(-1);
  }

  lap(name: string) {
    const i = LAPS.indexOf(name as (typeof LAPS)[number]);
    if (i >= 0) lapEnds[i] = performance.now() - this.frameStart;
  }

  frame(f: FrameIn, sprayers: number) {
    if (this.hiddenGap) {
      this.hiddenGap = false;
      this.skipped++;
      return;
    }
    this.interval.add(f.interval);
    this.hist.add(f.interval);
    for (const k of [33, 50, 100] as const) if (f.interval > k) this.over[k]++;
    this.cpu.add(f.cpu);
    if (!f.playing) this.notPlaying++;
    const gpuTotal = f.gpu ? Object.values(f.gpu).reduce((a, b) => a + b, 0) : null;
    if (gpuTotal !== null) this.gpu.add(gpuTotal);
    if (f.gpu) this.gpuPasses = f.gpu;
    this.calls.add(f.calls);
    this.triangles.add(f.triangles);
    this.uploads += f.uploads;
    this.uploadBytes.add(f.uploadBytes);
    this.particles.own.add(f.ownParticles);
    this.particles.others.add(f.otherParticles);
    this.sprayers.add(sprayers);
    this.inView.add(f.inView);
    let prev = 0;
    const laps: Record<string, number> = {};
    LAPS.forEach((name, i) => {
      if (lapEnds[i] < 0) return;
      const ms = lapEnds[i] - prev;
      prev = lapEnds[i];
      this.laps[i].add(ms);
      laps[name] = round(ms);
    });
    const ms = Math.max(f.interval, f.cpu);
    if (ms > this.worstMs || f.interval > PLAYTEST.hitchMs) {
      const frame = { interval: round(f.interval), cpu: round(f.cpu), gpu: gpuTotal === null ? null : round(gpuTotal), laps, calls: f.calls, triangles: f.triangles, uploads: f.uploads, uploadBytes: f.uploadBytes, ownParticles: f.ownParticles, otherParticles: f.otherParticles, sprayers, shown: f.shown, inView: f.inView, messages: f.messages, programs: f.programs, playing: f.playing };
      if (ms > this.worstMs) [this.worstMs, this.worst] = [ms, frame];
      if (f.interval > PLAYTEST.hitchMs) this.hitch = frame;
    }
  }

  /** The window's numbers, cleared. */
  take() {
    const s = <T>(x: Samples): T => x.summary() as T;
    const out = {
      interval: s(this.interval),
      fps: this.interval.n ? round((1000 * this.interval.n) / this.interval.sum) : null,
      hist: this.hist.take(),
      over: { ...this.over },
      cpu: s(this.cpu),
      laps: Object.fromEntries(LAPS.map((n, i) => [n, s(this.laps[i])])),
      worst: this.worst,
      notPlaying: this.notPlaying,
      skipped: this.skipped,
      gpu: s(this.gpu),
      gpuPasses: Object.fromEntries(Object.entries(this.gpuPasses).map(([k, v]) => [k, round(v)])),
      calls: s(this.calls),
      triangles: s(this.triangles),
      uploads: this.uploads,
      uploadBytes: s(this.uploadBytes),
      particles: {
        own: s(this.particles.own),
        others: s(this.particles.others),
        ownAsked: probe.ownAsked,
        ownLost: probe.ownAsked - probe.ownLaunched,
        othersAsked: probe.othersAsked,
        othersLost: probe.othersAsked - probe.othersLaunched,
      },
      sprayers: s(this.sprayers),
      inView: s(this.inView),
      longFrames: { ...this.loaf, total: round(this.loaf.total), blocking: round(this.loaf.blocking) },
    };
    for (const x of [this.interval, this.cpu, this.gpu, this.calls, this.triangles, this.uploadBytes, this.particles.own, this.particles.others, this.sprayers, this.inView, ...this.laps]) x.clear();
    this.over = { 33: 0, 50: 0, 100: 0 };
    this.notPlaying = this.skipped = this.uploads = this.worstMs = 0;
    this.worst = null;
    this.loaf = { n: 0, total: 0, blocking: 0, longest: null };
    probe.ownAsked = probe.ownLaunched = probe.othersAsked = probe.othersLaunched = 0;
    return out;
  }

  /** Long animation frames (Chromium 123+), else long tasks: count, time, and the longest with what ran in it. */
  private observeLongFrames() {
    const types = PerformanceObserver.supportedEntryTypes ?? [];
    const type = types.includes('long-animation-frame') ? 'long-animation-frame' : types.includes('longtask') ? 'longtask' : null;
    if (!type) return;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & LoafLike)[]) {
        const l = this.loaf;
        l.n++;
        l.total += e.duration;
        l.blocking += e.blockingDuration ?? 0;
        if (l.longest && (l.longest.duration as number) >= e.duration) continue;
        l.longest = {
          type,
          duration: round(e.duration),
          blocking: e.blockingDuration === undefined ? undefined : round(e.blockingDuration),
          styleLayout: e.styleAndLayoutStart ? round(e.startTime + e.duration - e.styleAndLayoutStart) : undefined,
          render: e.renderStart ? round(e.startTime + e.duration - e.renderStart) : undefined,
          scripts: e.scripts?.slice(0, 5).map((x) => ({ invoker: x.invoker, fn: x.sourceFunctionName, src: x.sourceURL?.split('/').pop(), ms: round(x.duration) })),
        };
      }
    }).observe({ type, buffered: false });
  }
}

interface LoafLike {
  blockingDuration?: number;
  styleAndLayoutStart?: number;
  renderStart?: number;
  scripts?: { invoker?: string; sourceFunctionName?: string; sourceURL?: string; duration: number }[];
}
