import type { ServerResponse } from 'node:http';
import { SERVER } from '../src/config';
import { EventLog, later, pageOf, type AdminEvent, type EventType } from './event-log';

// The admin page's event stream (GET /events, admin-api.ts): what happens on
// the server, pushed when it happens, and a status every second while a page
// is open. No page open, no status built: only the last SERVER.adminEvents
// events are kept in memory, for the next page that opens. With a directory
// (DATA_DIR) every event is also kept on disk, and older ones are asked for in
// pages (GET /events/page, event-log.ts).

const recent: AdminEvent[] = [];
const streams = new Set<ServerResponse>();
let status: () => unknown = () => null;
let timer: ReturnType<typeof setInterval> | undefined;
let disk: EventLog | null = null;
let last = { ms: 0, n: 0 };

const send = (res: ServerResponse, type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

/** The next id, `<ms>-<n>`: a later one than any before it, even if the clock goes back. */
function nextId(now: number) {
  last = now > last.ms ? { ms: now, n: 0 } : { ms: last.ms, n: last.n + 1 };
  return `${last.ms}-${last.n}`;
}

/** Something happened: to every open stream, and kept among the recent ones and on disk. `s`: the session it's about. */
export function event(type: EventType, s: { code: string; setup: { name: string } } | null, player: string | null = null, detail: Record<string, unknown> = {}) {
  const now = Date.now();
  disk?.roll(now);
  const e: AdminEvent = { id: nextId(now), at: new Date(now).toISOString(), type, code: s?.code ?? null, name: s?.setup.name ?? null, player, detail };
  recent.push(e);
  if (recent.length > SERVER.adminEvents) recent.shift();
  disk?.append(e);
  for (const res of streams) send(res, 'event', e);
}

/** Keep the events in `dir`/events, and the last SERVER.adminEvents of them read back for the stream. Files older than SERVER.eventDays go now and once a day. */
export async function keepEvents(dir: string) {
  const log = new EventLog(`${dir}/events`, (count, day) => event('events-dropped', null, null, { count, day }));
  await log.init();
  recent.unshift(...(await log.page(null, SERVER.adminEvents)).events.reverse());
  disk = log;
  // Just past each midnight UTC: a new day's file, and the old ones pruned.
  const atMidnight = () => setTimeout(daily, 864e5 - (Date.now() % 864e5) + 1000).unref();
  const daily = () => {
    log.roll(Date.now());
    void log.prune().catch(() => {});
    atMidnight();
  };
  atMidnight();
}

/** The events before id `before` (none: the newest), at most `limit`, newest first, and `next`: the id to ask for the page after, or null. */
export async function eventPage(before: string | null, limit: number) {
  if (disk) return disk.page(before, limit);
  return pageOf([...recent].reverse().filter((e) => !before || later(before, e.id)), limit);
}

/** `res` as an open stream: the recent events at once, then each new one, and `now()` every SERVER.adminStatus s until it closes. */
export function stream(res: ServerResponse, now: () => unknown) {
  status = now;
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
  send(res, 'recent', recent);
  send(res, 'status', status());
  streams.add(res);
  timer ??= setInterval(() => {
    const s = status();
    for (const r of streams) send(r, 'status', s);
  }, SERVER.adminStatus * 1000);
  res.on('close', () => {
    streams.delete(res);
    if (streams.size) return;
    clearInterval(timer);
    timer = undefined;
  });
}
