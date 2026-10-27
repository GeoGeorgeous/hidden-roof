import './headless';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { encodeOps, SurfaceIndex } from '../src/op-wire';
import { decodePaintFile } from '../src/save/paint-file';
import { join, start } from './test-kit';

// The admin's uploads (uploads.ts) against the built server: a paint file streamed to DATA_DIR/uploads and checked as a save
// is loaded, a session made from one, a restore to one, and what each refuses: another level or detail, a file that is no paint,
// one too big, an unknown or expired id; leftovers cleaned at start; none without DATA_DIR. npm run test:server runs it.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-uploads-'));
const uploads = path.join(dir, 'uploads');
fs.mkdirSync(uploads);
// At start an expired upload and a half-written one are cleaned, a fresh one stays.
const old = '0123456789abcdef';
fs.writeFileSync(path.join(uploads, `${old}.rhhpaint`), 'x');
fs.writeFileSync(path.join(uploads, 'ffffffffffffffff.rhhpaint.tmp'), 'x');
fs.utimesSync(path.join(uploads, `${old}.rhhpaint`), new Date(Date.now() - 2 * 36e5), new Date(Date.now() - 2 * 36e5));
const LIMIT = 100000;
const main = await start({ ADMIN_KEY: 'test-key', DATA_DIR: dir, UPLOAD_BYTES: String(LIMIT), REJOIN_WINDOW: '5' });
const bare = await start({ ADMIN_KEY: 'test-key' });
const faces = levelPaintFaces(JSON.parse(fs.readFileSync('public/levels/demo.json', 'utf8')), 24);
const stamp = { kind: 'stamp' as const, key: faces[0].key, rect: 0, u: 0.5, v: 0.5, radius: 0.2, amount: 1, color: [1, 0, 0] as const, softness: 0, square: false };

try {
  const at = (s: typeof main) => `http://localhost:${s.adminPort}`;
  const ask = async (method: string, route: string, body?: unknown, s = main) => {
    const res = await fetch(at(s) + route, { method, headers: { authorization: 'Bearer test-key' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const upload = async (bytes: Uint8Array, s = main) => {
    const res = await fetch(`${at(s)}/uploads`, { method: 'POST', headers: { authorization: 'Bearer test-key', 'content-type': 'application/octet-stream' }, body: Buffer.from(bytes) });
    return { status: res.status, body: await res.json() };
  };
  const paintOf = async (code: string) => new Uint8Array(await (await fetch(`${at(main)}/sessions/${code}/paint`, { headers: { authorization: 'Bearer test-key' } })).arrayBuffer());
  const painted = async (code: string) => (await decodePaintFile(await paintOf(code))).header.faces.length;
  const make = async (body: object) => (await ask('POST', '/sessions', { kind: 'public', name: 'S', level: 'demo', detail: 'low', ...body })).body;
  const files = () => fs.readdirSync(uploads).sort();

  assert.deepEqual(files(), [], 'an expired upload and a half-written one are cleaned at start');
  // A paint file to upload: a session with one stamp on it.
  const source = await make({});
  const painter = await join(main.port, 'A', source.code);
  await painter.next('welcome');
  await painter.send({ type: 'ops', seq: 1, bytes: encodeOps([1], [stamp], new SurfaceIndex(faces.map((f) => f.key))) });
  await painter.send({ type: 'ping', t: 1 });
  await painter.next('pong');
  const file = await paintOf(source.code);

  // Without DATA_DIR there is nowhere to keep it; what is no paint file is refused with why; one too big is read to its end and refused.
  const none = await upload(file, bare);
  assert.deepEqual([none.status, typeof none.body.error], [400, 'string']);
  assert.match((await upload(new TextEncoder().encode('not a paint file'))).body.error, /./);
  const big = await upload(new Uint8Array(LIMIT + 1));
  assert.deepEqual([big.status, big.body.error], [400, `too big: up to ${LIMIT / 2 ** 20} MB`]);
  const cut = await upload(file.subarray(0, file.length - 8));
  assert.equal(cut.status, 400, 'a file cut short: it does not inflate whole');
  assert.deepEqual(files(), [], 'nothing of those stays');

  // A good one: checked, kept.
  const up = await upload(file);
  assert.equal(up.status, 200);
  assert.deepEqual([up.body.level, up.body.detail, up.body.bytes, /^[0-9a-f]{16}$/.test(up.body.upload)], ['demo', 'low', file.length, true]);
  const expires = Date.parse(up.body.expires);
  assert.ok(expires > Date.now() + 59 * 6e4 && expires <= Date.now() + 60 * 6e4, 'kept 60 minutes');
  assert.deepEqual(files(), [`${up.body.upload}.rhhpaint`]);

  // A session made from it: its level, detail and paint; its stats start as made. What it names too must agree; unknown, bad and expired ids are refused.
  const from = await ask('POST', '/sessions', { kind: 'public', name: 'From a file', upload: up.body.upload });
  assert.deepEqual([from.status, from.body.level, from.body.detail, from.body.stats.began, from.body.stats.stamps.can], [200, 'demo', 'low', 'made', 0]);
  assert.ok((await painted(from.body.code)) > 0, 'with its paint');
  assert.equal((await ask('POST', '/sessions', { kind: 'private', name: 'P', upload: up.body.upload, level: 'demo', detail: 'low' })).status, 200, 'private too, naming what the upload is');
  for (const [body, status] of [[{ level: 'roof' }, 400], [{ detail: 'high' }, 400], [{ upload: 'zz' }, 400], [{ upload: 'ffffffffffffffff' }, 404], [{ upload: old }, 404]] as const)
    assert.equal((await ask('POST', '/sessions', { kind: 'public', name: 'X', upload: up.body.upload, ...body })).status, status, JSON.stringify(body));
  const roof = (await ask('POST', '/sessions', { kind: 'public', name: 'Roof', level: 'roof', detail: 'low' })).body;
  assert.equal((await ask('POST', '/sessions', { kind: 'public', name: 'X', upload: 'a'.repeat(16) })).status, 404);
  assert.deepEqual((await ask('GET', '/sessions')).body.map((s: { name: string }) => s.name).sort(), ['From a file', 'P', 'Roof', 'S'], 'a refused one makes no session');

  // A restore to it: the session's paint becomes the upload's, its players come back to it.
  const wall = (await make({ name: 'Wall' })).code;
  const standing = await join(main.port, 'W', wall);
  const w = await standing.next('welcome');
  assert.equal(await painted(wall), 0);
  const done = await ask('POST', `/sessions/${wall}/restore`, { upload: up.body.upload });
  assert.deepEqual([done.status, typeof done.body.undo], [200, 'number']);
  assert.equal(await standing.closed, 1012, 'its players are dropped, to come back');
  await join(main.port, 'W', wall, { token: w.token }).then((g) => g.next('welcome'));
  assert.ok((await painted(wall)) > 0, 'the upload\'s paint');
  const stats = (await ask('GET', '/sessions')).body.find((s: { code: string }) => s.code === wall).stats;
  assert.deepEqual([stats.began, typeof stats.restoredAt, stats.stamps.can], ['restored', 'string', 0], 'an upload has no stats: they start as restored');
  assert.equal(fs.readdirSync(dir).filter((n) => n.startsWith(`${wall}-`) && n.endsWith('.rhhpaint')).length, 2, 'the undo and the restored paint');

  // What does not fit is refused and nothing changes: another level, another detail, an unknown or expired upload, both or neither, a private session.
  const medium = (await make({ name: 'Medium', detail: 'medium' })).code;
  const before = fs.readdirSync(dir).filter((n) => n.startsWith(`${roof.code}-`) && !n.endsWith('.json'));
  for (const [code, body, status] of [
    [roof.code, { upload: up.body.upload }, 400],
    [medium, { upload: up.body.upload }, 400],
    [wall, { upload: 'ffffffffffffffff' }, 404],
    [wall, { upload: old }, 404],
    [wall, { upload: 'nope' }, 400],
    [wall, { upload: up.body.upload, save: 1 }, 400],
    [from.body.code, { upload: 'x'.repeat(16) }, 400],
  ] as const)
    assert.equal((await ask('POST', `/sessions/${code}/restore`, body)).status, status, `${code} ${JSON.stringify(body)}`);
  const refused = await ask('POST', `/sessions/${roof.code}/restore`, { upload: up.body.upload });
  assert.match(refused.body.error, /level/);
  assert.match((await ask('POST', `/sessions/${medium}/restore`, { upload: up.body.upload })).body.error, /detail/);
  const roofNow = (await ask('GET', '/sessions')).body.find((s: { code: string }) => s.code === roof.code);
  assert.deepEqual([roofNow.stats.began, roofNow.saves, fs.readdirSync(dir).filter((n) => n.startsWith(`${roof.code}-`) && !n.endsWith('.json'))], ['made', [], before], 'the session is as it was: no undo made');
  const priv = (await ask('POST', '/sessions', { kind: 'private', name: 'Pr', level: 'demo', detail: 'low' })).body.code;
  assert.equal((await ask('POST', `/sessions/${priv}/restore`, { upload: up.body.upload })).status, 400, 'a private session is never kept');
  // An upload that expired is refused too.
  fs.utimesSync(path.join(uploads, `${up.body.upload}.rhhpaint`), new Date(Date.now() - 2 * 36e5), new Date(Date.now() - 2 * 36e5));
  assert.equal((await ask('POST', `/sessions/${wall}/restore`, { upload: up.body.upload })).status, 404);
  assert.equal((await ask('POST', '/sessions', { kind: 'public', name: 'Late', upload: up.body.upload })).status, 404);

  console.log('uploads: ok (cleaned at start, none without DATA_DIR, no paint file, too big, cut short, a session made from one, restore to one, another level or detail refused, unknown and expired ids)');
} finally {
  await Promise.all([main.stop(), bare.stop()]);
  fs.rmSync(dir, { recursive: true, force: true });
}
