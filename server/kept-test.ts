import './headless';
import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket as Ws } from 'ws';
import { SERVER } from '../src/config';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { CODE_LENGTH, decode, encode, PROTOCOL, type ToClient, type ToServer } from '../src/net/protocol';
import { PartsIn } from '../src/net/parts-in';
import { encodeOps, SurfaceIndex } from '../src/op-wire';
import { decodePaintFile } from '../src/save/paint-file';

// The admin's sessions (admin-api.ts, admin.mjs) and the public ones kept on
// disk (kept.ts), against the built server: the key, a public session made,
// full at its limit and kept when empty, its paint saved at shutdown and back
// after a restart, a wipe (games come back to a clean wall), a new surface table
// wiping the save, private ones that close when empty or stay, and a close;
// what the admin page reads: sessions, the machine, the event stream and history. npm run test:server runs it.

const freePort = () =>
  new Promise<number>((done) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => done(port));
    });
  });
const [PORT, ADMIN_PORT] = [await freePort(), await freePort()];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-kept-'));
const env = { ...process.env, PORT: String(PORT), ADMIN_PORT: String(ADMIN_PORT), ADMIN_KEY: 'test-key', DATA_DIR: dir, REJOIN_WINDOW: '5' };
const faces = levelPaintFaces(JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8')), 48);
const surfaces = new SurfaceIndex(faces.map((f) => f.key));
const stamp = { kind: 'stamp' as const, key: faces[0].key, rect: 0, u: 0.5, v: 0.5, radius: 0.2, amount: 1, color: [1, 0, 0] as const, softness: 0, square: false };

let out = '';
async function start() {
  out = '';
  const server = spawn(process.execPath, ['--expose-gc', 'dist-server/server/main.js'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  server.stdout!.on('data', (d: Buffer) => (out += d.toString()));
  for (let i = 0; !out.includes('roof server on'); i++) {
    assert.ok(i < 200, 'the server starts');
    await new Promise((w) => setTimeout(w, 50));
  }
  return server;
}
const stop = (server: ChildProcess) => new Promise((done) => (server.once('exit', done), server.kill('SIGTERM')));

const admin = async (method: string, at: string, body?: unknown, key = 'test-key', headers = {}) => {
  const res = await fetch(`http://localhost:${ADMIN_PORT}${at}`, { method, headers: { authorization: `Bearer ${key}`, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

/** The admin's event stream: what it has got so far, as { type, data }. */
async function feed() {
  const res = await fetch(`http://localhost:${ADMIN_PORT}/events`, { headers: { authorization: 'Bearer test-key' } });
  const got: { type: string; data: { type?: string; code?: string; players?: number } }[] = [];
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  void (async () => {
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      buf += r.value;
      for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
        const [, type, data] = /^event: (.*)\ndata: (.*)$/.exec(buf.slice(0, i)) ?? [];
        buf = buf.slice(i + 2);
        if (type) got.push({ type, data: JSON.parse(data) });
      }
    }
  })().catch(() => {});
  return got;
}
const events = (got: Awaited<ReturnType<typeof feed>>, type: string) => got.filter((g) => g.type === 'event' && g.data.type === type);

let games = 0;
/** A game as server-test.ts's: what it got, and the next message of a type. */
class Game {
  ws: Ws;
  got: (ToClient & { file?: Uint8Array })[] = [];
  closed: Promise<number>;
  constructor(
    ip = `10.1.0.${++games}`,
    readonly device?: string,
  ) {
    this.ws = new Ws(`ws://localhost:${PORT}/ws`, { headers: { 'x-forwarded-for': ip } });
    const parts = new PartsIn();
    this.ws.on('message', (d: Buffer) => {
      const done = parts.take(decode(new Uint8Array(d)) as ToClient);
      if (done) this.got.push(done.file ? { ...done.m, file: done.file } : done.m);
    });
    this.closed = new Promise((done) => this.ws.once('close', done));
  }
  async hello(code: string, name: string, token?: string) {
    if (this.ws.readyState !== Ws.OPEN) await new Promise((w) => this.ws.once('open', w));
    this.send({ type: 'join', protocol: PROTOCOL, device: this.device, name, code, token });
  }
  async join(code: string, name: string, token?: string) {
    await this.hello(code, name, token);
    return this.next('welcome');
  }
  send(m: ToServer) {
    this.ws.send(encode(m));
  }
  async next<T extends ToClient['type']>(type: T, ms = 10000) {
    for (const end = Date.now() + ms; ; await new Promise((w) => setTimeout(w, 20))) {
      const i = this.got.findIndex((m) => m.type === type);
      if (i >= 0) return this.got.splice(i, 1)[0] as Extract<ToClient, { type: T }> & { file?: Uint8Array };
      if (Date.now() > end) throw new Error(`no ${type} (got ${this.got.map((m) => m.type)})`);
    }
  }
}
const painted = async (file: Uint8Array) => (await decodePaintFile(file)).header.faces.length > 0;
const saves = () => fs.readdirSync(dir).filter((n) => n.endsWith('.rhhpaint'));

let server = await start();
try {
  // The key, the origin, and what a new session must say.
  assert.equal((await admin('GET', '/sessions', undefined, 'wrong')).status, 401);
  assert.equal((await admin('GET', '/sessions', undefined, 'test-key', { origin: 'https://elsewhere' })).status, 403);
  assert.equal((await admin('POST', '/sessions', { kind: 'secret', name: 'x' })).status, 400);
  assert.equal((await admin('POST', '/sessions', { kind: 'public', name: 'x'.repeat(33) })).status, 400);
  assert.equal((await admin('POST', '/sessions', { kind: 'public', name: 'x', level: 'nope' })).status, 400);
  assert.equal((await admin('POST', '/sessions', { kind: 'public', name: 'x', tools: ['spoon'] })).status, 400);

  const stream = await feed();
  const made = await admin('POST', '/sessions', { kind: 'public', name: ' Drawing together ', level: 'demo', detail: 'medium', tools: ['sponge', 'can'] });
  assert.equal(made.status, 200);
  const code: string = made.body.code;
  assert.deepEqual([made.body.kind, made.body.name, made.body.tools, made.body.detail, made.body.limit], ['public', 'Drawing together', ['can', 'sponge'], 'medium', SERVER.players.public]);

  // The command in the container asks the same API.
  const listed = await new Promise<string>((done, fail) => execFile(process.execPath, ['server/admin.mjs', 'list'], { env }, (e, so) => (e ? fail(e) : done(so))));
  assert.match(listed, new RegExp(`^${code}  public .* "Drawing together"`));

  // Full at the public limit, the next one waits in line; kept when everyone has left.
  await Promise.all(Array.from({ length: SERVER.players.public }, (_, i) => new Game().join(code, `P${i}`)));
  const extra = new Game();
  await extra.hello(code, 'Late');
  assert.equal((await extra.next('queued')).position, 1);
  assert.equal((await admin('GET', '/sessions')).body[0].queue, 1);
  assert.match(await new Promise<string>((done, fail) => execFile(process.execPath, ['server/admin.mjs', 'list'], { env }, (e, so) => (e ? fail(e) : done(so)))), / queue: 1 /);
  // The event stream: the recent events at once, then what happened as it happened, and the status every second.
  await new Promise((w) => setTimeout(w, SERVER.adminStatus * 1000 + 200));
  assert.deepEqual(stream[0].type, 'recent');
  assert.equal(events(stream, 'session-made')[0].data.code, made.body.code);
  assert.equal(events(stream, 'joined').length, SERVER.players.public);
  assert.ok(stream.some((g) => g.type === 'status' && g.data.players === SERVER.players.public), 'a status with everyone in');
  await stop(server);
  server = await start();
  assert.deepEqual((await admin('GET', '/sessions')).body.map((s: { code: string }) => s.code), [code], 'kept through a restart, empty');
  assert.equal(saves().length, 0, 'nothing painted: nothing saved');
  // History, written at shutdown: everyone's play counted when it started, the most players at once, ever.
  const day = await admin('GET', '/history?period=24h');
  assert.deepEqual([day.body.plays, day.body.peak.players, day.body.joinsPerHour[new Date().getUTCHours()]], [SERVER.players.public, SERVER.players.public, SERVER.players.public]);
  assert.equal((await admin('GET', '/')).body.peak.players, SERVER.players.public);
  assert.ok(fs.existsSync(path.join(dir, 'stats', `${new Date().toISOString().slice(0, 10)}.json`)), "the day's hours on disk");
  assert.equal((await admin('GET', '/history?period=week')).status, 400);
  // People: one device on two addresses, a second device on the second address, an IPv6 address changing within its /64: two people.
  const [d1, d2] = ['a'.repeat(32), 'b'.repeat(32)];
  for (const [ip, device] of [['10.2.0.1', d1], ['10.2.0.2', d1], ['10.2.0.2', d2], ['2001:db8:1:2::5', undefined], ['2001:db8:1:2:aaaa::9', undefined]] as const) {
    const g = new Game(ip, device);
    await g.join(code, 'Someone');
    g.send({ type: 'leave' });
    await g.closed;
  }
  const seen = (await admin('GET', '/history')).body.people;
  assert.deepEqual(seen, { merged: SERVER.players.public + 2, byDevice: 2, byIp: SERVER.players.public + 3 });

  // Paint, saved at shutdown, is back after the restart.
  const a = new Game();
  await a.join(code, 'A');
  a.send({ type: 'ops', seq: 1, bytes: encodeOps([1], [stamp], surfaces) });
  a.send({ type: 'ping', t: 1 });
  assert.equal((await a.next('pong')).acked, 1);
  // What the admin page reads: the version, today's paint (the stamp's color as the game's), the player, the machine.
  const top = await admin('GET', '/');
  assert.deepEqual([top.body.api, typeof top.body.version], [3, 'string']);
  const live = (await admin('GET', '/sessions')).body[0];
  assert.deepEqual([live.today.stamps.can, live.today.topColor, live.today.peak.players, live.emptySince], [1, 'red', 1, null]);
  assert.deepEqual([live.players[0].ip, live.players[0].here, live.players[0].held], [`10.1.0.${games}`, true, null]);
  assert.deepEqual([(await admin('GET', '/history')).body.stamps.can, (await admin('GET', '/history')).body.colors], [1, { red: 1 }]);
  const lost = new Game();
  await lost.hello('Z'.repeat(CODE_LENGTH), 'Lost');
  assert.equal((await lost.next('rejected')).reason, 'no-session');
  assert.equal((await admin('GET', '/history?period=7d')).body.turnedAway['no-session'], 1);
  const box = (await admin('GET', '/machine')).body;
  assert.ok(box.cpu.vcpus > 0 && box.disk.total > 0 && box.memory.limit > 0, 'the machine');
  await stop(server);
  assert.equal(saves().length, 1);
  server = await start();
  assert.match(out, new RegExp(`${code} paint from ${code}-\\d+\\.rhhpaint`));
  const b = new Game();
  const wb = await b.join(code, 'B');
  assert.ok(await painted(wb.file!), 'the paint is back');
  assert.equal((await admin('GET', '/sessions')).body[0].saves.length, 1, 'its save, listed');

  // The paint now, for the admin to keep: a paint file made at the request, not written to disk; a session that isn't there, 404.
  const download = await fetch(`http://localhost:${ADMIN_PORT}/sessions/${code}/paint`, { headers: { authorization: 'Bearer test-key' } });
  const file = new Uint8Array(await download.arrayBuffer());
  assert.deepEqual([download.status, download.headers.get('content-type')], [200, 'application/octet-stream']);
  assert.match(download.headers.get('content-disposition')!, new RegExp(`^attachment; filename="${code}-\\d{4}-\\d\\d-\\d\\dT\\d\\d-\\d\\d-\\d\\dZ\\.rhhpaint"$`));
  assert.ok(file.length > 0 && (await painted(file)), 'the paint, as a paint file');
  assert.equal(saves().length, 1, 'not written to disk');
  assert.equal((await admin('GET', `/sessions/ZZZZZ/paint`)).status, 404);
  assert.equal((await fetch(`http://localhost:${ADMIN_PORT}/sessions/${code}/paint`, { headers: { authorization: 'Bearer wrong' } })).status, 401);

  // A wipe: the game's link closes as a drop; it comes back with its token to a clean wall, and the saves stay aside, marked wiped.
  assert.equal((await admin('POST', `/sessions/${code}/wipe`)).status, 200);
  assert.equal(await b.closed, 1012);
  const held = (await admin('GET', '/sessions')).body[0].players[0];
  assert.ok(!held.here && held.held > 0 && held.held <= 5, 'a dropped seat, held');
  const again = await new Game().join(code, 'B', wb.token);
  assert.equal(again.you, wb.you);
  assert.ok(!(await painted(again.file!)), 'a clean wall');
  assert.deepEqual(saves().map((n) => n.endsWith('.wiped.rhhpaint')), [true], 'the save, kept as wiped');
  assert.deepEqual((await admin('GET', '/sessions')).body[0].saves.map((s: { wiped: boolean }) => s.wiped), [true], 'listed as wiped');
  // A restart after it: still the empty wall. A new save after it isn't wiped and is the one loaded; the wiped one stays.
  await stop(server);
  server = await start();
  assert.ok(!out.includes('paint from'), 'a wiped save is never loaded');
  const e = new Game();
  assert.ok(!(await painted((await e.join(code, 'E')).file!)), 'empty after the restart');
  e.send({ type: 'ops', seq: 1, bytes: encodeOps([1], [stamp], surfaces) });
  e.send({ type: 'ping', t: 1 });
  await e.next('pong');
  await stop(server);
  server = await start();
  assert.match(out, new RegExp(`${code} paint from ${code}-\\d+\\.rhhpaint`));
  assert.ok(await painted((await new Game().join(code, 'E')).file!), 'the new save is back');
  assert.deepEqual((await admin('GET', '/sessions')).body[0].saves.map((s: { wiped: boolean }) => s.wiped), [false, true]);
  // Newer saves around, then a second wipe: the newest keepFiles of all stay, the earlier wiped ones among them.
  const [fresh] = saves().filter((n) => !n.includes('wiped'));
  const [old] = saves().filter((n) => n.includes('wiped'));
  for (let i = 1; i < SERVER.keepFiles; i++) fs.copyFileSync(path.join(dir, fresh), path.join(dir, fresh.replace(/-(\d+)/, (_, ms) => `-${Number(ms) + i}`)));
  assert.equal((await admin('POST', `/sessions/${code}/wipe`)).status, 200);
  assert.equal(saves().length, SERVER.keepFiles, 'at most keepFiles wiped saves');
  assert.ok(saves().every((n) => n.endsWith('.wiped.rhhpaint')), 'all of them wiped');
  assert.ok(!saves().includes(old), 'the oldest is gone');

  // A new surface table (another version of the game) wipes the saves at start, the wiped ones too.
  const c = new Game();
  await c.join(code, 'C');
  c.send({ type: 'ops', seq: 1, bytes: encodeOps([1], [stamp], surfaces) });
  c.send({ type: 'ping', t: 1 });
  await c.next('pong');
  await stop(server);
  const list = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify(list.map((e: object) => ({ ...e, table: 'older' }))));
  server = await start();
  assert.match(out, new RegExp(`${code} paint wiped: a new surface table`));
  const atStart = await feed();
  for (let i = 0; !atStart.length; i++) await new Promise((w) => setTimeout(w, 20));
  assert.deepEqual((atStart[0].data as unknown as { type: string; detail: object }[]).map((e) => [e.type, e.detail]), [['wiped-at-start', { cause: ['surface table'] }]], 'kept for a page that opens later');
  assert.equal(saves().length, 0);

  // A private session of the admin's closes once its players have gone, unless it stays; it isn't kept on disk.
  for (const stay of [false, true]) {
    const made = await admin('POST', '/sessions', { kind: 'private', name: 'Friends', level: 'demo', detail: 'low', stay });
    assert.deepEqual([made.status, made.body.limit, made.body.stays], [200, SERVER.players.private, stay]);
    const g = new Game();
    await g.join(made.body.code, 'E');
    g.send({ type: 'leave' });
    await g.closed;
    const codes = (await admin('GET', '/sessions')).body.map((s: { code: string }) => s.code);
    assert.equal(codes.includes(made.body.code), stay, stay ? 'stays when empty' : 'closes when empty');
    if (stay) assert.equal((await admin('POST', `/sessions/${made.body.code}/close`)).status, 200);
  }
  const record = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8'));
  assert.deepEqual([record.length, record[0].limit], [1, SERVER.players.public], 'only the public session is kept, with its limit');

  // Closed: its players are told it has ended, and it's no longer kept; no save stays, wiped or not.
  const d = new Game();
  await d.join(code, 'D');
  fs.writeFileSync(path.join(dir, `${code}-1.wiped.rhhpaint`), '');
  fs.writeFileSync(path.join(dir, `${code}-2.rhhpaint`), '');
  assert.equal((await admin('POST', `/sessions/${code}/close`)).status, 200);
  assert.equal((await d.next('rejected')).reason, 'ended');
  assert.equal(saves().length, 0);
  assert.deepEqual((await admin('GET', '/sessions')).body, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8')), []);
  // Plays that ended (seven left, one ended by the close), the paint still there after two restarts.
  const month = (await admin('GET', '/history?period=30d')).body;
  assert.deepEqual([month.playLength, month.stamps.can], [{ under2m: 8, m2to10: 0, m10to30: 0, over30m: 0 }, 3]);
  assert.equal(month.people.byDevice, 2, 'people, kept through restarts');
  assert.ok(!JSON.stringify(fs.readdirSync(path.join(dir, 'stats')).map((n) => fs.readFileSync(path.join(dir, 'stats', n), 'utf8'))).includes('10.2.0.'), 'no address on disk');
  console.log('kept sessions: ok (admin key and origin, a public session full at its limit with a line, kept empty, paint back after a restart, the paint downloaded, wipe, saves kept aside, a new surface table wipes, private ones close when empty unless they stay, close, what the admin page reads, the event stream, history)');
} finally {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
