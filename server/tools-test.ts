import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SERVER } from '../src/config';
import { Inventory } from '../src/inventory/inventory';
import { SLOTS, type Tool } from '../src/inventory/tool';
import type { LevelData } from '../src/level/level-data';
import { received, type ToClient, type ToServer } from '../src/net/protocol';
import { decodeOps, encodeOps, SurfaceIndex } from '../src/op-wire';
import { opTool, type PaintOp } from '../src/paint-ops';
import type { Link } from './player';
import { Session } from './session';
import type { SessionSetup } from './setup';
import type { sessionPaint } from './world';

// Tools a session turns off: the inventory never holds them (and gives them back when they are allowed again), each op
// says which tool made it, and the session drops the ops and stepladders of the tools it turned off (session.ts) without
// breaking the batch's ack. In the process, no server running. npm run test:server builds it.

const level: LevelData = JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8'));

// The inventory: a tool turned off isn't held, can't be found, keeps what was found, and comes back when allowed.
{
  const inv = new Inventory();
  inv.give('marker');
  inv.allowOnly(['can', 'ladder']);
  assert.deepEqual([inv.has('marker'), inv.give('roller'), inv.allows('roller'), inv.has('can'), inv.give('ladder'), inv.has('ladder')], [false, false, false, true, true, true]);
  assert.deepEqual(inv.toJSON().tools, ['marker', 'ladder'], 'what the server keeps for the player is what they really have');
  inv.select(1);
  assert.equal(inv.tool, null, 'a slot of a tool that is off holds nothing');
  inv.reset();
  assert.deepEqual([inv.has('marker'), inv.give('marker')], [false, false], 'a new level starts with the tools still off');
  inv.allowOnly(SLOTS);
  assert.deepEqual([inv.give('marker'), inv.has('marker')], [true, true]);
  inv.allowOnly(['marker']);
  assert.equal(inv.has('can'), false, 'the can too can be turned off');
  console.log('tools off in the inventory: ok (not held, not found, restored on leaving)');
}

const stamp: PaintOp = { kind: 'stamp', key: '', rect: 0, u: 0.5, v: 0.5, radius: 0.1, amount: 1, color: [1, 0, 0], softness: 0.5, square: false };
const roll: PaintOp = { kind: 'roll', key: '', rect: 0, u: 0.5, v: 0.5, axis: [1, 0, 0], halfLength: 0.2, halfWidth: 0.1, edge: 0.5, amount: 1, color: [1, 0, 0] };
const drip: PaintOp = { kind: 'drip', key: '', rect: 0, u: 0.5, v: 0.5, length: 0.3, speed: 0.1, rgb: [1, 0, 0] };
const by: [string, PaintOp, Tool | null][] = [
  ['can', stamp, 'can'],
  ['marker', { ...stamp, square: true }, 'marker'],
  ['sponge', { ...stamp, color: null }, 'sponge'],
  ['roller', roll, 'roller'],
  ['run', drip, null],
];
for (const [name, op, tool] of by) assert.equal(opTool(op), tool, name);

/** A link recording what it was sent. */
const link = (): Link & { got: ToClient[] } => ({
  got: [],
  send(f) {
    this.got.push(...received(f));
  },
  close() {},
  open: true,
  ip: 'test',
  since: Date.now(),
});

// The session: with the roller, the sponge and the stepladder off, their ops and stepladders are dropped, the others
// relayed; a batch of only dropped ops is acked all the same (a resend is not painted twice).
{
  const was = { rejoinWindow: SERVER.rejoinWindow, snapshotKeep: SERVER.snapshotKeep };
  const say = console.log;
  console.log = () => {};
  Object.assign(SERVER, { rejoinWindow: 0, snapshotKeep: 0 });
  try {
    const setup: SessionSetup = { kind: 'private', name: 'T', limit: 2, tools: ['can', 'marker'], stays: false, admin: false };
    const s = new Session('TOOLS', 'demo', level, 48, () => {}, setup);
    const { paint } = (s as unknown as { world: ReturnType<typeof sessionPaint> }).world;
    const surfaces = new SurfaceIndex(paint.surfaces.map((x) => x.key));
    const key = paint.surfaces[0].key;
    const [a, b] = [link(), link()];
    const [pa, pb] = [await s.admit(a, 'A'), await s.admit(b, 'B')];
    assert.ok(typeof pa !== 'string' && typeof pb !== 'string');
    const from = (pa as { p: Parameters<Session['receive']>[0] }).p;
    await new Promise((done) => setTimeout(done, 10));
    const at = (op: PaintOp) => ({ ...op, key }) as PaintOp;
    // Relayed ops go out once the event loop's turn is done (relay.ts).
    const send = async (seq: number, list: PaintOp[]) => {
      s.receive(from, { type: 'ops', seq, bytes: encodeOps(list.map((_, i) => i + 1), list.map(at), surfaces) } as ToServer);
      await new Promise(setImmediate);
    };
    const relayed = () => b.got.filter((m) => m.type === 'ops').map((m) => decodeOps((m as Extract<ToClient, { type: 'ops' }>).bytes, surfaces)!.ops.map((o) => opTool(o)));
    await send(1, [stamp, { ...stamp, square: true }, { ...stamp, color: null }, roll, drip]);
    assert.deepEqual(relayed(), [['can', 'marker', null]], 'only the ops of tools it allows (and runs) are relayed');
    await send(2, [roll, { ...stamp, color: null }]);
    assert.equal(relayed().length, 1, 'a batch of only dropped ops is not relayed');
    assert.equal(from.acked, 2, 'but it is acked');
    await send(3, [stamp]);
    assert.equal(relayed().length, 2);
    const ladder = { type: 'prop', id: 1 } as unknown as NonNullable<Extract<ToServer, { type: 'ladder' }>['data']>;
    s.receive(from, { type: 'ladder', t: 1, data: ladder });
    assert.deepEqual([from.ladder, b.got.some((m) => m.type === 'ladder')], [null, false], 'a stepladder put down with it off is dropped');
    s.receive(from, { type: 'ladder', t: 2, data: null });
    assert.ok(b.got.some((m) => m.type === 'ladder'), 'picking one up is relayed');
    const welcome = a.got.find((m) => m.type === 'welcome') as Extract<ToClient, { type: 'welcome' }>;
    assert.deepEqual(welcome.session.tools, ['can', 'marker'], 'the welcome says which tools are on');
  } finally {
    console.log = say;
    Object.assign(SERVER, was);
  }
  console.log('tools off in a session: ok (their ops and stepladders are dropped, the batch still acked)');
}
