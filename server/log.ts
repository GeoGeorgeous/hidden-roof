import fs from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';
import { SERVER } from '../src/config';
import { cleanDir } from './log-files';

// The server's log: one line per event, with the time first (UTC), the session's
// code next when there is one. With a directory set (LOG_DIR) it goes to one file
// a day there, cleaned as server/log-files.ts says; without one, to stdout.

let dir: string | null = null;

/** Logs to files in `to` from now on, and cleans them now and every SERVER.logCleanEvery. */
export function logTo(to: string) {
  fs.mkdirSync(to, { recursive: true });
  dir = to;
  const tidy = () => {
    try {
      cleanDir(to, { redact: SERVER.logRedactDays, keep: SERVER.logKeepDays });
    } catch (e) {
      log('-----', 'log cleaning failed:', e);
    }
  };
  tidy();
  setInterval(tidy, SERVER.logCleanEvery * 1000).unref();
}

export function log(...parts: unknown[]) {
  const now = new Date().toISOString();
  const line = format(`${now.slice(0, 19)}Z`, ...parts);
  if (!dir) return console.log(line);
  try {
    fs.appendFileSync(path.join(dir, `${now.slice(0, 10)}.log`), line + '\n');
  } catch {
    console.log(line);
  }
}

/** A player as the log names them: the name as JSON, so a quote or a newline in it can't break the line. */
export const who = (p: { id: number; name: string }) => `${JSON.stringify(p.name)} #${p.id}`;

/** Bytes as MB, for the log. */
export const mb = (bytes: number) => (bytes / 2 ** 20).toFixed(1);

/** A time (ms) as the log says it: "42 s", "12 min", "1 h 16 min". */
export function span(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 120) return `${s} s`;
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** What's alive (JS objects, paint), in MB: the process's own size (rss) stays up after sessions end, until the OS asks for it back. */
export function liveMemory() {
  const m = process.memoryUsage();
  return (m.heapUsed + m.arrayBuffers) / 2 ** 20;
}

/** Over `limit` MB of live data, even after collecting garbage (dropped paint stays counted until a GC; gc() is there with node --expose-gc). */
export function overMemory(limit: number) {
  if (liveMemory() <= limit) return false;
  globalThis.gc?.();
  return liveMemory() > limit;
}
