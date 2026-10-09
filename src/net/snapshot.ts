import * as THREE from 'three';
import { COLOR_ORDER, type PaintColor } from '../config';
import type { AvatarAction } from '../avatar/pose';
import { SLOTS, type Inventory, type Tool } from '../inventory/inventory';
import type { Player } from '../player';
import type { Tools } from '../tools/tools';
import { SNAPSHOT_BYTES } from './protocol';

// What a player sends about themselves, NET.sendRate times a second
// (docs/multiplayer-audit.md 2.3): where their feet are, where they look, a few
// state flags, the tool in hand and what it's doing, the paint color. 23 bytes.
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
}

const ACTIONS: AvatarAction[] = [null, 'spray', 'shake', 'roll', 'scrub'];
const TAU = Math.PI * 2;

/** This player now. */
export function capture(t: number, player: Player, inventory: Inventory, tools: Tools): Snapshot {
  return { t, pos: player.position.clone(), yaw: player.yaw, pitch: player.pitch, onGround: player.onGround, onLadder: player.onLadder, crouched: player.crouched, tool: inventory.tool, action: tools.action, color: inventory.color };
}

export function encodeSnapshot(s: Snapshot) {
  const b = new Uint8Array(SNAPSHOT_BYTES);
  const v = new DataView(b.buffer);
  v.setFloat32(0, s.t, true);
  v.setFloat32(4, s.pos.x, true);
  v.setFloat32(8, s.pos.y, true);
  v.setFloat32(12, s.pos.z, true);
  // Yaw all the way round in 16 bits, pitch (-90..90 degrees) in 16 signed bits.
  v.setUint16(16, Math.round((((s.yaw % TAU) + TAU) % TAU) * (65535 / TAU)), true);
  v.setInt16(18, Math.round((s.pitch / (Math.PI / 2)) * 32767), true);
  b[20] = (s.onGround ? 1 : 0) | (s.onLadder ? 2 : 0) | (s.crouched ? 4 : 0);
  b[21] = (s.tool ? SLOTS.indexOf(s.tool) + 1 : 0) | (ACTIONS.indexOf(s.action) << 3);
  b[22] = COLOR_ORDER.indexOf(s.color);
  return b;
}

export function decodeSnapshot(b: Uint8Array): Snapshot {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tool = b[21] & 7;
  return {
    t: v.getFloat32(0, true),
    pos: new THREE.Vector3(v.getFloat32(4, true), v.getFloat32(8, true), v.getFloat32(12, true)),
    yaw: v.getUint16(16, true) * (TAU / 65535),
    pitch: v.getInt16(18, true) * (Math.PI / 2 / 32767),
    onGround: !!(b[20] & 1),
    onLadder: !!(b[20] & 2),
    crouched: !!(b[20] & 4),
    tool: tool ? SLOTS[tool - 1] : null,
    action: ACTIONS[b[21] >> 3] ?? null,
    color: COLOR_ORDER[b[22]] ?? 'black',
  };
}
