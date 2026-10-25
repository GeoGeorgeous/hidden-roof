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
import { decode, encode, PROTOCOL, type ToClient, type ToServer } from '../src/net/protocol';
import { PartsIn } from '../src/net/parts-in';
import { encodeOps, SurfaceIndex } from '../src/op-wire';
import { decodePaintFile } from '../src/save/paint-file';

// The admin's sessions (admin-api.ts, admin.mjs) and the public ones kept on
// disk (kept.ts), against the built server: the key, a public session made,
// full at its limit and kept when empty, its paint saved at shutdown and back
// after a restart, a wipe (games come back to a clean wall), a new surface table
// wiping the save, private ones that close when empty or stay, and a close. npm run test:server runs it.

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

let games = 0;
/** A game as server-test.ts's: what it got, and the next message of a type. */
class Game {
  ws: Ws;
  got: (ToClient & { file?: Uint8Array })[] = [];
  closed: Promise<number>;
  constructor() {
    this.ws = new Ws(`ws://localhost:${PORT}/ws`, { headers: { 'x-forwarded-for': `10.1.0.${++games}` } });
    const parts = new PartsIn();
    this.ws.on('message', (d: Buffer) => {
      const done = parts.take(decode(new Uint8Array(d)) as ToClient);
      if (done) this.got.push(done.file ? { ...done.m, file: done.file } : done.m);
    });
    this.closed = new Promise((done) => this.ws.once('close', done));
  }
  async hello(code: string, name: string, token?: string) {
    if (this.ws.readyState !== Ws.OPEN) await new Promise((w) => this.ws.once('open', w));
    this.send({ type: 'join', protocol: PROTOCOL, name, code, token });
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
  await stop(server);
  server = await start();
  assert.deepEqual((await admin('GET', '/sessions')).body.map((s: { code: string }) => s.code), [code], 'kept through a restart, empty');
  assert.equal(saves().length, 0, 'nothing painted: nothing saved');

  // Paint, saved at shutdown, is back after the restart.
  const a = new Game();
  await a.join(code, 'A');
  a.send({ type: 'ops', seq: 1, bytes: encodeOps([1], [stamp], surfaces) });
  a.send({ type: 'ping', t: 1 });
  assert.equal((await a.next('pong')).acked, 1);
  // What the admin page reads: the version, today's paint (the stamp's color as the game's), the player, the machine.
  const top = await admin('GET', '/');
  assert.deepEqual([top.body.api, typeof top.body.version], [2, 'string']);
  const live = (await admin('GET', '/sessions')).body[0];
  assert.deepEqual([live.today.stamps.can, live.today.topColor, live.today.peak.players, live.emptySince], [1, 'red', 1, null]);
  assert.deepEqual([live.players[0].ip, live.players[0].here, live.players[0].held], [`10.1.0.${games}`, true, null]);
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

  // A wipe: the game's link closes as a drop; it comes back with its token to a clean wall, and the saves are gone.
  assert.equal((await admin('POST', `/sessions/${code}/wipe`)).status, 200);
  assert.equal(await b.closed, 1012);
  const held = (await admin('GET', '/sessions')).body[0].players[0];
  assert.ok(!held.here && held.held > 0 && held.held <= 5, 'a dropped seat, held');
  const again = await new Game().join(code, 'B', wb.token);
  assert.equal(again.you, wb.you);
  assert.ok(!(await painted(again.file!)), 'a clean wall');
  assert.equal(saves().length, 0);

  // A new surface table (another version of the game) wipes the save at start.
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

  // Closed: its players are told it has ended, and it's no longer kept.
  const d = new Game();
  await d.join(code, 'D');
  assert.equal((await admin('POST', `/sessions/${code}/close`)).status, 200);
  assert.equal((await d.next('rejected')).reason, 'ended');
  assert.deepEqual((await admin('GET', '/sessions')).body, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8')), []);
  console.log('kept sessions: ok (admin key and origin, a public session full at its limit with a line, kept empty, paint back after a restart, wipe, a new surface table wipes, private ones close when empty unless they stay, close, what the admin page reads)');
} finally {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
