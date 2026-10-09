import * as THREE from 'three';
import { COLORS, INK, PICKUP, ROLLER, type CapId, type PaintColor } from '../config';
import { canShape, capSeat, capShape, ladderShape, markerShape, rollerShape, spongeShape } from '../tools/shapes';
import type { PickupKind } from '../inventory/items';

// Pickup look, inked: the item hovers and spins, tilted, inside a drawn ring
// (a solid one and a dashed one inside it), so it reads from far away. Only
// paint and caps are in color (a color pickup's label, ring and glow, a cap);
// the rest is ink, and so is every other ring.

const noRaycast = () => {};

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

let glowTexture: THREE.DataTexture | null = null;
/** A soft round falloff, the same in color and alpha (glowMaterial makes the rest). */
function glowMap() {
  if (glowTexture) return glowTexture;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const i = (y * n + x) * 4;
      data.fill(Math.round(Math.max(0, 1 - r * r) ** 2 * 255), i, i + 4);
    }
  glowTexture = new THREE.DataTexture(data, n, n);
  glowTexture.magFilter = THREE.LinearFilter;
  glowTexture.minFilter = THREE.LinearMipmapLinearFilter;
  glowTexture.generateMipmaps = true;
  glowTexture.needsUpdate = true;
  return glowTexture;
}

/**
 * Premultiplied, like a colored lamp's glow (render/light-fx.ts): its color
 * adds light, its opacity covers what's behind, so it shows in the dark and on
 * paper alike. Unfogged: the edge of the quad would turn paper-colored.
 */
function glowMaterial<M extends THREE.SpriteMaterial | THREE.MeshBasicMaterial>(m: M): M {
  return Object.assign(m, { map: glowMap(), transparent: true, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
}

/** A color pickup's glow: `light` around the item, `floor` on the ground under it, both in `color` (setGlow). */
export interface Glow {
  light: THREE.Sprite;
  floor: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  color: THREE.Color;
}

export function glow(color: string): Glow {
  const light = new THREE.Sprite(glowMaterial(new THREE.SpriteMaterial()));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMaterial(new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })));
  light.raycast = floor.raycast = noRaycast;
  return { light, floor, color: new THREE.Color(color) };
}

/** The glow at `k` (its strength and pulse) of its color. */
export function setGlow(g: Glow, k: number) {
  for (const m of [g.light.material, g.floor.material]) {
    m.color.copy(g.color).multiplyScalar(k);
    m.opacity = k * PICKUP.glow.cover;
  }
}

export function glowColor(kind: PickupKind) {
  const [k, a] = kind.split(':');
  return k === 'color' ? COLORS[a as PaintColor] : INK.ink;
}

const basic = (color: string) => new THREE.MeshBasicMaterial({ color });
/** A part a figure's tool keeps in color (held.ts): the can's label, its cap. */
const kept = (color: string) => Object.assign(basic(color), { userData: { keep: true } });
/** A tool's paint part (marker band, roller cover) on a pickup: no paint yet. */
const PAPER = '#e8e8e8';

/**
 * The spinning item itself: its tool model (tools/shapes.ts) at twice real
 * size, centered and leaning, in flat colors. A color unlock is a can with
 * that label and `cap` (a figure's can, held.ts: theirs); a cap shows its own color.
 */
export function itemModel(kind: PickupKind, cap: CapId = 'standard'): THREE.Group {
  const [k, a] = kind.split(':');
  const look = { tone: basic, color: kept, paint: k === 'color' ? kept(COLORS[a as PaintColor]) : basic(PAPER) };
  let shape: THREE.Object3D;
  if (k === 'color') {
    shape = canShape(look);
    const top = capShape(cap, look).group;
    top.position.y = capSeat();
    shape.add(top);
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

/** The ring around the item, always facing the camera. */
export function halo(color: string) {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ring(), color, transparent: true, depthWrite: false }));
  halo.raycast = noRaycast;
  return halo;
}
