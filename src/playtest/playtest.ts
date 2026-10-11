import * as THREE from 'three';
import { PAINT, PLAYTEST, RENDER, VOLUMETRICS } from '../config';
import type { GpuTimer } from '../debug/gpu-timer';
import type { Multiplayer } from '../net/multiplayer';
import { PROTOCOL } from '../net/protocol';
import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import type { Tools } from '../tools/tools';
import { VERSION } from '../version';
import { LinkTap } from './link-tap';
import { identity, showNotice } from './notice';
import { probe, round } from './probe';
import { FrameRecorder } from './recorder';

// The playtest build (docs/playtest.md): the notice on first launch, then in a
// multiplayer session whose server keeps reports (its welcome says so), one
// report every PLAYTEST.every seconds, a hitch report right after a frame over
// PLAYTEST.hitchMs, and a mark on F9 (Shift+F9: the next phase). Single player
// sends nothing. Nothing on screen changes.

interface PlaytestContext {
  renderer: THREE.WebGLRenderer;
  gpuTimer: GpuTimer;
  camera: THREE.Camera;
  paint: PaintSystem;
  drips: PaintDrips;
  tools: Tools;
  net: Multiplayer;
  levelName: () => string;
  /** Texture bytes outside the paint pages: the baked light's, and the rest (render/texture-bytes.ts). */
  textureBytes: () => { bake: number; fixed: number };
}

/** What the game loop calls: the frame's start, its laps (main.ts lap()), and its end. */
export interface Playtest {
  /** Every animation frame callback, also those the frame limit skips. */
  raf(time: number): void;
  begin(t0: number): void;
  lap(name: string): void;
  frame(f: { t0: number; interval: number; calls: number; triangles: number; playing: boolean }): void;
}

const projection = new THREE.Matrix4();
const frustum = new THREE.Frustum();

export function startPlaytest(g: PlaytestContext): Playtest {
  showNotice();
  const tap = new LinkTap();
  g.net.tap = tap;
  tap.peers = () => g.net.peersHere;
  const rec = new FrameRecorder();
  const errors: Record<string, unknown>[] = [];
  let errorCount = 0;
  const events: Record<string, unknown>[] = [];
  const event = (e: string, detail: Record<string, unknown> = {}) => events.length < PLAYTEST.keepEvents && events.push({ e, at: Math.round(performance.now()), ...detail });
  const error = (kind: string, msg: unknown, stack?: string) => {
    errorCount++;
    if (errors.length < PLAYTEST.keepErrors) errors.push({ kind, msg: String(msg).slice(0, 300), stack: stack?.slice(0, 600), at: Math.round(performance.now()) });
  };
  window.addEventListener('error', (e) => error('error', e.message, (e.error as Error | undefined)?.stack));
  window.addEventListener('unhandledrejection', (e) => error('rejection', (e.reason as Error)?.message ?? e.reason, (e.reason as Error)?.stack));
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      error(`console.${level}`, args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      orig(...args);
    };
  }
  const canvas = g.renderer.domElement;
  canvas.addEventListener('webglcontextlost', () => event('contextlost'));
  canvas.addEventListener('webglcontextrestored', () => event('contextrestored'));
  document.addEventListener('visibilitychange', () => event(document.hidden ? 'hidden' : 'shown'));
  window.addEventListener('blur', () => event('blur'));
  window.addEventListener('focus', () => event('focus'));
  document.addEventListener('fullscreenchange', () => event('fullscreen', { on: !!document.fullscreenElement }));

  let battery: { charging: boolean; level: number } | null = null;
  void (navigator as { getBattery?: () => Promise<{ charging: boolean; level: number; addEventListener(t: string, f: () => void): void }> }).getBattery?.().then((b) => {
    const read = () => (battery = { charging: b.charging, level: round(b.level) });
    read();
    b.addEventListener('chargingchange', () => (read(), event('battery', { ...battery })));
  });

  let phase = 0;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F9') return;
    e.preventDefault();
    if (e.shiftKey) phase++;
    send({ kind: 'mark', phase, next: e.shiftKey });
  });

  const fakeHitch = new URLSearchParams(location.search).has('playtest-hitch');
  let nextFake = performance.now() + PLAYTEST.fakeHitchEvery * 1000;
  let nextReport = 0;
  let seq = 0;
  let hitches = 0;
  let hitchesSent = 0;
  let programs = programCount(g.renderer);
  let shownSettings = '';
  let windowStart = performance.now();
  let self = 0;
  /** The last report's own time (ms), built between frames. */
  let reportMs = 0;

  function send(data: Record<string, unknown>) {
    g.net.report({ ...data, device: identity.device, load: identity.load, clock: Math.round(performance.now()) });
  }

  function report() {
    const t = performance.now();
    const env = tap.welcomed ? environment(g) : undefined;
    tap.welcomed = false;
    const settingsNow = JSON.stringify(settings());
    if (settingsNow !== shownSettings && shownSettings) event('settings', JSON.parse(settingsNow));
    shownSettings = settingsNow;
    const remotes = (g.net.stats?.players ?? []).map((p) => {
      const w = p.window;
      const out = { id: p.id, name: p.name, look: p.look, visible: p.visible, delay: Math.round(p.delay * 1000), jitter: Math.round(p.jitter * 1000), snaps: w.snaps, gaps: w.gaps, maxGap: Math.round(w.maxGap), guess: round(w.guess), teleports: w.teleports, silent: w.silent };
      Object.assign(w, { snaps: 0, gaps: 0, maxGap: 0, guess: 0, teleports: 0, silent: 0 });
      return out;
    });
    const mem = (performance as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const info = g.renderer.info;
    const extra = g.textureBytes();
    const data = {
      kind: 'window',
      seq,
      vpn: identity.vpn,
      dur: Math.round(t - windowStart),
      env,
      frames: rec.take(),
      hitches,
      net: tap.take(),
      remotes,
      arrivals: probe.arrivals.take(),
      corrections: probe.corrections,
      paint: {
        pages: g.paint.gpu.textureCount,
        pageMB: round(g.paint.gpu.textureBytes / 2 ** 20),
        painted: g.paint.surfaces.reduce((n, s) => n + (s.data ? 1 : 0), 0),
        cpuMB: round(g.paint.surfaces.reduce((n, s) => n + (s.data?.length ?? 0), 0) / 2 ** 20),
        drips: g.drips.count,
        ownOps: { ...probe.ownOps },
        remoteOps: probe.remoteOps,
        remoteOpMs: round(probe.remoteOpMs),
        opWait: probe.opWait.summary(),
        opLate: probe.opLate.summary(),
      },
      render: {
        programs: programCount(g.renderer),
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        gpuTimer: g.gpuTimer.supported,
        textureMB: { paint: round(g.paint.gpu.textureBytes / 2 ** 20), bake: round(extra.bake / 2 ** 20), fixed: round(extra.fixed / 2 ** 20) },
        levelEdits: probe.levelEdit.summary(),
        bakeSync: probe.bakeSync.summary(),
      },
      memory: mem ? { heapMB: round(mem.usedJSHeapSize / 2 ** 20), totalMB: round(mem.totalJSHeapSize / 2 ** 20), limitMB: round(mem.jsHeapSizeLimit / 2 ** 20) } : null,
      battery,
      errors: errors.splice(0),
      errorCount,
      events: [...tap.events.splice(0), ...events.splice(0)],
      selfMs: round(self),
      reportMs: round(reportMs),
    };
    probe.remoteOps = probe.remoteOpMs = probe.corrections = 0;
    probe.opWait.clear();
    probe.opLate.clear();
    probe.levelEdit.clear();
    probe.bakeSync.clear();
    for (const k in probe.ownOps) probe.ownOps[k] = 0;
    hitches = hitchesSent = errorCount = 0;
    windowStart = t;
    if (g.net.telemetry) {
      seq++;
      send(data);
    }
    self = 0;
    reportMs = performance.now() - t;
  }

  return {
    raf: (time) => rec.raf(time),
    begin: (t0) => rec.begin(t0),
    lap: (name) => rec.lap(name),
    frame(f) {
      const t = performance.now();
      const inSession = g.net.inSession;
      // The GPU timer runs all through a session: its passes are what the report's GPU numbers are.
      if (inSession) g.gpuTimer.enabled = true;
      const shown = g.tools.ladder.others();
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse));
      const inView = shown.reduce((n, p) => n + (frustum.containsPoint(p) ? 1 : 0), 0);
      const p = programCount(g.renderer);
      if (p !== programs && inSession) event('programs', { from: programs, to: p, interval: round(f.interval) });
      programs = p;
      const gpu = g.gpuTimer.supported ? pick(g.gpuTimer.ms, VOLUMETRICS.enabled ? ['scene', 'volumetrics', 'post'] : ['scene', 'post']) : null;
      rec.frame({ interval: f.interval, cpu: t - f.t0, gpu, calls: f.calls, triangles: f.triangles, uploads: g.paint.gpu.uploadsLastFrame, uploadBytes: g.paint.gpu.uploadBytesLastFrame, ownParticles: g.tools.spray.particles.count, otherParticles: g.tools.spray.others.count, shown: shown.length, inView, messages: tap.frame(), programs: p, playing: f.playing }, probe.sprayers);
      probe.sprayers = 0;
      if (rec.hitch) {
        hitches++;
        const frame = rec.hitch;
        rec.hitch = null;
        // A moment later, when the browser has told what held the thread (the long animation frame arrives after the frame).
        if (inSession && hitchesSent++ < PLAYTEST.hitchesPerWindow) setTimeout(() => send({ kind: 'hitch', frame, loaf: rec.loafSince((frame.at as number) - 50), events: [...tap.events.slice(-5), ...events.slice(-5)] }), PLAYTEST.hitchWait);
      }
      // Built when the browser is idle between frames, not in one: it takes a few ms.
      if (t >= nextReport) {
        nextReport = t + PLAYTEST.every * 1000;
        if ('requestIdleCallback' in window) requestIdleCallback(report, { timeout: 1000 });
        else setTimeout(report, 0);
      }
      self += performance.now() - t;
      if (fakeHitch && t >= nextFake) {
        nextFake = t + PLAYTEST.fakeHitchEvery * 1000;
        while (performance.now() - t < PLAYTEST.fakeHitchMs);
      }
    },
  };
}

const programCount = (r: THREE.WebGLRenderer) => r.info.programs?.length ?? 0;
const pick = (ms: Record<string, number>, keys: string[]) => Object.fromEntries(keys.filter((k) => ms[k] !== undefined).map((k) => [k, ms[k]]));

/** The settings that change what the GPU and CPU do, as the player has them now. */
function settings() {
  return { pixelScale: RENDER.pixelScale, maxFps: RENDER.maxFps, volumetrics: VOLUMETRICS.enabled, paintDetail: PAINT.texelsPerMeter, saved: storedSettings() };
}

function storedSettings() {
  try {
    return JSON.parse(localStorage.getItem('roofhiddenhaus.settings') ?? 'null') as unknown;
  } catch {
    return null;
  }
}

/** The device and the session, once per welcome. */
let gpuInfo: { gpu: Record<string, unknown>; maxTexture: number } | null = null;

function environment(g: PlaytestContext) {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const size = g.renderer.getDrawingBufferSize(new THREE.Vector2());
  return {
    version: VERSION,
    protocol: PROTOCOL,
    level: g.levelName(),
    ua: navigator.userAgent,
    platform: navigator.platform,
    cores: navigator.hardwareConcurrency,
    memoryGB: nav.deviceMemory ?? null,
    ...gpuOf(g.renderer.getContext()),
    screen: [screen.width, screen.height],
    window: [innerWidth, innerHeight],
    buffer: [size.x, size.y],
    dpr: devicePixelRatio,
    fullscreen: !!document.fullscreenElement,
    settings: settings(),
  };
}

/** Asked once: these calls wait for the GPU process (a frame's worth of time the first time). */
function gpuOf(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  if (gpuInfo) return gpuInfo;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return (gpuInfo = {
    gpu: dbg ? { vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) } : { renderer: gl.getParameter(gl.RENDERER) },
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  });
}
