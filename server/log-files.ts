import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config.ts';

// The log's files (LOG_DIR, server/log.ts): one a day. Each line starts with
// its time; past `days.redact` its IP addresses and nicknames are removed,
// past `days.keep` the line goes, and an empty file with it (SERVER.logRedactDays, logKeepDays).
// Any *.log in the directory is cleaned the same way, so logs saved before
// LOG_DIR existed (docker logs -t: two times, the first counts) can go there.
// A file named YYYY-MM-DD.log is judged by its name: not read while young or once cleaned, deleted unread when old.
// An undated one is read again only when it has changed since the last cleaning, or once a day (its lines keep aging).
// A file is read and rewritten in chunks (SERVER.logChunkBytes) so the cleaning never holds up the relay.
// (Node runs this file as is in scripts/server-log.test.mjs: imports with their .ts extension.)

const DAY = 86_400_000;

/** Ages in days: lines older than `redact` lose IP addresses and nicknames, older than `keep` go. */
interface Ages {
  redact: number;
  keep: number;
}
const TIME = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)/;
/** A nickname as server/log.ts writes it (JSON), or as older logs did ("name" #id). */
const NAME = /"(?:[^"\\\n]|\\.)*" #(\d+)/g;
const IPV4 = /(?<![\w.])\d{1,3}(?:\.\d{1,3}){3}(?![\w.])/g;
/** An IPv6 address, also ::ffff:1.2.3.4: a time (11:02:51) has neither "::" nor three colons. */
const IPV6 = /(?<![\w:.])[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?::\d{1,3}(?:\.\d{1,3}){3})?(?![\w:.])/gi;

/** An IPv6 match as "x", keeping a colon that ends the address's sentence ("from 2001:db8::1: reset"); anything else as it was. */
function ipv6(m: string) {
  const tail = m.endsWith(':') && !m.endsWith('::') ? ':' : '';
  const ip = tail ? m.slice(0, -1) : m;
  return ip.includes('::') || ip.split(':').length > 3 ? 'x' + tail : m;
}

/** A log entry made safe to write: control characters escaped, and a line break only followed by a space, so no text can start a line of its own (a forged time would beat the cleaning by age). A stack's lines already start with spaces. */
export function oneEntry(text: string) {
  return text
    .replace(/[\0-\x08\x0b-\x1f\x7f]/g, (c) => (c === '\r' ? '\\r' : `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`))
    .replace(/\n(?!\s)/g, '\n  ');
}

/** A line with its IP addresses and nicknames removed. */
function redact(line: string) {
  return line
    .replace(IPV6, ipv6)
    .replace(IPV4, 'x')
    .replace(NAME, '"" #$1');
}

/** `clean` for a file in pieces: each piece is whole lines (the last may lack its break), and a line without a time is as old as the one before, also across pieces. */
function cleaner(now: number, days: Ages) {
  let time = now;
  return (text: string) => {
    const out: string[] = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      const t = TIME.exec(line);
      if (t) time = Date.parse(t[1]);
      const age = (now - time) / DAY;
      if (age > days.keep) continue;
      out.push(age > days.redact ? redact(line) : line);
    }
    return out.length ? out.join('\n') + '\n' : '';
  };
}

/** A log file's text, cleaned for `now` (ms): old lines redacted, older ones dropped. */
export const clean = (text: string, now: number, days: Ages) => cleaner(now, days)(text);

const DATED = /^(\d{4}-\d\d-\d\d)\.log$/;

/** What a YYYY-MM-DD.log needs, by its name alone (all its lines are from that UTC day): 'skip' while it is younger than `redact`, or when it was cleaned after it was due; 'remove' once all of it is older than `keep`; else 'lines'. An imported log has no date: always 'lines'. */
function due(name: string, mtime: number, now: number, days: Ages) {
  const m = DATED.exec(name);
  const start = m ? Date.parse(m[1]) : NaN;
  if (Number.isNaN(start)) return 'lines';
  if (now - start <= days.redact * DAY) return 'skip';
  if (now - start - DAY > days.keep * DAY) return 'remove';
  // Cleaned once its last line was past `redact`, and before its first one was past `keep`: nothing left to do.
  return mtime >= start + DAY + days.redact * DAY && now - start <= days.keep * DAY ? 'skip' : 'lines';
}

/** Undated files as the last cleaning left them: their mtime then, and when. */
const cleaned = new Map<string, { mtime: number; at: number }>();

/** Rewrites a file cleaned, chunk by chunk, written aside and renamed only if it changed; deleted if nothing is left. */
async function cleanFile(file: string, now: number, days: Ages) {
  const step = cleaner(now, days);
  const kept: string[] = [];
  let changed = false;
  const take = (text: string) => {
    const out = step(text);
    if (out !== text) changed = true;
    if (out) kept.push(out);
  };
  let rest = '';
  // Each chunk is awaited from the disk, so the event loop runs in between.
  for await (const piece of fs.createReadStream(file, { encoding: 'utf8', highWaterMark: SERVER.logChunkBytes })) {
    rest += piece;
    const cut = rest.lastIndexOf('\n') + 1;
    if (cut) take(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) take(rest);
  if (!kept.length) return fsp.rm(file);
  if (changed) {
    const out = await fsp.open(`${file}.tmp`, 'w');
    try {
      for (const text of kept) await out.write(text);
    } finally {
      await out.close();
    }
    await fsp.rename(`${file}.tmp`, file);
  }
  await fsp.utimes(file, new Date(now), new Date(now)); // cleaned at `now`: a dated file isn't read again
}

/** Cleans every *.log in `dir`: a dated file (YYYY-MM-DD.log) is read only when its day is due, an undated one when it changed or a day has passed, a file is rewritten only when it changes (written aside, then renamed), and deleted once empty. A file that fails is reported to `fail` and the rest go on. */
export async function cleanDir(dir: string, days: Ages, now = Date.now(), fail: (name: string, e: unknown) => void = () => {}) {
  for (const name of await fsp.readdir(dir)) {
    if (!name.endsWith('.log')) continue;
    const file = path.join(dir, name);
    try {
      const mtime = (await fsp.stat(file)).mtimeMs;
      const todo = due(name, mtime, now, days);
      const seen = cleaned.get(file);
      if (todo === 'skip' || (seen?.mtime === mtime && now - seen.at < DAY)) continue;
      cleaned.delete(file);
      if (todo === 'remove') await fsp.rm(file);
      else {
        await cleanFile(file, now, days);
        const after = DATED.test(name) ? null : await fsp.stat(file).catch(() => null);
        if (after) cleaned.set(file, { mtime: after.mtimeMs, at: now });
      }
    } catch (e) {
      fail(name, e);
      await fsp.rm(`${file}.tmp`, { force: true }).catch(() => {});
    }
  }
}
