import type { CityMesh, V3 } from './mesh';
import type { Lines } from './lines';
import type { Rect, Tier, Tower } from './layout';
import { cityTextRect } from '../render/ink/city-text';

// Rooftop clutter, packed like the roofs of a pen-and-ink megacity: stair
// cores, water tanks on lattice legs, rows of AC units, billboard frames,
// lattice masts with guy wires, now and then a crane; railings, ladders and
// pipe runs dropping down the facades; signs with made-up lettering on the
// roofs and hanging off the walls. Volumes go into the city mesh (signs into
// their own, drawn with the city text atlas), thin steel into pen lines. Less
// detail farther away (nothing beyond SKYLINE.clutterRange but the odd core).
// That only stops a tower's dressing early (a far core draws what a near one
// draws first), so a tower looks the same at every CITY DETAIL as far as both
// build it.

/** Line ranges (m) per kind of steel: small things vanish first. */
const NEAR_LINES = 140;
const MID_LINES = 320;
const FAR_LINES = 600;

class Roof {
  private used: Rect[] = [];
  constructor(
    readonly t: Tier,
    readonly rnd: () => number,
  ) {}

  /** Find a free w x d spot (with a 0.6 m gap), or null; `side` (0..3 = -z, +z, -x, +x) puts it against that roof edge. */
  place(w: number, d: number, side = -1): Rect | null {
    const { x0, z0, x1, z1 } = this.t;
    if (w > x1 - x0 - 1 || d > z1 - z0 - 1) return null;
    for (let i = 0; i < 10; i++) {
      let x = x0 + 0.5 + this.rnd() * (x1 - x0 - 1 - w);
      let z = z0 + 0.5 + this.rnd() * (z1 - z0 - 1 - d);
      if (side === 0) z = z0 + 0.3;
      if (side === 1) z = z1 - 0.3 - d;
      if (side === 2) x = x0 + 0.3;
      if (side === 3) x = x1 - 0.3 - w;
      const r: Rect = [x, z, x + w, z + d];
      if (this.used.every((u) => r[2] + 0.6 < u[0] || r[0] - 0.6 > u[2] || r[3] + 0.6 < u[1] || r[1] - 0.6 > u[3])) {
        this.used.push(r);
        return r;
      }
    }
    return null;
  }
}

/** `clutterRange`: SKYLINE.clutterRange (or the level's own). */
export function dressTower(tw: Tower, clutterRange: number, mesh: CityMesh, signs: CityMesh, lines: Lines) {
  const roof = tw.tiers[tw.tiers.length - 1];
  const rnd = tw.rnd;
  const y = roof.top;
  const lod = tw.dist < 130 ? 2 : tw.dist < clutterRange ? 1 : 0;
  const R = new Roof(roof, rnd);
  const cx = (roof.x0 + roof.x1) / 2;
  const cz = (roof.z0 + roof.z1) / 2;
  mesh.set(0.82, undefined, cx, cz);
  signs.set(0.85, undefined, cx, cz);

  // Stair / lift cores: on nearly every roof, even far away (they shape the silhouette).
  const cores = lod === 0 ? (rnd() < 0.6 ? 1 : 0) : 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < cores; i++) {
    const w = 3 + rnd() * 4;
    const d = 3 + rnd() * 3;
    const h = 3 + rnd() * 2.5;
    const r = R.place(w, d);
    if (!r) continue;
    mesh.set(0.78 + rnd() * 0.08);
    mesh.box(r[0], y, r[1], r[2], y + h, r[3]);
    if (lod === 2) {
      lines.style(0.9, NEAR_LINES).ladder(r[0] - 0.2, y, (r[1] + r[3]) / 2, h + 1, false);
      lines.railing(r[0], r[1], r[2], r[3], y + h, 0.9, 1.2);
    }
    if (lod >= 1 && rnd() < 0.5) {
      // A small tank or mast on the core.
      lines.style(0.85, MID_LINES).mast((r[0] + r[2]) / 2, y + h, (r[1] + r[3]) / 2, 4 + rnd() * 8, 0.6, 0.15, 1.2);
    }
  }
  if (lod === 0) return;

  // Water tanks on lattice legs.
  for (let i = Math.floor(rnd() * 4); i > 0; i--) {
    const rad = 0.9 + rnd() * 1.1;
    const r = R.place(rad * 2 + 0.4, rad * 2 + 0.4);
    if (!r) break;
    const tx = (r[0] + r[2]) / 2;
    const tz = (r[1] + r[3]) / 2;
    const legs = 1.2 + rnd() * 2.5;
    const h = 1.8 + rnd() * 2;
    mesh.set(0.84);
    mesh.cyl([tx, y + legs, tz], 'y', h, rad, lod === 2 ? 12 : 8);
    mesh.set(0.6);
    mesh.cyl([tx, y + legs + h, tz], 'y', 0.25, rad * 0.6, 8);
    const s = rad * 0.75;
    lines.style(1, MID_LINES).sized(legs * 1.5);
    const feet: V3[] = [[tx - s, y, tz - s], [tx + s, y, tz - s], [tx + s, y, tz + s], [tx - s, y, tz + s]];
    for (let k = 0; k < 4; k++) {
      const a = feet[k];
      const b = feet[(k + 1) % 4];
      lines.seg(a, [a[0], y + legs, a[2]]);
      lines.seg(a, [b[0], y + legs, b[2]]);
      lines.seg(b, [a[0], y + legs, a[2]]);
    }
  }

  // Horizontal tanks on saddles.
  if (rnd() < 0.35) {
    const len = 3 + rnd() * 4;
    const rad = 0.7 + rnd() * 0.5;
    const alongX = rnd() < 0.5;
    const r = R.place(alongX ? len : rad * 2, alongX ? rad * 2 : len);
    if (r) {
      mesh.set(0.86);
      const b: V3 = alongX ? [r[0], y + 0.5 + rad, (r[1] + r[3]) / 2] : [(r[0] + r[2]) / 2, y + 0.5 + rad, r[1]];
      mesh.cyl(b, alongX ? 'x' : 'z', len, rad, 10);
      mesh.set(0.5);
      for (const t of [0.2, 0.8]) {
        const sx = alongX ? r[0] + len * t : b[0];
        const sz = alongX ? b[2] : r[1] + len * t;
        mesh.box(sx - 0.2, y, sz - 0.2, sx + 0.2, y + 0.6 + rad * 0.5, sz + 0.2);
      }
    }
  }

  // Rows of AC units.
  for (let i = Math.floor(rnd() * 3); i > 0; i--) {
    const count = 2 + Math.floor(rnd() * 4);
    const alongX = rnd() < 0.5;
    const r = R.place(alongX ? count * 1.4 : 1.3, alongX ? 1.3 : count * 1.4);
    if (!r) break;
    for (let k = 0; k < count; k++) {
      const x = alongX ? r[0] + k * 1.4 : r[0];
      const z = alongX ? r[1] : r[1] + k * 1.4;
      mesh.set(0.88);
      mesh.box(x, y, z, x + 1.2, y + 0.95, z + 1.2);
      if (lod === 2) {
        mesh.set(0.12);
        mesh.cyl([x + 0.6, y + 0.95, z + 0.6], 'y', 0.04, 0.42, 8);
      }
    }
  }

  // Billboard on a lattice frame at the roof edge, mostly facing the level.
  if (rnd() < 0.6) {
    const w = 6 + rnd() * 12;
    const h = 3 + rnd() * 5;
    const lift = 1.5 + rnd() * 3;
    const [tx, tz] = tw.toward;
    const facing = Math.abs(tx) > Math.abs(tz) ? (tx < 0 ? 2 : 3) : tz < 0 ? 0 : 1;
    const side = rnd() < 0.75 ? facing : Math.floor(rnd() * 4);
    const alongX = side < 2;
    const r = R.place(alongX ? w : 1.4, alongX ? 1.4 : w, side);
    if (r) billboard(r, side, y, lift, h, mesh, signs, lines, lod, rnd);
  }

  // Lattice mast with guy wires.
  if (rnd() < 0.4) {
    const r = R.place(1.6, 1.6);
    if (r) {
      const mx = (r[0] + r[2]) / 2;
      const mz = (r[1] + r[3]) / 2;
      const h = 8 + rnd() * 22;
      lines.style(1, FAR_LINES).mast(mx, y, mz, h, 1.4, 0.3, 1.4);
      lines.style(0.6, MID_LINES).sized(h);
      for (const [gx, gz] of [[roof.x0, roof.z0], [roof.x1, roof.z0], [roof.x1, roof.z1], [roof.x0, roof.z1]]) lines.seg([mx, y + h * 0.7, mz], [gx, y, gz]);
      if (rnd() < 0.6) {
        mesh.set(0.85);
        mesh.cyl([mx, y + h * 0.6, mz + 0.3], 'z', 0.25, 0.7, 10);
      }
    }
  }

  // A crane now and then, over the tallest roofs.
  if (roof.top > 20 && rnd() < 0.12) crane(R, y, mesh, lines, rnd);

  if (lod < 2) return;
  // Railing round the roof, and pipe runs that drop down the facade.
  lines.style(0.85, NEAR_LINES).railing(roof.x0 + 0.2, roof.z0 + 0.2, roof.x1 - 0.2, roof.z1 - 0.2, y);
  lines.style(0.9, MID_LINES).sized(6);
  for (let i = Math.floor(rnd() * 4); i > 0; i--) {
    const side = Math.floor(rnd() * 4);
    const t = rnd();
    const px = side < 2 ? roof.x0 + (roof.x1 - roof.x0) * t : side === 2 ? roof.x0 - 0.3 : roof.x1 + 0.3;
    const pz = side >= 2 ? roof.z0 + (roof.z1 - roof.z0) * t : side === 0 ? roof.z0 - 0.3 : roof.z1 + 0.3;
    const drop = 10 + rnd() * 50;
    lines.path([[cx, y + 0.4, cz], [px, y + 0.4, pz], [px, y - drop, pz]]);
    lines.seg([px + 0.25, y + 0.4, pz + 0.25], [px + 0.25, y - drop, pz + 0.25]);
  }
  facadeClutter(tw, mesh, lines);
}

/** Signs on the walls: tall blade signs sticking out, flat shop signs lower down. */
export function wallSigns(tw: Tower, clutterRange: number, signs: CityMesh, lines: Lines) {
  if (tw.dist > clutterRange) return;
  const rnd = tw.rnd;
  const t = tw.tiers[0];
  const roofY = tw.tiers[tw.tiers.length - 1].top;
  const top = Math.min(t.top, roofY) - 2;
  const count = Math.floor(rnd() * (tw.dist < 150 ? 8 : 4));
  for (let i = 0; i < count; i++) {
    const side = Math.floor(rnd() * 4);
    const alongX = side < 2; // the wall runs along x
    const out = side % 2 ? 1 : -1;
    const len = alongX ? t.x1 - t.x0 : t.z1 - t.z0;
    const s = 0.5 + rnd() * Math.max(0, len - 1);
    const wx = alongX ? t.x0 + s : out < 0 ? t.x0 : t.x1;
    const wz = alongX ? (out < 0 ? t.z0 : t.z1) : t.z0 + s;
    signs.set(0.92, undefined, wx, wz);
    if (rnd() < 0.65) {
      // Blade sign: vertical, sticking out of the wall, lettering on both faces.
      const h = 6 + rnd() * 12;
      const w = 1.6 + rnd() * 1.6;
      const y0 = top - h - rnd() * Math.max(0, Math.min(40, top - h + 60));
      signs.letters(cityTextRect(rnd(), rnd(), h / w, true, rnd() < 0.45));
      const gap = 0.5;
      if (alongX) signs.box(wx - 0.18, y0, out < 0 ? wz - gap - w : wz + gap, wx + 0.18, y0 + h, out < 0 ? wz - gap : wz + gap + w, true);
      else signs.box(out < 0 ? wx - gap - w : wx + gap, y0, wz - 0.18, out < 0 ? wx - gap : wx + gap + w, y0 + h, wz + 0.18, true);
      // Brackets back to the wall.
      lines.style(0.9, 200).sized(2);
      for (const k of [0.15, 0.85]) {
        const yy = y0 + h * k;
        if (alongX) lines.seg([wx, yy, wz], [wx, yy, wz + out * (gap + w * 0.3)]);
        else lines.seg([wx, yy, wz], [wx + out * (gap + w * 0.3), yy, wz]);
      }
    } else {
      // Flat sign on the wall.
      const w = Math.min(len - 1, 3 + rnd() * 6);
      const h = 1 + rnd() * 1.2;
      const y0 = top - 3 - rnd() * 30;
      const a = Math.max(0.3, s - w / 2);
      signs.letters(cityTextRect(rnd(), rnd(), (w / h) * 0.8, false, rnd() < 0.5, rnd() < 0.3));
      if (alongX) signs.box(t.x0 + a, y0, out < 0 ? wz - 0.3 : wz, t.x0 + a + w, y0 + h, out < 0 ? wz : wz + 0.3, true);
      else signs.box(out < 0 ? wx - 0.3 : wx, y0, t.z0 + a, out < 0 ? wx : wx + 0.3, y0 + h, t.z0 + a + w, true);
    }
  }
}

/** Billboard against roof edge `side` (0..3 = -z, +z, -x, +x): the panel faces out, its frame stands behind it. */
function billboard(r: Rect, side: number, y: number, lift: number, h: number, mesh: CityMesh, signs: CityMesh, lines: Lines, lod: number, rnd: () => number) {
  const [x0, z0, x1, z1] = r;
  const alongX = side < 2;
  const len = alongX ? x1 - x0 : z1 - z0;
  // The panel's outer face, and the way into the roof.
  const outer = side === 0 ? z0 : side === 1 ? z1 : side === 2 ? x0 : x1;
  const inward = side % 2 ? -1 : 1;
  const across = (off: number) => outer + inward * off;
  signs.set(0.95).letters(cityTextRect(rnd(), rnd(), (len / h) * (0.7 + rnd() * 0.5), false, rnd() < 0.4, rnd() < 0.25));
  const [a, b] = [across(0), across(0.25)].sort((p, q) => p - q);
  if (alongX) signs.box(x0, y + lift, a, x1, y + lift + h, b);
  else signs.box(a, y + lift, z0, b, y + lift + h, z1);
  mesh.set(0.3);
  // Lamps on arms over the face.
  const [la, lb] = [across(-0.6), across(0.1)].sort((p, q) => p - q);
  for (let t = 1; t < len; t += 2.5) {
    if (alongX) mesh.box(x0 + t - 0.1, y + lift + h, la, x0 + t + 0.1, y + lift + h + 0.12, lb);
    else mesh.box(la, y + lift + h, z0 + t - 0.1, lb, y + lift + h + 0.12, z0 + t + 0.1);
  }
  lines.style(1, lod === 2 ? MID_LINES : FAR_LINES * 0.7);
  const n = Math.max(2, Math.round(len / 2));
  const back = 0.9;
  // Front and back frames, each a truss, tied together.
  const p = (t: number, yy: number, off: number): V3 => (alongX ? [x0 + t * len, yy, across(0.25 + off)] : [across(0.25 + off), yy, z0 + t * len]);
  lines.truss(p(0, y, 0), p(0, y + lift + h, 0), p(1, y, 0), p(1, y + lift + h, 0), n * 2);
  lines.truss(p(0, y, back), p(1, y, back), p(0, y + lift, back), p(1, y + lift, back), n);
  lines.sized(2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    lines.seg(p(t, y + lift, 0), p(t, y + lift, back));
    lines.seg(p(t, y, back), p(t, y + lift + h, 0));
  }
  if (lod === 2) {
    // Catwalk with a rail behind the panel.
    lines.seg(p(0, y + lift + 1.1, back), p(1, y + lift + 1.1, back));
  }
}

function crane(R: Roof, y: number, mesh: CityMesh, lines: Lines, rnd: () => number) {
  const r = R.place(2.4, 2.4);
  if (!r) return;
  const x = (r[0] + r[2]) / 2;
  const z = (r[1] + r[3]) / 2;
  const h = 18 + rnd() * 22;
  const ang = rnd() * Math.PI * 2;
  const jib = 20 + rnd() * 14;
  const counter = 7 + rnd() * 3;
  const dx = Math.cos(ang);
  const dz = Math.sin(ang);
  const top = y + h;
  lines.style(1, FAR_LINES).mast(x, y, z, h, 1.8, 1.8, 1.8);
  // Jib: a triangular girder, two rails low and one high.
  const ox = -dz * 0.7;
  const oz = dx * 0.7;
  const at = (d: number, yy: number, side: number): V3 => [x + dx * d + ox * side, yy, z + dz * d + oz * side];
  lines.truss(at(-counter, top, -1), at(jib, top, -1), at(-counter, top, 1), at(jib, top, 1), Math.round((jib + counter) / 1.8));
  lines.truss(at(-counter, top, 0), at(jib, top + 0.3, 0), at(-counter, top + 1.6, 0), at(jib * 0.9, top + 1.6, 0), Math.round((jib + counter) / 1.8));
  // Tie bars from the peak, hook cable.
  lines.sized(jib);
  lines.seg([x, top + 6, z], at(jib * 0.7, top + 1.6, 0));
  lines.seg([x, top + 6, z], at(-counter, top + 1.6, 0));
  lines.mast(x, top, z, 6, 1.6, 0.2, 1.5);
  const hook = jib * (0.4 + rnd() * 0.5);
  lines.seg(at(hook, top, 0), at(hook, top - 8 - rnd() * 15, 0));
  mesh.set(0.35);
  const cw = at(-counter + 1.5, top - 1.5, 0);
  mesh.box(cw[0] - 1.2, cw[1], cw[2] - 1.2, cw[0] + 1.2, cw[1] + 1.6, cw[2] + 1.2, true);
  mesh.set(0.85);
  mesh.box(x + 1, top - 2.4, z - 1, x + 2.8, top - 0.2, z + 1, true);
}

/** Boxes and lines on the walls of near towers: AC units, small signs' frames, balconies. */
function facadeClutter(tw: Tower, mesh: CityMesh, lines: Lines) {
  const rnd = tw.rnd;
  const t = tw.tiers[0];
  const roofY = tw.tiers[tw.tiers.length - 1].top;
  const lowY = Math.max(t.top - 70, -70);
  const faces: [number, number, number, number, number, number][] = [
    // x, z of the start, along-x?, length, outward nx, nz
    [t.x0, t.z0, 1, t.x1 - t.x0, 0, -1],
    [t.x0, t.z1, 1, t.x1 - t.x0, 0, 1],
    [t.x0, t.z0, 0, t.z1 - t.z0, -1, 0],
    [t.x1, t.z0, 0, t.z1 - t.z0, 1, 0],
  ];
  for (const [fx, fz, alongX, len, nx, nz] of faces) {
    const top = Math.min(t.top, roofY);
    const count = Math.floor(rnd() * 14);
    for (let i = 0; i < count; i++) {
      const s = 0.5 + rnd() * (len - 1.5);
      const yy = lowY + rnd() * (top - lowY - 2);
      const w = 0.7 + rnd() * 0.5;
      const d = 0.45 + rnd() * 0.25;
      const h = 0.5 + rnd() * 0.3;
      const x = alongX ? fx + s : fx;
      const z = alongX ? fz : fz + s;
      mesh.set(0.86);
      if (alongX) mesh.box(x, yy, nz < 0 ? z - d : z, x + w, yy + h, nz < 0 ? z : z + d, true);
      else mesh.box(nx < 0 ? x - d : x, yy, z, nx < 0 ? x : x + d, yy + h, z + w, true);
      // Bracket under it.
      lines.style(0.8, NEAR_LINES).sized(1);
      const bx = alongX ? x + w / 2 : nx < 0 ? x - d : x + d;
      const bz = alongX ? (nz < 0 ? z - d : z + d) : z + w / 2;
      lines.seg([bx, yy, bz], [alongX ? bx : x, yy - 0.5, alongX ? z : bz]);
    }
  }
}
