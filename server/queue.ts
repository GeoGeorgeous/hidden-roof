import { randomUUID } from 'node:crypto';
import { SERVER } from '../src/config';
import { closeCode, encode, type ToServer } from '../src/net/protocol';
import { log, logNoisy, span, who } from './log';
import type { Link } from './player';

// A session's line for its places: a JOIN that finds it full waits here (SERVER.queueMax at most), first come, first
// served. When a place frees (session.ts) the first entry whose link is open comes in as a JOIN would, and everyone
// is told their position again if it changed. A link that closes keeps its entry, held, for SERVER.rejoinWindow:
// a JOIN with its token takes it back; meanwhile the line goes past it. Waiting links send nothing the session
// takes but ping and leave.

/** One entry in the line. */
export interface Place {
  /** Numbers the entries in the log (a nickname is logged with it, as a player's is). */
  id: number;
  name: string;
  /** Lets the same game take its place back (queued). */
  token: string;
  /** Its link; null while the entry is held. */
  link: Link | null;
  ip: string;
  since: number;
  /** Brings its link in as a JOIN would (lobby.ts), once a place is free; true: the server had no memory for it now (its link is closed, it keeps its place). */
  seat: (waited: number) => Promise<boolean>;
  /** The position it was last told (0: none yet). */
  told: number;
  expires: ReturnType<typeof setTimeout> | null;
}

export class Queue {
  private places: Place[] = [];
  private ids = 0;
  private over = false;

  /** `room`: the session has a place free. */
  constructor(
    private code: string,
    private room: () => boolean,
  ) {}

  get length() {
    return this.places.length;
  }

  /** How many places in the line are from `ip`, held ones too. */
  held(ip: string) {
    return this.places.filter((p) => p.ip === ip).length;
  }

  /** A link to wait in line, or null when the line is full. Call `update` once it is placed. */
  add(link: Link, name: string, seat: Place['seat']): Place | null {
    if (this.places.length >= SERVER.queueMax) return null;
    const p: Place = { id: ++this.ids, name, token: randomUUID(), link, ip: link.ip, since: Date.now(), seat, told: 0, expires: null };
    this.places.push(p);
    logNoisy(p.ip, this.code, `${who(p)} from ${p.ip} waits in line: position ${this.places.length}`);
    return p;
  }

  /** The held entry with `token`, now on `link` (the one still on another link loses it, told why); undefined if there is none. Call `update` once it is placed. */
  resume(token: string, link: Link, name: string, seat: Place['seat']): Place | undefined {
    const p = this.places.find((q) => q.token === token);
    if (!p) return;
    if (p.expires) clearTimeout(p.expires);
    p.expires = null;
    p.link?.send(encode({ type: 'rejected', reason: 'replaced' }));
    p.link?.close(closeCode('replaced'), 'replaced');
    Object.assign(p, { link, ip: link.ip, name, seat, told: 0 });
    logNoisy(p.ip, this.code, `${who(p)} from ${p.ip} is back in line: position ${this.places.indexOf(p) + 1}`);
    return p;
  }

  /** Its link closed: the entry stays for SERVER.rejoinWindow. */
  dropped(p: Place, link: Link) {
    if (p.link !== link) return;
    p.link = null;
    logNoisy(p.ip, this.code, `${who(p)} dropped from the line: ${SERVER.rejoinWindow} s to come back`);
    p.expires = setTimeout(() => this.remove(p, `held place expired (${SERVER.rejoinWindow} s)`), SERVER.rejoinWindow * 1000);
  }

  /** A message from a waiting link: it may leave, or ping. */
  receive(p: Place, m: ToServer) {
    if (m.type === 'ping') p.link?.send(encode({ type: 'pong', t: m.t, acked: 0 }));
    else if (m.type === 'leave') {
      const link = p.link;
      this.remove(p, 'left the line');
      link?.close(1000, 'left');
    }
  }

  /** The line moves on: places free are taken, and whoever's position changed is told. */
  update() {
    while (this.places.length && this.room()) {
      const i = this.places.findIndex((p) => p.link?.open);
      if (i < 0) break;
      const [p] = this.places.splice(i, 1);
      log(this.code, `${who(p)} from ${p.ip} admitted from the line: position ${i + 1}, waited ${span(Date.now() - p.since)}`);
      void p.seat(Date.now() - p.since).then((busy) => busy && this.putBack(p));
    }
    this.places.forEach((p, i) => {
      if (!p.link || p.told === i + 1) return;
      p.told = i + 1;
      p.link.send(encode({ type: 'queued', position: i + 1, token: p.token }));
    });
  }

  /** An entry the server had no memory to seat is back where it was (the entries are in the order they came), held as its closed link is. */
  private putBack(p: Place) {
    if (this.over) return;
    const i = this.places.findIndex((q) => q.id > p.id);
    this.places.splice(i < 0 ? this.places.length : i, 0, p);
    if (p.link && !p.link.open) this.dropped(p, p.link);
    this.update();
  }

  /** The session pings: the waiting too, so their game knows the link is alive. */
  ping(frame: Uint8Array) {
    for (const p of this.places) p.link?.send(frame);
  }

  /** The session has ended: everyone waiting is told. */
  end() {
    this.over = true;
    for (const p of this.places) {
      if (p.expires) clearTimeout(p.expires);
      p.link?.send(encode({ type: 'rejected', reason: 'ended' }));
      p.link?.close(closeCode('ended'), 'ended');
    }
    this.places = [];
  }

  private remove(p: Place, why: string) {
    const i = this.places.indexOf(p);
    if (i < 0) return;
    if (p.expires) clearTimeout(p.expires);
    this.places.splice(i, 1);
    logNoisy(p.ip, this.code, `${who(p)} from ${p.ip} out of the line: ${why} (${this.places.length} waiting)`);
    this.update();
  }
}
