import * as THREE from 'three';
import { COLORS, INK, ROLLER, type CapId, type PaintColor } from '../config';
import { canShape, capSeat, capShape, ladderShape, markerShape, rollerShape, spongeShape } from '../tools/shapes';
import type { PickupKind } from '../inventory/items';

// Pickup look, inked: the item hovers and spins, tilted, inside a drawn ring
// (a solid one and a dashed one inside it), so it reads from far away. Only
// paint and caps are in color (a color pickup's label and ring, a cap); the
// rest is ink, and so is every other ring.

let ringTexture: THREE.Texture | null = null;
function ring() {
  if (ringTexture) return ringTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  // A dashed inner ring, like a pen going round twice.
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.stroke();
  ringTexture = new THREE.CanvasTexture(c);
  return ringTexture;
}

export function glowColor(kind: PickupKind) {
  const [k, a] = kind.split(':');
  return k === 'color' ? COLORS[a as PaintColor] : INK.ink;
}

const basic = (color: string) => new THREE.MeshBasicMaterial({ color });
/** A tool's paint part (marker band, roller cover) on a pickup: no paint yet. */
const PAPER = '#e8e8e8';

/**
 * The spinning item itself: its tool model (tools/shapes.ts) at twice real
 * size, centered and leaning, in flat colors. A color unlock is a can with
 * that label and a standard cap; a cap shows its own color.
 */
export function itemModel(kind: PickupKind): THREE.Group {
  const [k, a] = kind.split(':');
  const look = { tone: basic, color: basic, paint: basic(k === 'color' ? COLORS[a as PaintColor] : PAPER) };
  let shape: THREE.Object3D;
  if (k === 'color') {
    shape = canShape(look);
    const cap = capShape('standard', look).group;
    cap.position.y = capSeat();
    shape.add(cap);
  } else if (k === 'cap') shape = capShape(a as CapId, look).group;
  else if (k === 'ladder') shape = ladderShape(look);
  else if (k === 'roller') shape = rollerShape(look, ROLLER.width).group;
  else if (k === 'sponge') {
    // Turned to show its pad.
    shape = spongeShape(look);
    shape.rotation.set(0.3, 0.4, 0);
  } else shape = markerShape(look);
  shape.position.sub(new THREE.Box3().setFromObject(shape).getCenter(new THREE.Vector3()));
  const g = new THREE.Group();
  g.add(shape);
  // Every item leans a little, like it was tossed there.
  g.rotation.z = 0.5;
  g.scale.setScalar(2);
  return g;
}

const noRaycast = () => {};

/** The ring around the item, always facing the camera. */
export function halo(color: string) {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ring(), color, transparent: true, depthWrite: false }));
  halo.raycast = noRaycast;
  return halo;
}
