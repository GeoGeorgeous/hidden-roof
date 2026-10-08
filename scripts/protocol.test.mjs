// Tests of the multiplayer messages (src/net/protocol.ts) in Node, as the
// server reads them: round trips, exact paint op numbers, and what the server
// turns down.
// Usage: node scripts/protocol.test.mjs
import assert from 'node:assert/strict';
import { checkToServer, cleanName, decode, encode, PROTOCOL } from '../src/net/protocol.ts';

const level = { version: 4, spawn: { pos: [0, 0, 0], yaw: 0 }, props: [{ id: 1, type: 'slab', pos: [0, 0, 0] }] };
const stamp = { kind: 'stamp', key: 'p12#0', rect: 3, u: 0.1 + 0.2, v: 1 / 3, radius: 0.0125, amount: 0.35, color: [1, 0.2, 0.1], softness: 0.5, square: false };
const roll = { kind: 'roll', key: 'jwall|2.00|0.00|4.00#0', rect: 0, u: 0.5, v: 0.25, axis: [0.6, 0, -0.8], halfLength: 0.11, halfWidth: 0.02, edge: 0.2, amount: 0.9, color: [0, 0, 1] };
const drip = { kind: 'drip', key: 'p3#1', rect: 2, u: 0.51, v: 0.97, length: 0.4, speed: 0.07, rgb: [1, 1, 0] };
const snap = new Uint8Array(23).map((_, i) => i * 11);
const save = new Uint8Array(1000).map((_, i) => (i * 7) & 255);

const host = { type: 'host', protocol: PROTOCOL, table: '00a1b2c3d4e5f6', name: 'geo', levelName: 'demo', level, detail: 96, bytes: save };
const join = { type: 'join', protocol: PROTOCOL, name: 'ghost', code: 'ABCDE', token: 'x1' };
const sent = [
  host,
  { ...host, bytes: undefined },
  join,
  { type: 'state', bytes: snap },
  { type: 'ops', t: [1.5, 1.55, 1.6], ops: [stamp, roll, drip] },
  { type: 'ladder', t: 2, data: { type: 'stepladder', pos: [1, 0, 2], rot: 3 } },
  { type: 'ladder', t: 2.5, data: null },
  { type: 'save' },
  { type: 'ping', t: 12.5 },
  { type: 'leave' },
];
// Every message comes back as sent: paint ops to the last bit of every number, which keeps everyone's paint identical.
for (const m of sent) {
  const { bytes, ...json } = m;
  const back = checkToServer(decode(encode(m)));
  assert.ok(back, `${m.type} is refused`);
  const { bytes: got, ...rest } = back;
  assert.deepEqual(rest, Object.fromEntries(Object.entries(json).filter(([, v]) => v !== undefined)));
  assert.deepEqual(got, bytes);
}
const welcome = { type: 'welcome', code: 'ABCDE', you: 2, token: 't', levelName: 'demo', level, detail: 48, table: 'x', players: [{ id: 1, name: 'geo' }], ladders: [], bytes: save };
const { bytes: paint, ...w } = decode(encode(welcome));
assert.deepEqual({ ...w, bytes: paint }, welcome);

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
refused({ type: 'ops', t: [1], ops: [stamp, roll] });
refused({ type: 'ops', t: [1], ops: [{ ...stamp, kind: 'splat' }] });
refused({ type: 'ops', t: [1], ops: [{ ...stamp, rect: -1 }] });
refused({ type: 'ops', t: [1], ops: [{ ...roll, color: null }] });
refused({ type: 'ops', t: [1], ops: [{ ...drip, rgb: [2, 0, 0] }] });
// A run with no length or speed would never end.
refused({ type: 'ops', t: [1], ops: [{ ...drip, speed: 0 }] });
refused({ type: 'ops', t: [1], ops: [{ ...drip, length: -1 }] });
refused({ type: 'ops', t: [null], ops: [stamp] });
refused({ type: 'ladder', t: 1, data: { type: 'building', pos: [0, 0, 0] } });
refused({ type: 'ladder', t: 1 });
refused({ type: 'ping' });
// Non-finite numbers don't survive JSON (they become null), so they're refused too.
refused({ type: 'ops', t: [1], ops: [{ ...stamp, u: NaN }] });

assert.equal(cleanName('  a name far longer than allowed  '), 'a name far longe');
assert.equal(cleanName('ゴースト'), 'ゴースト');
console.log(`protocol: ok (${sent.length} messages round trip; a stroke of ${encode(sent[4]).length} bytes for 3 ops)`);
