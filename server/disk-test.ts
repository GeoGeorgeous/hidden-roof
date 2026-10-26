import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { encodeOps, SurfaceIndex } from '../src/op-wire';
import { join, start } from './test-kit';

// What the kept sessions' disk work survives (kept.ts), against the built server: a save that fails is tried
// again, a crash's half-written files are cleaned at start, a sessions.json that isn't a list (or has bad
// entries) is set aside and the rest is used, wipes and closes at once all answer, and a level file that can't
// be read keeps its session for the next start while one that isn't there does not. npm run test:server runs it.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-disk-'));
const levels = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-levels-'));
const faces = levelPaintFaces(JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8')), 48);
const stamp = { kind: 'stamp' as const, key: faces[0].key, rect: 0, u: 0.5, v: 0.5, radius: 0.2, amount: 1, color: [1, 0, 0] as const, softness: 0, square: false };
const ops = (seq: number) => ({ type: 'ops' as const, seq, bytes: encodeOps([1], [stamp], new SurfaceIndex(faces.map((f) => f.key))) });
const env = { ADMIN_KEY: 'test-key', DATA_DIR: dir, KEEP_EVERY: '1', REJOIN_WINDOW: '5' };

let server = await start(env);
const admin = async (method: string, at: string, body?: unknown) => {
  const res = await fetch(`http://localhost:${server.adminPort}${at}`, { method, headers: { authorization: 'Bearer test-key' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const make = async (name: string) => (await admin('POST', '/sessions', { kind: 'public', name, level: 'demo', detail: 'medium' })).body.code as string;
const listed = async () => ((await admin('GET', '/sessions')).body as { code: string }[]).map((s) => s.code);
const names = () => fs.readdirSync(dir);
const saves = () => names().filter((n) => n.endsWith('.rhhpaint'));
const record = () => JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8')) as { code: string }[];
const until = async (what: string, ok: () => boolean) => {
  for (let i = 0; !ok(); i++) {
    assert.ok(i < 400, what);
    await new Promise((w) => setTimeout(w, 20));
  }
};
const restart = async (more: Record<string, string> = {}) => {
  await server.stop();
  server = await start({ ...env, ...more });
};

try {
  // A save that fails (the directory can't be written) is tried again: nothing half written stays, and the paint is saved once it can.
  const code = await make('Wall');
  const game = await join(server.port, 'A', code);
  await game.next('welcome');
  game.send(ops(1));
  await until('the periodic save', () => saves().length === 1);
  if (process.getuid?.() !== 0) {
    fs.chmodSync(dir, 0o555);
    game.send(ops(2));
    await until('the failed save is logged', () => server.out().includes('paint not saved'));
    assert.deepEqual([saves().length, names().filter((n) => n.endsWith('.tmp')).length], [1, 0], 'no new save, no half-written file');
    fs.chmodSync(dir, 0o755);
    await until('the save tried again', () => saves().length === 2);
  }
  game.send({ type: 'leave' });

  // What a crash left half written is cleaned at start, and nothing else of the directory's.
  await server.stop();
  for (const n of [`${code}-9.rhhpaint.tmp`, 'sessions.json.tmp', 'traffic.json.tmp']) fs.writeFileSync(path.join(dir, n), 'x');
  server = await start(env);
  assert.deepEqual(names().filter((n) => n.endsWith('.tmp')), ['traffic.json.tmp'], 'only its own leftovers');
  assert.deepEqual(await listed(), [code]);

  // A sessions.json that isn't a list is set aside, under a name of its own each time, and the paint files stay.
  const kept = saves().length;
  for (let round = 1; round <= 2; round++) {
    await server.stop();
    fs.writeFileSync(path.join(dir, 'sessions.json'), '{"sessions":[]}');
    server = await start(env);
    assert.equal(names().filter((n) => /^sessions\.json\.\d+\.bad$/.test(n)).length, round);
    assert.deepEqual([await listed(), saves().length], [[], kept]);
  }
  const fresh = await make('Fresh');
  assert.deepEqual(record().map((e) => e.code), [fresh], 'a new list, not an older one overwritten');
  // Bad entries are skipped, the good one is made again.
  await server.stop();
  fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify([null, { code: 'nope' }, ...record()]));
  server = await start(env);
  assert.match(server.out(), /entry 0 skipped/);
  assert.match(server.out(), /entry 1 skipped/);
  assert.deepEqual(await listed(), [fresh]);

  // Wipes and closes at once: each answers, and the disk is as if they had come one after the other.
  const [b, c] = [await make('B'), await make('C')];
  for (const s of [fresh, b]) fs.writeFileSync(path.join(dir, `${s}-1.rhhpaint`), '');
  const done = await Promise.all([admin('POST', `/sessions/${fresh}/wipe`), admin('POST', `/sessions/${fresh}/wipe`), admin('POST', `/sessions/${b}/close`), admin('POST', `/sessions/${c}/close`)]);
  assert.deepEqual(done.map((r) => r.status), [200, 200, 200, 200]);
  assert.deepEqual(record().map((e) => e.code), [fresh]);
  assert.deepEqual(names().filter((n) => n.startsWith(`${fresh}-`)), [`${fresh}-1.wiped.rhhpaint`]);
  assert.ok(!names().some((n) => n.startsWith(`${b}-`)), 'a closed one leaves nothing');

  // A level file that can't be read (here a directory) is no reason to forget the session or its paint; one that isn't there is.
  fs.writeFileSync(path.join(dir, `${fresh}-7.rhhpaint`), '');
  fs.mkdirSync(path.join(levels, 'demo.json'));
  await restart({ LEVELS_DIR: levels });
  assert.match(server.out(), /left for the next start/);
  assert.deepEqual([await listed(), record().map((e) => e.code), saves().filter((n) => n.startsWith(fresh)).length], [[], [fresh], 2]);
  await restart();
  assert.deepEqual(await listed(), [fresh], 'back once the level reads');
  fs.rmSync(path.join(levels, 'demo.json'), { recursive: true });
  await restart({ LEVELS_DIR: levels });
  assert.match(server.out(), /not made again: no level/);
  assert.deepEqual([record(), saves().filter((n) => n.startsWith(fresh))], [[], []]);
  console.log('kept disk work: ok (a failed save tried again, leftovers cleaned, sessions.json not a list or with bad entries, wipes and closes at once, a level that does not read)');
} finally {
  fs.chmodSync(dir, 0o755);
  await server.stop();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(levels, { recursive: true, force: true });
}
