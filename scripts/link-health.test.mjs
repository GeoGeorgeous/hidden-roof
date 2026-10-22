// Tests of the link's chip (src/net/link-health.ts) in Node, on a fake clock: a status shows after its hold and goes
// after its clear time, a value at the threshold doesn't flicker, the worst status wins.
// Usage: node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/link-health.test.mjs
import assert from 'node:assert/strict';
import { NET } from '../src/config.ts';
import { LinkHealth } from '../src/net/link-health.ts';

/** A health over a clock; `run(seconds, values)` ticks each 0.25 s with the values (counters grow by `per` a second) and returns the id shown at the end. */
function setup() {
  const h = new LinkHealth();
  let t = 0;
  let got = 0;
  let lost = 0;
  let out = null;
  const base = { ping: 0.05, silence: 0.2, delays: [{ name: 'Geo', delay: 0.13 }] };
  const run = (seconds, v = {}, per = { got: 20, lost: 0 }) => {
    const x = { ...base, ...v };
    for (let i = 0; i < seconds * 4; i++) {
      t += 0.25;
      got += per.got / 4;
      lost += per.lost / 4;
      out = h.update({ t, ...x, got, lost });
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
  assert.equal(run(NET.statusHold - 1, { ping: 0.5 }), null);
  assert.equal(run(1.5, { ping: 0.5 }), 'badConnection');
  assert.equal(run(20, { ping: 0.25 }), 'badConnection');
  assert.equal(run(NET.statusHold - 1, { ping: 0.1 }), 'badConnection');
  assert.equal(run(1.5, { ping: 0.1 }), null);
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

// Loss: a share of what was due over the window; too few due says nothing.
{
  const { run } = setup();
  assert.equal(run(12, {}, { got: 18, lost: 2 }), 'packetLoss');
  assert.equal(run(NET.lossWindow + 2, {}, { got: 20, lost: 0 }), null);
  const few = setup();
  assert.equal(few.run(12, {}, { got: 1, lost: 1 }), null);
}

// High delay names the worst player, after the hold.
{
  const { run } = setup();
  const delays = [{ name: 'Ann', delay: 0.15 }, { name: 'Bob', delay: 0.4 }];
  assert.equal(run(NET.statusHold + 1, { delays }), 'highDelay:Bob');
  assert.equal(run(NET.statusHold + 1, { delays: [{ name: 'Bob', delay: 0.1 }] }), null);
}

// The worst wins: no signal over bad connection over loss over delay; the weaker one shows again when it clears.
{
  const { run } = setup();
  const all = { ping: 0.5, delays: [{ name: 'Bob', delay: 0.4 }] };
  assert.equal(run(NET.statusHold + 1, all, { got: 18, lost: 2 }), 'badConnection');
  assert.equal(run(1, { ...all, silence: 9 }, { got: 18, lost: 2 }), 'noSignal');
  assert.equal(run(1, { ...all, ping: 0.05 }, { got: 18, lost: 2 }), 'badConnection');
  assert.equal(run(NET.statusHold + 1, { ...all, ping: 0.05 }, { got: 18, lost: 2 }), 'packetLoss');
  assert.equal(run(NET.lossWindow + 2, { ...all, ping: 0.05 }), 'highDelay:Bob');
}

// Reset (the link went down) starts over.
{
  const { h, run } = setup();
  assert.equal(run(1, { silence: 9 }), 'noSignal');
  h.reset();
  assert.equal(run(0.25), null);
}
console.log('link-health: ok');
