import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay, performance, PerformanceObserver } from 'node:perf_hooks';
import v8 from 'node:v8';
import zlib from 'node:zlib';
import { PLAYTEST } from '../src/config';
import { log } from './log';

// The playtest build's server side (docs/playtest.md): the games' reports and
// the server's own numbers, one JSON line each, in PLAYTEST_LOG (a directory,
// one file a day; yesterday's is gzipped). Unset, nothing is kept and welcomes
// don't ask for reports. IPs are kept only as a salted hash: the salt is made
// at start and never written. Every link gets a number, so the report can tell
// who was who when names repeat (docs/playtest.md, Who's who).

const dir = process.env.PLAYTEST_LOG;
/** Welcomes ask for reports. */
export const telemetry = !!dir;
const salt = randomBytes(16);
const hashIp = (ip: string) => createHash('sha256').update(salt).update(ip).digest('hex').slice(0, 12);

type Count = { n: number; bytes: number };
interface LinkInfo {
  id: number;
  ip: string;
  host: boolean;
  code: string | null;
  player: number | null;
  name: string | null;
  device: string | null;
  in: Map<string, Count>;
  outN: number;
  outBytes: number;
  maxQueued: number;
  /** Sends that found the queue past PLAYTEST.queueWarn, since when it's been past it (ms), and the longest stretch. */
  backedUp: number;
  backedSince: number | null;
  longestBacked: number;
  tokens: number;
  refilled: number;
  dropped: number;
}

const links = new Map<object, LinkInfo>();
let nextLink = 1;
const ipOfDevice = new Map<string, string>();
const ticks = new Map<string, number[]>();

// ---- the file ----

let day = '';
let out: fs.WriteStream | null = null;
let written = dir ? diskUsed(dir) : 0;
let full = false;

function write(line: Record<string, unknown>) {
  if (!dir || full) return;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    const old = day;
    out?.end(() => old && gzip(path.join(dir, `playtest-${old}.jsonl`)));
    day = today;
    out = fs.createWriteStream(path.join(dir, `playtest-${today}.jsonl`), { flags: 'a' });
    out.on('error', (e) => log('-----', `playtest: can't write: ${e.message}`));
  }
  const text = `${JSON.stringify({ t: new Date().toISOString(), ...line })}\n`;
  written += text.length;
  if (written > PLAYTEST.maxDiskMB * 2 ** 20) {
    full = true;
    log('-----', `playtest: ${PLAYTEST.maxDiskMB} MB written, no more`);
    return;
  }
  out!.write(text);
}

function gzip(file: string) {
  if (!fs.existsSync(file)) return;
  fs.createReadStream(file)
    .pipe(zlib.createGzip())
    .pipe(fs.createWriteStream(`${file}.gz`))
    .on('finish', () => fs.unlinkSync(file))
    .on('error', (e) => log('-----', `playtest: gzip ${file}: ${e.message}`));
}

function diskUsed(d: string) {
  try {
    return fs.readdirSync(d).reduce((n, f) => n + fs.statSync(path.join(d, f)).size, 0);
  } catch {
    return 0;
  }
}

// ---- links ----

const info = (link: object) => links.get(link);

/** A socket opened. */
export function opened(link: object, ip: string, host: boolean) {
  if (!dir) return;
  const l: LinkInfo = { id: nextLink++, ip: hashIp(ip), host, code: null, player: null, name: null, device: null, in: new Map(), outN: 0, outBytes: 0, maxQueued: 0, backedUp: 0, backedSince: null, longestBacked: 0, tokens: PLAYTEST.burst, refilled: Date.now(), dropped: 0 };
  links.set(link, l);
  write({ kind: 'link', event: 'open', link: l.id, ip: l.ip, host });
}

/** HOST or JOIN went through: `how` new, back (token) or takeover (a dropped player's name). */
export function admitted(link: object, code: string, p: { id: number; name: string }, how: string) {
  const l = info(link);
  if (!l) return;
  Object.assign(l, { code, player: p.id, name: p.name });
  write({ kind: 'link', event: 'in', link: l.id, ip: l.ip, code, player: p.id, name: p.name, how });
}

export function turnedAway(link: object, reason: string) {
  const l = info(link);
  if (l) write({ kind: 'link', event: 'turned-away', link: l.id, ip: l.ip, reason });
}

export function closed(link: object, code: number, reason: string) {
  const l = info(link);
  if (!l) return;
  write({ kind: 'link', event: 'closed', link: l.id, code: l.code, player: l.player, closeCode: code, reason });
  links.delete(link);
}

/** A session event that isn't a link's (a player out, a paint file). */
export function event(code: string, e: Record<string, unknown>) {
  write({ kind: 'event', code, ...e });
}

export function received(link: object, type: string, bytes: number) {
  const l = info(link);
  if (!l) return;
  const c = l.in.get(type);
  if (c) (c.n++, (c.bytes += bytes));
  else l.in.set(type, { n: 1, bytes });
}

/** A frame went out; `queued`: the socket's queue after it. */
export function sent(link: object, bytes: number, queued: number) {
  const l = info(link);
  if (!l) return;
  l.outN++;
  l.outBytes += bytes;
  l.maxQueued = Math.max(l.maxQueued, queued);
  // What was already waiting, not this frame: a paint file part (256 KB) is over the line by itself.
  if (queued - bytes > PLAYTEST.queueWarn) {
    l.backedUp++;
    l.backedSince ??= Date.now();
    l.longestBacked = Math.max(l.longestBacked, Date.now() - l.backedSince);
  } else l.backedSince = null;
}

/** A game's report: kept if it's small enough and the link isn't sending too many. */
export function report(link: object, data: Record<string, unknown>, bytes: number) {
  const l = info(link);
  if (!l || !l.code) return;
  const now = Date.now();
  l.tokens = Math.min(PLAYTEST.burst, l.tokens + ((now - l.refilled) / 1000) * PLAYTEST.rate);
  l.refilled = now;
  if (bytes > PLAYTEST.maxReport || l.tokens < 1) return void l.dropped++;
  l.tokens--;
  const device = typeof data.device === 'string' ? data.device.slice(0, 32) : null;
  if (device && device !== l.device) {
    l.device = device;
    const was = ipOfDevice.get(device);
    if (was && was !== l.ip) write({ kind: 'link', event: 'ip-change', device, from: was, to: l.ip, link: l.id });
    ipOfDevice.set(device, l.ip);
    write({ kind: 'link', event: 'device', link: l.id, device, code: l.code, player: l.player, name: l.name });
  }
  const kind = typeof data.kind === 'string' ? data.kind.slice(0, 16) : 'client';
  write({ ...data, kind, code: l.code, player: l.player, name: l.name, link: l.id, ip: l.ip });
}

/** A session's paint runs took `ms`. */
export function tick(code: string, ms: number) {
  if (!dir) return;
  const t = ticks.get(code);
  if (t) t.push(ms);
  else ticks.set(code, [ms]);
}

// ---- the server's own numbers, every PLAYTEST.every while a session is live ----

// The histogram counts its own timer: its resolution is taken off what it reads.
const RESOLUTION = 5;
const loop = monitorEventLoopDelay({ resolution: RESOLUTION });
let elu = performance.eventLoopUtilization();
let cpu = process.cpuUsage();
const gc = { n: 0, total: 0, longest: 0 };

/** Starts the server's lines; `sessions()`: each live session's code, players and paint (MB). */
export function watch(sessions: () => { code: string; players: number; paintMB: number }[]) {
  if (!dir) return;
  loop.enable();
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      gc.n++;
      gc.total += e.duration;
      gc.longest = Math.max(gc.longest, e.duration);
    }
  }).observe({ entryTypes: ['gc'] });
  log('-----', `playtest: reports go to ${dir} (${(written / 2 ** 20).toFixed(0)} MB there already)`);
  /** When the last session ended (ms), and when the process was last written with none live. */
  let idleSince: number | null = null;
  let idleWritten = 0;
  setInterval(() => {
    const live = sessions();
    const now = Date.now();
    if (live.length) idleSince = null;
    else idleSince ??= now;
    // Right after the last session ends, and then every PLAYTEST.idleEvery for PLAYTEST.idleMinutes: the memory it left behind.
    const idle = !live.length && now - idleSince! < PLAYTEST.idleMinutes * 60_000 && now - idleWritten >= PLAYTEST.idleEvery * 1000;
    if (live.length || idle) {
      if (idle) idleWritten = now;
      const ms = (ns: number) => Math.max(0, Math.round(ns / 1e4) / 100 - RESOLUTION);
      const m = process.memoryUsage();
      const h = v8.getHeapStatistics();
      const e = performance.eventLoopUtilization(elu);
      const c = process.cpuUsage(cpu);
      const secs = PLAYTEST.every;
      write({
        kind: 'process',
        ...(idle && { idleSeconds: Math.round((now - idleSince!) / 1000) }),
        eventLoop: { p50: ms(loop.percentile(50)), p99: ms(loop.percentile(99)), max: ms(loop.max), utilization: Math.round(e.utilization * 1000) / 1000 },
        cpu: { user: Math.round(c.user / 1e4 / secs) / 100, system: Math.round(c.system / 1e4 / secs) / 100 },
        // heap used is live JS; heap total is what V8 holds; external and arrayBuffers are outside it (paint); rss minus these is what malloc keeps.
        memoryMB: { heap: mb(m.heapUsed), heapTotal: mb(h.total_heap_size), external: mb(m.external), arrayBuffers: mb(m.arrayBuffers), rss: mb(m.rss) },
        gc: { ...gc, total: Math.round(gc.total), longest: Math.round(gc.longest) },
        sessions: live.length,
        links: links.size,
      });
      for (const s of live) {
        const t = (ticks.get(s.code) ?? []).sort((a, b) => a - b);
        const players = [...links.values()].filter((l) => l.code === s.code).map((l) => ({ link: l.id, player: l.player, name: l.name, device: l.device, in: Object.fromEntries(l.in), outN: l.outN, outBytes: l.outBytes, maxQueued: l.maxQueued, backedUp: l.backedUp, longestBacked: l.longestBacked, reportsDropped: l.dropped }));
        write({ kind: 'session', code: s.code, players: s.players, paintMB: Math.round(s.paintMB), drips: t.length ? { p50: r(t[t.length >> 1]), max: r(t[t.length - 1]) } : null, links: players });
      }
    }
    for (const l of links.values()) Object.assign(l, { in: new Map(), outN: 0, outBytes: 0, maxQueued: 0, backedUp: 0, longestBacked: 0, dropped: 0 });
    ticks.clear();
    loop.reset();
    elu = performance.eventLoopUtilization();
    cpu = process.cpuUsage();
    Object.assign(gc, { n: 0, total: 0, longest: 0 });
  }, PLAYTEST.every * 1000);
}

const mb = (b: number) => Math.round(b / 2 ** 20);
const r = (x: number) => Math.round(x * 100) / 100;
