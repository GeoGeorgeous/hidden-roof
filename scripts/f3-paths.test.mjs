// Tests of the F3 panel's rows in Node: each value row's config path resolves
// in config.ts, and its default fits the row (in a slider's range, on/off for
// a toggle, a hex for a color). A path the panel can't read stops the dev
// tools as the game loads; this names it.
// Usage: npm test (node --experimental-transform-types scripts/f3-paths.test.mjs)
import assert from 'node:assert/strict';
import { register } from 'node:module';

// The game's imports leave out .ts (Vite resolves them); here a relative one without an extension gets it.
const hook = `export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) { if (/^\\.\\.?\\//.test(s) && !/\\.\\w+$/.test(s)) return next(s + '.ts', c); throw e; }
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`);

const config = await import('../src/config.ts');
const { captureDefaults, defaultOf } = await import('../src/debug/defaults.ts');
const { allSections } = await import('../src/debug/sections.ts');
captureDefaults();

const bad = [];
let rows = 0;
for (const s of allSections()) {
  for (const it of s.items) {
    if (!it.path) continue;
    rows++;
    const name = `${s.id} "${it.label}" (${it.path.join('.')})`;
    const parent = it.path.slice(0, -1).reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), config);
    if (!parent || typeof parent !== 'object' || !(it.path.at(-1) in parent)) {
      bad.push(`${name}: no such config value`);
      continue;
    }
    const d = defaultOf(it.path);
    const fits = it.kind === 'range' ? typeof d === 'number' && d >= it.min && d <= it.max : it.kind === 'toggle' ? typeof d === 'boolean' : typeof d === 'string' && /^#[0-9a-f]{6}$/i.test(d);
    if (!fits) bad.push(`${name}: config.ts has ${JSON.stringify(d)}, ${it.kind === 'range' ? `outside ${it.min}..${it.max}` : `not a ${it.kind}`}`);
  }
}
assert.ok(rows > 100, `only ${rows} value rows found`);
assert.deepEqual(bad, [], `F3 rows that don't fit config.ts:\n${bad.join('\n')}`);
console.log(`f3 paths: ok (${rows} rows: each path in config.ts, each default fits its row)`);
