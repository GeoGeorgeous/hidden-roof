// Tests of the can's brush in Node (src/spray/dab.ts, src/spray/stroke.ts): what a dab is made of, and a stroke over a fake wall at 60, 144 and 240 Hz.
// Usage: npm test (node --experimental-transform-types scripts/brush.test.mjs)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import './ts-imports.mjs';

const { BRUSH, CAPS, SPRAY } = await import('../src/config.ts');
const { dabAt, dabSpacing, lineWidth, stepOpacity } = await import('../src/spray/dab.ts');
const { SprayStroke } = await import('../src/spray/stroke.ts');

const RATES = [60, 144, 240];
const near = (a, b, share, what) => assert.ok(Math.abs(a - b) <= share * Math.abs(b), `${what}: ${a} against ${b}`);
const dab = (cap, distance, speed = 0) => dabAt(CAPS[cap], distance, speed, { radius: 0, softness: 0, amount: 0 });

/** One pass's opacity along the middle of a straight line of such dabs. */
function pass(cap, distance, speed) {
  const d = dab(cap, distance, speed);
  const spacing = dabSpacing(CAPS[cap], distance);
  let left = 1;
  for (let x = -d.radius; x <= d.radius; x += spacing) left *= 1 - d.amount * (1 - d.softness * (x / d.radius) ** 2);
  return 1 - left;
}

// Distance.
for (const cap of Object.keys(CAPS)) {
  assert.equal(dab(cap, 0.2).radius, dab(cap, BRUSH.gap).radius, `${cap}: up to the gap the can acts as close up`);
  assert.ok(dab(cap, 2.5).radius > dab(cap, 1).radius, `${cap}: far is wider`);
  assert.ok(dab(cap, 3).softness >= dab(cap, 0.5).softness, `${cap}: far is softer`);
  // A pass reaches the opacity set, less the fade with distance, whatever the spacing and the edge: the small caps' spacing is the minimum, the big ones' a share of the dab.
  near(pass(cap, 3, 0), BRUSH.opacity * 0.78, 0.06, `${cap}: one pass far away`);
  assert.ok(dabSpacing(CAPS[cap], 0.5) >= BRUSH.minSpacing, `${cap}: spacing has a floor`);
}
assert.ok(dabSpacing(CAPS.skinny, 0.5) === BRUSH.minSpacing, 'skinny is on the floor up close');
assert.ok(dabSpacing(CAPS.spray, 2) > BRUSH.minSpacing, 'spray is above it');
assert.ok(dab('standard', SPRAY.reach).amount > 0, 'at the far end it still paints');

// Hand speed.
const slow = dab('standard', 1, BRUSH.speedRef);
const fast = dab('standard', 1, BRUSH.speedRef * 4);
assert.deepEqual(dab('standard', 1, 0), slow, 'up to the reference speed a line is as set');
near(fast.radius, slow.radius * (1 + BRUSH.speedWiden), 1e-9, 'fast is wider');
assert.ok(fast.softness > slow.softness && fast.amount < slow.amount, 'fast is softer and thinner');

// The line's width: out to half the density of its middle, counted from a line of real dabs.
for (const [cap, distance] of [['skinny', 1], ['standard', 2.5], ['spray', 3]]) {
  const d = dab(cap, distance);
  const spacing = dabSpacing(CAPS[cap], distance);
  const density = (y) => {
    let left = 1;
    for (let x = -d.radius; x <= d.radius; x += spacing) if (x * x + y * y < d.radius ** 2) left *= 1 - d.amount * (1 - d.softness * ((x * x + y * y) / d.radius ** 2));
    return 1 - left;
  };
  const width = lineWidth(CAPS[cap], distance, 0);
  assert.ok(density(width * 0.45) > density(0) / 2 && density(width * 0.55) < density(0) / 2, `${cap}: half as dense at the line's edge`);
  assert.ok(width <= d.radius * 2, `${cap}: never past a dab's reach`);
}
assert.ok(lineWidth(CAPS.spray, 3, 0) < dab('spray', 3).radius * 1.8, 'a soft line reads narrower than its reach');
assert.ok(lineWidth(CAPS.standard, 3, 0) > lineWidth(CAPS.standard, 1, 0), 'far is wider');
assert.ok(lineWidth(CAPS.standard, 1, BRUSH.speedRef * 4) > lineWidth(CAPS.standard, 1, 0), 'fast is wider');

// The set opacity.
{
  const set = BRUSH.opacity;
  const walk = (from, dir, steps) => Array.from({ length: steps }).reduce((v) => stepOpacity(v, dir), from);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => walk(set, 1, n)), [0.75, 0.85, 0.95, 1, 1], 'up, stopping at 100%');
  assert.deepEqual([6, 7, 8].map((n) => walk(set, -1, n)), [0.05, 0.05, 0.05], 'down, stopping at 5%');
  assert.equal(walk(walk(set, 1, 2), -1, 2), set, 'steps back to the same number');
  for (const cap of Object.keys(CAPS)) {
    BRUSH.opacity = 0.2;
    near(pass(cap, 3, 0), 0.2 * 0.78, 0.06, `${cap}: a faint pass`);
    BRUSH.opacity = set;
  }
}

/** A wall at z = -depth, painted where x is under `end`; a stroke over it, with what it lays. */
function rig(depth, end = Infinity) {
  const dabs = [];
  const wall = {
    find(from, along) {
      if (along.z >= 0) return null;
      const distance = (from.z + depth) / -along.z;
      const point = from.clone().addScaledVector(along, distance);
      return point.x < end ? { point, distance } : null;
    },
  };
  const stroke = new SprayStroke(wall, { lay: (hit, d) => dabs.push({ x: hit.point.x, y: hit.point.y, amount: d.amount, radius: d.radius }) });
  return { stroke, dabs };
}

const eye = new THREE.Vector3();
/** Plays `seconds` at `hz` of the aim on a wall `depth` away going to x(t), y(t). */
function play(r, hz, seconds, depth, cap, x, y = () => 0) {
  const forward = new THREE.Vector3();
  const dt = 1 / hz;
  const speeds = [];
  for (let i = 0; i < Math.round(seconds * hz); i++) {
    forward.set(x(i * dt), y(i * dt), -depth).normalize();
    r.stroke.update({ eye, forward, cap: CAPS[cap], dt });
    speeds.push(r.stroke.speed);
  }
  return speeds;
}
const ink = (dabs) => dabs.reduce((sum, d) => sum + d.amount, 0);

for (const hz of RATES) {
  // A fast flick: no gaps.
  const flick = rig(1);
  play(flick, hz, 0.25, 1, 'skinny', (t) => t * 12);
  const steps = flick.dabs.slice(1).map((d, i) => Math.hypot(d.x - flick.dabs[i].x, d.y - flick.dabs[i].y));
  assert.ok(Math.max(...steps) <= dabSpacing(CAPS.skinny, 3.1) * 1.01, `${hz} Hz: dabs a spacing apart, the widest ${Math.max(...steps)}`);
  assert.ok(flick.dabs.at(-1).x > 2.5, `${hz} Hz: the line reaches the aim, ${flick.dabs.at(-1).x}`);

  // The hand speed is the hand's: a true 1 m/s with the spray cap, 2.4 m from the wall.
  const speeds = play(rig(2.4), hz, 1, 2.4, 'spray', (t) => t);
  near(speeds.at(-1), 1, 0.08, `${hz} Hz: hand speed`);
}

// The same stroke paints the same at every rate: moving, slow, held still, on any cap.
const strokes = [
  ['slow', 'standard', 1, (t) => t * 0.05, 3],
  ['walking pace', 'skinny', 1, (t) => t * 0.4, 2],
  ['steady', 'standard', 1, (t) => t * 1.5, 1],
  ['fast', 'fat', 2, (t) => t * 8, 0.5],
  ['held', 'standard', 1, () => 0, 2],
];
for (const [name, cap, depth, x, seconds] of strokes) {
  const at = RATES.map((hz) => {
    const r = rig(depth);
    play(r, hz, seconds, depth, cap, x);
    return { count: r.dabs.length, ink: ink(r.dabs) };
  });
  for (const [i, a] of at.entries()) near(a.ink, at[0].ink, 0.08, `${name}: paint at ${RATES[i]} Hz against 60 Hz`);
}

// Held still: the rate set, at the weight set.
{
  const r = rig(1);
  play(r, 240, 2, 1, 'standard', () => 0);
  near(r.dabs.length, 2 * BRUSH.buildRate, 0.02, 'held still: dabs a second');
  near(r.dabs[5].amount, r.dabs[0].amount * BRUSH.buildAmount, 1e-9, 'held still: a dab holds less');
}

// Streamline: the brush trails the aim alike at any rate, and has caught up after a moment.
for (const hz of RATES) {
  const r = rig(1);
  play(r, hz, 0.1, 1, 'standard', () => 0);
  r.dabs.length = 0;
  play(r, hz, 0.02, 1, 'standard', () => 0.5);
  const first = r.dabs.at(-1).x;
  near(first, 0.5 * (1 - Math.exp(-1)), 0.3, `${hz} Hz: one time constant after a jump of the aim`);
  play(r, hz, 0.3, 1, 'standard', () => 0.5);
  near(r.dabs.at(-1).x, 0.5, 0.02, `${hz} Hz: caught up`);
}

// A stroke's ends.
{
  const r = rig(1);
  play(r, 60, 0.2, 1, 'standard', (t) => t);
  r.stroke.end();
  assert.equal(r.stroke.speed, 0, 'a new stroke starts with no speed');
  const before = r.dabs.length;
  play(r, 60, 1 / 60, 1, 'standard', () => 1);
  assert.equal(r.dabs.length, before + 1, 'and with one dab where the aim is, not a line from the last stroke');
  assert.equal(r.dabs.at(-1).x, 1);
}
{
  const r = rig(1, 0.5);
  play(r, 60, 1, 1, 'standard', (t) => t);
  assert.ok(r.dabs.length > 0 && r.dabs.every((d) => d.x < 0.5), 'past the wall nothing is laid');
  const back = r.dabs.length;
  play(r, 60, 1 / 60, 1, 'standard', () => 0);
  assert.ok(r.dabs.length >= back, 'the stroke goes on where the wall comes back');
}
{
  // A jump of the spot starts anew; dabs in a frame have a limit, and the line keeps up with the aim anyway.
  const r = rig(1);
  play(r, 60, 1 / 60, 1, 'skinny', () => 0);
  const before = r.dabs.length;
  const forward = new THREE.Vector3(BRUSH.maxJump + 1, 0, -1).normalize();
  const fresh = new THREE.Vector3().copy(forward);
  BRUSH.streamline = 0;
  r.stroke.update({ eye, forward: fresh, cap: CAPS.skinny, dt: 1 / 60 });
  assert.equal(r.dabs.length, before + 1, 'a jump leaves no line between');
  const far = rig(1);
  play(far, 60, 1 / 60, 1, 'skinny', () => 0);
  far.stroke.update({ eye, forward: new THREE.Vector3(2.5, 0, -1).normalize(), cap: CAPS.skinny, dt: 1 / 60 });
  assert.equal(far.dabs.length, 1 + BRUSH.maxDabs, 'at most maxDabs in a frame');
  near(far.dabs.at(-1).x, 2.5, 1e-6, 'and they still reach the spot');
}

console.log('brush: dabs, strokes at 60, 144 and 240 Hz ok');
