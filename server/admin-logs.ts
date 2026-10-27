import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { SERVER } from '../src/config';
import { CODE_LENGTH, CODE_LETTERS } from '../src/net/protocol';
import { logDir } from './log';

// The server's log for the admin page: its day files (LOG_DIR, log.ts) and one
// of them as it is, or only a session's lines: those with its code after the
// time, and the indented lines of the same entry (a stack).

const DAY = /^\d{4}-\d\d-\d\d$/;
const CODE = new RegExp(`^[${CODE_LETTERS}]{${CODE_LENGTH}}$`);

/** The day files, newest first, with their size; and how long the log keeps them and their addresses and nicknames (days). */
export async function logDays() {
  const dir = logDir();
  const names = dir ? await fs.readdir(dir).catch(() => []) : [];
  const days = await Promise.all(
    names.filter((n) => DAY.test(n.slice(0, -4)) && n.endsWith('.log')).map(async (n) => ({ day: n.slice(0, -4), bytes: (await fs.stat(path.join(dir!, n))).size })),
  );
  return { days: days.sort((a, b) => b.day.localeCompare(a.day)), keepDays: SERVER.logKeepDays, redactDays: SERVER.logRedactDays };
}

/** Answers a day's file as a download (`code`: only that session's lines); false for a bad day or code, null when there's no such file. */
export async function sendLog(res: http.ServerResponse, day: string, code: string | null): Promise<boolean | null> {
  const dir = logDir();
  if (!DAY.test(day) || (code !== null && !CODE.test(code))) return false;
  const file = dir && path.join(dir, `${day}.log`);
  if (!file || !(await fs.stat(file).catch(() => null))?.isFile()) return null;
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="roof-${day}${code ? `-${code}` : ''}.log"` });
  const input = createReadStream(file);
  if (!code) {
    input.pipe(res);
    return true;
  }
  let kept = false;
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    // An indented line goes on the entry before it.
    if (!/^\s/.test(line)) kept = line.split(' ', 2)[1] === code;
    if (kept && !res.write(`${line}\n`)) await new Promise((done) => res.once('drain', done));
  }
  res.end();
  return true;
}
