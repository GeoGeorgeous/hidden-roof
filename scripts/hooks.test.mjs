// Tests of the debug panel's hooks (src/debug/hooks.ts) in Node: a hook taken
// by reference before the dev tools set it runs the one set later.
// Usage: node scripts/hooks.test.mjs
import assert from 'node:assert/strict';
import { hooks } from '../src/debug/hooks.ts';

const h = hooks({ rebuild: () => 'default', label: (n) => `n/a ${n}` });
const rebuild = h.call.rebuild;
const label = h.call.label;
assert.equal(rebuild(), 'default');
h.set({ rebuild: () => 'set', label: (n) => `${n} ms` });
assert.equal(rebuild(), 'set', 'a hook taken by reference runs the one set later');
assert.equal(label(3), '3 ms', 'arguments and results pass through');
console.log('debug hooks: ok (taken by reference before they are set, they run the ones set later)');
