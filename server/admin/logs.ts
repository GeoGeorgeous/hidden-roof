import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { SERVER } from '../../src/config';
import { isCode } from '../../src/net/protocol';
import { dayOf } from '../days';
import { logDir } from '../log';

// The server's log for the admin page: its day files (LOG_DIR, log.ts) and one
// of them as it is, or only a session's lines: those with its code after the
// time, and the indented lines of the same entry (a stack).

/** A day of the calendar as YYYY-MM-DD (not 2026-13-01, nor 2026-02-30). */
const isDay = (d: string) => dayOf(d) !== null;

/** The day files, newest first, with their size; and how long the log keeps them and their addresses and nicknames (days). */
export async function logDays() {
  const dir = logDir();
  const names = dir ? await fs.readdir(dir).catch(() => []) : [];
  // A file rotated away between the listing and its size is no day.
  const days = await Promise.all(
    names.filter((n) => isDay(n.slice(0, -4)) && n.endsWith('.log')).map(async (n) => ({ day: n.slice(0, -4), bytes: (await fs.stat(path.join(dir!, n)).catch(() => null))?.size ?? null })),
  );
  return { days: days.flatMap((d) => (d.bytes === null ? [] : [{ day: d.day, bytes: d.bytes }])).sort((a, b) => b.day.localeCompare(a.day)), keepDays: SERVER.logKeepDays, redactDays: SERVER.logRedactDays };
}

/** Answers a day's file as a download (`code`: only that session's lines); false for a bad day or code, null when there's no such file. */
export async function sendLog(res: http.ServerResponse, day: string, code: string | null): Promise<boolean | null> {
  const dir = logDir();
  if (!isDay(day) || (code !== null && !isCode(code))) return false;
  const file = dir && path.join(dir, `${day}.log`);
  if (!file || !(await fs.stat(file).catch(() => null))?.isFile()) return null;
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="roof-${day}${code ? `-${code}` : ''}.log"` });
  const input = createReadStream(file);
  // Both ways end when the response closes (a client that went) or the file fails: the stream is destroyed, nothing is left waiting.
  const gone = new AbortController();
  res.once('close', () => gone.abort());
  try {
    if (!code) await pipeline(input, res, { signal: gone.signal });
    else {
      let kept = false;
      const lines = createInterface({ input, crlfDelay: Infinity });
      gone.signal.addEventListener('abort', () => lines.close());
      for await (const line of lines) {
        if (gone.signal.aborted) break;
        // An indented line goes on the entry before it.
        if (!/^\s/.test(line)) kept = line.split(' ', 2)[1] === code;
        if (kept && !res.write(`${line}\n`)) await new Promise<void>((done) => (res.once('drain', done), gone.signal.addEventListener('abort', () => done())));
      }
      input.destroy();
      if (!gone.signal.aborted) res.end();
    }
  } catch {
    // The client went, or the file did: the response is over.
    input.destroy();
    res.destroy();
  }
  return true;
}
