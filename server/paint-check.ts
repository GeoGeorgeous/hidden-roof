import './headless';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { PAINT } from '../src/config';
import type { PaintOp } from '../src/paint-ops';
import { sessionPaint } from './world';

// The server's paint against the browser's (scripts/golden-paint.mjs runs it):
// builds the level's paint surfaces, which must match the browser's (keys,
// atlases, face rects), then replays the ops the golden test recorded
// (shots/golden/<detail>.ops.json) frame by frame, as its loopback does, and
// compares the hash of the paint.
// Usage: node dist-server/paint-check.js <level.json> <ops.json>...

type Table = [key: string, atlasW: number, atlasH: number, rects: number[][]][];

/** Null if both have the same surfaces, else what differs. */
function sameTable(a: Table, b: Table) {
  const byKey = new Map(b.map((s) => [s[0], JSON.stringify(s)]));
  if (a.length !== b.length) return `${a.length} surfaces vs ${b.length}`;
  const bad = a.find((s) => byKey.get(s[0]) !== JSON.stringify(s));
  return bad ? `${bad[0]}: ${JSON.stringify(bad)} vs ${byKey.get(bad[0]) ?? 'missing'}` : null;
}

const TPM: Record<string, number> = { low: 24, medium: 48, high: 72, ultra: 96 };
const [levelPath, ...opsPaths] = process.argv.slice(2);
const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
let failed = 0;
for (const path of opsPaths) {
  const detail = path.match(/(\w+)\.ops\.json$/)![1];
  const rec: { hash: string; table: Table; log: PaintOp[]; frames: number[] } = JSON.parse(fs.readFileSync(path, 'utf8'));
  PAINT.texelsPerMeter = TPM[detail];
  const t0 = performance.now();
  const { paint, drips, ops } = sessionPaint(level);
  const built = performance.now() - t0;
  const table: Table = paint.surfaces.map((s) => [s.key, s.geo.atlasW, s.geo.atlasH, s.geo.rects.map((r) => [r.x, r.y, r.w, r.h])]);
  const differ = sameTable(table, rec.table);
  if (differ) {
    failed++;
    console.log(`${detail.padEnd(6)} paint surfaces DIFFER from the browser's: ${differ}`);
    continue;
  }
  const t1 = performance.now();
  for (let f = 0; f < rec.frames.length; f++) {
    const end = f + 1 < rec.frames.length ? rec.frames[f + 1] : rec.log.length;
    for (let i = rec.frames[f]; i < end; i++) ops.apply(rec.log[i]);
    drips.update(1 / 60);
  }
  const played = performance.now() - t1;
  const h = createHash('sha256');
  for (const s of paint.surfaces.filter((s) => s.data).sort((a, b) => (a.key < b.key ? -1 : 1))) h.update(`${s.key}:`).update(s.data!);
  const hash = h.digest('hex').slice(0, 16);
  const ok = hash === rec.hash;
  if (!ok) failed++;
  // Ops from elsewhere never start runs, so the server keeps RGBA only (no excess counts).
  const full = paint.surfaces.reduce((n, s) => n + s.geo.atlasW * s.geo.atlasH * 4, 0) / 2 ** 20;
  console.log(`${detail.padEnd(6)} ${hash} ${ok ? 'identical to the browser' : `DIFFERS from the browser's ${rec.hash}`} (${paint.surfaces.length} surfaces built in ${built.toFixed(0)} ms, ${rec.log.length} ops in ${played.toFixed(0)} ms, ${full.toFixed(0)} MB when all painted)`);
}
process.exitCode = failed ? 1 : 0;
