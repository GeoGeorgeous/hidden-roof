// Tests of the beacon's body (src/beacon.ts) in Node, with a fake page: the minute beat, the first beacon's settings, funnel
// and tutorial steps once, counts, and seconds playing, idle and in menus.
// Usage: node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/beacon.test.mjs
import './ts-imports.mjs';
import assert from 'node:assert/strict';

const sent = [];
const pages = [];
let tick = null;
let visibility = 'visible';
const handlers = {};
globalThis.addEventListener = (type, f) => (handlers[type] = f);
Object.defineProperty(globalThis, 'document', { value: { get visibilityState() { return visibility; } }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: (_url, text) => { const { page, ...body } = JSON.parse(text); pages.push(page); sent.push(body); } }, configurable: true });
globalThis.setInterval = (f) => (tick = f);

const { NET, SERVER } = await import('../src/config.ts');
const { Beacon } = await import('../src/beacon.ts');
const canvas = { addEventListener: () => {} };
const now = () => performance.now() / 1000;

const b = new Beacon('Test GPU', canvas);
const mine = { ...handlers };

// Nothing gathered: a minute beacon still goes, with only its beat.
tick();
assert.deepEqual(sent.pop(), { beat: 'menu', doing: 'menu' }, 'before Play: in the menu');

// The first one: GPU, load time, settings, and the funnel step it completes; no beat.
b.step('play');
b.loaded({ 'graphics.rain': 'on' });
let body = sent.pop();
assert.equal(body.beat, undefined);
assert.equal(body.first.gpu, 'Test GPU');
assert.deepEqual(body.first.settings, { 'graphics.rain': 'on' });
assert.deepEqual(body.steps, ['play', 'ready']);
assert.match(body.first.device, /^[0-9a-f]{32}$/);
// The days the device keeps: made on this load, it first played today and has played no day before.
assert.deepEqual(body.first.days, { first: Math.floor(Date.now() / 864e5), prev: null });

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
assert.deepEqual(sent.pop(), { beat: 'solo', doing: 'menu' }, 'no frame yet: in the menu');

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
// Counted once a page load: a pickup found again after a restart is not a second one.
b.countOnce('pickup.marker');
b.countOnce('pickup.marker');
tick();
assert.deepEqual(sent.pop().counts, { 'pickup.marker': 1 });
b.countOnce('pickup.marker');
tick();
assert.equal(sent.pop().counts, undefined);

// A slider drag is one change: later steps within NET.beaconSettingGap of the last count nothing; after a pause it is a new one.
let skew = 0;
const real = performance.now.bind(performance);
performance.now = () => real() + skew * 1000;
for (let i = 0; i < 5; i++) (b.setting('sound.master'), (skew += NET.beaconSettingGap / 2));
b.setting('gameplay.hints');
skew += NET.beaconSettingGap + 1;
b.setting('sound.master');
tick();
assert.deepEqual(sent.pop().counts, { 'setting.sound.master': 2, 'setting.gameplay.hints': 1 });
performance.now = real;

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

// What the page does, in each minute beat: what its last frame was; playing, idle (no input for NET.beaconIdle s), in a menu (not playing, or a dialog up).
for (const [frame, doing] of [[[true, false, now() - NET.beaconIdle - 1], 'idle'], [[false, false, 0], 'menu'], [[true, true, now()], 'menu'], [[true, false, now()], 'playing']]) {
  b.frame(0.1, ...frame);
  tick();
  assert.equal(sent.pop().doing, doing);
}

// A hidden tab counts nothing, and says so.
visibility = 'hidden';
b.frame(1, true, false, now());
tick();
assert.deepEqual(sent.pop(), { beat: 'hidden', doing: 'hidden' });
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
assert.deepEqual(sent.pop(), { beat: 'solo', doing: 'playing' });

// What the server would refuse is cut here, so a minute isn't lost whole: a GPU name, codes (long, and too many kinds), a long load.
const c = new Beacon('G'.repeat(SERVER.beaconText + 20), canvas);
const long = 'a'.repeat(60);
c.count(long);
c.count(long);
for (let i = 0; i < SERVER.beaconKinds + 10; i++) c.count(`k${i}`);
c.count('k0');
performance.now = () => (SERVER.beaconMostSeconds + 500) * 1000;
c.loaded({});
body = sent.pop();
assert.equal(body.first.gpu.length, SERVER.beaconText);
assert.equal(body.first.load, SERVER.beaconMostSeconds);
assert.deepEqual([Object.keys(body.counts).length, body.counts['a'.repeat(40)]], [SERVER.beaconKinds, 2], 'cut to 40, and no more kinds than the server takes');
assert.equal(body.counts.k0, 2, 'a kind already there still counts');
assert.equal(body.counts[`k${SERVER.beaconKinds}`], undefined);
for (const code of Object.keys(body.counts)) assert.ok(code.length <= 40);
performance.now = real;

// The page id: made once per page load, in every beacon, and another page load has its own.
assert.match(pages[0], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
assert.equal(new Set(pages).size, 2, 'one id for each page, in every beacon');

// Left (pagehide): a goodbye with what was gathered; shown again from the back-forward cache: a beat. A tab that is only hidden says nothing of leaving.
b.count('jump');
mine.pagehide();
assert.deepEqual(sent.pop(), { bye: true, counts: { jump: 1 } });
mine.pagehide();
assert.deepEqual(sent.pop(), { bye: true });
mine.pageshow({ persisted: false });
assert.equal(sent.length, 0);
mine.pageshow({ persisted: true });
assert.deepEqual(sent.pop(), { beat: 'solo', doing: 'playing' });
assert.equal(pages.at(-1), pages[0]);

// Where storage is blocked the device id is made once, not on every call.
Object.defineProperty(globalThis, 'localStorage', { get: () => { throw new Error('blocked'); }, configurable: true });
const { deviceId } = await import('../src/stored.ts');
assert.match(deviceId(), /^[0-9a-f]{32}$/);
assert.equal(deviceId(), deviceId());

// A stored value that is no device id is replaced by a new one (kept), a good one is kept.
const bin = new Map([['roofhiddenhaus.device', 'not-a-device']]);
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => bin.get(k) ?? null, setItem: (k, v) => bin.set(k, v) }, configurable: true });
const fresh = await import('../src/stored.ts?bad-device');
assert.match(fresh.deviceId(), /^[0-9a-f]{32}$/);
assert.equal(bin.get('roofhiddenhaus.device'), fresh.deviceId());
const good = 'ab'.repeat(16);
bin.set('roofhiddenhaus.device', good);
assert.equal((await import('../src/stored.ts?good-device')).deviceId(), good);
Object.defineProperty(globalThis, 'localStorage', { get: () => { throw new Error('blocked'); }, configurable: true });

// The days kept on the device (UTC days since 1970): the first, the last, and the one before.
const { nextDays } = await import('../src/stored.ts');
let kept = nextDays(null, 100, true);
assert.deepEqual([kept.keep, kept.send], [{ first: 100, last: 100, prev: null }, { first: 100, prev: null }], 'a device made on this load');
kept = nextDays(kept.keep, 100, false);
assert.deepEqual(kept.send, { first: 100, prev: null }, 'a reload the same day');
kept = nextDays(kept.keep, 103, false);
assert.deepEqual([kept.keep, kept.send], [{ first: 100, last: 103, prev: 100 }, { first: 100, prev: 100 }], 'three days later: the day before is the last');
kept = nextDays(kept.keep, 103, false);
assert.deepEqual(kept.send, { first: 100, prev: 100 }, 'a reload that day keeps the day before');
kept = nextDays(kept.keep, 104, false);
assert.deepEqual(kept.send, { first: 100, prev: 103 });
// A device from before the days were kept never gets a first day; it still says its day before.
kept = nextDays(null, 100, false);
assert.deepEqual(kept.send, { first: null, prev: null });
kept = nextDays(nextDays(kept.keep, 100, false).keep, 101, false);
assert.deepEqual(kept.send, { first: null, prev: 100 });
// A clock set back never sends a day to come.
assert.deepEqual(nextDays({ first: 100, last: 200, prev: 150 }, 120, false).send, { first: 100, prev: 120 });
assert.deepEqual(nextDays({ first: 300, last: 300, prev: null }, 120, false).send, { first: 120, prev: null });

console.log('beacon: ok');
