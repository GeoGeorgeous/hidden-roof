import './headless';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { PAINT } from '../src/config';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { decode, encode, PROTOCOL, type ToClient, type ToServer } from '../src/net/protocol';
import { decodePaintFile } from '../src/save/paint-file';
import { surfaceTable } from '../src/save/shape';

// The server (dist-server/server/main.js) against games speaking the protocol:
// HOST and JOIN, what's turned away, relaying, SAVE, a reconnect, a player who
// doesn't come back, and HOST from a save. npm run test:server builds both.

const PORT = 3999;
const level = JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8'));
PAINT.texelsPerMeter = 48;
const faces = levelPaintFaces(level);
const table = surfaceTable(faces);
const stamp = { kind: 'stamp' as const, key: faces[0].key, rect: 0, u: 0.5, v: 0.5, radius: 0.2, amount: 1, color: [1, 0, 0] as const, softness: 0, square: false };

const server = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(PORT), REJOIN_WINDOW: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
const log: string[] = [];
await new Promise<void>((ready) => server.stdout!.on('data', (d: Buffer) => (log.push(d.toString()), ready())));

/** A game: what it got so far, and the next message of a type. */
class Game {
  ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  got: ToClient[] = [];
  closed: Promise<number>;
  private waiters: (() => void)[] = [];
  constructor() {
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (e) => {
      this.got.push(decode(new Uint8Array(e.data as ArrayBuffer)) as ToClient);
      this.waiters.splice(0).forEach((w) => w());
    };
    this.closed = new Promise((done) => (this.ws.onclose = (e) => done(e.code)));
  }
  async open() {
    if (this.ws.readyState !== WebSocket.OPEN) await new Promise((done) => (this.ws.onopen = done));
    return this;
  }
  send(m: ToServer) {
    this.ws.send(encode(m));
  }
  async next<T extends ToClient['type']>(type: T, ms = 2000): Promise<Extract<ToClient, { type: T }>> {
    const end = Date.now() + ms;
    for (;;) {
      const i = this.got.findIndex((m) => m.type === type);
      if (i >= 0) return this.got.splice(i, 1)[0] as Extract<ToClient, { type: T }>;
      if (Date.now() > end) throw new Error(`no ${type} (got ${this.got.map((m) => m.type)})`);
      await new Promise<void>((w) => (this.waiters.push(w), setTimeout(w, 50)));
    }
  }
  /** Nothing of this type arrives for a while. */
  async none(type: ToClient['type'], ms = 300) {
    await new Promise((w) => setTimeout(w, ms));
    assert.ok(!this.got.some((m) => m.type === type), `unexpected ${type}`);
  }
}
const game = () => new Game().open();
const host = { type: 'host' as const, protocol: PROTOCOL, table, name: 'A', levelName: 'demo', level, detail: 48 };

try {
  assert.equal((await fetch(`http://localhost:${PORT}/healthz`)).status, 200);

  // Turned away: an older game, a game that builds the level differently, an unknown code, a broken save.
  for (const [m, reason] of [
    [{ ...host, protocol: PROTOCOL + 1 }, 'version'],
    [{ ...host, table: 'x' }, 'version'],
    [{ type: 'join', protocol: PROTOCOL, name: 'B', code: 'ZZZZZ' }, 'no-session'],
    [{ ...host, bytes: new Uint8Array([1, 2, 3]) }, 'bad-save'],
  ] as const) {
    const g = await game();
    g.send(m as ToServer);
    assert.equal((await g.next('rejected')).reason, reason);
  }

  // HOST, then JOIN by its code; the host hears who joined.
  const a = await game();
  a.send(host);
  const wa = await a.next('welcome');
  assert.deepEqual([wa.you, wa.players, wa.detail, wa.table], [1, [], 48, table]);
  const b = await game();
  b.send({ type: 'join', protocol: PROTOCOL, name: 'B', code: wa.code });
  const wb = await b.next('welcome');
  assert.deepEqual([wb.you, wb.players, wb.levelName], [2, [{ id: 1, name: 'A' }], 'demo']);
  assert.deepEqual(await a.next('joined'), { type: 'joined', id: 2, name: 'B' });
  const c = await game();
  c.send({ type: 'join', protocol: PROTOCOL, name: 'C', code: wa.code });
  assert.equal((await c.next('rejected')).reason, 'full');

  // Relayed to the other player only: state, paint ops (one on a surface the level doesn't have is dropped), the stepladder.
  const snap = new Uint8Array(23).map((_, i) => i);
  a.send({ type: 'state', bytes: snap });
  assert.deepEqual((await b.next('state')).bytes, snap);
  a.send({ type: 'ops', t: [1, 2], ops: [stamp, { ...stamp, key: 'p99999#0' }] });
  assert.deepEqual(await b.next('ops'), { type: 'ops', id: 1, t: [1], ops: [stamp] });
  const ladder = { type: 'stepladder', pos: [1, 0, 2] as [number, number, number], rot: 1 };
  a.send({ type: 'ladder', t: 3, data: ladder });
  assert.deepEqual(await b.next('ladder'), { type: 'ladder', id: 1, t: 3, data: ladder });
  await a.none('state');

  // SAVE: the session's paint, with the stamp in it.
  b.send({ type: 'save' });
  const save = (await b.next('save')).bytes;
  const { header } = await decodePaintFile(save);
  assert.deepEqual([header.density, [...new Set(header.faces.map((f) => f.surface))]], [48, [stamp.key]]);

  // B drops and comes back with its token: the same player, the paint and A's ladder in its welcome; A hears nothing.
  b.ws.close();
  await b.closed;
  const b2 = await game();
  b2.send({ type: 'join', protocol: PROTOCOL, name: 'B', code: wa.code, token: wb.token });
  const back = await b2.next('welcome');
  assert.deepEqual([back.you, back.ladders], [2, [{ id: 1, data: ladder }]]);
  assert.deepEqual((await decodePaintFile(back.bytes)).header.faces, header.faces);
  await a.none('joined');
  await a.none('left');

  // B drops for good: after the rejoin window (1 s here) A hears it left; when A leaves, the session closes.
  b2.ws.close();
  assert.deepEqual(await a.next('left', 3000), { type: 'left', id: 2 });
  a.send({ type: 'leave' });
  await a.closed;
  const late = await game();
  late.send({ type: 'join', protocol: PROTOCOL, name: 'B', code: wa.code });
  assert.equal((await late.next('rejected')).reason, 'no-session');

  // HOST from a save: the paint is there for the next player.
  const h = await game();
  h.send({ ...host, bytes: save });
  const wh = await h.next('welcome');
  assert.deepEqual((await decodePaintFile(wh.bytes)).header.faces, header.faces);

  // Pings keep coming; a message that isn't one closes the socket.
  await h.next('ping', 3000);
  h.ws.send(new Uint8Array([1, 2, 3]));
  assert.equal(await h.closed, 1008);
  console.log('server: ok');
} finally {
  server.kill();
}
assert.match(log.join(''), /hosted: demo at 48 texels\/m/);
