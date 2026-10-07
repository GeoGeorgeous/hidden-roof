import * as THREE from 'three';
import { CAPS, MODELS, type CapId } from '../config';
import { lcg } from '../lcg';
import { segment } from '../spray/hands';
import { inkify } from '../render/ink/tone';

// Every tool's shape, from MODELS at real size, shared by the first-person
// view (inked, with the hand added), the pickups and hotbar icons (flat
// colors) and the figure's hand. Each is centered on its own axis, up along +y,
// front (the side toward the wall) along -z. Ink tones (grays before the ink)
// are here; only the paint shows color, and each cap its own.

/** How a shape's parts are drawn: `tone` for an ink part (a gray before the ink), `color` for one that keeps its color, `paint` for the part showing the paint color. */
export interface Look {
  tone: (hex: string) => THREE.Material;
  color: (hex: string) => THREE.Material;
  paint: THREE.Material;
}

const inked = new Map<string, THREE.Material>();
/** First-person look: inked like the world (one material per tone, kept); `paint` keeps its color. */
export function inkLook(paint: THREE.Material): Look {
  const get = (hex: string, keep: boolean) => {
    const key = `${hex}${keep ? '!' : ''}`;
    let m = inked.get(key);
    if (!m) inked.set(key, (m = inkify(new THREE.MeshLambertMaterial({ color: hex }), keep)));
    return m;
  };
  return { tone: (hex) => get(hex, false), color: (hex) => get(hex, true), paint };
}

/** Bumped when a model changes in F3, so cached copies (the figure's tool) rebuild. */
export const shapes = { version: 0 };

const SILVER = '#d8d8d8';
const METAL = '#cfcfcf';
const DARK = '#1a1a1e';
const TREAD = '#9aa0a6';
const SPONGE_SOFT = '#c4c4c4';
const SPONGE_PAD = '#3a3a40';

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  return m;
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The shoulder's height, as a share of the can's. */
const SHOULDER = 0.025 / 0.17;
/** Height of the can's top (where the cap sits) above its middle. */
const canTop = () => MODELS.can.height * (0.5 + SHOULDER);
/** Where a cap stands on the can, above its middle: sunk a little into the shoulder. */
export const capSeat = () => canTop() - 0.0021;

/** The can, without its cap: shell, paint label, shoulder. */
export function canShape(look: Look) {
  const { width, height: h, labelHeight } = MODELS.can;
  const r = width / 2;
  const shoulder = h * SHOULDER;
  const g = new THREE.Group();
  g.add(
    mesh(new THREE.CylinderGeometry(r, r, h, 12), look.tone(SILVER)),
    mesh(new THREE.CylinderGeometry(r + 0.0005, r + 0.0005, labelHeight, 12), look.paint, -h * (0.01 / 0.17)),
    mesh(new THREE.CylinderGeometry(r * 0.55, r, shoulder, 12), look.tone('#c0c0c0'), (h + shoulder) / 2),
  );
  return g;
}

/** A cap in its color, standing on y = 0, the nozzle at its front; `tip` is where paint leaves. */
export function capShape(cap: CapId, look: Look) {
  const { width, height } = MODELS.cap;
  const n = CAPS[cap].nozzle;
  const group = new THREE.Group();
  const nozzle = mesh(new THREE.BoxGeometry(n, n, 0.006), look.tone('#202020'), height / 2 + 0.002);
  nozzle.position.z = -width / 2;
  const tip = new THREE.Object3D();
  tip.position.set(0, nozzle.position.y, -width / 2 - 0.003);
  group.add(mesh(new THREE.CylinderGeometry(width / 2, width / 2, height, 8), look.color(CAPS[cap].color), height / 2), nozzle, tip);
  return { group, tip };
}

/** The marker along +y, nib up: barrel, paint band, collar, square paint nib. */
export function markerShape(look: Look) {
  const { width, length: l, bandLength, nibSize } = MODELS.marker;
  const r = width / 2;
  const dark = look.tone(DARK);
  const g = new THREE.Group();
  const nib = mesh(new THREE.BoxGeometry(nibSize, 0.016, nibSize), look.paint, l / 2 + 0.018);
  g.add(
    mesh(new THREE.CylinderGeometry(r, r, l, 10), dark),
    mesh(new THREE.CylinderGeometry(r + 0.0005, r + 0.0005, bandLength, 10), look.paint, l * 0.154),
    mesh(new THREE.CylinderGeometry(r * 0.73, r, 0.012, 10), dark, l / 2 + 0.006),
    nib,
  );
  return g;
}

/**
 * The roller, `length` wide: the paint cover along x on the axle (y = 0), its
 * seam showing it turn, then a bent wire frame out of the right end and down
 * into a short pole. `cover` is what spins.
 */
export function rollerShape(look: Look, length: number) {
  const { coverThickness, frameThickness: wire, poleLength } = MODELS.roller;
  const r = coverThickness / 2;
  const metal = look.tone(METAL);
  const group = new THREE.Group();
  const cover = new THREE.Group();
  const roll = mesh(new THREE.CylinderGeometry(r, r, length, 16), look.paint);
  roll.rotation.z = Math.PI / 2;
  cover.add(roll, mesh(new THREE.BoxGeometry(length * 0.98, 0.006, 0.006), look.tone(DARK), r));
  const end = length / 2;
  for (const x of [-end - 0.004, end + 0.004]) {
    const cap = mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.008, 10), metal);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = x;
    cover.add(cap);
  }
  const w = end + 0.025;
  group.add(
    cover,
    segment(V(end, 0, 0), V(w, 0, 0), wire, metal),
    segment(V(w, 0, 0), V(w, -0.09, 0), wire, metal),
    segment(V(w, -0.09, 0), V(0, -0.2, 0), wire, metal),
    segment(V(0, -0.2, 0), V(0, -0.24, 0), wire * 1.75, metal), // ferrule
    segment(V(0, -0.24, 0), V(0, -0.24 - poleLength, 0), 0.026, look.tone(DARK)),
  );
  return { group, cover };
}

/**
 * The stepladder folded: the front frame (-z) with its treads and the back one
 * braced, hinged together at the top cap and a little apart at the feet.
 */
export function ladderShape(look: Look) {
  const { height: h, width, treadSpacing } = MODELS.ladder;
  const metal = look.tone(METAL);
  const tread = look.tone(TREAD);
  const top = h * 0.445;
  const bottom = top - h;
  const x = width / 2;
  const z = (frame: number, y: number) => frame * (0.006 + ((top - y) / h) * 0.03);
  const g = new THREE.Group();
  for (const frame of [-1, 1]) for (const s of [-x, x]) g.add(segment(V(s, bottom, z(frame, bottom)), V(s, top, z(frame, top)), 0.01, metal));
  for (let y = bottom + 0.08; y <= top - 0.08 + 1e-6; y += Math.max(0.02, treadSpacing)) {
    const t = mesh(new THREE.BoxGeometry(width, 0.006, 0.018), tread, y);
    t.position.z = z(-1, y) - 0.004;
    g.add(t);
  }
  g.add(
    segment(V(-x, bottom + 0.04, z(1, bottom + 0.04)), V(x, top - 0.06, z(1, top - 0.06)), 0.006, metal),
    mesh(new THREE.BoxGeometry(width + 0.02, 0.012, 0.036), tread, top + 0.005),
  );
  return g;
}

/**
 * A kitchen sponge: a soft block with a darker scouring pad on its front and
 * pores dotted over the soft part's back, top and sides, always in the same places.
 */
export function spongeShape(look: Look) {
  const m = MODELS.sponge;
  const soft = look.tone(SPONGE_SOFT);
  const pad = look.tone(SPONGE_PAD);
  const g = new THREE.Group();
  const pd = Math.min(m.padThickness, m.depth * 0.8);
  const body = new THREE.Mesh(new THREE.BoxGeometry(m.width, m.height, m.depth - pd), soft);
  body.position.z = pd / 2;
  g.add(body);
  if (pd > 0) {
    const scour = new THREE.Mesh(new THREE.BoxGeometry(m.width, m.height, pd), pad);
    scour.position.z = -(m.depth - pd) / 2;
    g.add(scour);
  }
  // Pores: small dark dents on the back (+z), top (+y) and the two ends (±x).
  const rnd = lcg(7);
  const pore = new THREE.BoxGeometry(m.poreSize, m.poreSize, m.poreSize);
  const w = m.width / 2;
  const h = m.height / 2;
  const back = m.depth / 2;
  const inset = m.poreSize * 0.3;
  for (let i = 0; i < m.pores; i++) {
    const p = new THREE.Mesh(pore, pad);
    const a = rnd() * 2 - 1;
    const b = rnd() * 2 - 1;
    const face = i % 4;
    if (face < 2) p.position.set(a * (w - m.poreSize), b * (h - m.poreSize), back - inset); // back, twice as many
    else if (face === 2) p.position.set(a * (w - m.poreSize), h - inset, pd / 2 + b * (back - pd / 2 - m.poreSize));
    else p.position.set((b > 0 ? 1 : -1) * (w - inset), a * (h - m.poreSize), pd / 2 + rnd() * (back - pd / 2 - m.poreSize));
    g.add(p);
  }
  return g;
}

/** Drop a built shape's geometries (materials are the caller's). */
export function disposeShape(o: THREE.Object3D) {
  o.removeFromParent();
  o.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
}
