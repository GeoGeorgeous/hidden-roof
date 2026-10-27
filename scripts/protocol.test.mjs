// Tests of the multiplayer messages (src/net/protocol.ts) in Node, as the
// server reads them: round trips, exact paint op numbers, and what the server
// turns down. Then the op batches a game keeps until the server has them (net/outbox.ts).
// Usage: node scripts/protocol.test.mjs
import assert from 'node:assert/strict';
import { PAINT, PAINT_DETAIL, SERVER } from '../src/config.ts';
import { Outbox } from '../src/net/outbox.ts';
import { decodeOps, encodeOps, rounded, SurfaceIndex } from '../src/op-wire.ts';
import { LEVEL_VERSION, levelProblem } from '../src/level/level-data.ts';
import { checkToServer, cleanName, closeCode, decode, encode, isName, isSessionName, partFrames, PROTOCOL, rejectionOf, SNAPSHOT_BYTES } from '../src/net/protocol.ts';

const level = { version: 4, spawn: { pos: [0, 0, 0], yaw: 0 }, props: [{ id: 1, type: 'slab', pos: [0, 0, 0] }] };
const stamp = { kind: 'stamp', key: 'p12#0', rect: 3, u: 0.1 + 0.2, v: 1 / 3, radius: 0.0125, amount: 0.35, color: [1, 0.2, 0.1], softness: 0.5, square: false };
const roll = { kind: 'roll', key: 'jwall|2.00|0.00|4.00#0', rect: 0, u: 0.5, v: 0.25, axis: [0.6, 0, -0.8], halfLength: 0.11, halfWidth: 0.02, edge: 0.2, amount: 0.9, color: [0, 0, 1] };
const drip = { kind: 'drip', key: 'p3#1', rect: 2, u: 0.51, v: 0.97, length: 0.4, speed: 0.07, rgb: [1, 1, 0] };
const surfaces = new SurfaceIndex([drip.key, stamp.key, roll.key, 'p1#0']);
const snap = new Uint8Array(SNAPSHOT_BYTES).map((_, i) => i * 11);
const save = new Uint8Array(1000).map((_, i) => (i * 7) & 255);

const host = { type: 'host', protocol: PROTOCOL, table: '00a1b2c3d4e5f6', name: 'geo', levelName: 'demo', level, detail: 96, session: { name: 'Friends', limit: 3, tools: ['can', 'sponge'] }, bytes: save };
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
  { type: 'status', status: 'idle' },
  { type: 'status', status: 'lagging' },
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
const welcome = { type: 'welcome', code: 'ABCDE', you: 2, name: 'geo (2)', token: 't', levelName: 'demo', level, detail: 48, table: 'x', players: [{ id: 1, name: 'geo', state: 'away' }], ladders: [], inventory: null, parts: 3, acked: 0 };
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
// A name is Latin letters and digits (ASCII) only, 1 to NAME_MAX of them: the menu and the server ask the same isName.
for (const name of ['Geo', 'geo', 'GEOGEO', 'G293', '7', 'abcdefghij123456']) {
  assert.ok(isName(name), name);
  assert.ok(checkToServer(decode(encode({ ...join, name }))), name);
}
for (const name of ['', '   ', 'Geo Geo', ' Geo', 'Geo ', 'Geo_', 'Geo.', 'Geo-1', 'Гоша', 'Geо', 'ゴースト', 'Geo!@#$%', 'Ｇｅｏ', 'Geo\n', 'a\u0000b', 'abcdefghij1234567', 7, null]) {
  assert.ok(!isName(name), JSON.stringify(name));
  refused({ ...host, name });
  refused({ ...join, name });
}
// A hosted session: a name (trimmed, 1 to SESSION_NAME_MAX, no control characters), a limit from privateMin to the private limit, some tools each once.
const hosting = (session) => ({ ...host, session: { ...host.session, ...session } });
for (const session of [{ name: ' Friends ' }, { name: 'x'.repeat(32) }, { name: 'Ünï cöde ✓' }, { limit: SERVER.privateMin }, { limit: SERVER.players.private }, { tools: [] }, { tools: ['sponge', 'can', 'marker', 'ladder', 'roller'] }]) assert.ok(checkToServer(decode(encode(hosting(session)))), JSON.stringify(session));
for (const session of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(33) }, { name: 'a\nb' }, { name: 'a\u0000b' }, { name: 'a\u200bb' }, { name: 7 }, { name: null }, { limit: SERVER.privateMin - 1 }, { limit: SERVER.players.private + 1 }, { limit: 2.5 }, { limit: '3' }, { limit: null }, { tools: ['can', 'can'] }, { tools: ['spoon'] }, { tools: 'can' }, { tools: [1] }, { tools: null }]) refused(hosting(session));
for (const session of [undefined, null, 'Friends', ['Friends', 3, []]]) refused({ ...host, session });
assert.ok(isSessionName('  trimmed ') && !isSessionName('   ') && !isSessionName(undefined));
// Another protocol passes whatever else is in it (a name or fields an older game sent), so the server can answer 'version'; the current one keeps every check.
for (const m of [host, join]) {
  assert.ok(checkToServer(decode(encode({ ...m, protocol: PROTOCOL - 1, name: 'Anna K', code: 'x', level: 1 }))));
  assert.ok(checkToServer(decode(encode({ ...m, protocol: PROTOCOL + 1, name: '' }))));
  refused({ ...m, protocol: PROTOCOL, name: 'Anna K' });
  refused({ ...m, protocol: '6', name: 'Anna K' });
}
// A socket's close code says the rejection it came with; any other close code says none.
for (const r of ['version', 'no-session', 'ended', 'full', 'bad-save', 'bad-level', 'busy', 'replaced', 'too-many', 'no-host', 'kicked', 'seats', 'rate']) assert.equal(rejectionOf(closeCode(r)), r);
for (const code of [1000, 1006, 1008, 1011, 4000, 4014]) assert.equal(rejectionOf(code), undefined, String(code));
// A name saved by an older version is cleaned to what a name may be: letters and digits, at most NAME_MAX.
assert.equal(cleanName('Geo Geo'), 'GeoGeo');
assert.equal(cleanName('Гоша_7!'), '7');
assert.equal(cleanName('abcdefghij1234567'), 'abcdefghij123456');
assert.equal(cleanName('Ｇｅｏ'), '');
for (const name of ['Geo Geo', 'Гоша_7!', 'abcdefghij1234567', ' g.e-o ']) assert.ok(!cleanName(name) || isName(cleanName(name)), name);
refused({ ...host, level: { props: 'x' } });
refused({ ...host, level: { ...level, props: [{ type: 'slab' }] } });
refused({ ...host, level: { ...level, props: [{ type: 'slab', pos: [0, 0, 0], rot: 1.5 }] } });
refused({ ...host, level: { ...level, props: Array.from({ length: 5001 }, () => level.props[0]) } });
// The level as the game checks a file (levelProblem, level-data.ts): a spawn with no position, bad pickups.
refused({ ...host, level: { ...level, spawn: { yaw: 0 } } });
refused({ ...host, level: { ...level, pickups: [{ kind: 'can' }] } });
// And the game refuses what HOST would be: a prop turned by a fraction of a quarter turn.
assert.equal(levelProblem({ ...level, props: [{ ...level.props[0], rot: 1.5 }] }), 'BAD PROPS');
assert.equal(levelProblem(level), null);
// A file from a newer game is refused, not read as the newest format this one knows.
assert.equal(levelProblem({ ...level, version: LEVEL_VERSION + 1 }), 'MADE BY A NEWER VERSION');
assert.equal(levelProblem({ ...level, version: '4' }), 'BAD VERSION');
refused({ ...host, level: { ...level, version: LEVEL_VERSION + 1 } });
refused({ ...join, code: 'ABCD' });
refused({ ...join, code: 'ABCDI' });
refused({ ...join, code: 'abcde' });
refused({ ...join, protocol: -1 });
// A join may carry the queue token of an earlier 'queued': a short string, or none.
assert.ok(checkToServer(decode(encode({ ...join, queue: '4f0d1c3e-9a52-4c0e-8d4e-0a1b2c3d4e5f' }))));
for (const queue of [7, null, ['x'], 'x'.repeat(65)]) refused({ ...join, queue });
refused({ type: 'state', bytes: snap.subarray(1) });
refused({ type: 'state' });
// Op batches are numbered from 1, and packed.
refused({ type: 'ops', bytes: encodeOps([1], [stamp], surfaces) });
refused({ type: 'ops', seq: 0, bytes: encodeOps([1], [stamp], surfaces) });
refused({ type: 'ops', seq: 1 });
refused({ type: 'ladder', t: 1, data: { type: 'building', pos: [0, 0, 0] } });
refused({ type: 'ladder', t: 1 });
refused({ type: 'ping' });
refused({ type: 'status' });
refused({ type: 'status', status: 'dropped' });
refused({ type: 'inventory', data: { tools: [], colors: [], caps: [], selected: -1, color: 'red', cap: 'x' } });
refused({ type: 'inventory', data: { tools: Array(33).fill('x'), colors: [], caps: [], selected: 0, color: 'red', cap: 'x' } });

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

// Paint ops travel in meters, so neither module reads the local PAINT.texelsPerMeter: at every PAINT DETAIL
// the messages and op batches pack to the same bytes and unpack to the same ops.
const wire = () => {
  const ops = encodeOps([1.5, 1.55, 1.6], [stamp, roll, drip], surfaces);
  return { frames: sent.map((m) => [...encode(m)]), ops: [...ops], back: decodeOps(ops, surfaces), rounded: [stamp, roll, drip].map(rounded) };
};
const texels = PAINT.texelsPerMeter;
const byDetail = Object.values(PAINT_DETAIL).map((d) => ((PAINT.texelsPerMeter = d), wire()));
PAINT.texelsPerMeter = texels;
for (const w of byDetail) assert.deepEqual(w, byDetail[0]);

console.log(`protocol: ok (${sent.length} messages round trip; a stroke of ${encode(sent[4]).length} bytes for 3 ops, a stamp ${encodeOps([0], [stamp], surfaces).length - 8})`);
