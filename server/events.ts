import type { ServerResponse } from 'node:http';
import { SERVER } from '../src/config';

// The admin page's event stream (GET /events, admin-api.ts): what happens on
// the server, pushed when it happens, and a status every second while a page
// is open. No page open, no status built: only the last SERVER.adminEvents
// events are kept, for the next page that opens.

type EventType = 'joined' | 'left' | 'kicked' | 'dropped' | 'turned-away' | 'session-made' | 'session-closed' | 'wiped' | 'wiped-at-start' | 'save-failed';

interface AdminEvent {
  at: string;
  type: EventType;
  /** The session's code and name, if it's about one. */
  code: string | null;
  name: string | null;
  player: string | null;
  detail: Record<string, unknown>;
}

const recent: AdminEvent[] = [];
const streams = new Set<ServerResponse>();
let status: () => unknown = () => null;
let timer: ReturnType<typeof setInterval> | undefined;

const send = (res: ServerResponse, type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

/** Something happened: to every open stream, and kept among the recent ones. `s`: the session it's about. */
export function event(type: EventType, s: { code: string; setup: { name: string } } | null, player: string | null = null, detail: Record<string, unknown> = {}) {
  const e: AdminEvent = { at: new Date().toISOString(), type, code: s?.code ?? null, name: s?.setup.name ?? null, player, detail };
  recent.push(e);
  if (recent.length > SERVER.adminEvents) recent.shift();
  for (const res of streams) send(res, 'event', e);
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
