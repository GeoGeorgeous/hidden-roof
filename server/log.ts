import fs from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';
import { SERVER } from '../src/config';
import { cleanDir, oneEntry } from './log-files';

// The server's log: one line per event, with the time first (UTC), the session's
// code next when there is one. With a directory set (LOG_DIR) it goes to one file
// a day there (capped in size), cleaned as server/log-files.ts says; without one, to stdout.

let dir: string | null = null;
/** The day file being written, and its size; `full` once the cap (SERVER.logDayBytes) is reached. */
const today = { name: '', bytes: 0, full: false };

/** Logs to files in `to` from now on, and cleans them now and every SERVER.logCleanEvery. A directory that can't be made leaves the log on stdout. */
export function logTo(to: string) {
  try {
    fs.mkdirSync(to, { recursive: true });
  } catch (e) {
    return log('-----', `LOG_DIR ${to} can't be made, logging to stdout:`, e);
  }
  dir = to;
  let busy = false;
  const tidy = async () => {
    if (busy) return;
    busy = true;
    try {
      await cleanDir(to, { redact: SERVER.logRedactDays, keep: SERVER.logKeepDays }, Date.now(), (name, e) => log('-----', `log cleaning failed for ${name}:`, e));
    } catch (e) {
      log('-----', 'log cleaning failed:', e);
    }
    busy = false;
  };
  void tidy();
  setInterval(tidy, SERVER.logCleanEvery * 1000).unref();
}

export function log(...parts: unknown[]) {
  const now = new Date().toISOString();
  const line = oneEntry(format(`${now.slice(0, 19)}Z`, ...parts));
  if (!dir) return console.log(line);
  try {
    const name = `${now.slice(0, 10)}.log`;
    const file = path.join(dir, name);
    if (today.name !== name) {
      let bytes = 0;
      try {
        bytes = fs.statSync(file).size;
      } catch {}
      Object.assign(today, { name, bytes, full: false });
    }
    if (today.full) return;
    let text = line + '\n';
    if (today.bytes + Buffer.byteLength(text) > SERVER.logDayBytes) {
      today.full = true;
      text = `${now.slice(0, 19)}Z ----- log full (${mb(SERVER.logDayBytes)} MB today): the rest of today's lines are dropped\n`;
    }
    fs.appendFileSync(file, text);
    today.bytes += Buffer.byteLength(text);
  } catch {
    console.log(line);
  }
}

/** Each address's noisy lines in the window that began at `start`. */
const noise = new Map<string, { start: number; n: number }>();

/** `log` for lines a stranger can make at will: at most SERVER.noisyPerIp per SERVER.noisyWindow from one address, then one line says the rest are held back (until the window ends). */
export function logNoisy(ip: string, ...parts: unknown[]) {
  const now = Date.now();
  const window = SERVER.noisyWindow * 1000;
  if (noise.size >= SERVER.noisyIps) for (const [k, e] of noise) if (now - e.start >= window) noise.delete(k);
  let e = noise.get(ip);
  if (!e || now - e.start >= window) {
    if (!e && noise.size >= SERVER.noisyIps) return;
    noise.set(ip, (e = { start: now, n: 0 }));
  }
  if (++e.n <= SERVER.noisyPerIp) return log(...parts);
  if (e.n === SERVER.noisyPerIp + 1) log('-----', `more lines from ${ip} held back for ${SERVER.noisyWindow} s`);
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
