import { SERVER } from '../src/config';
import { SLOTS } from '../src/inventory/tool';
import type { LevelData } from '../src/level/level-data';
import type { Rejection, ToServer } from '../src/net/protocol';
import { log, overMemory } from './log';
import type { Session } from './session';
import type { SessionSetup } from './setup';

// HOST: a player's own private session from their level, and their save's paint if they sent one (lobby.ts enter).
// Off unless SERVER.playerHost: the admin makes the sessions (admin-api.ts). Each one's address counts for
// SERVER.sessionsPerIp.

/** What HOST needs of the lobby. */
export interface HostLobby {
  sessions: { size: number };
  /** Sessions hosted from `ip` now. */
  hostedFrom(ip: string): number;
  /** A new session under a new code, not listed yet; throws if the level doesn't build. */
  start(levelName: string, level: LevelData, detail: number, setup: SessionSetup): Session;
  /** `session` listed, hosted from `ip`. */
  list(session: Session, ip: string): void;
}

/** The HOST's session with its save's paint, listed; or why not. */
export async function host(m: Extract<ToServer, { type: 'host' }>, ip: string, lobby: HostLobby): Promise<Session | Rejection> {
  if (!SERVER.playerHost) return 'no-host';
  if (lobby.hostedFrom(ip) >= SERVER.sessionsPerIp) return 'too-many';
  if (overMemory(SERVER.hostMemory)) return 'busy';
  let session: Session;
  try {
    const { name, limit, tools } = m.session;
    session = lobby.start(m.levelName, m.level, m.detail, { kind: 'private', name: name.trim(), limit, tools: SLOTS.filter((t) => tools.includes(t)), stays: false, admin: false });
  } catch (e) {
    log('-----', `host from ${ip}: the level doesn't build`, e);
    return 'bad-level';
  }
  if (session.table !== m.table) return 'version';
  if (m.bytes)
    try {
      await session.load(m.bytes);
    } catch (e) {
      log('-----', `host from ${ip}: paint file refused: ${(e as Error).message}`);
      return 'bad-save';
    }
  lobby.list(session, ip);
  const mb = session.memory;
  log(session.code, `hosted by ${ip}: ${JSON.stringify(m.levelName)} at ${m.detail} texels/m, ${mb.now.toFixed(0)} MB of paint (${mb.full.toFixed(0)} MB if all painted), ${lobby.sessions.size} sessions`);
  return session;
}
