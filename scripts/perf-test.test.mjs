// Tests of the performance test (src/perf-test.ts) in Node: what it measures
// over a fake GPU timer and frame clock (warm-up left out, the GPU's late
// results waited for, stopped with no result, the timer put back; the 1% low,
// the live numbers and how far it is), the tiers, and each tip from stand-in
// timings and settings.
// Usage: node scripts/perf-test.test.mjs
import assert from 'node:assert/strict';
import { PERF_TEST } from '../src/config.ts';
import { gpuInfo } from '../src/gpu-name.ts';
import { GpuTimer } from '../src/debug/gpu-timer.ts';
import { browserOf, perfTip, PerfTest, spread, tierOf, tierShare } from '../src/perf-test.ts';

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
  assert.ok(Math.abs(result.low - 60) < 0.5);
  // Done a few frames after measuring, once the GPU's late results are in.
  assert.ok(frames <= Math.ceil((PERF_TEST.warmup + PERF_TEST.seconds) * 60) + 5, `${frames} frames`);
  assert.equal(timer.enabled, false);
  assert.equal(timer.onFrame, null);
}
// The timer was on (the HUD's GPU line): it stays on.
assert.equal((await measure({ timerOn: true })).timer.enabled, true);
// No timer queries (Firefox, Safari): CPU and fps, no GPU, no waiting.
assert.equal((await measure({ gpu: null })).result.gpuMs, null);
// 1% low: the slowest 1% of frames (one in 50 here takes 50 ms).
{
  const timer = fakeTimer(8);
  const test = new PerfTest(timer);
  let result;
  test.start().then((r) => (result = r));
  for (let time = 1000, f = 0; test.running; f++) timer.draw(test, (time += f % 50 === 25 ? 50 : 10), 4);
  await null;
  assert.ok(Math.abs(result.low - 20) < 0.5, `low ${result.low}`);
  assert.ok(result.fps > 85, `fps ${result.fps}`);
}
// While it runs: how far it is (the camera's place on its path), and the last moments' numbers once measuring.
{
  const timer = fakeTimer(8);
  const test = new PerfTest(timer);
  test.start();
  assert.equal(test.progress(5000), 0);
  assert.deepEqual(test.live(), { progress: 0, fps: null, cpuMs: null, gpuMs: null, calls: null });
  const total = (PERF_TEST.warmup + PERF_TEST.seconds) * 1000;
  let time = 1000;
  for (; time < 1000 + total / 2; time += 20) timer.draw(test, time, 4, 300);
  const live = test.live();
  assert.ok(Math.abs(live.progress - 0.5) < 0.01, `progress ${live.progress}`);
  assert.equal(test.progress(1000 + total * 2), 1);
  assert.ok(Math.abs(live.fps - 50) < 0.5 && live.cpuMs === 4 && live.gpuMs === 8 && live.calls === 300, JSON.stringify(live));
  test.stop();
  assert.equal(test.live(), null);
  assert.equal(test.progress(time), 0);
}
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

// Tiers from the average fps: the slider straight between 15, 30, 60, 100 and 144.
assert.deepEqual([10, 15, 22.5, 30, 45, 60, 80, 100, 122, 144, 200].map(tierShare), [0, 0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1]);
// The tier of the fps shown: 59.6 reads 60, Smooth.
assert.deepEqual([12, 29.4, 30, 59.4, 59.6, 60, 99.4, 100, 240].map(tierOf), [0, 0, 1, 1, 2, 2, 2, 3, 3]);

// Each tip, from stand-in timings and settings.
const nvidia = gpuInfo('ANGLE (NVIDIA, NVIDIA RTX A2000 Laptop GPU (0x000025B8) Direct3D11 vs_5_0 ps_5_0, D3D11)');
const intel = gpuInfo('ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60) Direct3D11 vs_5_0 ps_5_0, D3D11)');
const run = (frame, cpu, gpu) => ({ fps: 1000 / frame, low: 1000 / frame, frames: 100, frameMs: spread([frame]), cpuMs: spread([cpu]), gpuMs: gpu === null ? null : spread([gpu]), calls: 100 });
const tested = { size: '1920×1080', volumetrics: 'Low', paint: 'Ultra', city: 'High', volOff: false, volHigh: false, nextScale: 1.5, cityLow: false };
const ctx = (o = {}, s = {}) => ({ gpu: nvidia, os: 'windows', browser: 'chrome', maxFps: 0, ...o, settings: { ...tested, ...s } });
const say = (r, c) => {
  const t = perfTip(r, c);
  return `${t.lead} ${t.more}`;
};
// 1. Very smooth: room to spare, Volumetrics a step higher, unless it's at High.
assert.equal(say(run(8, 6, 7.5), ctx()), 'Room to spare. Volumetrics can go a step higher.');
assert.equal(say(run(8, 6, 7.5), ctx({}, { volHigh: true })), 'Room to spare. Even the highest settings run smoothly.');
// Held at the display's refresh with time to spare (60 Hz, the RTX A2000's bench run): room to spare too.
assert.equal(say(run(16.7, 1.3, 2.7), ctx()), 'Room to spare. Volumetrics can go a step higher.');
// 2. The video card: Volumetrics, then Resolution; with Volumetrics off the next Resolution; at the lowest, nothing.
assert.equal(say(run(20, 5, 18), ctx()), 'The video card is the limit. Lower Volumetrics first, then Resolution.');
assert.equal(say(run(20, 5, 18), ctx({}, { volOff: true })), 'The video card is the limit. Resolution 1/1.5 would help most.');
assert.equal(say(run(20, 5, 18), ctx({}, { volOff: true, nextScale: null })), 'The video card is the limit. Everything it draws is already at its lowest.');
// Built into the processor: how to give the browser the faster GPU too. A GPU too slow for a 60 Hz frame is shown
// every third refresh (50 ms apart, the Intel UHD's bench run): not held.
assert.match(say(run(49.9, 1, 23.1), ctx({ gpu: intel })), /^The video card is the limit\. Lower Volumetrics first, then Resolution\. .*Display → Graphics/);
// 3. The processor: City detail, unless it's Low.
assert.equal(say(run(25, 22, 10), ctx()), 'The processor is the limit. Lower City detail first.');
assert.equal(say(run(25, 22, 10), ctx({}, { cityLow: true })), 'The processor is the limit. Closing other tabs may help.');
// 4. Neither 1.15 times the other.
assert.equal(say(run(25, 20, 21), ctx()), 'The processor and video card are evenly loaded. Lower Resolution or City detail.');
// Held at 30 Hz with time to spare, on either GPU: the browser's power saver.
assert.match(say(run(33.3, 5, 6), ctx()), /^Something holds the game at 30 FPS.*Chrome's Energy Saver.*chrome:\/\/settings\/performance/);
assert.match(say(run(33.3, 5, 6), ctx({ gpu: intel })), /Chrome's Energy Saver/);
assert.match(say(run(33.3, 5, 6), ctx({ browser: 'edge' })), /Edge's efficiency mode.*edge:\/\/settings\/system/);
assert.match(say(run(33.3, 5, 6), ctx({ browser: 'safari', os: 'mac' })), /Low Power Mode/);
assert.match(say(run(33.3, 5, 6), ctx({ browser: 'other', os: 'linux' })), /your browser's or system's power saver/);
// ... unless Frame rate is set to it (at 60 too).
assert.match(say(run(33.3, 5, 6), ctx({ maxFps: 30 })), /^Your Frame rate setting holds the game at 30 FPS/);
assert.match(say(run(16.7, 2, 3), ctx({ maxFps: 60 })), /^Your Frame rate setting holds the game at 60 FPS/);
// No GPU timer: very smooth still says so; otherwise no limit named.
assert.equal(say(run(8, 5, null), ctx()), 'Room to spare. Volumetrics can go a step higher.');
assert.match(say(run(25, 5, null), ctx()), /^This browser doesn't time the video card\./);

// Browsers, by their user agent.
const ua = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 OPR/120.0.0.0',
};
assert.deepEqual(Object.values(ua).map(browserOf), ['chrome', 'edge', 'safari', 'other', 'other']);

console.log('perf test: ok (measures after the warm-up, waits for the GPU, stops clean; 1% low, live numbers; tiers; every tip)');
