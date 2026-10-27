import type http from 'node:http';
import { SERVER } from '../src/config';
import { type Lobby as LobbyList, type LobbyEntry } from '../src/net/protocol';
import type { Lobby } from './lobby';
import { PerMinute } from './per-minute';
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
  /** Code lookups by address, SERVER.lookupsPerIp a minute. */
  private lookups = new PerMinute(SERVER.lookupsPerIp, SERVER.lookupIps);

  constructor(private lobby: Lobby) {}

  /** The answer to a GET at /ws?list or /ws?code=..., or null when it is neither (a plain GET at /ws is for the caller). */
  reply(req: http.IncomingMessage): { status: number; body: LobbyList | LobbyEntry | Record<string, never> } | null {
    const query = new URL(req.url ?? '', 'http://roof').searchParams;
    if (query.has('list')) return { status: 200, body: this.list() };
    if (!query.has('code')) return null;
    if (!this.lookups.allow(addressOf(req))) return { status: 429, body: {} };
    const code = query.get('code') ?? '';
    const found = this.lobby.sessions.get(code);
    return found ? { status: 200, body: entry(found, true) } : { status: 404, body: {} };
  }

  /** Every live session: public ones first, then the fullest. */
  private list(): LobbyList {
    const sessions = [...this.lobby.sessions.values()].sort((a, b) => Number(b.setup.kind === 'public') - Number(a.setup.kind === 'public') || b.players.size - a.players.size);
    return { region: SERVER.region, sessions: sessions.map((s) => entry(s, s.setup.kind === 'public')) };
  }
}
