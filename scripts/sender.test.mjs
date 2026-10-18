// Tests of what a player sends (src/net/sender.ts) in Node: who has paint.log,
// the snapshots' clock, the stepladder and the inventory when they change.
// Usage: node scripts/sender.test.mjs
import assert from 'node:assert/strict';
import { NET } from '../src/config.ts';
import { Sender } from '../src/net/sender.ts';

/** A sender over a fake game: a paint log, a level with one stepladder to place, an inventory to change. */
function setup() {
  const game = {
    paint: { log: null },
    props: new Map([[7, { type: 'stepladder', pos: [1, 2, 3], rot: 1 }]]),
    ladder: undefined,
    inventory: { version: 0, toJSON: () => ({ v: game.inventory.version }) },
    capture: (at) => new Uint8Array([Math.round(at * 100)]),
  };
  const level = { props: game.props, runtimeOf: (owner) => (owner === 'me' ? game.ladder : undefined) };
  const sender = new Sender({ capture: (at) => game.capture(at), paint: game.paint, level, owner: () => 'me', inventory: game.inventory });
  return { game, sender };
}
const types = (sent) => sent.messages.map((m) => m.type);
const op = (u) => ({ kind: 'stamp', key: 'a', rect: 0, u, v: 0.5, radius: 0.1, amount: 1, color: [1, 0, 0], softness: 0, square: false });

// Snapshots go NET.sendRate times a second on the clock it's handed, the first at once; the inventory goes with the first.
{
  const { sender } = setup();
  const dt = 1 / 60;
  let ticks = 0;
  let first;
  for (let i = 0; i < 60; i++) {
    const sent = sender.update(i * dt, i * dt + 1.5);
    if (i === 0) first = sent;
    if (sent.tick) ticks++;
    assert.equal(sent.tick, types(sent).includes('state'), 'tick says there is a snapshot');
  }
  assert.deepEqual(types(first), ['inventory', 'state'], 'the first frame: what they carry, then where they are');
  assert.deepEqual([...first.messages[1].bytes], [150], 'a snapshot is stamped with the time it is handed (at), spaced by now');
  assert.ok(Math.abs(ticks - NET.sendRate) <= 1, `${ticks} snapshots in a second at ${NET.sendRate} a second`);
}

// A late frame doesn't owe the snapshots it missed: the clock catches up, and they go on at the rate.
{
  const { sender } = setup();
  sender.update(0, 0);
  const ticks = [1, 1.01, 1.02, 1.03, 1.04].map((t) => sender.update(t, t).tick);
  assert.deepEqual(ticks, [true, true, false, false, false], 'not a burst of the ones missed');
  assert.ok(sender.update(1.06, 1.06).tick);
}

// The stepladder is sent when it is placed, moved or taken away, never twice for the same; the inventory when its version changes.
{
  const { sender, game } = setup();
  sender.update(0, 0);
  assert.deepEqual(types(sender.update(0.001, 0.001)), [], 'nothing changed, nothing sent');
  game.ladder = 7;
  game.inventory.version++;
  const placed = sender.update(0.002, 0.002);
  assert.deepEqual(types(placed), ['ladder', 'inventory']);
  assert.deepEqual(placed.messages[0], { type: 'ladder', t: 0.002, data: { type: 'stepladder', pos: [1, 2, 3], rot: 1 } });
  assert.deepEqual(placed.messages[1], { type: 'inventory', data: { v: 1 } });
  assert.deepEqual(types(sender.update(0.003, 0.003)), []);
  game.ladder = undefined;
  assert.deepEqual(sender.update(0.004, 0.004).messages, [{ type: 'ladder', t: 0.004, data: null }], 'taken away');
}

// restart: the others already know the stepladder (a welcome), the snapshot and the inventory go again.
{
  const { sender, game } = setup();
  game.ladder = 7;
  sender.restart(7);
  assert.deepEqual(types(sender.update(0, 0)), ['inventory', 'state'], 'a ladder the others know is not sent again');
  sender.restart();
  assert.deepEqual(types(sender.update(0.001, 0.001)), ['ladder', 'inventory', 'state'], 'restarted knowing none: the ladder, what they carry, a snapshot');
}

// paint.log: begun by one, refused to a second, taken over by a session; an ended owner leaves what isn't its own.
{
  const { sender, game } = setup();
  const other = new Sender({ capture: () => new Uint8Array(), paint: game.paint, level: { props: game.props, runtimeOf: () => undefined }, owner: () => 'x', inventory: game.inventory });
  assert.equal(sender.take().length, 0, 'not logging: nothing to take');
  assert.ok(sender.begin() && sender.logging && Array.isArray(game.paint.log));
  assert.equal(other.begin(), false, 'a second owner is refused');
  assert.equal(other.logging, false);
  other.end();
  assert.ok(sender.logging, 'a refused one ending leaves the log alone');
  game.paint.log.push(op(0.1), op(0.2));
  const sent = sender.update(0, 0);
  assert.deepEqual(sent.ops.map((o) => o.u), [0.1, 0.2], 'the ops made, in order');
  assert.equal(game.paint.log.length, 0, 'and the log is emptied');
  assert.deepEqual(sender.update(0.001, 0.001).ops, [], 'taken once');
  // A session takes the log from a recording; the recording ending later leaves the session's alone.
  assert.ok(other.begin(true));
  assert.equal(sender.logging, false);
  sender.end();
  assert.ok(other.logging && game.paint.log !== null, 'the one that lost it ending does not put it back to null');
  game.paint.log.push(op(0.3));
  assert.equal(sender.take().length, 0, 'and takes none of the session\'s ops');
  assert.deepEqual(other.take().map((o) => o.u), [0.3]);
  other.end();
  assert.equal(game.paint.log, null, 'the owner ending ends it');
  assert.ok(sender.begin(), 'free again');
  sender.end();
}

console.log('sender: ok');
