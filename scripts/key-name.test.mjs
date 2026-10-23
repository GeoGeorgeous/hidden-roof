// Tests of key names from the keyboard layout (src/key-name.ts) in Node: Latin letters show, other scripts and symbols don't.
// Usage: npm test (node --experimental-transform-types scripts/key-name.test.mjs)
import assert from 'node:assert/strict';
import { layoutName } from '../src/key-name.ts';

for (const [printed, name] of [['z', 'Z'], ['q', 'Q'], ['é', 'É'], ['w', 'W']]) assert.equal(layoutName(printed), name);
for (const printed of ['ц', 'ф', 'Ж', 'α', 'ж', '&', '1', ';', '', undefined]) assert.equal(layoutName(printed), undefined, String(printed));
console.log('key names: ok (a Latin letter from the layout, the physical key for any other script)');
