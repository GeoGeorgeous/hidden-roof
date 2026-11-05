import * as THREE from 'three';
import { CAP_ORDER, COLOR_ORDER, type CapId, type PaintColor } from '../config';
import type { AvatarAction } from '../avatar/pose';
import type { Inventory } from '../inventory/inventory';
import { SLOTS, type Tool } from '../inventory/tool';
import type { Player } from '../player';
import type { Tools } from '../tools/tools';
import { SNAPSHOT_BYTES, SNAPSHOT_FEET as FEET, SNAPSHOT_REST as YAW, type Spot } from './protocol';

// What a player sends about themselves, NET.sendRate times a second:
// where their feet are, where they look, a few
// state flags, the tool in hand and what it's doing, the paint color and cap,
// how much paint comes out of the can (for the spray others see). 25 bytes.
// Velocity, footsteps and the eased crouch are derived on the other side;
// paint goes separately, as paint ops.

export interface Snapshot {
  /** Sender's clock (s). */
  t: number;
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  onLadder: boolean;
  crouched: boolean;
  tool: Tool | null;
  action: AvatarAction;
  color: PaintColor;
  cap: CapId;
  /** The can's flow (SprayTool.flow): how much comes out, for its plume; 0 when nothing does (another tool, not spraying). */
  flow: number;
}

const ACTIONS: AvatarAction[] = [null, 'spray', 'shake', 'roll', 'scrub'];
const TAU = Math.PI * 2;

/** This player now. */
export function capture(t: number, player: Player, inventory: Inventory, tools: Tools): Snapshot {
  return { t, pos: player.position.clone(), yaw: player.yaw, pitch: player.pitch, onGround: player.onGround, onLadder: player.onLadder, crouched: player.crouched, tool: inventory.tool, action: tools.action, color: inventory.color, cap: inventory.cap, flow: tools.spray.flow };
}

export function encodeSnapshot(s: Snapshot) {
  const b = new Uint8Array(SNAPSHOT_BYTES);
  const v = new DataView(b.buffer);
  v.setFloat32(0, s.t, true);
  v.setFloat32(FEET, s.pos.x, true);
  v.setFloat32(FEET + 4, s.pos.y, true);
  v.setFloat32(FEET + 8, s.pos.z, true);
  // Yaw all the way round in 16 bits, pitch (-90..90 degrees) in 16 signed bits.
  v.setUint16(YAW, Math.round((((s.yaw % TAU) + TAU) % TAU) * (65535 / TAU)), true);
  v.setInt16(18, Math.round((s.pitch / (Math.PI / 2)) * 32767), true);
  b[20] = (s.onGround ? 1 : 0) | (s.onLadder ? 2 : 0) | (s.crouched ? 4 : 0);
  // The tool in 3 bits: SLOTS has at most 7 (inventory/tool.ts).
  b[21] = (s.tool ? SLOTS.indexOf(s.tool) + 1 : 0) | (ACTIONS.indexOf(s.action) << 3);
  b[22] = COLOR_ORDER.indexOf(s.color);
  b[23] = CAP_ORDER.indexOf(s.cap);
  b[24] = Math.round(Math.min(1, Math.max(0, s.flow)) * 255);
  return b;
}

/** Snapshot `b`, a copy, with its time moved on by `s` seconds. */
export function snapshotLater(b: Uint8Array, s: number) {
  const later = new Uint8Array(b);
  const v = new DataView(later.buffer);
  v.setFloat32(0, v.getFloat32(0, true) + s, true);
  return later;
}

/** Where a snapshot puts its sender (the server keeps it for a player who comes back). */
export function snapshotSpot(b: Uint8Array): Spot {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { pos: [v.getFloat32(FEET, true), v.getFloat32(FEET + 4, true), v.getFloat32(FEET + 8, true)], yaw: v.getUint16(YAW, true) * (TAU / 65535) };
}

export function decodeSnapshot(b: Uint8Array): Snapshot {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tool = b[21] & 7;
  const { pos, yaw } = snapshotSpot(b);
  return {
    t: v.getFloat32(0, true),
    pos: new THREE.Vector3(...pos),
    yaw,
    pitch: v.getInt16(18, true) * (Math.PI / 2 / 32767),
    onGround: !!(b[20] & 1),
    onLadder: !!(b[20] & 2),
    crouched: !!(b[20] & 4),
    tool: tool ? SLOTS[tool - 1] : null,
    action: ACTIONS[b[21] >> 3] ?? null,
    color: COLOR_ORDER[b[22]] ?? 'black',
    cap: CAP_ORDER[b[23]] ?? 'standard',
    flow: b[24] / 255,
  };
}
