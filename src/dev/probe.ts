import type * as THREE from 'three';
import { ATMOS, LIGHTMAP, PROFILE, RENDER, SMOKE, VOLUMETRICS } from '../config';
import type { Level } from '../level/level';
import type { Lighting } from '../render/lighting';

// The probe (F9 while profiling): stand still and it turns the game's systems
// off one at a time, a few seconds each, and measures the frame with each
// gone. What a system costs is the baseline minus its step: the way to tell
// props from lights from the city when the browser can't time the GPU.

interface ProbeWorld {
  renderer: THREE.WebGLRenderer;
  level: Level;
  lighting: Lighting;
  lightFx: { root: THREE.Object3D };
  city(): THREE.Object3D;
}

/** A step: what it turns off, and how to put it back (null: nothing to turn off here). */
type Step = { name: string; apply(w: ProbeWorld): (() => void) | null };

const set = <T extends object, K extends keyof T>(o: T, k: K, v: T[K]) => {
  const was = o[k];
  o[k] = v;
  return () => void (o[k] = was);
};
const hide = (...objects: THREE.Object3D[]) => {
  const was = objects.map((o) => o.visible);
  objects.forEach((o) => (o.visible = false));
  return () => objects.forEach((o, i) => (o.visible = was[i]));
};

const STEPS: Step[] = [
  { name: 'baseline', apply: () => () => {} },
  { name: 'no city', apply: (w) => hide(w.city()) },
  // The level in two halves, both merged per tile: its paintable surfaces, and the rest of its props.
  { name: 'no prop surfaces', apply: (w) => hide(w.level.merged.surfaces) },
  { name: 'no prop details', apply: (w) => hide(w.level.merged.decor) },
  { name: 'no glows or beams', apply: (w) => hide(w.lightFx.root) },
  { name: 'no moon shadows', apply: () => (ATMOS.shadows ? set(ATMOS, 'shadows', false) : null) },
  { name: 'no wet highlights', apply: () => (LIGHTMAP.highlights ? set(LIGHTMAP, 'highlights', 0) : null) },
  { name: 'no real lights', apply: (w) => hide(...w.lighting.spots) },
  { name: 'no volumetrics', apply: () => (VOLUMETRICS.enabled ? set(VOLUMETRICS, 'enabled', false) : null) },
  {
    name: 'no rain or smoke',
    apply: () => {
      const rain = set(ATMOS, 'rain', false);
      const smoke = set(SMOKE, 'enabled', false);
      return () => (rain(), smoke());
    },
  },
  // A quarter of the pixels: if this one helps most, the GPU is fill-bound (pixel shaders), not slowed by draw calls.
  {
    name: 'half resolution',
    apply: (w) => {
      w.renderer.setPixelRatio(1 / (RENDER.pixelScale * 2));
      return () => w.renderer.setPixelRatio(1 / RENDER.pixelScale);
    },
  },
];

export interface ProbeResult {
  step: string;
  frames: number;
  /** Time between frames (the median: a step's shader compiles don't count), mean CPU and GPU time (all passes; null where the browser can't time it), ms. */
  frameMs: number;
  cpuMs: number;
  gpuMs: number | null;
  fps: number;
  calls: number;
  /** The frame's cost saved against the baseline (ms): the busier of CPU and GPU, since the frame time itself stops at the display's rate. */
  saved: number;
}

export class Probe {
  results: ProbeResult[] = [];
  private i = -1;
  private undo: (() => void) | null = null;
  private since = 0;
  private settled = 0;
  private baseCost = 0;
  private sum = { intervals: [] as number[], cpu: 0, gpu: 0, gpuFrames: 0, calls: 0 };

  constructor(private w: ProbeWorld) {}

  get running() {
    return this.i >= 0;
  }

  /** The step under way, for the status line. */
  get label() {
    return this.running ? `${STEPS[this.i].name} (${this.i + 1}/${STEPS.length})` : '';
  }

  start() {
    this.results = [];
    this.i = -1;
    this.next(performance.now());
  }

  /** Puts back whatever is off and stops (leaving the results so far). */
  cancel() {
    this.undo?.();
    this.undo = null;
    this.i = -1;
  }

  /** Once a frame. Returns true when the last step is done. */
  frame(now: number, frameMs: number, cpuMs: number, gpuMs: number | null, calls: number) {
    if (!this.running) return false;
    const t = (now - this.since) / 1000;
    // Settled: the time has passed and some frames have been drawn (a compile can hold up the first ones for seconds).
    if (t < PROFILE.probeSettle || ++this.settled < PROFILE.probeSettleFrames) return false;
    const s = this.sum;
    s.intervals.push(frameMs);
    s.cpu += cpuMs;
    s.calls += calls;
    if (gpuMs !== null) (s.gpu += gpuMs), s.gpuFrames++;
    if (t < PROFILE.probeSettle + PROFILE.probeMeasure || s.intervals.length < PROFILE.probeSettleFrames) return false;
    const n = s.intervals.length;
    const frame = s.intervals.sort((a, b) => a - b)[n >> 1];
    const cpu = s.cpu / n;
    const cost = Math.max(cpu, s.gpuFrames ? s.gpu / s.gpuFrames : 0);
    this.baseCost = this.results.length ? this.baseCost : cost;
    this.results.push({
      step: STEPS[this.i].name,
      frames: n,
      frameMs: round(frame),
      cpuMs: round(cpu),
      gpuMs: s.gpuFrames ? round(s.gpu / s.gpuFrames) : null,
      fps: round(1000 / frame),
      calls: Math.round(s.calls / n),
      saved: round(this.baseCost - cost),
    });
    this.next(now);
    return !this.running;
  }

  private next(now: number) {
    this.undo?.();
    this.undo = null;
    // Steps with nothing to turn off here (volumetrics already off) are skipped.
    while (++this.i < STEPS.length && !(this.undo = STEPS[this.i].apply(this.w)));
    if (this.i >= STEPS.length) this.i = -1;
    this.since = now;
    this.settled = 0;
    this.sum = { intervals: [], cpu: 0, gpu: 0, gpuFrames: 0, calls: 0 };
  }
}

const round = (v: number) => Math.round(v * 100) / 100;
