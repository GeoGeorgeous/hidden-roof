import { PAINT_DETAIL } from '../config.ts';
import type { InventoryData } from '../inventory/inventory';
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
export const PROTOCOL = 7;
export const NAME_MAX = 16;
/** A player's name: Latin letters and digits only (ASCII), 1 to NAME_MAX of them; the menu checks it before HOST or JOIN, the server refuses any other. */
export const isName = (x: unknown): x is string => typeof x === 'string' && x.length <= NAME_MAX && /^[A-Za-z0-9]+$/.test(x);
/** What is left of `x` as a name: the letters and digits of it, at most NAME_MAX (a name saved by an older version, or typed). */
export const cleanName = (x: string) => x.replace(/[^A-Za-z0-9]/g, '').slice(0, NAME_MAX);
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
 * another version, no session with that code, one that has ended (the server
 * remembers codes for SERVER.endedMemory), a full session, a paint file or
 * level it can't use, the server too full for another session, or the same
 * player come in from another tab (a duplicated tab carries the token along),
 * or too many links or sessions from one address (SERVER.linksPerIp, sessionsPerIp).
 * The socket then closes with closeCode(reason), for the logs.
 */
const REJECTIONS = ['version', 'no-session', 'ended', 'full', 'bad-save', 'bad-level', 'busy', 'replaced', 'too-many'] as const;
export type Rejection = (typeof REJECTIONS)[number];
export const closeCode = (r: Rejection) => 4001 + REJECTIONS.indexOf(r);
/** What the server answers a plain GET at /ws (no WebSocket): the game asks when it can't connect (net/diagnostics.ts). */
export const HELLO = `roof server · protocol ${PROTOCOL}`;

/** What a player is doing, as they say: playing, away (their game is hidden: minimized, another tab), in the menu (paused), or idle (nothing pressed for NET.idleAfter s). */
const ACTIVITIES = ['here', 'away', 'menu', 'idle'] as const;
export type Activity = (typeof ACTIVITIES)[number];
/** A player as the others see them: what they're doing, or dropped (their link is gone; they may come back). */
export type Presence = Activity | 'dropped';

/** Game -> server. */
export type ToServer =
  /** Start a session on this level, at this PAINT DETAIL, from a paint save (`bytes`) or clean. `table`: this client's surfaceTable of the level. */
  | { type: 'host'; protocol: number; table: string; name: string; levelName: string; level: LevelData; detail: number; bytes?: Uint8Array }
  /** Join by code; with the `token` from an earlier welcome, as the same player (a reconnect). */
  | { type: 'join'; protocol: number; name: string; code: string; token?: string }
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
  | { type: 'welcome'; code: string; you: number; token: string; levelName: string; level: LevelData; detail: number; table: string; players: { id: number; name: string; state: Presence }[]; ladders: { id: number; data: PropData }[]; inventory: InventoryData | null; parts: number; acked: number }
  | { type: 'rejected'; reason: Rejection }
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
  switch (m.type) {
    case 'host':
      return isInt(v.protocol) && typeof v.table === 'string' && isName(v.name) && typeof v.levelName === 'string' && v.levelName.length <= 64 && !levelProblem(v.level, MAX_PROPS) && DETAILS.includes(v.detail as number) ? (m as ToServer) : null;
    case 'join':
      return isInt(v.protocol) && isName(v.name) && isCode(v.code) && (v.token === undefined || typeof v.token === 'string') && !m.bytes ? (m as ToServer) : null;
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
const isCode = (x: unknown) => typeof x === 'string' && x.length === CODE_LENGTH && [...x].every((c) => CODE_LETTERS.includes(c));
/** Shape and size only: the game takes from it what it knows (Inventory.restore). */
const isWords = (x: unknown) => Array.isArray(x) && x.length <= 32 && x.every((w) => typeof w === 'string' && w.length <= 32);
const isInventory = (x: unknown) => isObj(x) && isWords(x.tools) && isWords(x.colors) && isWords(x.caps) && isInt(x.selected) && isWords([x.color, x.cap]);
/** Only a stepladder: a player places nothing else while playing. */
const isLadder = (x: unknown) => isObj(x) && x.type === 'stepladder' && isV3(x.pos) && (x.rot === undefined || isInt(x.rot));
