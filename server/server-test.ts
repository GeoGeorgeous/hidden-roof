import './headless';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import { PAINT, SERVER } from '../src/config';
import { levelPaintFaces } from '../src/level/prop-pieces';
import type { InventoryData } from '../src/inventory/inventory';
import { closeCode, decode, encode, HELLO, PROTOCOL, SNAPSHOT_BYTES, type ToClient, type ToServer } from '../src/net/protocol';
import { decodePaintFile, encodePaintFile, joinBytes } from '../src/save/paint-file';
import { surfaceTable } from '../src/save/shape';
import { loadPaint } from '../src/save/load-paint';
import { savePaint } from '../src/save/save-paint';
import type { LevelData } from '../src/level/level';
import { Session, type Link } from './session';
import { sessionPaint } from './world';

// The server (dist-server/server/main.js) against games speaking the protocol:
// HOST and JOIN, what's turned away, relaying, SAVE, a reconnect, a player who
// doesn't come back, who's away or dropped, what a player carries, HOST from a save, a full session joining at once,
// message sizes, and the limits per address. Then level paint: made on a level
// it fits, not once a painted prop is gone, and each level's own paint fits
// its level. npm run test:server builds both.

// A free port: other agents may be testing on this machine at the same time.
const PORT = await new Promise<number>((done) => {
  const s = net.createServer().listen(0, () => {
    const { port } = s.address() as net.AddressInfo;
    s.close(() => done(port));
  });
});
const level = JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8'));
PAINT.texelsPerMeter = 48;
const faces = levelPaintFaces(level);
const table = surfaceTable(faces);
const stamp = { kind: 'stamp' as const, key: faces[0].key, rect: 0, u: 0.5, v: 0.5, radius: 0.2, amount: 1, color: [1, 0, 0] as const, softness: 0, square: false };

const server = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(PORT), REJOIN_WINDOW: '1', HELLO_TIMEOUT: '2' }, stdio: ['ignore', 'pipe', 'inherit'] });
if (process.env.SERVER_LOG) server.stdout!.pipe(process.stderr);
const log: string[] = [];
await new Promise<void>((ready) => server.stdout!.on('data', (d: Buffer) => (log.push(d.toString()), ready())));

/** A message as a game takes it: a welcome or a save with its paint file. */
type Got = ToClient & { file?: Uint8Array };
let games = 0;
/** The session whose paint file two players shared. */
let shared = '';
/** A game: what it got so far, and the next message of a type. Each comes from its own address (as Caddy passes it on), unless given one. */
class Game {
  ws: WebSocket;
  got: Got[] = [];
  closed: Promise<number>;
  private waiters: (() => void)[] = [];
  constructor(ip = `10.0.${games >> 8}.${++games & 255}`, path = '/ws') {
    // Node's WebSocket takes headers (undici); the DOM type doesn't know.
    this.ws = new WebSocket(`ws://localhost:${PORT}${path}`, { headers: { 'x-forwarded-for': ip } } as unknown as string[]);
    this.ws.binaryType = 'arraybuffer';
    // A welcome or a save comes once its paint file's parts have (`file`).
    let waiting: { m: Got; parts: Uint8Array[] } | null = null;
    this.ws.onmessage = (e) => {
      const m = decode(new Uint8Array(e.data as ArrayBuffer)) as Got;
      if (m.type === 'part') {
        waiting!.parts.push(m.bytes);
        if (waiting!.parts.length < (waiting!.m as { parts: number }).parts) return;
        this.got.push({ ...waiting!.m, file: joinBytes(waiting!.parts) });
        waiting = null;
      } else if ((m.type === 'welcome' || m.type === 'save') && m.parts) waiting = { m, parts: [] };
      else this.got.push(m);
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
  async next<T extends ToClient['type']>(type: T, ms = 2000): Promise<Extract<Got, { type: T }>> {
    const end = Date.now() + ms;
    for (;;) {
      const i = this.got.findIndex((m) => m.type === type);
      if (i >= 0) return this.got.splice(i, 1)[0] as Extract<Got, { type: T }>;
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
const game = (ip?: string, path?: string) => new Game(ip, path).open();
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
  assert.deepEqual([wb.you, wb.players, wb.levelName, wb.inventory], [2, [{ id: 1, name: 'A', state: 'here' }], 'demo', null]);
  assert.deepEqual(await a.next('joined'), { type: 'joined', id: 2, name: 'B' });
  // The rest of a full session joins all at once; one more is turned away; they go again.
  const rest = await Promise.all(Array.from({ length: SERVER.maxPlayers - 2 }, () => game()));
  rest.forEach((x, i) => x.send({ type: 'join', protocol: PROTOCOL, name: `C${i}`, code: wa.code }));
  const ids = new Set<number>();
  for (const x of rest) ids.add((await x.next('welcome', 5000)).you);
  assert.equal(ids.size, rest.length);
  const c = await game();
  c.send({ type: 'join', protocol: PROTOCOL, name: 'C', code: wa.code });
  assert.equal((await c.next('rejected')).reason, 'full');
  for (const x of rest) x.send({ type: 'leave' });
  for (let i = 0; i < rest.length; i++) (await a.next('joined'), await a.next('left'), await b.next('joined'), await b.next('left'));

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
  const save = (await b.next('save')).file!;
  const { header } = await decodePaintFile(save);
  assert.deepEqual([header.density, [...new Set(header.faces.map((f) => f.surface))]], [48, [stamp.key]]);

  // B's game is hidden (minimized): A hears it's away.
  b.send({ type: 'away', away: true });
  assert.deepEqual(await a.next('presence'), { type: 'presence', id: 2, state: 'away' });
  // B carries something, drops and comes back with its token: the same player, the paint, A's ladder and what B
  // carried in its welcome; A hears B dropped and is back, never that B left or joined.
  const carried = { tools: ['marker'], colors: ['black', 'red'], caps: ['standard'], selected: 1, color: 'red', cap: 'standard' } as InventoryData;
  b.send({ type: 'inventory', data: carried });
  b.ws.close();
  await b.closed;
  assert.deepEqual(await a.next('presence'), { type: 'presence', id: 2, state: 'dropped' });
  const b2 = await game();
  b2.send({ type: 'join', protocol: PROTOCOL, name: 'B', code: wa.code, token: wb.token });
  const back = await b2.next('welcome');
  assert.deepEqual([back.you, back.ladders, back.inventory], [2, [{ id: 1, data: ladder }], carried]);
  assert.deepEqual((await decodePaintFile(back.file!)).header.faces, header.faces);
  assert.deepEqual(await a.next('presence'), { type: 'presence', id: 2, state: 'here' });
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
  // One who left and comes in again later under the same name gets back what they carried.
  twin.send({ type: 'inventory', data: carried });
  twin.send({ type: 'leave' });
  await twin.closed;
  const again = await game();
  again.send({ type: 'join', protocol: PROTOCOL, name: 'geo (2)', code: wg.code });
  assert.deepEqual((await again.next('welcome')).inventory, carried);

  // HOST from a save: the host isn't sent its own save back; the paint is there for the next player.
  const h = await game();
  h.send({ ...host, bytes: save });
  const wh = await h.next('welcome');
  assert.equal(wh.parts, 0);
  const hj = await game();
  hj.send({ type: 'join', protocol: PROTOCOL, name: 'J', code: wh.code });
  assert.deepEqual((await decodePaintFile((await hj.next('welcome')).file!)).header.faces, header.faces);

  // Who joins soon after a paint file was made shares it, and gets what was painted since right after it, to paint
  // at once (not when a figure gets there: the painter may be gone); a SAVE
  // then needs a new one, with that paint in it.
  const x = await game();
  x.send(host);
  const wx = await x.next('welcome');
  x.send({ type: 'ops', t: [1], ops: [stamp] });
  x.send({ type: 'ping', t: 1 });
  await x.next('pong');
  const y = await game();
  y.send({ type: 'join', protocol: PROTOCOL, name: 'Y', code: wx.code });
  assert.deepEqual((await decodePaintFile((await y.next('welcome')).file!)).header.faces, []);
  assert.deepEqual((await y.next('paint')).ops, [stamp]);
  x.send({ type: 'save' });
  assert.deepEqual([...new Set((await decodePaintFile((await x.next('save')).file!)).header.faces.map((f) => f.surface))], [stamp.key]);
  shared = wx.code;

  // A paint file whose header claims gigabytes is turned down, and the server goes on.
  const bomb = await encodePaintFile({ created: '', level: { name: 'demo' }, density: 48, surfaces: { [stamp.key]: 'x' }, faces: [{ surface: stamp.key, rect: 0, w: 60000, h: 60000 }] }, []);
  const g = await game();
  g.send({ ...host, bytes: joinBytes(bomb) });
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
  const saved = async (x: Game) => (x.send({ type: 'save' }), decodePaintFile((await x.next('save')).file!));
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

  // Only /ws?host takes a message past SERVER.maxMessage (a save), from a few links per address.
  const tooBig = await game();
  tooBig.ws.send(new Uint8Array(SERVER.maxMessage + 1));
  assert.equal(await tooBig.closed, 1009);
  const uploaders = [];
  for (let i = 0; i < SERVER.uploadsPerIp; i++) uploaders.push(await game('10.7.7.7', '/ws?host'));
  const oneMore = await game('10.7.7.7', '/ws?host');
  assert.equal((await oneMore.next('rejected')).reason, 'too-many');
  uploaders[0].send({ ...host, bytes: new Uint8Array(SERVER.maxMessage + 1) });
  assert.equal((await uploaders[0].next('rejected')).reason, 'bad-save');
  uploaders.forEach((x) => x.ws.close());

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
assert.match(lines, new RegExp(`${shared} "Y" #2 in from \\S+ \\(new, 2 players; paint file shared \\(2\\)\\)`));
assert.match(lines, /paint file: [\d.]+ MB of paint, [\d.]+ MB packed, in [\d.]+ s \(0 more in line\)/);
// A player who left isn't also logged as dropped.
assert.doesNotMatch(lines, /"A" #1 out: left[^]*"A" #1 dropped/);

// A paint file that fails (here: paint that can't be read) fails only the joins waiting for it; the next join gets a
// new one. In the process, with the server's log quiet.
{
  const say = console.log;
  console.log = () => {};
  // No timers left to keep the test running: the dropped joiner goes and the paint file isn't kept.
  Object.assign(SERVER, { rejoinWindow: 0, snapshotKeep: 0 });
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
  console.log = say;
  assert.ok(typeof r !== 'string' && y.sent > 1, 'a join after a failed paint file gets a welcome and the paint');
  console.log('failed paint file: ok (the next join gets a new one)');
}

// A level's own paint (src/save/level-paint.ts) fits it face for face, and the faces of a prop removed since don't: made here on the demo level.
const paintOn = (level: LevelData, bytes: Uint8Array, name: string) => {
  const { paint, drips } = sessionPaint(level);
  return loadPaint(paint, drips, bytes, { name });
};
const demo: LevelData = JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8'));
const made = sessionPaint(demo).paint;
const last = demo.props.at(-1)!.id!;
for (const s of [made.surfaces[0], made.surfaces.find((s) => s.key.startsWith(`p${last}#`))!]) made.stamp(s, { rect: 0, u: 0.5, v: 0.5 }, 0.2, 1, [1, 1, 1]);
const own = await savePaint(made, { name: 'demo' });
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
