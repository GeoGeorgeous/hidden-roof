import * as THREE from 'three';
import { COLORS, INK, type PaintColor } from '../config';
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
  if (k === 'color') {
    // Color unlock: a can with that label.
    const h = 0.17;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, h, 12), basic('#cfcfcf'));
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, h * 0.55, 12), basic(COLORS[a as PaintColor]));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.03, 0.03, 12), basic('#e8e8e8'));
    top.position.y = h / 2 + 0.015;
    g.add(body, label, top);
  } else if (k === 'cap') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.028, 12), basic('#e8e8e8'));
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(a === 'spray' ? 0.014 : 0.008, 0.008, 0.008), basic('#202020'));
    nozzle.position.set(0, 0.004, 0.018);
    g.add(cap, nozzle);
    g.scale.setScalar(2.2);
  } else if (k === 'ladder') {
    // A small stepladder: two leaning frames and a few treads.
    const frame = (z: number, lean: number) => {
      for (const x of [-0.05, 0.05]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.2, 0.008), basic('#cfcfcf'));
        leg.position.set(x, 0, z);
        leg.rotation.x = lean;
        g.add(leg);
      }
    };
    frame(-0.025, 0.25);
    frame(0.025, -0.25);
    for (const y of [-0.05, 0, 0.05]) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.006, 0.014), basic('#9aa0a6'));
      tread.position.set(0, y, -0.025 + y * 0.26);
      g.add(tread);
    }
    g.scale.setScalar(1.6);
  } else if (k === 'roller') {
    // A wide graffiti roller: a long fat cover on a bent wire frame and a short pole.
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 14), basic('#e8e8e8'));
    cover.rotation.z = Math.PI / 2;
    cover.position.y = 0.09;
    const wire = (x0: number, y0: number, x1: number, y1: number) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.006, len, 0.006), basic('#cfcfcf'));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      m.rotation.z = Math.atan2(x0 - x1, y1 - y0);
      g.add(m);
    };
    wire(0.1, 0.09, 0.112, 0.09);
    wire(0.112, 0.09, 0.112, 0.045);
    wire(0.112, 0.045, 0, -0.01);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 10), basic('#1a1a1e'));
    pole.position.y = -0.075;
    g.add(cover, pole);
    g.scale.setScalar(1.4);
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
