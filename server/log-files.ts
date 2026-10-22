import fs from 'node:fs';
import path from 'node:path';

// The log's files (LOG_DIR, server/log.ts): one a day. Each line starts with
// its time; past `days.redact` its IP addresses and nicknames are removed,
// past `days.keep` the line goes, and an empty file with it (SERVER.logRedactDays, logKeepDays).
// Any *.log in the directory is cleaned the same way, so logs saved before
// LOG_DIR existed (docker logs -t: two times, the first counts) can go there.

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

/** A log file's text, cleaned for `now` (ms): old lines redacted, older ones dropped. A line without a time is as old as the one before it. */
export function clean(text: string, now: number, days: Ages) {
  let time = now;
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
}

/** Cleans every *.log in `dir`: a file is rewritten only when it changes (written aside, then renamed), and deleted once empty. */
export function cleanDir(dir: string, days: Ages, now = Date.now()) {
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.log')) continue;
    const file = path.join(dir, name);
    const text = fs.readFileSync(file, 'utf8');
    const kept = clean(text, now, days);
    if (kept === text) continue;
    if (!kept) fs.rmSync(file);
    else {
      fs.writeFileSync(`${file}.tmp`, kept);
      fs.renameSync(`${file}.tmp`, file);
    }
  }
}
