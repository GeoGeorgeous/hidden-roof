// Tests of the message catalogue (src/messages.ts) in Node: values fill in, a missing one stays visible, action names stay.
// Usage: node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/messages.test.mjs
import assert from 'node:assert/strict';
import { MESSAGES, msg, msgLines } from '../src/messages.ts';

assert.equal(msg('toast.joined', { user: 'Geo' }), '**Geo** joined');
assert.equal(msg('chip.reconnecting', { n: 3 }), 'Trying to reconnect · Attempt #3');
assert.equal(msg('dialogue.sessionLost'), "You're playing alone now; your paint is kept");
// A missing value stays as {name}; an extra one is ignored.
assert.equal(msg('toast.pickedUp'), 'You picked up **{item}**');
assert.equal(msg('toast.left', { user: 'A', other: 1 }), '**A** left');
// Action names are not values: they stay for the display to resolve.
assert.deepEqual(msgLines('hint.climb'), ['Walk into the ladder or hold {jump} to climb', 'Hold {crouch} to stay on it']);
assert.equal(msg('hint.move', { forward: 'W' }), 'Press W {left} {back} {right} to move\nHold {sprint} to run, press {jump} to jump');
// Values go in as plain text: no template syntax, no $ patterns, no second pass.
assert.equal(msg('toast.joined', { user: '{item} $& **x**' }), '**{item} $& **x**** joined');
// Hints are at most 3 lines.
for (const [id, lines] of Object.entries(MESSAGES.hint)) assert.ok(lines.length <= 3, id);
console.log('messages: ok');
