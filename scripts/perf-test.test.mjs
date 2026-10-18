// Tests of the performance test (src/perf-test.ts) in Node: what it measures
// over a fake GPU timer and frame clock (warm-up left out, the GPU's late
// results waited for, stopped with no result, the timer put back), and each
// message from stand-in timings.
// Usage: node scripts/perf-test.test.mjs
import assert from 'node:assert/strict';
import { PERF_TEST } from '../src/config.ts';
import { gpuInfo } from '../src/gpu-name.ts';
import { GpuTimer } from '../src/debug/gpu-timer.ts';
import { browserOf, perfMessage, perfNumbers, PerfTest, spread } from '../src/perf-test.ts';

/** A GPU timer whose results come `lag` frames late, `gpuMs` each; null: no timer queries. */
function fakeTimer(gpuMs, lag = 3) {
  const t = { supported: gpuMs !== null, enabled: false, frame: 0, onFrame: null, queued: [] };
  /** One frame as main.ts draws it: the test's hook before the draw calls, the timer polled, then the test's frame. */
  t.draw = (test, time, cpuMs, calls = 100) => {
    test.beforeDraw();
    if (t.enabled && t.supported) t.queued.push(t.frame);
    t.frame++;
    while (t.queued.length && t.queued[0] <= t.frame - lag) t.onFrame?.(t.queued.shift(), gpuMs);
    test.frame(time, cpuMs, calls);
  };
  return t;
}

/** Runs a test at `interval` ms a frame until it's done; returns the result and the frames it took. */
async function measure({ interval = 1000 / 60, cpu = 4, gpu = 8, lag = 3, timerOn = false } = {}) {
  const timer = fakeTimer(gpu, lag);
  timer.enabled = timerOn;
  const test = new PerfTest(timer);
  let result;
  test.start().then((r) => (result = r));
  let frames = 0;
  for (let time = 1000; test.running && frames < 10000; time += interval, frames++) timer.draw(test, time, cpu);
  await null;
  return { result, frames, timer, test };
}

// 60 fps, GPU 8 ms: the warm-up isn't measured, every measured frame has its GPU time, the timer goes back off.
{
  const { result, frames, timer } = await measure();
  const measured = Math.ceil(PERF_TEST.seconds * 60);
  assert.ok(Math.abs(result.frames - measured) <= 1, `${result.frames} frames measured`);
  assert.ok(Math.abs(result.fps - 60) < 0.5);
  assert.equal(result.gpuMs.p50, 8);
  assert.equal(result.cpuMs.p50, 4);
  assert.equal(result.calls, 100);
  // Done a few frames after measuring, once the GPU's late results are in.
  assert.ok(frames <= Math.ceil((PERF_TEST.warmup + PERF_TEST.seconds) * 60) + 5, `${frames} frames`);
  assert.equal(timer.enabled, false);
  assert.equal(timer.onFrame, null);
}
// The timer was on (the HUD's GPU line): it stays on.
assert.equal((await measure({ timerOn: true })).timer.enabled, true);
// No timer queries (Firefox, Safari): CPU and fps, no GPU, no waiting.
assert.equal((await measure({ gpu: null })).result.gpuMs, null);
// Stopped (Esc): no result, the timer put back.
{
  const timer = fakeTimer(8);
  const test = new PerfTest(timer);
  let result = 'pending';
  test.start().then((r) => (result = r));
  for (let i = 0; i < 20; i++) timer.draw(test, 1000 + i * 16.7, 4);
  assert.equal(timer.enabled, true);
  test.stop();
  await null;
  assert.equal(result, null);
  assert.equal(timer.enabled, false);
  assert.equal(test.running, false);
}

// The real GPU timer, over a fake WebGL whose results come `lag` frames late: each frame's total is whole (all its
// passes), late results included, and a GPU far behind leaves whole frames out, never some of a frame's passes.
for (const lag of [2, 12]) {
  let polled = 0;
  const made = [];
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    createQuery: () => (made.push({ at: polled }), made.at(-1)),
    beginQuery() {},
    endQuery() {},
    deleteQuery() {},
    getParameter: () => false,
    getQueryParameter: (q, p) => (p === 1 ? polled - q.at >= lag : 2e6),
  };
  const timer = new GpuTimer(gl);
  timer.enabled = true;
  const totals = [];
  timer.onFrame = (frame, ms) => totals.push(ms);
  for (let f = 0; f < 60; f++) {
    for (const pass of ['scene', 'volumetrics', 'post']) (timer.begin(pass), timer.end());
    timer.poll();
    polled++;
  }
  assert.ok(totals.length > 10, `lag ${lag}: ${totals.length} frames`);
  assert.ok(totals.every((ms) => ms === 6), `lag ${lag}: ${[...new Set(totals)]}`);
}

assert.deepEqual(spread([5, 1, 3, 2, 4]), { p50: 3, p95: 5, p99: 5 });
assert.equal(perfNumbers({ fps: 58.4, cpuMs: { p50: 4.12 }, gpuMs: { p50: 12.34 } }), 'GPU 12.3 ms · CPU 4.1 ms · 58 fps');
assert.equal(perfNumbers({ fps: 30, cpuMs: { p50: 4 }, gpuMs: null }), 'CPU 4.0 ms · 30 fps');

// Each message, from stand-in timings.
const nvidia = gpuInfo('ANGLE (NVIDIA, NVIDIA RTX A2000 Laptop GPU (0x000025B8) Direct3D11 vs_5_0 ps_5_0, D3D11)');
const intel = gpuInfo('ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60) Direct3D11 vs_5_0 ps_5_0, D3D11)');
const run = (frame, cpu, gpu) => ({ fps: 1000 / frame, frames: 100, frameMs: spread([frame]), cpuMs: spread([cpu]), gpuMs: gpu === null ? null : spread([gpu]), calls: 100 });
const ctx = (o = {}) => ({ gpu: nvidia, os: 'windows', browser: 'chrome', maxFps: 0, ...o });
const say = (r, c) => {
  const m = perfMessage(r, c);
  return `${m.lead} ${m.more ?? ''}`.trim();
};
// Capped at 30 Hz with time to spare, on either GPU: the browser's power saver.
assert.match(say(run(33.3, 5, 6), ctx()), /^Something holds the game at 30 fps.*Chrome's Energy Saver.*chrome:\/\/settings\/performance/);
assert.match(say(run(33.3, 5, 6), ctx({ gpu: intel })), /Chrome's Energy Saver/);
assert.match(say(run(33.3, 5, 6), ctx({ browser: 'edge' })), /Edge's efficiency mode.*edge:\/\/settings\/system/);
assert.match(say(run(33.3, 5, 6), ctx({ browser: 'safari', os: 'mac' })), /Low Power Mode/);
assert.match(say(run(33.3, 5, 6), ctx({ browser: 'other', os: 'linux' })), /your browser's or system's power saver/);
// ... unless FRAME RATE is set to it.
assert.match(say(run(33.3, 5, 6), ctx({ maxFps: 30 })), /^Your Frame rate setting holds the game at 30 fps/);
// A GPU too slow for a 60 Hz frame is shown every third refresh (50 ms apart): not a cap (the Intel UHD's bench run).
assert.match(say(run(49.9, 1, 27.7), ctx({ gpu: intel })), /^Intel UHD Graphics is built into the processor, and it is the limit/);
assert.match(say(run(49.9, 1, 27.7), ctx()), /^Your GPU is the limit/);
// Integrated by name: named, and how to give the browser the faster GPU; "the limit" when it is.
assert.match(say(run(25, 8, 22), ctx({ gpu: intel })), /^Intel UHD Graphics is built into the processor, and it is the limit\. .*Display → Graphics/);
assert.match(say(run(16.7, 8, 12), ctx({ gpu: intel })), /^Intel UHD Graphics is built into the processor\. /);
// A dedicated GPU over 20 ms: the GPU is the limit; a busy CPU likewise.
assert.equal(say(run(40, 5, 38), ctx()), 'Your GPU is the limit. It takes 38.0 ms a frame: 26 fps at most.');
assert.equal(say(run(40, 30, 10), ctx()), 'Your CPU is the limit. It takes 30.0 ms a frame: 33 fps at most.');
assert.equal(say(run(16.7, 5, 8), ctx()), 'Runs well.');
// No GPU timer.
assert.match(say(run(16.7, 5, null), ctx()), /^GPU time isn't available in this browser/);
// Never a lower resolution.
for (const r of [run(33.3, 5, 6), run(25, 8, 22), run(40, 5, 38), run(40, 30, 10)]) for (const c of [ctx(), ctx({ gpu: intel })]) assert.doesNotMatch(say(r, c), /resolution/i);

// Browsers, by their user agent.
const ua = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 OPR/120.0.0.0',
};
assert.deepEqual(Object.values(ua).map(browserOf), ['chrome', 'edge', 'safari', 'other', 'other']);

console.log('perf test: ok (measures after the warm-up, waits for the GPU, stops clean; every message)');
