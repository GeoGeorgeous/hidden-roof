// Tests of the can's brush in Node (src/spray/dab.ts, src/spray/stroke.ts): what a dab is made of, and a stroke over a fake wall at 60, 144 and 240 Hz.
// Usage: npm test (node --experimental-transform-types scripts/brush.test.mjs)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import './ts-imports.mjs';

const { BRUSH, CAPS, SPRAY } = await import('../src/config.ts');
const { dabAt, dabSpacing, lineWidth, slantOf, stepOpacity } = await import('../src/spray/dab.ts');
const { PaintRaster } = await import('../src/paint-raster.ts');
const { plumeLook } = await import('../src/spray/plume.ts');
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

// A wall of texels, and a painted thing's alpha (0..1) at a texel.
const TEXELS = 96;
const WALL = 800;
const wall = () => ({ geo: { atlasW: WALL, atlasH: WALL, texelsPerMeter: TEXELS }, data: new Uint8Array(WALL * WALL * 4), wet: null });
const raster = new PaintRaster({ touched() {}, drip() {} });
const whole = { x: 0, y: 0, w: WALL, h: WALL };
const alpha = (s, x, y) => s.data[(y * WALL + x) * 4 + 3] / 255;
const painted = (s) => s.data.filter((v, i) => i % 4 === 3 && v > 0).length;
const reach = (s, x, y, dx, dy) => {
  let n = 0;
  while (alpha(s, x + dx * (n + 1), y + dy * (n + 1)) > 0) n++;
  return n;
};

// Slant: a ray at an angle stretches a dab along it as 1 / cos, toward where it goes on to. Only the far end fades.
{
  const face = { origin: new THREE.Vector3(), uAxis: new THREE.Vector3(2, 0, 0), vAxis: new THREE.Vector3(0, 3, 0), normal: new THREE.Vector3(0, 0, 1) };
  const ray = (deg, x, y) => new THREE.Vector3(x * Math.sin((deg * Math.PI) / 180), y * Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180));
  assert.equal(slantOf(face, new THREE.Vector3(0, 0, -1)), undefined, 'head on it is round');
  assert.equal(slantOf(face, ray(5, 1, 0)), undefined, 'a few degrees off too');
  assert.equal(slantOf(undefined, ray(60, 1, 0)), undefined, 'a curved face has no plane to lay it in');
  const s = slantOf(face, ray(60, 1, 0));
  near(s.stretch, 2, 1e-6, 'at 60 degrees twice as long');
  near(s.tail, BRUSH.slantTail / 2, 1e-6, 'its tail');
  assert.ok(Math.abs(s.turn) < 1e-9, 'toward +u');
  near(slantOf(face, ray(60, 0, -1)).turn, -0.25, 1e-6, 'toward -v');
  assert.equal(slantOf(face, ray(89.9, 1, 0)).stretch, BRUSH.slantMax, 'along the wall it stops at the most');
  // Axes of different lengths don't bend it: a face is as dense along both.
  near(slantOf(face, ray(60, Math.SQRT1_2, Math.SQRT1_2)).turn, 0.125, 1e-6, 'a diagonal stays a diagonal');

  const dot = { radius: 0.2, amount: 0.5, color: [1, 0, 0], softness: 0.5, square: false };
  const [round, long, tailed, diagonal] = [wall(), wall(), wall(), wall()];
  raster.dot(round, whole, 400, 400, dot, 0);
  raster.dot(long, whole, 400, 400, { ...dot, slant: { stretch: 3, turn: 0, tail: 0 } }, 0);
  raster.dot(tailed, whole, 400, 400, { ...dot, slant: { stretch: 3, turn: 0, tail: 0.8 } }, 0);
  raster.dot(diagonal, whole, 400, 400, { ...dot, slant: { stretch: 3, turn: 0.125, tail: 0 } }, 0);
  near(reach(long, 400, 400, 1, 0), reach(round, 400, 400, 1, 0) * 3, 0.06, 'as long as its stretch');
  assert.equal(reach(long, 400, 400, 0, 1), reach(round, 400, 400, 0, 1), 'as wide as round');
  near(painted(long), painted(round) * 3, 0.03, 'as many texels as its stretch');
  near(painted(diagonal), painted(long), 0.03, 'any way round');
  assert.ok(alpha(diagonal, 440, 440) > 0 && alpha(diagonal, 440, 360) === 0, 'it lies along its turn');
  assert.equal(alpha(tailed, 355, 400), alpha(long, 355, 400), 'the near end keeps its paint');
  assert.ok(alpha(long, 355, 400) > 0 && alpha(tailed, 445, 400) < alpha(long, 445, 400) * 0.75, 'the far end loses it');

  // A line of them: across the aim as dense and wider; along it dabs overlap more, so it darkens.
  const line = (turn) => {
    const d = dab('standard', 3);
    const slant = { stretch: 2, turn, tail: 0 };
    const s = wall();
    for (let x = 100; x < 700; x += dabSpacing(CAPS.standard, 3) * TEXELS) raster.dot(s, whole, x, 400, { ...d, color: [1, 0, 0], square: false, slant }, 0);
    return alpha(s, 400, 400);
  };
  const flat = (() => {
    const d = dab('standard', 3);
    const s = wall();
    for (let x = 100; x < 700; x += dabSpacing(CAPS.standard, 3) * TEXELS) raster.dot(s, whole, x, 400, { ...d, color: [1, 0, 0], square: false }, 0);
    return alpha(s, 400, 400);
  })();
  near(line(0.25), flat, 0.03, 'a line across the aim is as dense');
  assert.ok(line(0) > flat * 1.3, 'a line along the aim darkens');
}

{
  // Narrower than a texel it keeps its length and a texel's width, at every detail.
  const thin = wall();
  raster.dot(thin, whole, 400.5, 400.5, { radius: 0.002, amount: 1, color: [1, 0, 0], softness: 0, square: false, slant: { stretch: 8, turn: 0, tail: 0 } }, 0);
  assert.ok(reach(thin, 400, 400, 1, 0) >= 1, 'a long thin dab paints along its length, not one texel');
}

// NEEDLE under SKINNY at every distance and as wide as the marker at 1.5 m; BLUE DOT softer than BANANA.
for (const d of [0.5, 1.5, 3]) assert.ok(lineWidth(CAPS.needle, d, 0) < lineWidth(CAPS.skinny, d, 0), `needle under skinny at ${d} m`);
near(lineWidth(CAPS.needle, 1.5, 0), 0.035, 0.05, 'needle at 1.5 m');
assert.ok(dab('standard', 1).softness < dab('soft', 1).softness, 'blue dot is softer');

// A plume by its cap: BANANA's as the sandbox had it; cones wide as the caps, specks with them, a soft cap's a haze.
{
  const plume = (cap) => plumeLook(CAPS[cap], { cone: 0, size: 0, grow: 1 });
  near(plume('standard').cone, 0.09, 0.03, 'BANANA: the cone');
  near(plume('standard').size, 0.01, 1e-9, 'BANANA: a speck');
  near(plume('standard').grow, 1.5, 1e-9, 'BANANA: how it grows');
  const order = ['needle', 'skinny', 'standard', 'fat', 'spray'].map(plume);
  order.slice(1).forEach((p, i) => assert.ok(p.cone > order[i].cone && p.size > order[i].size, 'thin to wide'));
  assert.ok(plume('soft').grow > plume('standard').grow && plume('standard').grow > plume('needle').grow, 'the softer the hazier');
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
    near(pass(cap, 3, 0), 0.2 * 0.78, 0.09, `${cap}: a faint pass`);
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
// Under 60 frames a second a slow line owes no backlog: when it stops, the can builds up as if held still all along.
{
  const r = rig(2);
  const perFrame = dabSpacing(CAPS.standard, 2) * 1.2;
  play(r, 30, 3, 2, 'standard', (t) => t * 30 * perFrame);
  const before = r.dabs.length;
  play(r, 30, 0.5, 2, 'standard', () => 90 * perFrame);
  assert.ok(r.dabs.length - before <= 0.5 * BRUSH.buildRate + 4, `a slow line's stop laid ${r.dabs.length - before} dabs`);
}

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
