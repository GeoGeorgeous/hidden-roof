import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PAINT, SERVER } from '../src/config';
import type { LevelData } from '../src/level/level-data';
import { loadPaint } from '../src/save/load-paint';
import { savePaint } from '../src/save/save-paint';
import { planLevel } from '../src/level/prop-pieces';
import { Session, type Link } from './session';
import { sessionPaint } from './world';

// The server's paint in the process, no server running: the level plan, a paint
// file that fails, paint measured at its surfaces' own detail, ops replayed without being
// logged, and level paint: made on a level it fits, not once a painted prop is
// gone, and each level's own paint fits its level. npm run test:server builds it.

const level: LevelData = JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8'));

// A paint file that fails (here: paint that can't be read) fails only the joins waiting for it; the next join gets a
// new one. In the process, with the server's log quiet.
{
  const say = console.log;
  const was = { rejoinWindow: SERVER.rejoinWindow, snapshotKeep: SERVER.snapshotKeep };
  console.log = () => {};
  // No timers left to keep the test running: the dropped joiner goes and the paint file isn't kept.
  Object.assign(SERVER, { rejoinWindow: 0, snapshotKeep: 0 });
  try {
    const s = new Session('FAILS', 'demo', level, 48, () => {});
    const link = (): Link & { sent: number } => ({ sent: 0, send() { this.sent++; }, close() {}, open: true, ip: 'test', since: Date.now() });
    const { paint } = (s as unknown as { world: ReturnType<typeof sessionPaint> }).world;
    paint.stamp(paint.surfaces[0], { rect: 0, u: 0.5, v: 0.5 }, 0.2, 1, [1, 0, 0]);
    const data = paint.surfaces[0].data!;
    paint.surfaces[0].data = new Proxy(data, { get: () => { throw new Error('unreadable paint'); } });
    await assert.rejects(s.admit(link(), 'X'), /unreadable paint/);
    paint.surfaces[0].data = data;
    const y = link();
    const r = await s.admit(y, 'Y');
    await new Promise((done) => setTimeout(done, 10));
    assert.ok(typeof r !== 'string' && y.sent > 1, 'a join after a failed paint file gets a welcome and the paint');
  } finally {
    // What a failure says is seen, and the checks after this one get the server as configured.
    console.log = say;
    Object.assign(SERVER, was);
  }
  console.log('failed paint file: ok (the next join gets a new one)');
}

// The level plan both the game and the server build from: a prop keeps its id from the file, one without (or with an
// id taken) gets the next free one, and every prop's solid boxes are in the cover index before anything is built.
{
  const slab = { type: 'slab', pos: [0, 0, 0] as [number, number, number] };
  const plan = planLevel({ version: 4, spawn: { pos: [0, 0, 0], yaw: 0 }, props: [{ ...slab, id: 5 }, slab, { ...slab, id: 5 }, { ...slab, type: 'no-such-prop' }] });
  assert.deepEqual([[...plan.props.keys()], plan.next], [[5, 6, 7], 8]);
  assert.ok([5, 6, 7].every((id) => plan.cover.boxesOf(id).length > 0));
  console.log('level plan: ok (ids kept, numbered after, solid boxes listed)');
}

// Ops replayed (another player's) are painted and never logged; this player's are logged.
{
  const { paint, ops } = sessionPaint(level, 48);
  const s = paint.surfaces[0];
  paint.log = [];
  ops.apply({ kind: 'stamp', key: s.key, rect: 0, u: 0.3, v: 0.5, radius: 0.1, amount: 1, color: [0, 0, 1], softness: 0, square: false });
  const replayed = s.data!.filter((v, i) => i % 4 === 3 && v > 0).length;
  paint.stamp(s, { rect: 0, u: 0.7, v: 0.5 }, 0.1, 1, [1, 0, 0]);
  assert.ok(replayed > 0, 'a replayed op paints');
  assert.deepEqual(paint.log.map((op) => op.kind), ['stamp'], 'only the stamp made here is logged');
  console.log('replayed ops: ok (painted, not logged)');
}

// A level's own paint (src/save/level-paint.ts) fits it face for face, and the faces of a prop removed since don't: made here on the demo level.
const paintOn = (level: LevelData, bytes: Uint8Array, name: string) => {
  const { paint, drips } = sessionPaint(level, 48);
  return loadPaint(paint, drips, bytes, { name });
};
const demo: LevelData = JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8'));
const made = sessionPaint(demo, 48).paint;
const last = demo.props.at(-1)!.id!;
for (const s of [made.surfaces[0], made.surfaces.find((s) => s.key.startsWith(`p${last}#`))!]) made.stamp(s, { rect: 0, u: 0.5, v: 0.5 }, 0.2, 1, [1, 1, 1]);
const own = await savePaint(made, { name: 'demo' });
// Paint is measured at its surfaces' own detail, whatever the global PAINT DETAIL says meanwhile (another session's).
const ultra = sessionPaint(demo, 96).paint;
PAINT.texelsPerMeter = 24;
ultra.stamp(ultra.surfaces[0], { rect: 0, u: 0.5, v: 0.5 }, 0.1, 1, [1, 1, 1]);
assert.ok(ultra.surfaces[0].data!.filter((v, i) => i % 4 === 3 && v > 0).length > 200, 'a 0.1 m stamp at 96 texels/m covers ~290 texels');
const fits = await paintOn(demo, own, 'demo');
assert.ok(fits.faces > 0 && !fits.skipped, `level paint: ${fits.skipped} faces don't fit the level it was made on`);
const changed = await paintOn({ ...demo, props: demo.props.slice(0, -1) }, own, 'demo');
assert.ok(changed.faces > 0 && changed.skipped > 0, 'level paint: the faces of a removed prop still fit');
console.log(`level paint: ok (${fits.faces} faces fit the level made on; ${changed.skipped} skipped once their prop is gone)`);
// Each level that ships paint is marked so in its file, and the paint still fits it (save the level again in build mode after editing props).
const levels = fs.readdirSync('public/levels');
for (const file of levels.filter((f) => f.endsWith('.json'))) {
  const name = file.slice(0, -'.json'.length);
  const level: LevelData = JSON.parse(fs.readFileSync(`public/levels/${file}`, 'utf8'));
  assert.equal(!!level.paint, levels.includes(`${name}.rhhpaint`), `level ${name}: its file says paint: ${!!level.paint}, but ${name}.rhhpaint is ${level.paint ? 'missing' : 'there'}`);
  if (!level.paint) continue;
  const { faces, skipped } = await paintOn(level, fs.readFileSync(`public/levels/${name}.rhhpaint`), name);
  assert.ok(faces > 0 && !skipped, `level paint of ${name}: ${skipped} of ${faces + skipped} faces don't fit the level`);
  console.log(`level paint of ${name}: ok (${faces} faces)`);
}
