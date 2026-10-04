import * as THREE from 'three';
import { CAN_SIZES, COLORS, INK, type CanSize, type PaintColor } from '../config';
import type { PickupKind } from '../inventory/items';

// Pickup look, inked: the item hovers and spins, tilted, inside a drawn ring
// (a solid one and a dashed one inside it), so it reads from far away. Only paint colors are in color (the ring of a color
// pickup); everything else is ink.

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

/** The spinning item itself, roughly 2x real size so it reads as a pickup. */
export function itemModel(kind: PickupKind): THREE.Group {
  const g = new THREE.Group();
  const [k, a] = kind.split(':');
  if (k === 'color' || k === 'can') {
    // Color unlock: a can with that label. Size upgrade: a bare silver can of that size.
    const h = 0.17 * (k === 'can' ? CAN_SIZES[a as CanSize].scale * 1.2 : 1);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, h, 12), basic('#cfcfcf'));
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, h * 0.55, 12), basic(k === 'color' ? COLORS[a as PaintColor] : '#9aa0a6'));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.03, 0.03, 12), basic('#e8e8e8'));
    top.position.y = h / 2 + 0.015;
    g.add(body, label, top);
  } else if (k === 'cap') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.028, 12), basic('#e8e8e8'));
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(a === 'spray' ? 0.014 : 0.008, 0.008, 0.008), basic('#202020'));
    nozzle.position.set(0, 0.004, 0.018);
    g.add(cap, nozzle);
    g.scale.setScalar(2.2);
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 10), basic('#1a1a1e'));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.03, 10), basic('#e8e8e8'));
    band.position.y = 0.02;
    g.add(body, band);
  }
  // Every item leans a little, like it was tossed there.
  g.rotation.z = 0.5;
  g.scale.multiplyScalar(2);
  return g;
}

const noRaycast = () => {};

/** The ring around the item, always facing the camera. */
export function halo(color: string) {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ring(), color, transparent: true, opacity: 0.7, depthWrite: false }));
  halo.scale.setScalar(1.3);
  halo.raycast = noRaycast;
  return halo;
}
