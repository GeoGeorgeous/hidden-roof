// Tests of the multiplayer messages (src/net/protocol.ts) in Node, as the
// server reads them: round trips, exact paint op numbers, and what the server
// turns down. Then the op batches a game keeps until the server has them (net/outbox.ts).
// Usage: node scripts/protocol.test.mjs
import assert from 'node:assert/strict';
import { Outbox } from '../src/net/outbox.ts';
import { decodeOps, encodeOps, rounded, SurfaceIndex } from '../src/op-wire.ts';
import { checkToServer, cleanName, decode, encode, partFrames, PROTOCOL, SNAPSHOT_BYTES } from '../src/net/protocol.ts';

const level = { version: 4, spawn: { pos: [0, 0, 0], yaw: 0 }, props: [{ id: 1, type: 'slab', pos: [0, 0, 0] }] };
const stamp = { kind: 'stamp', key: 'p12#0', rect: 3, u: 0.1 + 0.2, v: 1 / 3, radius: 0.0125, amount: 0.35, color: [1, 0.2, 0.1], softness: 0.5, square: false };
const roll = { kind: 'roll', key: 'jwall|2.00|0.00|4.00#0', rect: 0, u: 0.5, v: 0.25, axis: [0.6, 0, -0.8], halfLength: 0.11, halfWidth: 0.02, edge: 0.2, amount: 0.9, color: [0, 0, 1] };
const drip = { kind: 'drip', key: 'p3#1', rect: 2, u: 0.51, v: 0.97, length: 0.4, speed: 0.07, rgb: [1, 1, 0] };
const surfaces = new SurfaceIndex([drip.key, stamp.key, roll.key, 'p1#0']);
const snap = new Uint8Array(SNAPSHOT_BYTES).map((_, i) => i * 11);
const save = new Uint8Array(1000).map((_, i) => (i * 7) & 255);

const host = { type: 'host', protocol: PROTOCOL, table: '00a1b2c3d4e5f6', name: 'geo', levelName: 'demo', level, detail: 96, bytes: save };
const join = { type: 'join', protocol: PROTOCOL, name: 'ghost', code: 'ABCDE', token: 'x1' };
const sent = [
  host,
  { ...host, bytes: undefined },
  join,
  { type: 'state', bytes: snap },
  { type: 'ops', seq: 1, bytes: encodeOps([1.5, 1.55, 1.6], [stamp, roll, drip], surfaces) },
  { type: 'ladder', t: 2, data: { type: 'stepladder', pos: [1, 0, 2], rot: 3 } },
  { type: 'ladder', t: 2.5, data: null },
  { type: 'save' },
  { type: 'inventory', data: { tools: ['marker', 'ladder'], colors: ['black', 'red'], caps: ['standard'], selected: 2, color: 'red', cap: 'standard' } },
  { type: 'away', away: true },
  { type: 'ping', t: 12.5 },
  { type: 'leave' },
];
// Every message comes back as sent.
for (const m of sent) {
  const { bytes, ...json } = m;
  const back = checkToServer(decode(encode(m)));
  assert.ok(back, `${m.type} is refused`);
  const { bytes: got, ...rest } = back;
  assert.deepEqual(rest, Object.fromEntries(Object.entries(json).filter(([, v]) => v !== undefined)));
  assert.deepEqual(got, bytes);
}
const welcome = { type: 'welcome', code: 'ABCDE', you: 2, token: 't', levelName: 'demo', level, detail: 48, table: 'x', players: [{ id: 1, name: 'geo', state: 'away' }], ladders: [], inventory: null, parts: 3, acked: 0 };
assert.deepEqual(decode(encode(welcome)), welcome);
// A paint file in pieces goes as parts of at most the size asked, and comes back whole.
const parts = partFrames([save.subarray(0, 10), save.subarray(10, 700), save.subarray(700)], 400).map(decode);
assert.deepEqual([parts.map((p) => p.type), parts.map((p) => p.bytes.length)], [['part', 'part', 'part'], [400, 400, 200]]);
assert.deepEqual(new Uint8Array(parts.flatMap((p) => [...p.bytes])), save);

// Not messages.
for (const frame of [new Uint8Array(0), new Uint8Array([9, 0, 0, 0, 1]), encode({ type: 'save' }).subarray(0, 8)]) assert.equal(decode(frame), null);
const raw = (json) => {
  const j = new TextEncoder().encode(json);
  const b = new Uint8Array(4 + j.length);
  new DataView(b.buffer).setUint32(0, j.length, true);
  b.set(j, 4);
  return b;
};
for (const json of ['{"type":', '[1,2]', '{"kind":"x"}', 'null']) assert.equal(decode(raw(json)), null);

// Turned down by the server.
const refused = (m) => assert.equal(checkToServer(decode(encode(m))), null, JSON.stringify(m).slice(0, 120));
refused({ type: 'nope' });
refused({ ...host, detail: 50 });
refused({ ...host, name: '   ' });
refused({ ...host, level: { props: 'x' } });
refused({ ...host, level: { ...level, props: [{ type: 'slab' }] } });
refused({ ...host, level: { ...level, props: [{ type: 'slab', pos: [0, 0, 0], rot: 1.5 }] } });
refused({ ...host, level: { ...level, props: Array.from({ length: 5001 }, () => level.props[0]) } });
refused({ ...join, code: 'ABCD' });
refused({ ...join, code: 'ABCDI' });
refused({ ...join, code: 'abcde' });
refused({ ...join, protocol: -1 });
refused({ type: 'state', bytes: snap.subarray(1) });
refused({ type: 'state' });
// Op batches are numbered from 1, and packed.
refused({ type: 'ops', bytes: encodeOps([1], [stamp], surfaces) });
refused({ type: 'ops', seq: 0, bytes: encodeOps([1], [stamp], surfaces) });
refused({ type: 'ops', seq: 1 });
refused({ type: 'ladder', t: 1, data: { type: 'building', pos: [0, 0, 0] } });
refused({ type: 'ladder', t: 1 });
refused({ type: 'ping' });
refused({ type: 'away' });
refused({ type: 'inventory', data: { tools: [], colors: [], caps: [], selected: -1, color: 'red', cap: 'x' } });
refused({ type: 'inventory', data: { tools: Array(33).fill('x'), colors: [], caps: [], selected: 0, color: 'red', cap: 'x' } });

assert.equal(cleanName('  a name far longer than allowed  '), 'a name far longe');
assert.equal(cleanName('ゴースト'), 'ゴースト');
// Paint ops packed (op-wire.ts, BL-024): every op comes out as the painter rounded it (rounded), to the last bit, so
// everyone paints the same texels; rounded again or packed again it doesn't change; close to what was made; times to
// the ms. A stamp is 23 bytes.
const { t: times, ops: [s2, r2, d2] } = decodeOps(encodeOps([1.5, 1.55, 1.6], [stamp, roll, drip], surfaces), surfaces);
assert.deepEqual([s2, r2, d2], [stamp, roll, drip].map(rounded));
assert.deepEqual([s2, r2, d2].map(rounded), [s2, r2, d2]);
assert.ok(s2.u !== stamp.u && Math.abs(s2.u - stamp.u) < 1e-4 && Math.abs(r2.axis[0] - roll.axis[0]) < 1e-4 && Math.abs(d2.speed - drip.speed) < 1e-4);
assert.deepEqual(decodeOps(encodeOps(times, [s2, r2, d2], surfaces), surfaces).ops, [s2, r2, d2]);
assert.ok(times.every((t, i) => Math.abs(t - [1.5, 1.55, 1.6][i]) < 1e-3));
const scrub = decodeOps(encodeOps([0], [{ ...stamp, color: null, square: true }], surfaces), surfaces).ops[0];
assert.deepEqual([scrub.color, scrub.square], [null, true]);
assert.equal(encodeOps([0], [stamp, stamp], surfaces).length - encodeOps([0], [stamp], surfaces).length, 23);
// An op on a surface not in the session is left out; bytes that aren't a batch are refused.
assert.deepEqual(decodeOps(encodeOps([0, 1], [{ ...stamp, key: 'nowhere' }, roll], surfaces), surfaces).t, [1]);
const packed = encodeOps([0], [drip], surfaces);
for (const bad of [packed.subarray(0, packed.length - 1), Object.assign(packed.slice(), { 8: 3 }), encodeOps([0], [{ ...drip, speed: 0 }], surfaces)]) assert.equal(decodeOps(bad, surfaces), null);
// A surface past the end of the index (the kind byte 3 above: no such kind).
assert.equal(decodeOps(encodeOps([0], [stamp], surfaces), new SurfaceIndex([])), null);

// Op batches (net/outbox.ts, BL-003): numbered from 1, kept until acked; back after a drop, what the server doesn't
// have (and what was painted meanwhile) is painted again and sent again, in order; a new session starts over.
const out = new Outbox();
const log = [stamp];
out.take(log, 1);
assert.equal(log.length, 0);
assert.deepEqual(out.batch(), { seq: 1, t: [1], ops: [stamp] });
assert.equal(out.batch(), null);
out.take([roll], 2);
out.batch();
out.take([drip], 3);
out.batch();
out.acked(1);
out.take([stamp], 4);
const painted = [];
assert.deepEqual(out.rejoined(2, (op) => painted.push(op)).map((b) => [b.seq, b.t]), [[3, [3]], [4, [4]]]);
assert.deepEqual(painted, [drip, stamp]);
out.acked(4);
assert.deepEqual(out.rejoined(4, () => assert.fail('nothing to paint again')), []);
out.clear();
out.take([roll], 5);
assert.equal(out.batch().seq, 1);

console.log(`protocol: ok (${sent.length} messages round trip; a stroke of ${encode(sent[4]).length} bytes for 3 ops, a stamp ${encodeOps([0], [stamp], surfaces).length - 8})`);
