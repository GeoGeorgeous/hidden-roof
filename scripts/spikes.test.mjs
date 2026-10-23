// Tests of the profiler's spike catcher (src/dev/spikes.ts) in Node: a mouse spike from the profile that showed BL-010 (one event of 392 px among events of a few px) keeps the raw trail, and says how long after the lock it came.
// Usage: npm test (node --experimental-transform-types scripts/spikes.test.mjs)
import assert from 'node:assert/strict';
import './ts-imports.mjs';

const listeners = {};
globalThis.addEventListener = (type, fn) => (listeners[type] ??= []).push(fn);
const doc = { pointerLockElement: null, addEventListener: globalThis.addEventListener };
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.innerWidth = 1920;
globalThis.innerHeight = 1080;

const { SpikeCatcher } = await import('../src/dev/spikes.ts');
const emit = (type, e) => listeners[type]?.forEach((fn) => fn({ timeStamp: performance.now() - 1, ...e }));
const frame = (c, t, yaw = 0) => c.frame({ t, ms: 16.7, cpuMs: 3, laps: {}, gpuMs: 5, calls: 100, state: 'play', pos: [0, 0, 0], yaw, pitch: 0 }, 16.7);

const c = new SpikeCatcher();
c.start(performance.now());
doc.pointerLockElement = {};
listeners.pointerlockchange.forEach((fn) => fn());

for (let i = 0; i < 5; i++) {
  emit('mousemove', { movementX: 2, movementY: -1 });
  frame(c, i * 0.0167);
}
frame(c, 0.09);
// The next frame: three events at once, one of them 97 by 381.
emit('mousemove', { movementX: 3, movementY: 0 });
emit('pointerrawupdate', { movementX: 3, movementY: 0 });
const big = { movementX: -97, movementY: -381 };
emit('mousemove', big);
emit('pointermove', { ...big, getCoalescedEvents: () => [big] });
emit('pointerrawupdate', big);
frame(c, 0.1);

assert.equal(c.spikes.length, 1);
const [why] = c.spikes[0].reasons;
assert.match(why.why, /^mouse spike: one event of 393\.\d+ px, \d+(\.\d+)? s after the lock$/);
const spike = c.spikes[0].frames.at(-1);
assert.equal(spike.mouse.events, 2);
assert.deepEqual([...new Set(spike.trail.map((e) => e.on))].sort(), ['mouse', 'pointer', 'raw']);
assert.deepEqual(spike.trail.find((e) => e.on === 'pointer').coalesced, [[-97, -381]]);
assert.ok(spike.trail.every((e) => e.lag >= 0));
// Frames without a spike carry no trail.
assert.equal(c.spikes[0].frames[0].trail, undefined);

// Events outside the lock are not the camera's.
doc.pointerLockElement = null;
listeners.pointerlockchange.forEach((fn) => fn());
emit('mousemove', big);
frame(c, 0.2);
assert.equal(c.spikes.length, 1);
