import { PAINT_DETAIL, SERVER } from '../config.ts';
import type { InventoryData } from '../inventory/inventory';
import { SLOTS, type Tool } from '../inventory/tool.ts';
import { isNum, isObj, isV3, levelProblem, type LevelData, type PropData } from '../level/level-data.ts';

// The messages between the game and the multiplayer server (server/), over a
// WebSocket. Each is one binary frame: a u32 (little-endian) length, that many
// bytes of JSON, then the message's `bytes`, if any (a player snapshot, a paint
// file, paint ops). Paint ops travel packed (op-wire.ts), ~23 bytes a stamp, each
// number rounded as the painter painted it, so every client paints the very same
// texels. Nothing is compressed by the socket: the server would deflate every op
// once per player (with 20 painting, more than a core). Node runs this file as is
// (scripts/protocol.test.mjs): runtime imports only from files that have none
// themselves, with their .ts extension. The server reads untrusted messages
// through checkToServer.

/** Bumped when a message changes or anything the server runs for a session does (paint, drips, face keys, the save format). host and join carry it and the level's surface-table hash; a mismatch is answered 'version' and the game asks for a reload. */
export const PROTOCOL = 8;
export const NAME_MAX = 16;
/** A player's name: Latin letters and digits only (ASCII), 1 to NAME_MAX of them; the menu checks it before HOST or JOIN, the server refuses any other. */
export const isName = (x: unknown): x is string => typeof x === 'string' && x.length <= NAME_MAX && /^[A-Za-z0-9]+$/.test(x);
/** What is left of `x` as a name: the letters and digits of it, at most NAME_MAX (a name saved by an older version, or typed). */
export const cleanName = (x: string) => x.replace(/[^A-Za-z0-9]/g, '').slice(0, NAME_MAX);
/** A session's name, as its creator typed it (server/admin-api.ts): at most this many characters. */
export const SESSION_NAME_MAX = 32;
/** A session's name as its creator typed it: 1 to SESSION_NAME_MAX characters once trimmed, no control characters; the server keeps it trimmed. */
export const isSessionName = (x: unknown): x is string => {
  if (typeof x !== 'string') return false;
  const t = x.trim();
  return t.length > 0 && t.length <= SESSION_NAME_MAX && !/\p{C}/u.test(t);
};
/** Players a session may be made for: SERVER.privateMin to SERVER.players.private. */
export const isPrivateLimit = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= SERVER.privateMin && (x as number) <= SERVER.players.private;
/** Some of the tools, each once. */
export const isToolSet = (x: unknown): x is Tool[] => Array.isArray(x) && new Set(x).size === x.length && x.every((t) => SLOTS.includes(t));
/** Session codes: this many letters from CODE_LETTERS (no I or O, which read as 1 and 0). */
export const CODE_LENGTH = 5;
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** The PAINT DETAILs a host may pick (texels per meter). */
const DETAILS = Object.values(PAINT_DETAIL);
/** Player snapshot size (net/snapshot.ts). */
export const SNAPSHOT_BYTES = 25;
/** Most props a hosted level may have (the roof has 1340): each costs the server building it. */
const MAX_PROPS = 5000;

/**
 * Why the server turned a player away (the game says it in its own words):
 * another version, no session with that code (a server that restarted has none
 * either), one that has ended (every player left or ran out of time to come
 * back; the server remembers codes for SERVER.endedMemory), a full session, a paint file or
 * level it can't use, the server too full for another session, or the same
 * player come in from another tab (a duplicated tab carries the token along),
 * or too many links or sessions from one address (SERVER.linksPerIp, sessionsPerIp),
 * or HOST while players may not host (SERVER.playerHost), or the admin removed the player or closed the session.
 * The socket then closes with closeCode(reason), for the logs.
 */
const REJECTIONS = ['version', 'no-session', 'ended', 'full', 'bad-save', 'bad-level', 'busy', 'replaced', 'too-many', 'no-host', 'kicked', 'closed'] as const;
export type Rejection = (typeof REJECTIONS)[number];
export const closeCode = (r: Rejection) => 4001 + REJECTIONS.indexOf(r);
/** The rejection a socket's close code says (see closeCode), if it does. */
export const rejectionOf = (code: number): Rejection | undefined => REJECTIONS[code - 4001];
/** Public (anyone joins it from the list) or private (joined with its code). */
export type SessionKind = 'public' | 'private';
/** What a session is, as its creator made it: its kind, name (up to SESSION_NAME_MAX), most players, and the tools it allows. */
export interface SessionInfo {
  kind: SessionKind;
  name: string;
  limit: number;
  tools: Tool[];
}
/** A session in the server list: its code only if it's public (a private one's is the host's to share), and its players' names. */
export interface LobbyEntry extends SessionInfo {
  code?: string;
  players: string[];
}
/**
 * The server list over plain HTTP, no WebSocket (Caddy passes /ws on): GET
 * LOBBY_LIST answers `Lobby`; GET LOBBY_CODE + a code answers that session's
 * LobbyEntry (with its code), or 404 when there's none. `region`: where the
 * server is, a country code (SERVER.region, REGION).
 */
export interface Lobby {
  region: string;
  sessions: LobbyEntry[];
}
export const LOBBY_LIST = '/ws?list';
export const LOBBY_CODE = '/ws?code=';
/** What the server answers a plain GET at /ws (no WebSocket): the game asks when it can't connect (net/diagnostics.ts). */
export const HELLO = `roof server · protocol ${PROTOCOL}`;

/** What a player is doing, as they say: playing, away (their game is hidden: minimized, another tab), in the menu (paused), or idle (nothing pressed for NET.idleAfter s). */
const ACTIVITIES = ['here', 'away', 'menu', 'idle', 'lagging'] as const;
export type Activity = (typeof ACTIVITIES)[number];
/** A player as the others see them: what they're doing, or dropped (their link is gone; they may come back). */
export type Presence = Activity | 'dropped';

/** Game -> server. */
export type ToServer =
  /** Start a private session on this level, at this PAINT DETAIL, from a paint save (`bytes`) or clean; `session`: its name, most players (SERVER.privateMin to SERVER.players.private) and tools. `table`: this client's surfaceTable of the level. `device` (here and in JOIN): this browser's random id (stored.ts deviceId), for the admin's count of people. */
  | { type: 'host'; protocol: number; device?: string; table: string; name: string; levelName: string; level: LevelData; detail: number; session: { name: string; limit: number; tools: Tool[] }; bytes?: Uint8Array }
  /** Join by code; with the `token` from an earlier welcome, as the same player (a reconnect); with the `queue` token of an earlier 'queued', back to that place in line. */
  | { type: 'join'; protocol: number; device?: string; name: string; code: string; token?: string; queue?: string }
  /** This player now (net/snapshot.ts). */
  | { type: 'state'; bytes: Uint8Array }
  /**
   * Paint ops, each made at the sender's time (the snapshots' clock), packed (op-wire.ts encodeOps). `seq` numbers
   * this player's batches from 1 in the session: the server acks the highest it has (welcome, pong), drops a batch it
   * has had, and the game sends again what wasn't acked when it comes back (net/outbox.ts).
   */
  | { type: 'ops'; seq: number; bytes: Uint8Array }
  /** Their stepladder placed, or taken away (null), at their time `t`. */
  | { type: 'ladder'; t: number; data: PropData | null }
  /** The session's paint as a paint file, please (SAVE). */
  | { type: 'save' }
  /** What they carry, whenever it changes: given back when they come back. */
  | { type: 'inventory'; data: InventoryData }
  /** What they're doing now, when it changes (net/own-status.ts). */
  | { type: 'status'; status: Activity }
  /** Answered with a pong carrying the same `t`: the round trip, for the HUD. */
  | { type: 'ping'; t: number }
  | { type: 'leave' };

/** Server -> game. */
export type ToClient =
  /**
   * In the session (also after a reconnect): its level, PAINT DETAIL and
   * surfaceTable (the client checks its own against it), the players and
   * their stepladders, what this player carried when here before (null: the
   * starting kit); its paint as a paint file follows in `parts` parts (none:
   * it's the save this host sent). `acked`: their last op batch the server has (0: none), in the paint file.
   */
  | { type: 'welcome'; code: string; you: number; name: string; token: string; session: SessionInfo; levelName: string; level: LevelData; detail: number; table: string; players: { id: number; name: string; state: Presence }[]; ladders: { id: number; data: PropData }[]; inventory: InventoryData | null; parts: number; acked: number }
  | { type: 'rejected'; reason: Rejection }
  /**
   * The session is full: this link waits in line, `position` 1 next (SERVER.queueMax at most; past it, 'full').
   * Sent again whenever the position changes; the welcome follows once a place is free. A JOIN with `token` after
   * a dropped link keeps the place for SERVER.rejoinWindow.
   */
  | { type: 'queued'; position: number; token: string }
  | { type: 'joined'; id: number; name: string }
  | { type: 'left'; id: number }
  | { type: 'presence'; id: number; state: Presence }
  | { type: 'state'; id: number; bytes: Uint8Array }
  /** A player's paint ops, packed as they sent them. */
  | { type: 'ops'; id: number; bytes: Uint8Array }
  /** Ops painted since the paint file of this welcome was read, packed: painted at once, after it. */
  | { type: 'paint'; bytes: Uint8Array }
  | { type: 'ladder'; id: number; t: number; data: PropData | null }
  /** The session's paint as a paint file in `parts` parts that follow (SAVE); none: the server can't make one now. */
  | { type: 'save'; parts: number }
  /** A piece of the paint file a welcome or a save announced (partFrames). */
  | { type: 'part'; bytes: Uint8Array }
  /** Sent every few seconds, so a client notices a dead link. */
  | { type: 'ping' }
  /** The ping's `t` back, and the last op batch of theirs the server has. */
  | { type: 'pong'; t: number; acked: number };

type Message = { type: string; bytes?: Uint8Array };

export function encode(msg: ToServer | ToClient): Uint8Array<ArrayBuffer> {
  const { bytes, ...rest } = msg as Message;
  const json = new TextEncoder().encode(JSON.stringify(rest));
  const out = new Uint8Array(4 + json.length + (bytes?.length ?? 0));
  new DataView(out.buffer).setUint32(0, json.length, true);
  out.set(json, 4);
  if (bytes) out.set(bytes, 4 + json.length);
  return out;
}

/**
 * A paint file (in pieces) as 'part' frames of about `size` bytes: in one
 * frame a big file is one long silence for the game while it downloads, and
 * frames made once can go to every player who wants the file.
 */
export function partFrames(pieces: Uint8Array[], size: number): Uint8Array[] {
  const head = encode({ type: 'part', bytes: new Uint8Array(0) });
  const frames: Uint8Array[] = [];
  let left = pieces.reduce((n, p) => n + p.length, 0);
  let frame = new Uint8Array(0);
  let o = 0;
  for (let piece of pieces)
    while (piece.length) {
      if (o === frame.length) {
        frame = new Uint8Array(head.length + Math.min(size, left));
        frame.set(head);
        frames.push(frame);
        o = head.length;
      }
      const n = Math.min(piece.length, frame.length - o);
      frame.set(piece.subarray(0, n), o);
      [o, left, piece] = [o + n, left - n, piece.subarray(n)];
    }
  return frames;
}

/** The pieces of a paint file in its 'part' frames (partFrames), without their headers. */
export function partPieces(frames: Uint8Array[]) {
  const head = encode({ type: 'part', bytes: new Uint8Array(0) }).length;
  return frames.map((f) => f.subarray(head));
}

/** A message as sent, or null if it isn't one; its fields still need checking if the sender isn't trusted. */
export function decode(frame: Uint8Array): Message | null {
  if (frame.length < 4) return null;
  const n = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0, true);
  if (4 + n > frame.length) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(new TextDecoder().decode(frame.subarray(4, 4 + n)));
  } catch {
    return null;
  }
  if (!isObj(msg) || typeof msg.type !== 'string') return null;
  const m = msg as Message;
  if (4 + n < frame.length) m.bytes = frame.subarray(4 + n);
  return m;
}

/**
 * A message from a game as the server may act on it, or null. Paint ops are
 * the session's to read (op-wire.ts decodeOps) and check: their surfaces and
 * faces. Their sizes need no limit, since paint is clipped to the face it's on.
 */
export function checkToServer(m: Message | null): ToServer | null {
  if (!m) return null;
  const v = m as Record<string, unknown>;
  // A game of another version is answered 'version' whatever else it sent: an older one's fields may not pass today's checks.
  if ((m.type === 'host' || m.type === 'join') && isInt(v.protocol) && v.protocol !== PROTOCOL) return m as ToServer;
  switch (m.type) {
    case 'host':
      return isInt(v.protocol) && isDevice(v.device) && typeof v.table === 'string' && isName(v.name) && typeof v.levelName === 'string' && v.levelName.length <= 64 && !levelProblem(v.level, MAX_PROPS) && DETAILS.includes(v.detail as number) && isHosting(v.session) ? (m as ToServer) : null;
    case 'join':
      return isInt(v.protocol) && isDevice(v.device) && isName(v.name) && isCode(v.code) && (v.token === undefined || typeof v.token === 'string') && (v.queue === undefined || isQueueToken(v.queue)) && !m.bytes ? (m as ToServer) : null;
    case 'state':
      return m.bytes?.length === SNAPSHOT_BYTES ? (m as ToServer) : null;
    case 'ops':
      return isInt(v.seq) && v.seq > 0 && !!m.bytes ? (m as ToServer) : null;
    case 'ladder':
      return isNum(v.t) && (v.data === null || isLadder(v.data)) ? (m as ToServer) : null;
    case 'ping':
      return isNum(v.t) ? (m as ToServer) : null;
    case 'inventory':
      return isInventory(v.data) ? (m as ToServer) : null;
    case 'status':
      return ACTIVITIES.includes(v.status as Activity) ? (m as ToServer) : null;
    case 'save':
    case 'leave':
      return m as ToServer;
  }
  return null;
}

const isInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isHosting = (x: unknown) => isObj(x) && isSessionName(x.name) && isPrivateLimit(x.limit) && isToolSet(x.tools);
/** A queue token is a UUID; anything much longer is not one. */
const isQueueToken = (x: unknown) => typeof x === 'string' && x.length <= QUEUE_TOKEN_MAX;
const QUEUE_TOKEN_MAX = 64;
/** HOST's and JOIN's `device`: the browser's random id (stored.ts deviceId), or none. */
const isDevice = (x: unknown) => x === undefined || (typeof x === 'string' && /^[0-9a-f]{32}$/.test(x));
const isCode = (x: unknown) => typeof x === 'string' && x.length === CODE_LENGTH && [...x].every((c) => CODE_LETTERS.includes(c));
/** Shape and size only: the game takes from it what it knows (Inventory.restore). */
const isWords = (x: unknown) => Array.isArray(x) && x.length <= 32 && x.every((w) => typeof w === 'string' && w.length <= 32);
const isInventory = (x: unknown) => isObj(x) && isWords(x.tools) && isWords(x.colors) && isWords(x.caps) && isInt(x.selected) && isWords([x.color, x.cap]);
/** Only a stepladder: a player places nothing else while playing. */
const isLadder = (x: unknown) => isObj(x) && x.type === 'stepladder' && isV3(x.pos) && (x.rot === undefined || isInt(x.rot));
