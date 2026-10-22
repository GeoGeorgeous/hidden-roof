// Tests of the server log's files (server/log-files.ts): past SERVER.logRedactDays
// a line loses its IP addresses and nicknames and keeps its time, code and player
// number; past SERVER.logKeepDays it goes, and an empty file with it; a line with
// no time is as old as the one before; a second clean changes nothing.
// Usage: node scripts/server-log.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SERVER } from '../src/config.ts';
import { clean, cleanDir, oneEntry } from '../server/log-files.ts';

const DAY = 86_400_000;
const days = { redact: SERVER.logRedactDays, keep: SERVER.logKeepDays };
const now = Date.parse('2026-12-31T12:00:00Z');
const at = (d) => new Date(now - d * DAY).toISOString().slice(0, 19) + 'Z';

// What the log writes, past the redaction age: names as JSON (a quote, a newline), and in older logs as typed.
const redact = (line) => clean(line + '\n', now, days).trimEnd();
assert.equal(redact(`${at(20)} ABCDE "Geo" #3 in from 203.0.113.7 (new, 2 players)`), `${at(20)} ABCDE "" #3 in from x (new, 2 players)`);
assert.equal(redact(`${at(20)} ABCDE "say \\"hi\\" #2\\n" #4 out: left (1 players)`), `${at(20)} ABCDE "" #4 out: left (1 players)`);
assert.equal(redact(`${at(20)} ABCDE "ゴースト 👻" #5 dropped (1006): 180 s to come back`), `${at(20)} ABCDE "" #5 dropped (1006): 180 s to come back`);
assert.equal(redact(`${at(20)} ----- link from 2001:db8::1: read ECONNRESET`), `${at(20)} ----- link from x: read ECONNRESET`);
assert.equal(redact(`${at(20)} ----- bad message from ::ffff:198.51.100.2`), `${at(20)} ----- bad message from x`);
assert.equal(redact(`${at(20)} ----- server error with 2001:0db8:85a3:0000:0000:8a2e:0370:7334`), `${at(20)} ----- server error with x`);
// Times, docker's own included, and plain numbers stay.
const plain = `${new Date(now - 20 * DAY).toISOString()} ${at(20)} ----- memory: 12.5 MB live; protocol 6, 1.2.3 build`;
assert.equal(redact(plain), plain);

// Ages: kept as is, redacted, dropped; a line with no time (a stack) goes with the one before.
const text = [
  `${at(70)} ABCDE "Old" #1 in from 192.0.2.1 (new, 1 players)`,
  `    at stack (192.0.2.1)`,
  `${at(20)} FGHIJ "Mid" #2 in from 192.0.2.2 (new, 1 players)`,
  `    at stack (192.0.2.2)`,
  `${at(1)} KLMNO "New" #3 in from 192.0.2.3 (new, 1 players)`,
].join('\n') + '\n';
const cleaned = clean(text, now, days);
assert.equal(
  cleaned,
  [`${at(20)} FGHIJ "" #2 in from x (new, 1 players)`, `    at stack (x)`, `${at(1)} KLMNO "New" #3 in from 192.0.2.3 (new, 1 players)`].join('\n') + '\n',
);
assert.equal(clean(cleaned, now, days), cleaned, 'a second clean changes nothing');
assert.equal(clean(`${at(SERVER.logKeepDays + 1)} ----- old\n`, now, days), '');

// Client text can't start a line of its own: no forged time, and the cleaning still sees one entry.
const forged = oneEntry(`${at(0)} ABCDE "x" #1 dropped (1000 a\r\n${at(90)} ----- forged\u0007)\n    at stack`);
assert.equal(forged.split('\n').filter((l) => /^\d{4}-/.test(l)).length, 1);
assert.ok(!/[\r\u0007]/.test(forged) && forged.endsWith('\n    at stack'));

// The directory: a changed file rewritten, an emptied one deleted, other files left alone.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roof-log-'));
fs.writeFileSync(path.join(dir, 'a.log'), text);
fs.writeFileSync(path.join(dir, 'b.log'), `${at(90)} ----- gone\n`);
fs.writeFileSync(path.join(dir, 'mem.txt'), `${at(90)} 192.0.2.9\n`);
cleanDir(dir, days, now);
assert.deepEqual(fs.readdirSync(dir).sort(), ['a.log', 'mem.txt']);
assert.equal(fs.readFileSync(path.join(dir, 'a.log'), 'utf8'), cleaned);
// Dated files go by their names: young ones are not read, old ones are deleted unread, and a cleaned one is not read again.
const day = (d) => new Date(now - d * DAY).toISOString().slice(0, 10);
const put = (d, body) => {
  fs.writeFileSync(path.join(dir, `${day(d)}.log`), body);
  fs.chmodSync(path.join(dir, `${day(d)}.log`), 0o644);
};
const dated = (d) => path.join(dir, `${day(d)}.log`);
const stamp = (d, ms) => fs.utimesSync(dated(d), new Date(ms), new Date(ms));
put(1, `${at(1)} ABCDE "New" #1 in from 192.0.2.1\n`);
put(30, `${at(30)} ABCDE "Mid" #1 in from 192.0.2.1\n`); // the line's own time is not read: only the name counts
put(80, `${at(80)} ----- old\n`);
put(20, `${at(20)} ABCDE "Mid" #1 in from 192.0.2.1\n`);
for (const d of [1, 30, 80, 20]) stamp(d, now - 100 * DAY); // never cleaned
cleanDir(dir, days, now);
assert.ok(!fs.existsSync(dated(80)), 'older than keep: deleted');
assert.match(fs.readFileSync(dated(1), 'utf8'), /192\.0\.2\.1/, 'younger than redact: left as it is');
assert.equal(fs.statSync(dated(1)).mtimeMs, now - 100 * DAY, 'and not touched');
assert.match(fs.readFileSync(dated(20), 'utf8'), /"" #1 in from x/);
assert.equal(fs.statSync(dated(20)).mtimeMs, now, 'redacted file: written now');
// A cleaned file is skipped: change its text without a new mtime and the next pass leaves it.
fs.writeFileSync(dated(20), `${at(20)} ----- 192.0.2.5\n`);
stamp(20, now);
cleanDir(dir, days, now + 3600_000);
assert.match(fs.readFileSync(dated(20), 'utf8'), /192\.0\.2\.5/, 'cleaned after its day was due: not read again');
fs.rmSync(dated(1));
fs.rmSync(dated(20));
fs.rmSync(dated(30));

// A file that fails (a directory named x.log) is reported, and the others are still cleaned.
fs.mkdirSync(path.join(dir, 'a-dir.log'));
fs.writeFileSync(path.join(dir, 'z.log'), `${at(90)} ----- gone\n`);
const failed = [];
cleanDir(dir, days, now, (name) => failed.push(name));
assert.deepEqual(failed, ['a-dir.log']);
assert.ok(!fs.existsSync(path.join(dir, 'z.log')));
fs.rmSync(dir, { recursive: true });

console.log(`server log: ok (IP addresses and nicknames gone after ${SERVER.logRedactDays} days, lines after ${SERVER.logKeepDays}; times, codes and player numbers kept)`);
