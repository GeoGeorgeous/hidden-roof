// Tests of wet paint in Node (src/paint-wet.ts): how it builds up, dries, rolls the dice for a spot, rests and keeps paint.
// Usage: npm test (node --experimental-transform-types scripts/paint-wet.test.mjs)
import assert from 'node:assert/strict';
import './ts-imports.mjs';

const { DRIPS } = await import('../src/config.ts');
const { paintRandom } = await import('../src/lcg.ts');
const { WetPaint, canRule, toolRule } = await import('../src/paint-wet.ts');
const { PaintRaster } = await import('../src/paint-raster.ts');

const surface = (tpm = 96) => ({ geo: { atlasW: 256, atlasH: 256, texelsPerMeter: tpm }, wet: null, spots: null });
/** A face from the atlas's corner. */
const FACE = { x: 0, y: 0 };
const pass = DRIPS.passCoats;
const ran = (length) => length !== null;
/** Sure to run, or never to: the odds past what a spot's size divides them by. */
const SURE = 1e9;
const dice = (...rolls) => {
  let i = 0;
  paintRandom.drips = () => rolls[i++ % rolls.length];
};

// Under the passes nothing runs, at them it does, and the paint that ran is gone.
{
  dice(0.5);
  const wet = new WetPaint();
  const s = surface();
  const rule = toolRule(SURE);
  assert.equal(wet.add(s, FACE, 1, 1, pass * DRIPS.passes - 1, rule), null, 'under the passes');
  assert.ok(ran(wet.add(s, FACE, 1, 1, 1, rule)), 'at the passes');
  assert.equal(wet.add(s, FACE, 1, 1, 1, rule), null, 'the paint that ran is gone');
  assert.deepEqual([wet.rolls, wet.runs], [1, 1], 'one roll, one run');
}

// Paint dries: the same coats, late, are short of it.
{
  const wet = new WetPaint();
  const s = surface();
  wet.add(s, FACE, 2, 2, pass * DRIPS.passes - 1, toolRule(SURE));
  wet.now += DRIPS.dryTime;
  assert.equal(wet.add(s, FACE, 2, 2, 1, toolRule(SURE)), null, 'dried meanwhile');
}

// More passes take more paint, and drying doesn't move with them.
{
  const { passes } = DRIPS;
  DRIPS.passes = 2;
  const wet = new WetPaint();
  const s = surface();
  assert.equal(wet.add(s, FACE, 3, 3, pass, toolRule(SURE)), null, 'one pass of two');
  assert.ok(ran(wet.add(s, FACE, 3, 3, pass, toolRule(SURE))), 'two passes of two');
  wet.add(s, FACE, 4, 4, pass, toolRule(SURE));
  assert.ok(Math.abs(s.wet[4 * 256 + 4] - DRIPS.dryTime) < 1e-6, 'a pass dries in dryTime, whatever the passes');
  DRIPS.passes = passes;
}

// The dice: as often as a spot's odds say, at any detail.
{
  let i = 0;
  paintRandom.drips = () => (i += 0.618033988) % 1;
  for (const tpm of [24, 96]) {
    const wet = new WetPaint();
    const s = surface(tpm);
    let runs = 0;
    const spot = (DRIPS.spot * tpm) ** 2;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if (ran(wet.add(s, FACE, x, y, pass * DRIPS.passes, toolRule(0.05 * spot)))) runs++;
    assert.ok(Math.abs(runs / 65536 - 0.05) < 0.005, `${tpm}: ${runs}`);
  }
}

// A failed roll: the marker's and roller's takes all the paint there, the can's a little of it.
{
  dice(0.99);
  const wet = new WetPaint();
  const [tool, can] = [surface(), surface()];
  wet.add(tool, FACE, 5, 5, pass * DRIPS.passes, toolRule(0.1));
  wet.add(can, FACE, 5, 5, pass * DRIPS.passes, canRule(0.1));
  assert.equal(tool.wet[5 * 256 + 5], wet.now, 'all of it');
  const left = can.wet[5 * 256 + 5] - wet.now;
  assert.ok(Math.abs(left - (DRIPS.passes - DRIPS.miss) * DRIPS.dryTime) < 1e-5, `the rest stays: ${left}`);
}

// A run rests its spot, the longer the lower the odds, and the next one along is free.
{
  dice(0);
  const wet = new WetPaint();
  const s = surface();
  const rule = canRule(0.5);
  assert.ok(Math.abs(rule.rest - DRIPS.rest * 2) < 1e-9, 'at half the odds, twice the rest');
  assert.ok(canRule(1).rest < canRule(0.2).rest, 'lower odds rest longer');
  assert.equal(canRule(0).rest, 0, 'no odds, no rest to work out');
  const size = Math.ceil(DRIPS.spot * 96);
  assert.ok(ran(wet.add(s, FACE, 1, 1, pass * DRIPS.passes, rule)), 'it runs');
  assert.equal(wet.add(s, FACE, 2, 1, pass * DRIPS.passes, rule), null, 'its spot rests');
  assert.ok(ran(wet.add(s, FACE, 1 + size, 1, pass * DRIPS.passes, rule)), 'the next spot does not');
  wet.now += rule.rest;
  assert.ok(ran(wet.add(s, FACE, 3, 1, pass * DRIPS.passes, rule)), 'rested, it runs again');
}

// Spots start at a face's corner: two faces side by side in an atlas never share one.
{
  dice(0);
  const wet = new WetPaint();
  const s = surface();
  const rule = canRule(0.5);
  const size = DRIPS.spot * 96;
  const [left, right] = [{ x: 0, y: 0 }, { x: Math.floor(size / 2), y: 0 }];
  assert.ok(ran(wet.add(s, left, 1, 1, pass * DRIPS.passes, rule)), 'one face runs');
  assert.equal(wet.add(s, left, 2, 1, pass * DRIPS.passes, rule), null, 'its spot rests');
  assert.ok(ran(wet.add(s, right, right.x + 1, 1, pass * DRIPS.passes, rule)), 'the face beside it, within the same square of the atlas, does not');
}

// The marker's and roller's spots don't rest.
{
  dice(0);
  const wet = new WetPaint();
  const s = surface();
  assert.ok(ran(wet.add(s, FACE, 1, 1, pass, toolRule(0.5))));
  assert.ok(ran(wet.add(s, FACE, 2, 1, pass, toolRule(0.5))));
  assert.equal(s.spots, null, 'they keep no spots');
}

// How long a can's run is: the more paint its spot keeps, the longer; a tool's by the dice.
{
  const rule = canRule(0.5);
  const after = (misses) => {
    const wet = new WetPaint();
    const s = surface();
    dice(0.99);
    for (let i = 0; i < misses; i++) wet.add(s, FACE, 1 + (i % 5), 1, pass * DRIPS.passes, rule);
    dice(0, 0.5);
    return wet.add(s, FACE, 7, 1, pass * DRIPS.passes, rule);
  };
  assert.equal(after(0), 0.5 * DRIPS.lengthLuck, 'nothing kept: the dice alone');
  assert.ok(after(400) > after(40), 'more paint kept, a longer run');
  assert.ok(Math.abs(after(1e5) - (0.5 * DRIPS.lengthLuck + 1 - DRIPS.lengthLuck)) < 1e-9, 'a full spot: as long as it gets');
  dice(0, 0.25);
  assert.equal(new WetPaint().add(surface(), FACE, 9, 9, pass * DRIPS.passes, toolRule(SURE)), 0.25, 'the dice say');
}

// No run starts on the ring around a face: nobody sees it, and a run there would paint nothing.
{
  dice(0);
  const rect = { x: 10, y: 10, w: 8, h: 8, upright: true };
  const s = { ...surface(), data: new Uint8Array(256 * 256 * 4).fill(255), geo: { atlasW: 256, atlasH: 256, texelsPerMeter: 96, rects: [rect] } };
  const at = [];
  const raster = new PaintRaster({ touched() {}, drip: (_s, _rect, x, y) => at.push([x, y]) });
  raster.dot(s, rect, 14, 14, { radius: 1, amount: 1, color: [1, 0, 0], softness: 0, square: false }, toolRule(SURE));
  for (let i = 0; i < 6; i++) raster.dot(s, rect, 14, 14, { radius: 1, amount: 1, color: [1, 0, 0], softness: 0, square: false }, toolRule(SURE));
  assert.ok(at.length > 0, 'runs start on the face');
  assert.ok(at.every(([x, y]) => x >= 10 && y >= 10 && x < 18 && y < 18), `and only there: ${JSON.stringify(at.find(([x, y]) => x < 10 || y < 10 || x >= 18 || y >= 18))}`);
}

console.log('paint wet: ok');
