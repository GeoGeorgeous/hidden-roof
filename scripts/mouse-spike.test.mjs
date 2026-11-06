// Tests of the mouse's jump filter (src/mouse-spike.ts) in Node: the jumps of real profiles are dropped, a real flick is not, and a raw lock is left alone.
// Usage: npm test (node --experimental-transform-types scripts/mouse-spike.test.mjs)
import assert from 'node:assert/strict';
import './ts-imports.mjs';

const listeners = {};
globalThis.addEventListener = (type, fn) => (listeners[type] ??= []).push(fn);
globalThis.window = globalThis;
globalThis.document = { addEventListener: globalThis.addEventListener };
globalThis.innerWidth = 1920;
globalThis.innerHeight = 1080;

const { MouseSpikes } = await import('../src/mouse-spike.ts');
const { Input } = await import('../src/input.ts');

/** Runs events `[dx, dy, ms since the last one]` through a filter: the ones it drops. */
function drops(events, width = 1920, height = 1080) {
  const f = new MouseSpikes();
  let time = 1000;
  return events.filter(([dx, dy, ms = 8]) => f.caught(dx, dy, (time += ms), width, height)).map(([dx, dy]) => [dx, dy]);
}

// The four jumps of the 2026-11-05 profile, with the events before them as the page got them.
const slow = [[-1, -1, 120], [-5, -9, 20], [-5, -8, 16], [0, 0, 0.1], [293, -389, 0.1], [0, 0, 0.1], [-9, -14, 16]];
assert.deepEqual(drops(slow), [[293, -389]]);
assert.deepEqual(drops([[1, -1], [1, -1, 16], [179, -380, 0.2], [2, -2, 16]]), [[179, -380]]);
assert.deepEqual(drops([[1, 0], [0, 1, 16], [1, 0, 16], [674, 284, 0.1], [1, 1, 16]]), [[674, 284]]);
assert.deepEqual(drops([[1, 3], [1, 3, 16], [0, 2, 33], [0, 0, 0.1], [-34, 381, 0.1], [0, 0, 0.1], [1, 3, 0.1]]), [[-34, 381]]);
// The first profile's, among events of up to 123 px.
assert.deepEqual(drops([[60, 40], [90, 70], [123, 0, 16], [256, 381, 16]]), [[256, 381]]);
// One at the window's size: a smaller window has smaller jumps, a larger one larger.
assert.deepEqual(drops([[1, 1], [0, 245, 16]], 1280, 700), [[0, 245]]);
assert.deepEqual(drops([[1, 1], [0, 400, 16]], 2560, 1440), []);
assert.deepEqual(drops([[1, 1], [0, 505, 16]], 2560, 1440), [[0, 505]]);

// A flick builds up, however large it gets: a 125 Hz mouse at high DPI, and one that stops as hard.
assert.deepEqual(drops([[30, 0], [90, 0], [200, 0], [350, 0], [700, 0], [900, 0], [500, 0], [120, 0]]), []);
assert.deepEqual(drops([[0, 40], [0, 120], [0, 250], [0, 350], [0, 300]]), []);
// A big event that isn't near the window's size is the hand's, even from rest.
assert.deepEqual(drops([[1, 1], [300, 200, 500]]), []);
// A flick long ago doesn't cover a jump now; a flick going on does cover its size.
assert.deepEqual(drops([[150, 0], [140, 0], [1, 0, 1000], [1, 381, 16]]), [[1, 381]]);
assert.deepEqual(drops([[0, 150], [0, 160], [0, 381, 8]]), []);

// The input: a jump doesn't reach the camera on a plain lock, a raw lock takes it as it comes.
const input = new Input({ addEventListener() {} });
input.setLocked(true);
const move = (movementX, movementY, timeStamp) => listeners.mousemove.forEach((fn) => fn({ movementX, movementY, timeStamp }));
move(2, -1, 1000);
move(179, -380, 1016);
assert.deepEqual([input.mouseDX, input.mouseDY], [2, -1]);
assert.equal(input.spikes.dropped, 1);
input.rawLocked = true;
move(179, -380, 1032);
assert.deepEqual([input.mouseDX, input.mouseDY], [181, -381]);
assert.equal(input.spikes.dropped, 1);

console.log('mouse spike: ok (real jumps dropped at any window size, flicks kept, a raw lock left alone)');
