// Tests of the session link's minute for the beacon (src/net/net-minute.ts) in Node: pings, stalls, drops and
// coming back, bytes over the seconds in a session, and nothing at all outside one.
// Usage: node scripts/net-minute.test.mjs
import assert from 'node:assert/strict';
import { NET } from '../src/config.ts';
import { NetMinute } from '../src/net/net-minute.ts';

const m = new NetMinute();
assert.equal(m.take(), undefined, 'not in a session: nothing');
for (let i = 0; i < 100; i++) m.pinged(i + 1);
m.carried(10000, 300000);
m.frame(5, 0.1);
m.frame(2, NET.stallGap + 0.5);
m.frame(1, NET.stallGap + 1);
m.frame(2, 0.05);
m.dropped('1006', 100);
m.dropped('timeout', 101);
m.in(102.4);
assert.deepEqual(m.take(), { seconds: 10, ping: { p50: 51, p95: 96, max: 100 }, drops: { 1006: 1, timeout: 1 }, back: [2.4], stalls: 1, stallLong: [NET.stallGap + 1], down: 30, up: 1 });
assert.equal(m.take(), undefined, 'taken: it starts over');
m.dropped('1006', 0);
assert.deepEqual(m.take()?.drops, { 1006: 1 }, 'a drop with no time in the session still goes');
console.log('net minute: ok (pings, stalls, drops and coming back, KB/s, nothing outside a session)');
