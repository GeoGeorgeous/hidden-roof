import type { InventoryData } from '../src/inventory/inventory';
import type { PropData } from '../src/level/level-data';
import { NAME_MAX, type Activity, type Presence, type Spot } from '../src/net/protocol';
import { flush } from './relay';

// A player of a session (session.ts) and their socket: what the session keeps
// of them, how others see them, and the name they go by in it.

/** A player's socket. */
export interface Link {
  send(frame: Uint8Array): void;
  close(code?: number, reason?: string): void;
  readonly open: boolean;
  /** Where it's from, and when it opened (ms), for the log. */
  readonly ip: string;
  readonly since: number;
  /** Its country (geoip.ts) and the game's device id (its HOST or JOIN), for the admin page. */
  readonly country?: string | null;
  device?: string;
  /** Its last WebSocket ping's round trip (ms), for the admin page; none yet. */
  rtt?: number;
}

export interface Player {
  id: number;
  /** The name they go by in the session: the one they asked for, numbered if it was taken. */
  name: string;
  /** The name they asked for, as the menu sent it: a new tab typing it takes their place back too. */
  asked: string;
  /** Lets them come back as themselves (welcome hands it out). */
  token: string;
  /** The game's device id (its last JOIN's), if it sent one: a JOIN from the same device while their link is open takes their seat. */
  device?: string;
  link: Link | null;
  /** When they first came in (ms). */
  joined: number;
  /** Their last op batch painted (ToServer ops `seq`): one resent after a rejoin is dropped. */
  acked: number;
  /** Their welcome has gone out on `link`: frames reach them. Until then what happens is in the welcome or after it. */
  live: boolean;
  /** A SAVE of theirs is under way. */
  saving: boolean;
  /** What they said they're doing (playing, hidden, paused, idle). */
  activity: Activity;
  /** What they carry, as they last said (null: the starting kit). */
  inventory: InventoryData | null;
  /** Where they last stood, as their state said (null: not yet): given back when they come back. */
  at: Spot | null;
  ladder: PropData | null;
  expires: ReturnType<typeof setTimeout> | null;
  /** Their last link that closed: from where, how long it lived, when (ms), for the log; how long (s) the seat is held. */
  was: { ip: string; country: string | null; lived: number; at: number; hold: number } | null;
}

export const presence = (p: Player): Presence => (p.link ? p.activity : 'dropped');

export function deliver(p: Player, f: Uint8Array) {
  if (!p.live) return;
  flush(p);
  p.link?.send(f);
}

/** `name`, or with the lowest number free when another player has it: "geo (2)", which no player can type, so it never looks like a typed name. */
export function uniqueName(name: string, players: Player[]) {
  const taken = new Set(players.map((p) => p.name));
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const tag = ` (${n})`;
    const s = name.slice(0, NAME_MAX - tag.length) + tag;
    if (!taken.has(s)) return s;
  }
}
