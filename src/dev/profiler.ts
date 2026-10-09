import * as THREE from 'three';
import { ATMOS, LIGHTMAP, LEVELS, PAINT, PROFILE, RENDER, SKYLINE, SMOKE, VOLUMETRICS } from '../config';
import type { GpuTimer } from '../debug/gpu-timer';
import { download, stamp } from '../files';
import type { Level } from '../level/level';
import type { Player } from '../player';
import type { LightBaker } from '../render/bake/baker';
import type { Lighting } from '../render/lighting';
import { VERSION } from '../version';
import { Probe, type ProbeResult } from './probe';
import { SpikeCatcher } from './spikes';

// Profiling mode (F8, F3 → Test → Performance, or ?profile in the address to
// start with the game): play as usual while it records each second: frame
// times, where the CPU time went (laps that main marks through the frame), GPU
// time per pass where the browser can time it, draw calls, lights, and where
// you stood. Spikes (slow frames, camera jumps, mouse spikes, or F2 when you
// saw one) keep the seconds around them frame by frame (spikes.ts). Stopping
// downloads it all as JSON, a summary first. The probe (F9) adds what each
// system costs from where you stand (probe.ts). Recording costs a few clock
// reads and one small object a frame.

export interface ProfilerWorld {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  level: Level;
  lighting: Lighting;
  baker: LightBaker;
  player: Player;
  gpuTimer: GpuTimer;
  lightFx: { root: THREE.Object3D };
  city(): THREE.Object3D;
}

/** What a frame told the profiler, at its end. */
export interface ProfiledFrame {
  /** Real time since the last frame (ms). */
  interval: number;
  calls: number;
  triangles: number;
  /** 'play', 'paused' or 'build'. */
  state: string;
}

const PASSES = ['scene', 'volumetrics', 'post'];

/** One second of play. CPU and laps are ms per frame, averaged. */
interface Second {
  t: number;
  state: string;
  fps: number;
  frameMs: number;
  worstMs: number;
  cpuMs: number;
  laps: Record<string, number>;
  gpu: Record<string, number> | null;
  calls: number;
  triangles: number;
  realLights: number;
  bakePending: number;
  longTasks: number;
  heapMB: number | null;
  pos: number[];
  yaw: number;
}

export class Profiler {
  private probe: Probe;
  private spikes = new SpikeCatcher();
  /** The last full second's frame time (ms), what a slow frame is measured against. */
  private typicalMs = 0;
  private on = false;
  private started = 0;
  private last = 0;
  private laps: Record<string, number> = {};
  private intervals: number[] = [];
  private seconds: Second[] = [];
  private bucket = newBucket();
  private worst: { t: number; ms: number; cpuMs: number; laps: Record<string, number>; pos: number[]; state: string }[] = [];
  private probes: { t: number; pos: number[]; yaw: number; steps: ProbeResult[] }[] = [];
  private longTasks = 0;
  private observer: PerformanceObserver | null = null;
  private context: object = {};
  private badge = Object.assign(document.createElement('div'), { className: 'profiling', hidden: true });

  constructor(private w: ProfilerWorld) {
    this.probe = new Probe(w);
    document.body.append(this.badge);
  }

  get recording() {
    return this.on;
  }

  toggle() {
    if (this.on) this.stop();
    else this.start();
  }

  start() {
    this.on = true;
    this.started = performance.now();
    this.intervals = [];
    this.seconds = [];
    this.worst = [];
    this.probes = [];
    this.bucket = newBucket();
    this.longTasks = 0;
    this.typicalMs = 0;
    this.spikes.start(this.started);
    this.context = { ...this.environment(), at_start: this.census() };
    try {
      this.observer = new PerformanceObserver((l) => (this.longTasks += l.getEntries().length));
      this.observer.observe({ type: 'longtask', buffered: false });
    } catch {
      this.observer = null; // not in Safari or Firefox: long tasks show as null
    }
  }

  /** Stops and downloads the report. */
  stop() {
    this.probe.cancel();
    this.on = false;
    this.spikes.stop();
    this.observer?.disconnect();
    this.badge.hidden = true;
    const report = this.report();
    console.log('profile', report.summary);
    download(new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' }), `profile-${report.context.level}-${stamp(new Date())}.json`);
  }

  /** F9: the probe from where you stand (recording starts if it wasn't). */
  runProbe() {
    if (!this.on) this.start();
    if (this.probe.running) this.probe.cancel();
    else this.probe.start();
  }

  /** F2: you saw something (a jerk, a stall): the seconds before go in the report (recording starts if it wasn't). */
  mark() {
    if (!this.on) this.start();
    this.spikes.mark();
  }

  /** Start of a frame's CPU time. */
  begin() {
    if (this.on) this.last = performance.now();
  }

  /** The CPU time since the last mark goes to `name`. */
  lap(name: string) {
    if (!this.on) return;
    const now = performance.now();
    this.laps[name] = (this.laps[name] ?? 0) + now - this.last;
    this.last = now;
  }

  /** End of a frame. */
  frame(f: ProfiledFrame) {
    if (!this.on) return;
    this.lap('rest');
    const now = performance.now();
    const t = (now - this.started) / 1000;
    let cpu = 0;
    for (const k in this.laps) cpu += this.laps[k];
    // The first frame's interval is from before recording.
    if (this.intervals.length || this.bucket.frames) this.intervals.push(f.interval);
    const b = this.bucket;
    b.frames++;
    b.interval += f.interval;
    b.worst = Math.max(b.worst, f.interval);
    b.cpu += cpu;
    b.calls += f.calls;
    b.triangles += f.triangles;
    b.state = f.state;
    for (const k in this.laps) b.laps[k] = (b.laps[k] ?? 0) + this.laps[k];
    const gpu = this.w.gpuTimer.supported ? PASSES.map((p) => this.w.gpuTimer.ms[p] ?? 0) : null;
    if (gpu) gpu.forEach((ms, i) => (b.gpu[i] += ms));
    this.keepWorst(t, f, cpu);
    const gpuTotal = gpu ? gpu.reduce((a, v) => a + v, 0) : null;
    if (this.probe.frame(now, f.interval, cpu, gpuTotal, f.calls)) this.saveProbe(t);
    const p = this.w.player;
    const deg = THREE.MathUtils.radToDeg;
    const typical = this.typicalMs || f.interval;
    this.spikes.frame({ t: round(t), ms: round(f.interval), cpuMs: round(cpu), laps: rounded(this.laps), gpuMs: gpuTotal === null ? null : round(gpuTotal), calls: f.calls, state: f.state, pos: this.pos(), yaw: round(deg(p.yaw)), pitch: round(deg(p.pitch)) }, typical);
    for (const k in this.laps) this.laps[k] = 0;
    if (t - b.t >= 1) this.closeSecond(t);
    this.badge.hidden = false;
    const spikes = this.spikes.spikes.length + this.spikes.dropped;
    this.badge.textContent = `● PROFILING ${clock(t)} · ${spikes} SPIKE${spikes === 1 ? '' : 'S'} · F2 MARK · F8 STOP · F9 ${this.probe.running ? `PROBE: ${this.probe.label} · STAND STILL` : 'PROBE'}`;
  }

  private keepWorst(t: number, f: ProfiledFrame, cpu: number) {
    const list = this.worst;
    if (list.length >= PROFILE.worstFrames && f.interval <= list[list.length - 1].ms) return;
    list.push({ t: round(t), ms: round(f.interval), cpuMs: round(cpu), laps: rounded(this.laps), pos: this.pos(), state: f.state });
    list.sort((a, b) => b.ms - a.ms);
    list.length = Math.min(list.length, PROFILE.worstFrames);
  }

  private closeSecond(t: number) {
    const b = this.bucket;
    const n = b.frames;
    const p = this.w.player;
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    this.seconds.push({
      t: Math.round(b.t),
      state: b.state,
      fps: round((n * 1000) / b.interval),
      frameMs: round(b.interval / n),
      worstMs: round(b.worst),
      cpuMs: round(b.cpu / n),
      laps: rounded(Object.fromEntries(Object.entries(b.laps).map(([k, v]) => [k, v / n]))),
      gpu: this.w.gpuTimer.supported ? rounded(Object.fromEntries(PASSES.map((pass, i) => [pass, b.gpu[i] / n]))) : null,
      calls: Math.round(b.calls / n),
      triangles: Math.round(b.triangles / n),
      realLights: this.w.lighting.active,
      bakePending: this.w.baker.stats.pending,
      longTasks: this.observer ? this.longTasks : -1,
      heapMB: heap ? Math.round(heap.usedJSHeapSize / 1048576) : null,
      pos: this.pos(),
      yaw: Math.round(THREE.MathUtils.radToDeg(p.yaw)),
    });
    this.longTasks = 0;
    this.typicalMs = b.interval / n;
    this.bucket = newBucket(t);
  }

  private saveProbe(t: number) {
    this.probes.push({ t: round(t), pos: this.pos(), yaw: Math.round(THREE.MathUtils.radToDeg(this.w.player.yaw)), steps: this.probe.results });
  }

  private pos() {
    return this.w.player.position.toArray().map((v) => Math.round(v * 10) / 10);
  }

  /** The machine, the browser and the settings that matter for speed. */
  private environment() {
    const r = this.w.renderer;
    const gl = r.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const nav = navigator as Navigator & { deviceMemory?: number };
    return {
      version: VERSION,
      level: new URLSearchParams(location.search).get('level') ?? LEVELS.start,
      date: new Date().toISOString(),
      browser: navigator.userAgent,
      cores: navigator.hardwareConcurrency,
      memoryGB: nav.deviceMemory ?? null,
      gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuTimer: this.w.gpuTimer.supported,
      window: [innerWidth, innerHeight],
      devicePixelRatio: devicePixelRatio,
      drawingBuffer: [size.x, size.y],
      settings: { RENDER, VOLUMETRICS, LIGHTMAP, shadows: ATMOS.shadows, spotShadows: ATMOS.spotShadows, shadowRange: ATMOS.shadowRange, rain: ATMOS.rain, smoke: SMOKE.enabled, cityRadius: SKYLINE.radius, paintTexelsPerMeter: PAINT.texelsPerMeter },
    };
  }

  /** What's in the scene: objects by kind, the level's props and lamps, GPU memory. */
  private census() {
    const objects: Record<string, number> = {};
    let instances = 0;
    let vertices = 0;
    const materials = new Set<string>();
    this.w.scene.traverse((o) => {
      if (!o.visible) return;
      objects[o.type] = (objects[o.type] ?? 0) + 1;
      if (o instanceof THREE.InstancedMesh) instances += o.count;
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
        vertices += o.geometry.attributes.position?.count ?? 0;
        for (const m of [o.material].flat()) materials.add(m.uuid);
      }
    });
    const props: Record<string, number> = {};
    for (const p of this.w.level.toJSON().props) props[p.type] = (props[p.type] ?? 0) + 1;
    const top = Object.entries(props).sort((a, b) => b[1] - a[1]);
    const info = this.w.renderer.info;
    return {
      props: top.reduce((n, [, c]) => n + c, 0),
      propsByType: Object.fromEntries(top),
      lamps: this.w.level.lights.length,
      sceneObjects: objects,
      instances,
      vertices,
      materials: materials.size,
      programs: info.programs?.length ?? null,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      bakedLightMB: round(this.w.baker.stats.textureBytes / 1048576),
    };
  }

  private report() {
    const all = [...this.intervals].sort((a, b) => a - b);
    const at = (q: number) => round(all[Math.min(all.length - 1, Math.floor(q * all.length))] ?? 0);
    const playing = this.seconds.filter((s) => s.state === 'play');
    const avg = (pick: (s: Second) => number, list = playing.length ? playing : this.seconds) => round(list.reduce((a, s) => a + pick(s), 0) / Math.max(1, list.length));
    const lapNames = [...new Set(this.seconds.flatMap((s) => Object.keys(s.laps)))];
    const total = all.reduce((a, v) => a + v, 0);
    const summary = {
      seconds: Math.round(total / 1000),
      frames: all.length,
      fps: round((all.length * 1000) / Math.max(1, total)),
      frameMs: { median: at(0.5), p95: at(0.95), p99: at(0.99), worst: at(1) },
      share: { over16ms: share(all, 16.7), over22ms: share(all, 22.2), over33ms: share(all, 33.4), over50ms: share(all, 50) },
      whilePlaying: {
        cpuMs: avg((s) => s.cpuMs),
        laps: Object.fromEntries(lapNames.map((k) => [k, avg((s) => s.laps[k] ?? 0)])),
        gpuMs: this.w.gpuTimer.supported ? Object.fromEntries(PASSES.map((p) => [p, avg((s) => s.gpu?.[p] ?? 0)])) : 'not measurable in this browser: see the probes',
        calls: avg((s) => s.calls),
        triangles: Math.round(avg((s) => s.triangles)),
      },
      verdict: verdict(avg((s) => s.frameMs), avg((s) => s.cpuMs), this.w.gpuTimer.supported ? avg((s) => PASSES.reduce((a, p) => a + (s.gpu?.[p] ?? 0), 0)) : null),
      spikes: { kept: this.spikes.spikes.length, notKept: this.spikes.dropped, byReason: countBy(this.spikes.spikes.flatMap((s) => s.reasons.map((r) => r.why.split(':')[0]))) },
      slowestSeconds: [...playing].sort((a, b) => a.fps - b.fps).slice(0, 5).map(({ t, fps, cpuMs, calls, pos, yaw }) => ({ t, fps, cpuMs, calls, pos, yaw })),
    };
    return { summary, context: { ...(this.context as ReturnType<Profiler['environment']>), at_end: this.census() }, probes: this.probes, spikes: this.spikes.spikes, browserEvents: this.spikes.events, worstFrames: this.worst, seconds: this.seconds };
  }
}

/** Which side holds the frame up, from the averages while playing. */
function verdict(frameMs: number, cpuMs: number, gpuMs: number | null) {
  if (!frameMs) return 'no frames while playing';
  const cpu = `CPU ${cpuMs.toFixed(1)} of ${frameMs.toFixed(1)} ms a frame`;
  if (gpuMs === null) return `${cpu}; GPU not measurable here: ${cpuMs > frameMs * 0.7 ? 'CPU-bound' : 'the rest is the GPU or waiting for the display; see the probes'}`;
  const gpu = `GPU ${gpuMs.toFixed(1)} ms`;
  if (gpuMs > frameMs * 0.7 && gpuMs > cpuMs) return `${cpu}, ${gpu}: GPU-bound`;
  if (cpuMs > frameMs * 0.7) return `${cpu}, ${gpu}: CPU-bound`;
  return `${cpu}, ${gpu}: neither busy all frame (waiting for the display, or a frame rate limit)`;
}

const countBy = (list: string[]) => list.reduce<Record<string, number>>((o, k) => ((o[k] = (o[k] ?? 0) + 1), o), {});

function newBucket(t = 0) {
  return { t, frames: 0, interval: 0, worst: 0, cpu: 0, calls: 0, triangles: 0, state: '', laps: {} as Record<string, number>, gpu: PASSES.map(() => 0) };
}

const round = (v: number) => Math.round(v * 100) / 100;
const rounded = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));
const share = (sorted: number[], ms: number) => round(sorted.filter((v) => v > ms).length / Math.max(1, sorted.length));
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
