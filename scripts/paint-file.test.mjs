// Tests of the paint save file (src/save/paint-file.ts) in Node, as a server
// will read and write it: round trip, and the errors a player sees.
// Usage: node scripts/paint-file.test.mjs
import assert from 'node:assert/strict';
import { decodePaintFile, encodePaintFile, faceBytes } from '../src/save/paint-file.ts';

const faces = [
  { surface: 'p12#0', rect: 3, w: 5, h: 4 },
  { surface: 'jparapet|-4.00|0.00|-6.00#0', rect: 0, w: 1, h: 1 },
];
const body = new Uint8Array(faces.reduce((n, f) => n + faceBytes(f), 0)).map((_, i) => (i * 37) & 255);
const surfaces = { 'p12#0': '0123456789abcd', 'jparapet|-4.00|0.00|-6.00#0': 'dcba9876543210' };
const header = { created: '2026-10-05T12:00:00.000Z', level: { name: 'demo' }, density: 96, surfaces, faces };

const bytes = await encodePaintFile(header, body);
const back = await decodePaintFile(bytes);
assert.deepEqual(back.body, body);
assert.deepEqual(back.header, { format: 'rhh-paint', version: 2, ...header });

/** `file` with its JSON header edited by `edit` (a string replace), the paint after it kept. */
function withHeader(file, edit) {
  const length = new DataView(file.buffer).getUint32(4, true);
  const json = new TextEncoder().encode(edit(new TextDecoder().decode(file.subarray(8, 8 + length))));
  const out = new Uint8Array([...file.subarray(0, 8), ...json, ...file.subarray(8 + length)]);
  new DataView(out.buffer).setUint32(4, json.length, true);
  return out;
}

const rejects = async (b, message) => assert.rejects(decodePaintFile(b), { message });
await rejects(new TextEncoder().encode('{"level":"x"}'), 'NOT A PAINT FILE');
await rejects(bytes.slice(0, bytes.length - 6), 'BROKEN PAINT FILE');
await rejects(withHeader(bytes, (j) => j.replace('"version":2', '"version":3')), 'SAVED BY A NEWER VERSION');
await rejects(withHeader(bytes, (j) => j.replace('"version":2', '"version":1')), 'SAVED BY AN OLDER VERSION');
await rejects(withHeader(bytes, (j) => j.replace(',"version":2', '')), 'BROKEN PAINT FILE');
// A face on a surface the header gives no shape for.
await rejects(withHeader(bytes, (j) => j.replace('"p12#0":"0123456789abcd",', '')), 'BROKEN PAINT FILE');
await rejects(await encodePaintFile({ ...header, faces: faces.slice(0, 1) }, body), 'BROKEN PAINT FILE');
await rejects(await encodePaintFile({ ...header, surfaces: { 'p1#0': 'x' }, faces: [{ surface: 'p1#0', rect: 0, w: -3, h: -3 }] }, new Uint8Array(4)), 'BROKEN PAINT FILE');

// A small file that inflates far past what its header says (200 MB for one 1x1 face) stops early.
const tiny = await encodePaintFile({ ...header, surfaces: { 'p1#0': 'x' }, faces: [{ surface: 'p1#0', rect: 0, w: 1, h: 1 }] }, new Uint8Array(36));
const huge = new Uint8Array(await new Response(new Blob([new Uint8Array(200 * 1024 * 1024)]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
const tinyLength = new DataView(tiny.buffer).getUint32(4, true);
const bomb = new Uint8Array([...tiny.subarray(0, 8 + tinyLength), ...huge]);
const before = process.memoryUsage().rss;
await rejects(bomb, 'BROKEN PAINT FILE');
assert.ok(process.memoryUsage().rss - before < 64 * 1024 * 1024, 'inflating stopped early');
// A header claiming more paint than the reader allows (the server's limit) is refused before anything is allocated.
await assert.rejects(decodePaintFile(await encodePaintFile({ ...header, faces: [{ surface: 'p12#0', rect: 0, w: 60000, h: 60000 }] }, new Uint8Array(0)), 2 ** 30), { message: 'BROKEN PAINT FILE' });

console.log(`paint file: ok (${body.length} bytes of paint -> ${bytes.length} in the file; a ${(bomb.length / 1024).toFixed(0)} KB file inflating to 200 MB is refused)`);
