// Tests of wet paint in Node (src/paint-wet.ts): how it builds up, dries and what a run takes.
// Usage: npm test (node --experimental-transform-types scripts/paint-wet.test.mjs)
import assert from 'node:assert/strict';
import './ts-imports.mjs';

const { DRIPS } = await import('../src/config.ts');
const { paintRandom } = await import('../src/lcg.ts');
const { WetPaint } = await import('../src/paint-wet.ts');

const surface = () => ({ geo: { atlasW: 64, atlasH: 64, texelsPerMeter: 96 }, wet: null });
const SURE = 1e9;
const pass = DRIPS.passCoats;

// Under the passes needed nothing runs, at them it does.
{
  const wet = new WetPaint();
  const s = surface();
  assert.equal(wet.add(s, 1, 1, pass * DRIPS.passes - 1, SURE), false, 'under the passes');
  assert.equal(wet.add(s, 1, 1, 1, SURE), true, 'at the passes');
  assert.equal(wet.add(s, 1, 1, 1, SURE), false, 'the paint that ran is gone');
}

// Paint dries: the same coats, late, are short of it.
{
  const wet = new WetPaint();
  const s = surface();
  wet.add(s, 2, 2, pass * DRIPS.passes - 1, SURE);
  wet.now += DRIPS.dryTime;
  assert.equal(wet.add(s, 2, 2, 1, SURE), false, 'dried meanwhile');
}

// More passes needed take more paint, and drying doesn't move with them.
{
  const passes = DRIPS.passes;
  DRIPS.passes = 2;
  const wet = new WetPaint();
  const s = surface();
  assert.equal(wet.add(s, 3, 3, pass, SURE), false, 'one pass of two');
  assert.equal(wet.add(s, 3, 3, pass, SURE), true, 'two passes of two');
  wet.add(s, 4, 4, pass, SURE);
  wet.now += DRIPS.dryTime - 1e-3;
  assert.ok(s.wet[4 * 64 + 4] > wet.now, 'a pass dries in dryTime, whatever the passes');
  DRIPS.passes = passes;
}

// The dice: as often as the rate says, at any detail.
{
  let i = 0;
  paintRandom.drips = () => ((i += 0.618033988) % 1);
  for (const tpm of [24, 96]) {
    const wet = new WetPaint();
    const s = { geo: { atlasW: 256, atlasH: 256, texelsPerMeter: tpm }, wet: null };
    let runs = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if (wet.add(s, x, y, pass * DRIPS.passes, 0.05 * tpm * tpm)) runs++;
    assert.ok(Math.abs(runs / 65536 - 0.05) < 0.005, `${tpm}: ${runs}`);
  }
}

console.log('paint wet: ok');
