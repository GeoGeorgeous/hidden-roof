import * as THREE from 'three';
import { SKYLINE } from '../config';
import { FACADES, type Facade } from '../render/ink/facade';
import { lcg } from '../lcg';

// Where the city's towers stand: a street grid of blocks around the level,
// each block split into lots, one tower per lot. Near the level the roofs are
// mostly low (you look down into the canyons) with a few huge towers among
// them; farther out the city rises into a wall that fades into the paper.

export interface Tier {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Top of this tier; the next tier starts here. */
  top: number;
}

export interface Tower {
  /** From the street up; the last one is the roof. */
  tiers: Tier[];
  facade: Facade;
  /** Wall gray (sRGB 0..1). */
  gray: number;
  /** Horizontal distance from the level's center (m). */
  dist: number;
  rnd: () => number;
}

type Rect = [number, number, number, number];
const STYLES = Object.values(FACADES) as Facade[];

export function layoutCity(level: THREE.Box3, cfg = SKYLINE): Tower[] {
  const rnd = lcg(cfg.seed * 7919 + 1);
  const cx = level.isEmpty() ? 0 : (level.min.x + level.max.x) / 2;
  const cz = level.isEmpty() ? 0 : (level.min.z + level.max.z) / 2;
  const m = cfg.margin;
  const blocked = (r: Rect) =>
    !level.isEmpty() && r[2] > level.min.x - m && r[0] < level.max.x + m && r[3] > level.min.z - m && r[1] < level.max.z + m;
  // Street widths per grid line, so streets run straight across the city.
  const n = Math.ceil(cfg.radius / cfg.block);
  const street = (i: number, axis: number) => {
    const r = lcg(cfg.seed * 131 + i * 17 + axis * 7)();
    return cfg.streetMin + (cfg.streetMax - cfg.streetMin) * r;
  };
  const towers: Tower[] = [];
  for (let bx = -n; bx < n; bx++) {
    for (let bz = -n; bz < n; bz++) {
      const x0 = cx + bx * cfg.block + street(bx, 0) / 2;
      const x1 = cx + (bx + 1) * cfg.block - street(bx + 1, 0) / 2;
      const z0 = cz + bz * cfg.block + street(bz, 1) / 2;
      const z1 = cz + (bz + 1) * cfg.block - street(bz + 1, 1) / 2;
      if (Math.hypot((x0 + x1) / 2 - cx, (z0 + z1) / 2 - cz) > cfg.radius) continue;
      for (const lot of split([x0, z0, x1, z1], rnd, 0)) {
        if (blocked(lot)) continue;
        const t = tower(lot, Math.hypot((lot[0] + lot[2]) / 2 - cx, (lot[1] + lot[3]) / 2 - cz), rnd, cfg);
        if (t) towers.push(t);
      }
    }
  }
  return towers;
}

/** Split a block into lots: sometimes touching (one dense mass), sometimes with an alley. */
function split(r: Rect, rnd: () => number, depth: number): Rect[] {
  const w = r[2] - r[0];
  const d = r[3] - r[1];
  if (depth > 3 || Math.max(w, d) < 18 || (depth > 0 && rnd() < 0.3)) return [r];
  const alongX = w > d;
  const len = alongX ? w : d;
  const at = len * (0.35 + rnd() * 0.3);
  const gap = rnd() < 0.5 ? 0 : 1 + rnd() * 3;
  const a: Rect = alongX ? [r[0], r[1], r[0] + at - gap / 2, r[3]] : [r[0], r[1], r[2], r[1] + at - gap / 2];
  const b: Rect = alongX ? [r[0] + at + gap / 2, r[1], r[2], r[3]] : [r[0], r[1] + at + gap / 2, r[2], r[3]];
  return [...split(a, rnd, depth + 1), ...split(b, rnd, depth + 1)];
}

function tower(lot: Rect, dist: number, rnd: () => number, cfg: typeof SKYLINE): Tower | null {
  const inset = rnd() * 1.2;
  const r: Rect = [lot[0] + inset, lot[1] + inset, lot[2] - inset, lot[3] - inset];
  if (r[2] - r[0] < 5 || r[3] - r[1] < 5) return null;
  const far = Math.min(1, dist / cfg.radius);
  let top: number;
  if (rnd() < cfg.tallChance * (dist < cfg.near ? 1 : 0.6)) {
    top = cfg.tallMin + (cfg.tallMax - cfg.tallMin) * Math.pow(rnd(), 1.5);
  } else if (dist < cfg.near) {
    // Mostly below the level's roofs, closer = lower: look down into the canyons.
    const k = dist / cfg.near;
    top = -38 + k * 28 + rnd() * (18 + k * 30);
  } else {
    top = -25 + rnd() * 55 + far * 45;
  }
  // Tall towers step back as they rise.
  const tiers: Tier[] = [];
  const height = top - cfg.street;
  const steps = height > 90 && rnd() < 0.65 ? 1 + Math.floor(rnd() * 2) : 0;
  let cur = r;
  let y = cfg.street;
  for (let i = 0; i <= steps; i++) {
    const tTop = i === steps ? top : y + (top - y) * (0.55 + rnd() * 0.25);
    tiers.push({ x0: cur[0], z0: cur[1], x1: cur[2], z1: cur[3], top: tTop });
    y = tTop;
    const s = 1.5 + rnd() * 3;
    const sx = rnd() < 0.5 ? s : 0;
    const sz = sx ? (rnd() < 0.5 ? s : 0) : s;
    cur = [cur[0] + sx, cur[1] + sz, cur[2] - sx * (rnd() < 0.7 ? 1 : 0), cur[3] - sz * (rnd() < 0.7 ? 1 : 0)];
    if (cur[2] - cur[0] < 5 || cur[3] - cur[1] < 5) break;
  }
  const facade = STYLES[Math.floor(rnd() * STYLES.length)];
  const gray = rnd() < 0.8 ? 0.8 + rnd() * 0.08 : 0.58 + rnd() * 0.1;
  return { tiers, facade, gray, dist, rnd: lcg(Math.floor(rnd() * 1e9)) };
}
