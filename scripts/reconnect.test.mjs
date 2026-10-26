// Tests of how a rejection ends a game (src/net/reconnect.ts) in Node: coming back to a server too busy for it is a
// failed try, any other rejection ends the game (a kick's close code included: it says the rejection even when its
// message still waits behind a welcome), and a session gone while coming back is the server's restart.
// Usage: node --experimental-transform-types scripts/reconnect.test.mjs
import assert from 'node:assert/strict';
import { closeCode, rejectionOf } from '../src/net/protocol.ts';
import { endedBy } from '../src/net/reconnect.ts';

const end = (code, back) => endedBy(rejectionOf(code), back);
assert.equal(end(closeCode('kicked'), true), 'kicked');
assert.equal(end(closeCode('replaced'), true), 'replaced');
assert.equal(end(closeCode('ended'), false), 'ended');
for (const r of ['busy', 'too-many']) {
  assert.equal(end(closeCode(r), true), undefined, `${r} coming back is a failed try`);
  assert.equal(end(closeCode(r), false), r, `${r} on a first try is the answer`);
}
assert.equal(end(closeCode('no-session'), true), 'restarted');
assert.equal(end(closeCode('no-session'), false), 'no-session');
assert.equal(rejectionOf(1006), undefined, 'a plain drop says nothing');
console.log('reconnect: ok');
