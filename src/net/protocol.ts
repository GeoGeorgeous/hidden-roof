import type { InventoryData } from '../inventory/inventory';
import type { LevelData, PropData } from '../level/level';
import type { PaintOp } from '../paint-ops';

// The messages between the game and the multiplayer server (server/), over a
// WebSocket. Each is one binary frame: a u32 (little-endian) length, that many
// bytes of JSON, then the message's `bytes`, if any (a player snapshot, a paint
// file). Paint ops travel as JSON, so their numbers arrive exactly and every
// client paints the very same texels. Nothing is compressed by the socket:
// full-precision numbers barely shrink, and the server would deflate every op
// once per player (with 20 painting, more than a core). Only type imports here: Node runs this file as is
// (scripts/protocol.test.mjs), and the server reads untrusted messages
// through checkToServer.

/** Bumped when a message changes or anything the server runs for a session does (paint, drips, face keys, the save format): docs/multiplayer-audit.md, section 4. */
export const PROTOCOL = 4;
export const NAME_MAX = 16;
/** Session codes: this many letters from CODE_LETTERS (no I or O, which read as 1 and 0). */
export const CODE_LENGTH = 5;
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** The PAINT DETAILs a host may pick (texels per meter, settings.ts). */
const DETAILS = [24, 48, 72, 96];
/** Player snapshot size (net/snapshot.ts). */
export const SNAPSHOT_BYTES = 23;
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

/** A player as the others see them: playing, away (their game is hidden: minimized, another tab), or dropped (their link is gone; they may come back). */
export type Presence = 'here' | 'away' | 'dropped';

/** Game -> server. */
export type ToServer =
  /** Start a session on this level, at this PAINT DETAIL, from a paint save (`bytes`) or clean. `table`: this client's surfaceTable of the level. */
  | { type: 'host'; protocol: number; table: string; name: string; levelName: string; level: LevelData; detail: number; bytes?: Uint8Array }
  /** Join by code; with the `token` from an earlier welcome, as the same player (a reconnect). */
  | { type: 'join'; protocol: number; name: string; code: string; token?: string }
  /** This player now (net/snapshot.ts). */
  | { type: 'state'; bytes: Uint8Array }
  /** Paint ops, each made at the sender's time t[i] (the snapshots' clock). */
  | { type: 'ops'; t: number[]; ops: PaintOp[] }
  /** Their stepladder placed, or taken away (null), at their time `t`. */
  | { type: 'ladder'; t: number; data: PropData | null }
  /** The session's paint as a paint file, please (SAVE). */
  | { type: 'save' }
  /** What they carry, whenever it changes: given back when they come back. */
  | { type: 'inventory'; data: InventoryData }
  /** Their game is hidden (minimized, another tab) or shown again. */
  | { type: 'away'; away: boolean }
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
   * it's the save this host sent).
   */
  | { type: 'welcome'; code: string; you: number; token: string; levelName: string; level: LevelData; detail: number; table: string; players: { id: number; name: string; state: Presence }[]; ladders: { id: number; data: PropData }[]; inventory: InventoryData | null; parts: number }
  | { type: 'rejected'; reason: Rejection }
  | { type: 'joined'; id: number; name: string }
  | { type: 'left'; id: number }
  | { type: 'presence'; id: number; state: Presence }
  | { type: 'state'; id: number; bytes: Uint8Array }
  | { type: 'ops'; id: number; t: number[]; ops: PaintOp[] }
  /** Ops painted since the paint file of this welcome was read: painted at once, after it. */
  | { type: 'paint'; ops: PaintOp[] }
  | { type: 'ladder'; id: number; t: number; data: PropData | null }
  /** The session's paint as a paint file in `parts` parts that follow (SAVE); none: the server can't make one now. */
  | { type: 'save'; parts: number }
  /** A piece of the paint file a welcome or a save announced (partFrames). */
  | { type: 'part'; bytes: Uint8Array }
  /** Sent every few seconds, so a client notices a dead link. */
  | { type: 'ping' }
  | { type: 'pong'; t: number };

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
  if (!isObject(msg) || typeof msg.type !== 'string') return null;
  const m = msg as Message;
  if (4 + n < frame.length) m.bytes = frame.subarray(4 + n);
  return m;
}

/**
 * A message from a game as the server may act on it, or null. Paint ops are
 * checked for shape only: their surfaces are the session's to check. Their
 * sizes need no limit, since paint is clipped to the face it's on.
 */
export function checkToServer(m: Message | null): ToServer | null {
  if (!m) return null;
  const v = m as Record<string, unknown>;
  switch (m.type) {
    case 'host':
      return isInt(v.protocol) && typeof v.table === 'string' && isName(v.name) && typeof v.levelName === 'string' && v.levelName.length <= 64 && isLevel(v.level) && DETAILS.includes(v.detail as number) ? (m as ToServer) : null;
    case 'join':
      return isInt(v.protocol) && isName(v.name) && isCode(v.code) && (v.token === undefined || typeof v.token === 'string') && !m.bytes ? (m as ToServer) : null;
    case 'state':
      return m.bytes?.length === SNAPSHOT_BYTES ? (m as ToServer) : null;
    case 'ops':
      return Array.isArray(v.t) && Array.isArray(v.ops) && v.t.length === v.ops.length && v.t.every(isNum) && v.ops.every(isOp) ? (m as ToServer) : null;
    case 'ladder':
      return isNum(v.t) && (v.data === null || isLadder(v.data)) ? (m as ToServer) : null;
    case 'ping':
      return isNum(v.t) ? (m as ToServer) : null;
    case 'inventory':
      return isInventory(v.data) ? (m as ToServer) : null;
    case 'away':
      return typeof v.away === 'boolean' ? (m as ToServer) : null;
    case 'save':
    case 'leave':
      return m as ToServer;
  }
  return null;
}

/** The name as shown: trimmed, at most NAME_MAX characters. */
export function cleanName(name: string) {
  return Array.from(name.trim()).slice(0, NAME_MAX).join('');
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isName = (x: unknown) => typeof x === 'string' && cleanName(x).length > 0;
const isCode = (x: unknown) => typeof x === 'string' && x.length === CODE_LENGTH && [...x].every((c) => CODE_LETTERS.includes(c));
const isV3 = (x: unknown) => Array.isArray(x) && x.length === 3 && x.every(isNum);
const isRgb = (x: unknown) => isV3(x) && (x as number[]).every((c) => c >= 0 && c <= 1);
const isLevel = (x: unknown) => isObject(x) && isObject(x.spawn) && Array.isArray(x.props) && x.props.length <= MAX_PROPS && x.props.every(isProp);
/** A level's prop as Level.load reads it (level.ts PropData). */
const isProp = (x: unknown) =>
  isObject(x) &&
  typeof x.type === 'string' &&
  isV3(x.pos) &&
  (x.id === undefined || isInt(x.id)) &&
  (x.rot === undefined || isInt(x.rot)) &&
  (x.variant === undefined || typeof x.variant === 'string') &&
  (x.adjust === undefined || isNum(x.adjust)) &&
  (x.text === undefined || typeof x.text === 'string') &&
  (x.finish === undefined || isObject(x.finish)) &&
  (x.mirror === undefined || typeof x.mirror === 'boolean');
/** Shape and size only: the game takes from it what it knows (Inventory.restore). */
const isWords = (x: unknown) => Array.isArray(x) && x.length <= 32 && x.every((w) => typeof w === 'string' && w.length <= 32);
const isInventory = (x: unknown) => isObject(x) && isWords(x.tools) && isWords(x.colors) && isWords(x.caps) && isInt(x.selected) && isWords([x.color, x.cap]);
/** Only a stepladder: a player places nothing else while playing. */
const isLadder = (x: unknown) => isObject(x) && x.type === 'stepladder' && isV3(x.pos) && (x.rot === undefined || isInt(x.rot));

function isOp(x: unknown): x is PaintOp {
  if (!isObject(x) || typeof x.key !== 'string' || !isInt(x.rect) || !isNum(x.u) || !isNum(x.v)) return false;
  switch (x.kind) {
    case 'stamp':
      return isNum(x.radius) && isNum(x.amount) && (x.color === null || isRgb(x.color)) && isNum(x.softness) && typeof x.square === 'boolean';
    case 'roll':
      return isV3(x.axis) && isNum(x.halfLength) && isNum(x.halfWidth) && isNum(x.edge) && isNum(x.amount) && isRgb(x.color);
    case 'drip':
      // A run with no length or speed would never end.
      return isNum(x.length) && x.length > 0 && isNum(x.speed) && x.speed > 0 && isRgb(x.rgb);
  }
  return false;
}
