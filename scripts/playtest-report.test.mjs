// Test of the playtest report (scripts/playtest-report.mjs) on a tiny made-up
// telemetry file: a percentile past the histograms' top bucket shows as more
// than its edge (>250 ms a frame, >1000 ms ping), never as Infinity.
// Usage: node scripts/playtest-report.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playtest-report-'));
const report = (t) => ({ kind: 'window', t, device: 'd1', link: 1, load: 'l1', ip: 'x', name: 'A', frames: { fps: 10, hist: [0, 0, 0, 0, 0, 0, 0, 0, 5] }, net: { pingHist: [0, 0, 0, 0, 0, 0, 0, 0, 0, 4] } });
fs.writeFileSync(path.join(dir, 't.jsonl'), [report('2026-10-12T17:00:00.000Z'), report('2026-10-12T17:00:05.000Z')].map((l) => JSON.stringify(l)).join('\n'));
execFileSync(process.execPath, [new URL('./playtest-report.mjs', import.meta.url).pathname, path.join(dir, 't.jsonl'), '--out', path.join(dir, 'r.html')], { stdio: 'ignore' });
const html = fs.readFileSync(path.join(dir, 'r.html'), 'utf8');
fs.rmSync(dir, { recursive: true, force: true });
assert.ok(!html.includes('Infinity'), 'no Infinity in the report');
assert.ok(html.includes('>250') && html.includes('>1000'), 'past the top bucket: more than its edge');
console.log('playtest report: ok (past the top bucket: >250, >1000)');
