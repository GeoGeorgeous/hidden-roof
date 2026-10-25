// Tests of the beacon's body (src/beacon.ts) in Node, with a fake page: the minute beat, the first beacon's settings, funnel
// and tutorial steps once, counts, and seconds playing, idle and in menus.
// Usage: node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/beacon.test.mjs
import './ts-imports.mjs';
import assert from 'node:assert/strict';

const sent = [];
let tick = null;
let visibility = 'visible';
globalThis.addEventListener = () => {};
Object.defineProperty(globalThis, 'document', { value: { get visibilityState() { return visibility; } }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: (_url, text) => sent.push(JSON.parse(text)) }, configurable: true });
globalThis.setInterval = (f) => (tick = f);

const { NET } = await import('../src/config.ts');
const { Beacon } = await import('../src/beacon.ts');
const canvas = { addEventListener: () => {} };
const now = () => performance.now() / 1000;

const b = new Beacon('Test GPU', canvas);

// Nothing gathered: a minute beacon still goes, with only its beat.
tick();
assert.deepEqual(sent.pop(), { beat: 'menu' });

// The first one: GPU, load time, settings, and the funnel step it completes; no beat.
b.step('play');
b.loaded({ 'graphics.rain': 'on' });
let body = sent.pop();
assert.equal(body.beat, undefined);
assert.equal(body.first.gpu, 'Test GPU');
assert.deepEqual(body.first.settings, { 'graphics.rain': 'on' });
assert.deepEqual(body.steps, ['play', 'ready']);

// Steps and tutorial steps count once per page load.
b.step('play');
b.step('sprayed');
b.step('sprayed');
b.lesson('move');
b.lesson('move');
b.lesson('done');
tick();
body = sent.pop();
assert.equal(body.beat, 'solo');
assert.deepEqual(body.steps, ['sprayed']);
assert.deepEqual(body.tutorial, ['move', 'done']);
b.step('sprayed');
b.lesson('move');
tick();
assert.deepEqual(sent.pop(), { beat: 'solo' });

// At most NET.beaconList steps a beacon; the rest go with the next.
const many = Array.from({ length: NET.beaconList + 2 }, (_, i) => `t${i}`);
for (const id of many) b.lesson(id);
tick();
assert.deepEqual(sent.pop().tutorial, many.slice(0, NET.beaconList));
tick();
assert.deepEqual(sent.pop().tutorial, many.slice(NET.beaconList));

// Counts, cleared on send.
b.count('jump');
b.count('jump');
b.count('pickup.color.red');
tick();
assert.deepEqual(sent.pop().counts, { jump: 2, 'pickup.color.red': 1 });
tick();
assert.equal(sent.pop().counts, undefined);

// Seconds: playing with recent input, idle without, menu when not playing or a dialog is up; a stall counts NET.beaconStep at most.
b.frame(0.5, true, false, now());
b.frame(0.2, true, false, now() - NET.beaconIdle - 1);
b.frame(0.2, false, false, 0);
b.frame(0.3, true, true, now());
b.frame(100, true, false, now());
tick();
assert.deepEqual(sent.pop().seconds, { playing: 0.5 + NET.beaconStep, idle: 0.2, menu: 0.5 });
tick();
assert.equal(sent.pop().seconds, undefined);

// A hidden tab counts nothing, and says so.
visibility = 'hidden';
b.frame(1, true, false, now());
tick();
assert.deepEqual(sent.pop(), { beat: 'hidden' });
visibility = 'visible';

// In a session: the beat says so, and the first time in is a step.
b.status({ state: 'in', code: 'ABCD' });
b.status({ state: 'in', code: 'ABCD' });
tick();
body = sent.pop();
assert.equal(body.beat, 'session');
assert.deepEqual(body.steps, ['joined']);
b.status({ state: 'off' });
tick();
assert.deepEqual(sent.pop(), { beat: 'solo' });

console.log('beacon: ok');
