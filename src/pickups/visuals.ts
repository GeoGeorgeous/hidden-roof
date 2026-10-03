import * as THREE from 'three';
import { CAN_SIZES, CAPS, COLORS, type CanSize, type CapId, type PaintColor } from '../config';
import type { PickupKind } from '../inventory/items';

// GTA4-style pickup look: the item hovers and spins above a soft ground glow,
// with an additive halo so it reads from far away.

const capColor = (id: string) => CAPS[id as CapId]?.color ?? '#ffffff';

let glowTexture: THREE.Texture | null = null;
function glow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

export function glowColor(kind: PickupKind) {
  const [k, a] = kind.split(':');
  if (k === 'color') return a === 'black' ? '#9fd0ff' : COLORS[a as PaintColor];
  if (k === 'can') return '#ffffff';
  if (k === 'cap') return capColor(a);
  return '#ffe066';
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
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.028, 12), basic(capColor(a)));
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(a === 'spray' ? 0.014 : 0.008, 0.008, 0.008), basic('#202020'));
    nozzle.position.set(0, 0.004, 0.018);
    g.add(cap, nozzle);
    g.scale.setScalar(2.2);
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 10), basic('#1a1a1e'));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.03, 10), basic('#e8e8e8'));
    band.position.y = 0.02;
    g.add(body, band);
    g.rotation.z = 0.5;
  }
  g.scale.multiplyScalar(2);
  return g;
}

const noRaycast = () => {};

export function groundGlow(color: string) {
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshBasicMaterial({ map: glow(), color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.03;
  disc.raycast = noRaycast;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(1.3);
  halo.raycast = noRaycast;
  return { disc, halo };
}
