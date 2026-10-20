// Tests of another player's clock (src/net/remote-timeline.ts) in Node: where they are between snapshots, how far a
// guess goes, a clock that starts over, what they did in its order, a hidden tab, the catch-up after a pile-up.
// Usage: npm test (node --experimental-transform-types scripts/remote-timeline.test.mjs)
import assert from 'node:assert/strict';
import { register } from 'node:module';

// The game's imports leave out .ts (Vite resolves them); here a relative one without an extension gets it.
const hook = `export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) { if (/^\\.\\.?\\//.test(s) && !/\\.\\w+$/.test(s)) return next(s + '.ts', c); throw e; }
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`);

const THREE = await import('three');
const { NET } = await import('../src/config.ts');
const { RemoteTimeline } = await import('../src/net/remote-timeline.ts');

/** A snapshot at their time `t`, `x` metres along. */
const snap = (t, x, rest = {}) => ({ t, pos: new THREE.Vector3(x, 0, 0), yaw: 0, pitch: 0, onGround: true, onLadder: false, crouched: false, tool: null, action: null, color: 'black', cap: 'standard', flow: 0, ...rest });
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a}, not ${b}`);

/** A timeline whose first two snapshots (t = 1 at 0 m, t = 1.05 at 1 m) came on time: shown NET.interpDelay behind. */
function started() {
  const tl = new RemoteTimeline();
  tl.receive(snap(1, 0), 1);
  tl.receive(snap(1.05, 1), 1.05);
  return tl;
}

{
  const tl = new RemoteTimeline();
  assert.equal(tl.sample(5, 0.016), null, 'nothing is shown before a snapshot');
  assert.equal(tl.heard, -Infinity);
  tl.receive(snap(1, 0), 1);
  assert.equal(tl.sample(1.05, 0), null, 'nor before their time gets to the first');
  near(tl.heard, 1, 'heard');
  tl.receive(snap(1.05, 1, { tool: 'can', action: 'spray', flow: 1 }), 1.05);
  const from = NET.interpDelay;
  // Halfway between the two, then at the second (the states switch there).
  let p = tl.sample(1.025 + from, 0);
  near(p.pos.x, 0.5, 'halfway');
  near(p.velocity.x, 20, 'velocity from the two');
  assert.equal(p.tool, null, 'states stay with the earlier snapshot');
  assert.equal(tl.stats.guessing, false);
  assert.equal(tl.stats.buffered, 2);
  p = tl.sample(1.05 + from, 0);
  near(p.pos.x, 1, 'at the second');
  assert.equal(p.tool, 'can');
  assert.equal(p.flow, 1);
  // The angle goes the short way round.
  const t2 = new RemoteTimeline();
  t2.receive(snap(0, 0, { yaw: 6.2 }), 0);
  t2.receive(snap(0.05, 0, { yaw: 0.1 }), 0.05);
  const q = t2.sample(0.025 + from, 0);
  near(q.yaw, 6.2 + (0.1 + 2 * Math.PI - 6.2) / 2, 'yaw through the turn');
  // A stale or repeated snapshot is heard but not kept.
  tl.receive(snap(1.05, 9), 3);
  near(tl.heard, 3, 'heard, though stale');
  assert.equal(tl.newest.pos.x, 1);
  // Their time never goes back, even when the clock asked for does.
  near(tl.sample(1.0, 0).pos.x, 1, 'shown time never goes back');
}

{
  const tl = started();
  const span = 0.05;
  const late = 1 + NET.extrapolate / span;
  let p = tl.sample(1.05 + 3 * span + NET.interpDelay, 0);
  near(p.pos.x, 4, 'a guess goes on along the last step');
  near(p.velocity.x, 20, 'at the same speed');
  assert.equal(tl.stats.guessing, true);
  p = tl.sample(60, 0);
  near(p.pos.x, late, 'a guess stops at NET.extrapolate past the newest');
  near(p.velocity.x, 0, 'and they stand');
  // The real snapshot takes over from where the guess stood.
  tl.receive(snap(60 - NET.interpDelay, 100), 60);
  assert.ok(tl.sample(60, 0.016).pos.x > late, 'the next snapshot is followed');
}

{
  const tl = started();
  const log = [];
  tl.schedule(1.5, () => log.push('late'), false);
  tl.reset();
  assert.equal(tl.waiting, 0, 'a clock starting over drops what waited for the old one');
  assert.equal(tl.sample(1.2, 0), null, 'and shows nothing until a snapshot of the new one');
  // Their page reloaded: the clock is at 0.5 again, 200 s of ours later.
  const old = new RemoteTimeline();
  old.receive(snap(100, 0), 100);
  old.receive(snap(100.05, 1), 100.05);
  old.schedule(101, () => log.push('old'), false);
  old.receive(snap(0.5, 5), 200);
  assert.equal(old.waiting, 0, 'a snapshot from a clock gone back starts over too');
  assert.equal(old.newest.pos.x, 5);
  old.receive(snap(0.55, 6), 200.05);
  near(old.sample(0.525 + 199.5 + NET.interpDelay, 0).pos.x, 5.5, 'the new clock is followed');
  assert.deepEqual(log, [], 'nothing waiting ran');
}

{
  const tl = started();
  const log = [];
  tl.schedule(1.1, () => log.push(1), false);
  tl.schedule(1.2, () => log.push(2), false);
  tl.schedule(1.3, () => log.push(3), false);
  tl.sample(1.15 + NET.interpDelay, 0);
  assert.deepEqual(log, [1], 'what is due runs');
  assert.equal(tl.waiting, 2);
  tl.sample(1.35 + NET.interpDelay, 0);
  assert.deepEqual(log, [1, 2, 3], 'the rest follows, in the order they were made');
  assert.equal(tl.waiting, 0);
}

{
  const tl = started();
  const log = [];
  tl.schedule(5, () => log.push('a'), false);
  tl.schedule(6, () => log.push('b'), false);
  tl.schedule(7, () => log.push('c'), true);
  assert.deepEqual(log, ['a', 'b', 'c'], 'hidden: what waited goes first, then this at once');
  assert.equal(tl.waiting, 0);
  tl.schedule(8, () => log.push('d'), true);
  assert.deepEqual(log, ['a', 'b', 'c', 'd'], 'and nothing is queued while it lasts');
  tl.schedule(9, () => log.push('e'), false);
  tl.schedule(10, () => log.push('f'), false);
  tl.flush();
  assert.deepEqual(log.slice(4), ['e', 'f'], 'flush runs them all, in order');
  assert.equal(tl.waiting, 0);
}

{
  // A slow start (5 s behind), then a burst of fresher snapshots, more than are kept: shown from the burst at once.
  const tl = new RemoteTimeline();
  tl.receive(snap(0, 0), 5);
  for (let i = 0; i < NET.snapsKept + 40; i++) tl.receive(snap(3 + i * 0.02, (3 + i * 0.02) * 10), 5);
  const p = tl.sample(5, 1 / 60);
  assert.ok(p, 'they are shown at once, not after the slow link would have got there');
  assert.ok(p.pos.x > 45, `near the newest, not 5 s behind: ${p.pos.x}`);
  assert.ok(tl.stats.delay < NET.maxDelay, `the delay is a normal one again: ${tl.stats.delay}`);
  assert.ok(tl.stats.buffered <= NET.snapsKept, 'and the kept ones are those of the burst');
}

{
  // A stalling link: six snapshots in a row come late, together, every second. The delay grows to cover it.
  const tl = new RemoteTimeline();
  const inbox = [];
  for (let i = 0; i < 400; i++) inbox.push({ t: i * 0.05, arrives: i * 0.05 + (i % 20 < 6 ? (6 - (i % 20)) * 0.05 : 0) });
  inbox.sort((a, b) => a.arrives - b.arrives);
  let next = 0;
  for (let now = 0; now < 18; now += 1 / 60) {
    while (next < inbox.length && inbox[next].arrives <= now) tl.receive(snap(inbox[next].t, inbox[next].t * 10), inbox[next++].arrives);
    tl.sample(now, 1 / 60);
  }
  assert.ok(tl.stats.jitter > 0.02, `jitter measured: ${tl.stats.jitter}`);
  const wanted = 1 / NET.sendRate + NET.jitterCover * tl.stats.jitter;
  assert.ok(wanted > NET.interpDelay + 0.01, `a delay beyond the usual is called for: ${wanted}`);
  assert.ok(Math.abs(tl.stats.delay - wanted) < 0.02, `the delay eased to it: ${tl.stats.delay}, not ${wanted}`);
}

console.log('remote timeline: ok');
