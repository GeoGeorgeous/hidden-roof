import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PAINT, SERVER } from '../src/config';
import type { LevelData } from '../src/level/level-data';
import { loadPaint } from '../src/save/load-paint';
import { savePaint } from '../src/save/save-paint';
import { planLevel } from '../src/level/prop-pieces';
import { closeCode, decode, encode, PROTOCOL, type ToClient, type ToServer } from '../src/net/protocol';
import { surfaceTable } from '../src/save/shape';
import { Lobby, type LinkInput } from './lobby';
import { Session, type Link } from './session';
import { sessionPaint } from './world';

// The server in the process, no server running: the lobby with fake links, the level plan, a paint
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

// A run paints the same texels whatever the frames it runs in: every client (and the server) runs it at its own frame rate.
{
  const ranAt = (steps: number[]) => {
    const { paint, ops, drips } = sessionPaint(level, 48);
    const s = paint.surfaces.find((s) => s.geo.rects[0].h >= 30)!;
    ops.apply({ kind: 'drip', key: s.key, rect: 0, u: 0.5, v: 0.95, length: 0.5, speed: 0.25, rgb: [0, 0, 1] });
    for (let i = 0; drips.count; i++) drips.update(steps[i % steps.length]);
    return s.data!;
  };
  const steady = ranAt([1 / 60]);
  assert.ok(steady.some((v, i) => i % 4 === 3 && v > 0), 'a run paints');
  assert.deepEqual(ranAt([1 / 20, 1 / 144, 1 / 37, 1 / 90]), steady, 'a run paints the same at another frame rate');
  console.log('paint runs: ok (the same at any frame rate)');
}

/** A link as the lobby sees one (Link), recording what it was sent and how it was closed. */
class FakeLink implements Link {
  open = true;
  readonly since = Date.now();
  got: ToClient[] = [];
  closedWith = 0;
  input: LinkInput | null = null;
  constructor(readonly ip: string) {}
  send(f: Uint8Array) {
    this.got.push(decode(f) as ToClient);
  }
  close(code?: number) {
    if (!this.open) return;
    [this.open, this.closedWith] = [false, code ?? 1000];
    // As a socket's close event comes: after the call that closed it.
    queueMicrotask(() => this.input!.closed(this.closedWith, ''));
  }
  say(m: object) {
    return this.input!.message(encode(m as ToServer));
  }
}

// The lobby, with fake links (no sockets): limits per address, HOST and JOIN, an unknown code and one that ended, a
// message it can't take, and a link that says nothing.
{
  const was = { snapshotKeep: SERVER.snapshotKeep, helloTimeout: SERVER.helloTimeout };
  Object.assign(SERVER, { snapshotKeep: 0, helloTimeout: 0.05 });
  const say = console.log;
  console.log = () => {};
  try {
    const lobby = new Lobby();
    const all: FakeLink[] = [];
    const fake = (ip: string, host = false) => {
      const l = new FakeLink(ip);
      l.input = lobby.open(l, host);
      all.push(l);
      return l;
    };
    const rejected = (l: FakeLink) => l.got.find((m) => m.type === 'rejected')?.reason;
    const crowd = Array.from({ length: SERVER.linksPerIp }, () => fake('10.0.0.1'));
    const extra = fake('10.0.0.1');
    assert.deepEqual([rejected(crowd[0]), rejected(extra), extra.closedWith, rejected(fake('10.0.0.2'))], [undefined, 'too-many', closeCode('too-many'), undefined]);
    // Closing them frees the address.
    crowd.forEach((l) => l.close());
    await Promise.resolve();
    assert.equal(rejected(fake('10.0.0.1')), undefined);
    // Uploads (HOST links, /ws?host): SERVER.uploadsPerIp from an address. One turned away for too many links never
    // took an upload slot, so its close gives none back.
    const ups = Array.from({ length: SERVER.uploadsPerIp }, () => fake('10.0.2.1', true));
    const plain = Array.from({ length: SERVER.linksPerIp - SERVER.uploadsPerIp }, () => fake('10.0.2.1'));
    const pastLinks = fake('10.0.2.1', true);
    pastLinks.close();
    plain[0].close();
    await Promise.resolve();
    assert.deepEqual([ups.map(rejected), rejected(pastLinks), rejected(fake('10.0.2.1', true))], [[undefined, undefined], 'too-many', 'too-many']);
    // And SERVER.uploads from everyone: the rest up to it go (two already are), the next is turned away.
    await Promise.resolve();
    const rest = Array.from({ length: SERVER.uploads - ups.length }, (_, i) => fake(`10.0.3.${i >> 1}`, true));
    assert.deepEqual([rest.filter(rejected).length, rejected(fake('10.0.4.1', true))], [0, 'too-many']);
    const table = surfaceTable(sessionPaint(level, 48).paint.surfaces);
    const host = fake('10.0.1.1');
    await host.say({ type: 'host', protocol: PROTOCOL, table, name: 'A', levelName: 'demo', level, detail: 48 });
    const code = host.got.find((m) => m.type === 'welcome')!.code;
    const nobody = fake('10.0.1.2');
    await nobody.say({ type: 'join', protocol: PROTOCOL, name: 'B', code: 'ZZZZZ' });
    await host.say({ type: 'leave' });
    const late = fake('10.0.1.3');
    await late.say({ type: 'join', protocol: PROTOCOL, name: 'B', code });
    const bad = fake('10.0.1.4');
    await bad.input!.message(new Uint8Array([1, 2, 3]));
    const silent = fake('10.0.1.5');
    await new Promise((done) => setTimeout(done, 100));
    assert.deepEqual([rejected(nobody), rejected(late), bad.closedWith, silent.closedWith], ['no-session', 'ended', 1008, 1008]);
    all.forEach((l) => l.close());
    await new Promise((done) => setTimeout(done, 10));
  } finally {
    console.log = say;
    Object.assign(SERVER, was);
  }
  console.log('lobby: ok (limits per address, unknown and ended codes, bad messages, silent links)');
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
const global = PAINT.texelsPerMeter;
PAINT.texelsPerMeter = 24;
ultra.stamp(ultra.surfaces[0], { rect: 0, u: 0.5, v: 0.5 }, 0.1, 1, [1, 1, 1]);
assert.ok(ultra.surfaces[0].data!.filter((v, i) => i % 4 === 3 && v > 0).length > 200, 'a 0.1 m stamp at 96 texels/m covers ~290 texels');
PAINT.texelsPerMeter = global;
// A session with nothing paintable is at its detail too (what its paint files say).
assert.equal(sessionPaint({ ...demo, props: [] }, 96).paint.texelsPerMeter, 96);
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
