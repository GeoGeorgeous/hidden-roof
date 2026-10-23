// Tests of the link's status (src/net/link-health.ts) in Node, on a fake clock: a status shows after NET.statusShow and goes
// after NET.statusClear, a value at the threshold doesn't flicker, the worst status wins.
// Usage: node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/link-health.test.mjs
import assert from 'node:assert/strict';
import { NET } from '../src/config.ts';
import { Flag, LinkHealth } from '../src/net/link-health.ts';
import { activity } from '../src/net/own-status.ts';

/** A health over a clock; `run(seconds, values)` ticks each 0.25 s with the values and returns the id shown at the end. */
function setup() {
  const h = new LinkHealth();
  let t = 0;
  let out = null;
  const base = { ping: 0.05, silence: 0.2 };
  const run = (seconds, v = {}) => {
    const x = { ...base, ...v };
    for (let i = 0; i < seconds * 4; i++) {
      t += 0.25;
      out = h.update({ t, ...x });
    }
    return out && (out.user ? `${out.id}:${out.user}` : out.id);
  };
  return { h, run };
}

// Nothing wrong: nothing said.
assert.equal(setup().run(30), null);

// A slow round trip shows after the hold, not before; goes after as long under the clear value; between the two it stays.
{
  const { run } = setup();
  assert.equal(run(NET.statusShow - 0.5, { ping: 0.5 }), null);
  assert.equal(run(1, { ping: 0.5 }), 'badConnection');
  assert.equal(run(20, { ping: 0.25 }), 'badConnection');
  assert.equal(run(NET.statusClear - 0.5, { ping: 0.1 }), 'badConnection');
  assert.equal(run(1, { ping: 0.1 }), null);
}

// A value that crosses the threshold now and then never builds up its hold.
{
  const { run } = setup();
  for (let i = 0; i < 20; i++) {
    run(2, { ping: 0.5 });
    assert.equal(run(1, { ping: 0.1 }), null);
  }
}

// The server going quiet shows at once and goes at once.
{
  const { run } = setup();
  assert.equal(run(1, { silence: NET.noSignal + 1 }), 'noSignal');
  assert.equal(run(1, { silence: 3 }), 'noSignal');
  assert.equal(run(1, { silence: 0.5 }), null);
}

// The worst wins: no signal over bad connection; bad connection shows again when the silence ends.
{
  const { run } = setup();
  assert.equal(run(NET.statusShow + 1, { ping: 0.5 }), 'badConnection');
  assert.equal(run(1, { ping: 0.5, silence: 9 }), 'noSignal');
  assert.equal(run(1, { ping: 0.5 }), 'badConnection');
}

// Reset (the link went down) starts over.
{
  const { h, run } = setup();
  assert.equal(run(1, { silence: 9 }), 'noSignal');
  h.reset();
  assert.equal(run(0.25), null);
}
// The flag: past the threshold for the show hold, gone under the clear value for the clear hold (two different times).
{
  const f = new Flag();
  let t = 0;
  const feed = (seconds, v) => {
    for (let i = 0; i < seconds * 4; i++) f.step((t += 0.25), v, NET.badPing, NET.badPingClear, NET.statusShow, NET.statusClear);
    return f.active;
  };
  const bad = NET.badPing + 0.1;
  const good = NET.badPingClear - 0.1;
  assert.equal(feed(NET.statusShow - 0.5, bad), false);
  assert.equal(feed(1, bad), true);
  assert.equal(feed(20, (NET.badPing + NET.badPingClear) / 2), true);
  assert.equal(feed(NET.statusClear - 0.5, good), true);
  assert.equal(feed(1, good), false);
}
// report tells only a change, and due paces the looks.
{
  const h = new LinkHealth();
  const told = [];
  assert.equal(h.due(0), true);
  assert.equal(h.due(NET.healthEvery / 2), false);
  assert.equal(h.due(NET.healthEvery), true);
  h.report({ t: 1, ping: 0.1, silence: 0 }, (x) => told.push(x?.id ?? null));
  h.report({ t: 2, ping: 0.1, silence: 9 }, (x) => told.push(x?.id ?? null));
  h.report({ t: 3, ping: 0.1, silence: 9 }, (x) => told.push(x?.id ?? null));
  h.report({ t: 4, ping: 0.1, silence: 0 }, (x) => told.push(x?.id ?? null));
  assert.deepEqual(told, ['noSignal', null]);
}
// A status that goes away by itself is told as null (the "Reconnected" check); a reset (the link went down) tells nothing.
{
  const h = new LinkHealth();
  const told = [];
  const say = (x) => told.push(x?.id ?? null);
  h.report({ t: 1, ping: 0.1, silence: 9 }, say);
  h.report({ t: 2, ping: 0.1, silence: 0 }, say);
  assert.deepEqual(told, ['noSignal', null]);
  h.report({ t: 3, ping: 0.1, silence: 9 }, say);
  h.reset();
  h.report({ t: 4, ping: 0.1, silence: 0 }, say);
  assert.deepEqual(told, ['noSignal', null, 'noSignal']);
}
// troubled follows the status chip (bad connection or no signal), and reset clears it.
{
  const h = new LinkHealth();
  assert.equal(h.troubled, false);
  h.report({ t: 1, ping: 0.1, silence: 9 }, () => {});
  assert.equal(h.troubled, true);
  h.reset();
  assert.equal(h.troubled, false);
}
// What the player tells the others (src/net/own-status.ts): away > menu > idle > lagging > here.
{
  const d = { hidden: false, paused: false, idleFor: 0, trouble: false };
  assert.equal(activity(d), 'here');
  assert.equal(activity({ ...d, trouble: true }), 'lagging');
  assert.equal(activity({ ...d, trouble: true, idleFor: NET.idleAfter + 1 }), 'idle');
  assert.equal(activity({ ...d, trouble: true, paused: true }), 'menu');
  assert.equal(activity({ ...d, trouble: true, paused: true, hidden: true }), 'away');
}
console.log('link-health: ok');
