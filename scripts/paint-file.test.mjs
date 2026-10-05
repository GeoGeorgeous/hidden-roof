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
const header = { created: '2026-10-05T12:00:00.000Z', level: { name: 'demo', hash: 'abc123' }, density: 96, faces };

const bytes = await encodePaintFile(header, body);
const back = await decodePaintFile(bytes);
assert.deepEqual(back.body, body);
assert.deepEqual(back.header, { format: 'rhh-paint', version: 1, ...header });

const rejects = async (b, message) => assert.rejects(decodePaintFile(b), { message });
await rejects(new TextEncoder().encode('{"level":"x"}'), 'NOT A PAINT FILE');
await rejects(bytes.slice(0, bytes.length - 6), 'BROKEN PAINT FILE');
// The same file with its header edited (version 2).
const length = new DataView(bytes.buffer).getUint32(4, true);
const json = new TextEncoder().encode(new TextDecoder().decode(bytes.subarray(8, 8 + length)).replace('"version":1', '"version":2'));
const newer = new Uint8Array([...bytes.subarray(0, 8), ...json, ...bytes.subarray(8 + length)]);
new DataView(newer.buffer).setUint32(4, json.length, true);
await rejects(newer, 'SAVED BY A NEWER VERSION');
const short = await encodePaintFile({ ...header, faces: faces.slice(0, 1) }, body);
await rejects(short, 'BROKEN PAINT FILE');
const negative = await encodePaintFile({ ...header, faces: [{ surface: 'p1#0', rect: 0, w: -3, h: -3 }] }, new Uint8Array(4));
await rejects(negative, 'BROKEN PAINT FILE');

console.log(`paint file: ok (${body.length} bytes of paint -> ${bytes.length} in the file)`);
