import './headless';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { PAINT, SERVER } from '../src/config';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { closeCode, decode, encode, HELLO, PROTOCOL, SNAPSHOT_BYTES, type ToClient, type ToServer } from '../src/net/protocol';
import { decodePaintFile, encodePaintFile } from '../src/save/paint-file';
import { surfaceTable } from '../src/save/shape';

// The server (dist-server/server/main.js) against games speaking the protocol:
// HOST and JOIN, what's turned away, relaying, SAVE, a reconnect, a player who
// doesn't come back, HOST from a save, and the limits per address. npm run test:server builds both.

const PORT = 3999;
const level = JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8'));
PAINT.texelsPerMeter = 48;
const faces = levelPaintFaces(level);
const table = surfaceTable(faces);
const stamp = { kind: 'stamp' as const, key: faces[0].key, rect: 0, u: 0.5, v: 0.5, radius: 0.2, amount: 1, color: [1, 0, 0] as const, softness: 0, square: false };

const server = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(PORT), REJOIN_WINDOW: '1', HELLO_TIMEOUT: '2' }, stdio: ['ignore', 'pipe', 'inherit'] });
const log: string[] = [];
await new Promise<void>((ready) => server.stdout!.on('data', (d: Buffer) => (log.push(d.toString()), ready())));

let games = 0;
/** A game: what it got so far, and the next message of a type. Each comes from its own address (as Caddy passes it on), unless given one. */
class Game {
  ws: WebSocket;
  got: ToClient[] = [];
  closed: Promise<number>;
  private waiters: (() => void)[] = [];
  constructor(ip = `10.0.0.${++games}`) {
    // Node's WebSocket takes headers (undici); the DOM type doesn't know.
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { 'x-forwarded-for': ip } } as unknown as string[]);
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
const game = (ip?: string) => new Game(ip).open();
const host = { type: 'host' as const, protocol: PROTOCOL, table, name: 'A', levelName: 'demo', level, detail: 48 };

try {
  assert.equal((await fetch(`http://localhost:${PORT}/healthz`)).status, 200);
  // A plain GET at /ws: what the game asks when it can't connect (net/diagnostics.ts).
  assert.equal(await (await fetch(`http://localhost:${PORT}/ws`)).text(), HELLO);

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
    // The socket closes with the reason's own code, for the logs.
    assert.equal(await g.closed, closeCode(reason));
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
  const snap = new Uint8Array(SNAPSHOT_BYTES).map((_, i) => i);
  a.send({ type: 'state', bytes: snap });
  assert.deepEqual((await b.next('state')).bytes, snap);
  a.send({ type: 'ops', t: [1, 2], ops: [stamp, { ...stamp, key: 'p99999#0' }] });
  assert.deepEqual(await b.next('ops'), { type: 'ops', id: 1, t: [1], ops: [stamp] });
  const ladder = { type: 'stepladder', pos: [1, 0, 2] as [number, number, number], rot: 1 };
  a.send({ type: 'ladder', t: 3, data: ladder });
  assert.deepEqual(await b.next('ladder'), { type: 'ladder', id: 1, t: 3, data: ladder });
  await a.none('state');
  a.send({ type: 'ping', t: 7.25 });
  assert.deepEqual(await a.next('pong'), { type: 'pong', t: 7.25 });

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

  // The same player again from another tab (a duplicated tab carries the token): the old tab is told, and goes.
  const b3 = await game();
  b3.send({ type: 'join', protocol: PROTOCOL, name: 'B', code: wa.code, token: wb.token });
  assert.equal((await b3.next('welcome')).you, 2);
  assert.equal((await b2.next('rejected')).reason, 'replaced');
  await b2.closed;
  await a.none('left');

  // B drops for good: after the rejoin window (1 s here) A hears it left; when A leaves, the session closes.
  b3.ws.close();
  assert.deepEqual(await a.next('left', 8000), { type: 'left', id: 2 });
  a.send({ type: 'leave' });
  await a.closed;
  // Its code now says the session has ended (an unknown code says there's none, above).
  const late = await game();
  late.send({ type: 'join', protocol: PROTOCOL, name: 'B', code: wa.code });
  assert.equal((await late.next('rejected')).reason, 'ended');

  // The same name twice gets a number. The host drops and comes back from a new tab (no token) while the other is
  // still in a full session: under the same name it takes its own place back, not "full".
  const geo = await game();
  geo.send({ ...host, name: 'geo' });
  const wg = await geo.next('welcome');
  const twin = await game();
  twin.send({ type: 'join', protocol: PROTOCOL, name: 'geo', code: wg.code });
  await twin.next('welcome');
  assert.equal((await geo.next('joined')).name, 'geo (2)');
  geo.ws.close();
  await geo.closed;
  const newTab = await game();
  newTab.send({ type: 'join', protocol: PROTOCOL, name: 'geo', code: wg.code });
  assert.equal((await newTab.next('welcome')).you, wg.you);
  await twin.none('joined');

  // HOST from a save: the paint is there for the next player.
  const h = await game();
  h.send({ ...host, bytes: save });
  const wh = await h.next('welcome');
  assert.deepEqual((await decodePaintFile(wh.bytes)).header.faces, header.faces);

  // A paint file whose header claims gigabytes is turned down, and the server goes on.
  const bomb = await encodePaintFile({ created: '', level: { name: 'demo' }, density: 48, surfaces: { [stamp.key]: 'x' }, faces: [{ surface: stamp.key, rect: 0, w: 60000, h: 60000 }] }, new Uint8Array(0));
  const g = await game();
  g.send({ ...host, bytes: bomb });
  assert.equal((await g.next('rejected')).reason, 'bad-save');
  assert.equal((await fetch(`http://localhost:${PORT}/healthz`)).status, 200);

  // Sessions at different PAINT DETAILs side by side (PAINT.texelsPerMeter is global on the server): one's paint
  // never depends on the other's. The same stamps, interleaved with another session's, paint what they paint alone.
  const [s48, s96, alone] = await Promise.all([game(), game(), game()]);
  s48.send(host);
  s96.send({ ...host, detail: 96 });
  alone.send(host);
  await Promise.all([s48, s96, alone].map((x) => x.next('welcome')));
  const other = { ...stamp, u: 0.3, color: [0, 0, 1] as const };
  for (const op of [stamp, other]) {
    s48.send({ type: 'ops', t: [1], ops: [op] });
    s96.send({ type: 'ops', t: [1], ops: [op] });
    alone.send({ type: 'ops', t: [1], ops: [op] });
  }
  const saved = async (x: Game) => (x.send({ type: 'save' }), decodePaintFile((await x.next('save')).bytes));
  const [p48, p96, pAlone] = await Promise.all([s48, s96, alone].map(saved));
  assert.deepEqual([p48.header.density, p96.header.density], [48, 96]);
  assert.deepEqual(p48.body, pAlone.body);
  assert.ok(p96.body.length > p48.body.length * 3);

  // Limits per address: links (the next one is turned away, another address isn't), hosted sessions, silent links.
  const crowd = await Promise.all(Array.from({ length: SERVER.linksPerIp }, () => game('10.9.9.9')));
  const extra = await game('10.9.9.9');
  assert.equal((await extra.next('rejected')).reason, 'too-many');
  assert.equal(await extra.closed, closeCode('too-many'));
  const neighbor = await game('10.9.9.10');
  neighbor.send(host);
  await neighbor.next('welcome');
  crowd.forEach((x) => x.ws.close());
  await Promise.all(crowd.map((x) => x.closed));
  const hosts = await Promise.all(Array.from({ length: SERVER.sessionsPerIp + 1 }, () => game('10.8.8.8')));
  for (const x of hosts.slice(0, -1)) (x.send(host), await x.next('welcome'));
  hosts.at(-1)!.send(host);
  assert.equal((await hosts.at(-1)!.next('rejected')).reason, 'too-many');
  const silent = await game();
  assert.equal(await silent.closed, 1008);

  // Pings keep coming; a message that isn't one closes the socket.
  await h.next('ping', 3000);
  h.ws.send(new Uint8Array([1, 2, 3]));
  assert.equal(await h.closed, 1008);
  console.log('server: ok');
} finally {
  server.kill();
}
const lines = log.join('');
assert.match(lines, /[A-Z]{5} hosted by \S+: demo at 48 texels\/m/);
// A player who left isn't also logged as dropped.
assert.doesNotMatch(lines, /"A" #1 out: left[^]*"A" #1 dropped/);
