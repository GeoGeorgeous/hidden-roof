import { randomBytes } from 'node:crypto';
import { SERVER } from '../src/config';
import { ADMIN_NAME, type Rejection, type ToServer } from '../src/net/protocol';
import { log } from './log';
import { turnAway, uniqueName, type Link, type Player } from './player';
import { forget } from './relay';
import type { Session } from './session';

// Admins in a session (CCTV's Join as admin, docs/admin-api.md): the admin API makes a one-time pass, and a JOIN
// with it (lobby.ts) brings that link in as an admin, outside the players: no seat, no line, no stats, no events,
// not in the listing; the server log's one line as each comes and goes is all they leave. Unseen (the start),
// nothing of theirs reaches the others; seen, the others take them for a player named Admin, whose ops count in
// no stat. They lock faces against paint (session.ts lock). Any closed link ends it: an admin never comes back.

/** Admins' ids, far above any player's (relay entries and stepladders go by id). */
const FIRST_ID = 1_000_000;

/** One-time passes into sessions, in memory: each good once, for its session, for SERVER.adminPassLife s. */
export class Passes {
  private passes = new Map<string, { code: string; expires: number }>();

  /** A pass into session `code`; the expired ones go now (no timer). */
  make(code: string) {
    const now = Date.now();
    for (const [p, v] of this.passes) if (v.expires <= now) this.passes.delete(p);
    const pass = randomBytes(SERVER.adminPassBytes).toString('base64url');
    const expires = now + SERVER.adminPassLife * 1000;
    this.passes.set(pass, { code, expires });
    return { pass, expires };
  }

  /** Whether `pass` lets a link into session `code`: used up either way. */
  take(pass: string, code: string) {
    const p = this.passes.get(pass);
    this.passes.delete(pass);
    return !!p && p.code === code && p.expires > Date.now();
  }
}

/** A session's admins: admit, receive and remove. Nothing here reaches what counts, lists, logs events or holds seats. */
export class Admins {
  readonly all = new Map<number, Player>();
  private next = FIRST_ID;

  constructor(private s: Session) {}

  /** An admin on `link`, unseen, welcomed; 'busy' with no memory for a paint file. One whose link went before the welcome is out already. */
  async admit(link: Link): Promise<Player | Rejection> {
    const now = Date.now();
    const a: Player = { id: this.next++, name: ADMIN_NAME, asked: ADMIN_NAME, token: '', device: link.device, link, joined: now, acked: 0, live: false, saving: false, activity: 'here', since: now, inventory: null, at: null, ladder: null, expires: null, was: null, watcher: { seen: false } };
    this.all.set(a.id, a);
    log(this.s.code, `admin #${a.id} in from ${link.ip}`);
    let r: boolean | 'busy';
    try {
      r = await this.s.watch(a, link);
    } catch (e) {
      this.remove(a, 'no welcome: server error');
      throw e;
    }
    if (r === 'busy') this.remove(a, 'no memory for a paint file', 'busy');
    else if (!r) this.remove(a, 'its link closed before the welcome');
    return r === 'busy' ? r : a;
  }

  receive(a: Player, m: ToServer) {
    const seen = a.watcher!.seen;
    if (m.type === 'seen') this.see(a, m.on);
    else if (m.type === 'lock') this.s.locks.set(m.surface, m.rect, m.on);
    else if (m.type === 'leave') this.remove(a, 'left');
    // Unseen, nothing of theirs goes on (their ops are acked, so the game doesn't keep them).
    else if (m.type === 'ops' && !seen) a.acked = Math.max(a.acked, m.seq);
    else if (m.type === 'inventory' || (!seen && (m.type === 'state' || m.type === 'ladder' || m.type === 'status'))) return;
    else this.s.receive(a, m);
  }

  /** Seen by the others as a player (joining: numbered like any name), or not (leaving, with their stepladder). */
  private see(a: Player, on: boolean) {
    const w = a.watcher!;
    if (w.seen === on) return;
    if (on) {
      a.name = uniqueName(ADMIN_NAME, [...this.s.players.values(), ...this.seen()]);
      w.seen = true;
      this.s.broadcast({ type: 'joined', id: a.id, name: a.name, role: 'watcher' }, a);
      return;
    }
    if (a.ladder) this.s.broadcast({ type: 'ladder', id: a.id, t: 0, data: null }, a);
    a.ladder = null;
    w.seen = false;
    this.s.broadcast({ type: 'left', id: a.id }, a);
  }

  /** The seen ones: the others' players. */
  seen() {
    return [...this.all.values()].filter((a) => a.watcher!.seen);
  }

  /** `a` is out for `why` (logged), their link closed (`told`: turned away with it); a session that doesn't stay closes with no one left. */
  remove(a: Player, why: string, told?: Rejection) {
    if (this.all.get(a.id) !== a) return;
    this.see(a, false);
    this.all.delete(a.id);
    log(this.s.code, `admin #${a.id} out: ${why}`);
    const link = a.link;
    a.link = null;
    a.live = false;
    forget(a);
    if (told) turnAway(link, told);
    else link?.close(1000, why);
    if (!this.s.setup.stays) this.s.close('no one left');
  }

  /** Every admin out, told `told` (a wipe, a restore, the session's end): admin mode ends in their games. */
  closeAll(why: string, told: Rejection) {
    for (const a of [...this.all.values()]) this.remove(a, why, told);
  }
}
