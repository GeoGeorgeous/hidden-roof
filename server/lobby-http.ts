import type http from 'node:http';
import { SERVER } from '../src/config';
import { CODE_LENGTH, CODE_LETTERS, type Lobby as LobbyList, type LobbyEntry } from '../src/net/protocol';
import type { Lobby } from './lobby';
import type { Session } from './session';

// The server list over plain HTTP at /ws (protocol.ts LOBBY_LIST, LOBBY_CODE): every live session, and one session by
// its code, so the menu can show them without a WebSocket. The list leaves out the codes of private sessions; looking
// one up by its code is limited per address (SERVER.lookupsPerIp a minute) so codes can't be tried one after another.

/** Where a request is from: behind Caddy the socket's address is Caddy's, which passes the player's on. */
export const addressOf = (req: http.IncomingMessage) => String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();

/** A session as the list shows it: its code only if it's `withCode`. */
function entry(s: Session, withCode: boolean): LobbyEntry {
  const { kind, name, limit, tools } = s.setup;
  return { kind, name, limit, tools: [...tools], players: [...s.players.values()].map((p) => p.name), ...(withCode && { code: s.code }) };
}

export class LobbyHttp {
  /** Code lookups so far in the current minute, by address. */
  private lookups = new Map<string, { since: number; n: number }>();

  constructor(private lobby: Lobby) {}

  /** The answer to a GET at /ws?list or /ws?code=..., or null when it is neither (a plain GET at /ws is for the caller). */
  reply(req: http.IncomingMessage): { status: number; body: LobbyList | LobbyEntry | Record<string, never> } | null {
    const query = new URL(req.url ?? '', 'http://roof').searchParams;
    if (query.has('list')) return { status: 200, body: this.list() };
    if (!query.has('code')) return null;
    if (!this.allow(addressOf(req))) return { status: 429, body: {} };
    const code = query.get('code') ?? '';
    const found = code.length === CODE_LENGTH && [...code].every((c) => CODE_LETTERS.includes(c)) ? this.lobby.sessions.get(code) : undefined;
    return found ? { status: 200, body: entry(found, true) } : { status: 404, body: {} };
  }

  /** Every live session: public ones first, then the fullest. */
  private list(): LobbyList {
    const sessions = [...this.lobby.sessions.values()].sort((a, b) => Number(b.setup.kind === 'public') - Number(a.setup.kind === 'public') || b.players.size - a.players.size);
    return { region: SERVER.region, sessions: sessions.map((s) => entry(s, s.setup.kind === 'public')) };
  }

  /** One more lookup from `ip`: false past SERVER.lookupsPerIp in the minute. */
  private allow(ip: string) {
    const now = Date.now();
    if (this.lookups.size >= SERVER.lookupIps) for (const [a, l] of this.lookups) if (now - l.since >= 60_000) this.lookups.delete(a);
    let l = this.lookups.get(ip);
    if (!l || now - l.since >= 60_000) {
      // Every address is tracked, or none new: past lookupIps live addresses the rest wait for the minute to turn.
      if (!l && this.lookups.size >= SERVER.lookupIps) return false;
      this.lookups.set(ip, (l = { since: now, n: 0 }));
    }
    return ++l.n <= SERVER.lookupsPerIp;
  }
}
