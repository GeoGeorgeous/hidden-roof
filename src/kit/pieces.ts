import type { TexName } from '../materials';
import type { Axis, BoxFace } from '../surfaces';
import type { LightKind } from '../config';
import type { Facade } from '../render/ink/facade';
import type { UvRect } from '../render/ink/glyphs';

// A prop is described as a list of pieces in prop-local space (origin at the
// bottom, front facing -z). Visuals, colliders and climb volumes are all
// generated from these pieces (see level/build-prop.ts) — never by hand.

export type V3 = [number, number, number];

export interface Mat {
  tex: TexName;
  tint?: string;
  emissive?: number;
  /** Alpha-tested base texture (chain-link). Such pieces don't stop paint. */
  alpha?: number;
  /** Meters per base texture repeat. */
  tile?: number;
  /** Neon flicker seed (1+): emissive dips with neonFlicker() (render/flicker.ts). */
  flicker?: number;
  /** Facade bands drawn on its walls (render/ink/facade.ts FACADES). */
  facade?: Facade;
  /** Sign lettering: box faces show this glyph atlas rect (render/ink/glyphs.ts signRect; use tex 'glyphs', tile 1). */
  letters?: UvRect;
}

/**
 * Slow back-and-forth turn around a vertical axis through `pivot` (CCTV heads).
 * Swinging pieces are always decor and never collide.
 */
export interface Swing {
  pivot: V3;
  /** Half the sweep, radians. */
  amp: number;
  /** Seconds for a full left-right-left cycle. */
  period: number;
  /** Start offset, radians. */
  phase?: number;
  /** Rotation axis (prop-local), default 'y'. */
  axis?: 'x' | 'y' | 'z';
  /** Turn continuously (fans) at FANS.speed instead of swinging; amp and period are ignored, `dir` ±1 sets the way round. */
  spin?: boolean;
  dir?: number;
  /**
   * Turn toward the player when they come near (CCTV heads, see CCTV in config;
   * y swings only). 'lens': also light up meanwhile (emissive Mat). Lights added
   * inside the same `swinging` block turn with it and only shine meanwhile.
   */
  track?: 'head' | 'lens';
}

/**
 * Effect source: 'smoke' puffs rise from `pos` (pushed along `dir` first),
 * 'fan' is a humming fan heard nearby. Neither has geometry of its own.
 */
export interface EmitterPiece {
  k: 'emitter';
  kind: 'smoke' | 'fan' | 'metal';
  pos: V3;
  dir?: V3;
}

/** 'auto' = paintable when the piece has a big enough flat face. */
export type Paint = boolean | 'auto';

export interface BoxPiece {
  k: 'box';
  min: V3;
  max: V3;
  mat: Mat;
  paint: Paint;
  collide: boolean;
  /** Only for faces fully covered by another piece of the same prop. */
  skip?: BoxFace[];  swing?: Swing;
}
export interface CylPiece {
  k: 'cyl';
  base: V3;
  axis: Axis;
  len: number;
  r: number;
  r2?: number;
  mat: Mat;
  paint: Paint;
  collide: boolean;
  seg?: number;
  swing?: Swing;
}
export interface RodPiece {
  k: 'rod';
  a: V3;
  b: V3;
  r: number;
  mat: Mat;
  collide: boolean;
  swing?: Swing;
}
export interface ConePiece {
  k: 'cone';
  base: V3;
  r: number;
  h: number;
  mat: Mat;
  swing?: Swing;
}
/** Ladder climb volume; `normal` points away from the ladder toward the climber. */
export interface ClimbPiece {
  k: 'climb';
  min: V3;
  max: V3;
  normal: V3;
}
/**
 * A light emitter at its default spot on the lens surface. Everything else
 * (color, aim, offset from this spot, strength, spread, range, glow, beam)
 * comes from LIGHTS[kind] in config.ts and is live-tunable (F3 → Lights).
 * Only the nearest few become real lights (budget).
 */
export interface LightPiece {
  k: 'light';
  kind: LightKind;
  pos: V3;
  /** Aim for this instance only (prop-local); default LIGHTS[kind].dir. */
  dir?: V3;
  /** Neon flicker seed (1+), the same as its tubes' Mat.flicker. */
  flicker?: number;
  /** Fraction of LIGHTS[kind].intensity this lamp gives (default 1): a long source is several lamps that share one intensity. */
  share?: number;
  /** Mirror LIGHTS[kind] offset and aim across x (the second face of a two-sided sign). */
  mirrorX?: boolean;
  /** Fixed glow sprite positions (lens centers); default: one at the emitter. */
  glows?: V3[];
  /** Set by `swinging`: a tracking light turns with its head (Swing.track). */
  swing?: Swing;
}
export type Piece = BoxPiece | CylPiece | RodPiece | ConePiece | ClimbPiece | LightPiece | EmitterPiece;

// --- Palette ---------------------------------------------------------------
// Mirror's Edge-like: four neutral grays on flat materials for all architecture
// and equipment. Color comes only from lights, signs and the player's paint.
export const GRAY = ['#2a2c30', '#4d5055', '#7d8085', '#b5b7ba'] as const;

export const M = {
  concrete: { tex: 'flat', tint: GRAY[3] },
  plaster: { tex: 'panel', tint: GRAY[3] },
  brick: { tex: 'panel', tint: GRAY[2] },
  roof: { tex: 'panel', tint: GRAY[2] },
  steel: { tex: 'flat', tint: GRAY[0] },
  metal: { tex: 'flat', tint: GRAY[1] },
  galv: { tex: 'flat', tint: GRAY[2] },
  ac: { tex: 'flat', tint: GRAY[3] },
  beige: { tex: 'flat', tint: GRAY[2] },
  green: { tex: 'flat', tint: GRAY[1] },
  door: { tex: 'flat', tint: GRAY[1] },
  rust: { tex: 'flat', tint: GRAY[1] },
  wood: { tex: 'flat', tint: GRAY[2] },
  paper: { tex: 'flat', tint: '#d4d6d8' },
  glass: { tex: 'flat', tint: '#16181c' },
  dark: { tex: 'flat', tint: '#121316' },
  cable: { tex: 'flat', tint: '#101114' },
  chain: { tex: 'chainlink', alpha: 0.5, tile: 0.4 },
  shutter: { tex: 'shutter', tint: GRAY[2] },
} satisfies Record<string, Mat>;

/** A light's lens: emissive in the light's color (build it from LIGHTS[kind].color). */
export const lens = (tint: string): Mat => ({ tex: 'flat', tint, emissive: 1 });

const RAIL_H = 1.1;

/** Piece collector with helpers for the recurring structures. */
export class Parts {
  readonly list: Piece[] = [];
  /** Set by `swinging`: attached to every box/cyl/rod/cone added meanwhile. */
  private swing: Swing | undefined;

  /** Pieces added inside `add` swing together (see Swing). */
  swinging(swing: Swing, add: () => void) {
    this.swing = swing;
    add();
    this.swing = undefined;
  }

  box(min: V3, max: V3, mat: Mat, o: { paint?: Paint; collide?: boolean; skip?: BoxFace[] } = {}) {
    this.list.push({ k: 'box', min, max, mat, paint: o.paint ?? 'auto', collide: o.collide ?? true, skip: o.skip, swing: this.swing });
  }

  /** Decor box: paintable like any box piece unless it is tiny (PAINT.minFaceSide / minFaceArea). */
  detail(min: V3, max: V3, mat: Mat, collide = true) {
    this.box(min, max, mat, { collide });
  }

  cyl(base: V3, axis: Axis, len: number, r: number, mat: Mat, o: { r2?: number; paint?: Paint; collide?: boolean; seg?: number } = {}) {
    this.list.push({ k: 'cyl', base, axis, len, r, r2: o.r2, mat, paint: o.paint ?? 'auto', collide: o.collide ?? true, seg: o.seg, swing: this.swing });
  }

  rod(a: V3, b: V3, r: number, mat: Mat, collide = false) {
    this.list.push({ k: 'rod', a, b, r, mat, collide, swing: this.swing });
  }

  cone(base: V3, r: number, h: number, mat: Mat) {
    this.list.push({ k: 'cone', base, r, h, mat, swing: this.swing });
  }

  emitter(kind: EmitterPiece['kind'], pos: V3, dir?: V3) {
    this.list.push({ k: 'emitter', kind, pos, dir });
  }

  light(l: Omit<LightPiece, 'k'>) {
    this.list.push({ k: 'light', ...l, swing: this.swing });
  }

  /** Horizontal railing along an axis-aligned line (x,z) on floor height y. */
  railing(a: [number, number], b: [number, number], y: number) {
    const [ax, az] = a;
    const [bx, bz] = b;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) return;
    const n = Math.max(1, Math.ceil(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const z = az + ((bz - az) * i) / n;
      this.detail([x - 0.03, y, z - 0.03], [x + 0.03, y + RAIL_H, z + 0.03], M.steel);
    }
    const x0 = Math.min(ax, bx) - 0.03;
    const x1 = Math.max(ax, bx) + 0.03;
    const z0 = Math.min(az, bz) - 0.03;
    const z1 = Math.max(az, bz) + 0.03;
    this.detail([x0, y + RAIL_H - 0.05, z0], [x1, y + RAIL_H, z1], M.steel);
    this.detail([x0, y + 0.5, z0], [x1, y + 0.54, z1], M.steel);
  }

  /**
   * Cable sagging from the wall (z = 0) straight out along -z for `span` m,
   * `sag` m low in the middle, in `segments` rods. Returns its curve (t = 0..1)
   * for hanging things on it.
   */
  sagCable(span: number, sag: number, segments: number, r: number) {
    const at = (t: number): V3 => [0, -sag * 4 * t * (1 - t), -span * t];
    for (let i = 0; i < segments; i++) this.rod(at(i / segments), at((i + 1) / segments), r, M.cable);
    return at;
  }

  /** Sloped stair handrail between two points at tread level. */
  stairRail(a: V3, b: V3) {
    for (const p of [a, b]) this.detail([p[0] - 0.03, p[1], p[2] - 0.03], [p[0] + 0.03, p[1] + RAIL_H, p[2] + 0.03], M.steel);
    const up = (p: V3, h: number): V3 => [p[0], p[1] + h, p[2]];
    this.rod(up(a, RAIL_H), up(b, RAIL_H), 0.03, M.steel, true);
    this.rod(up(a, 0.55), up(b, 0.55), 0.02, M.steel, true);
  }

  /**
   * Ladder whose back touches a wall plane at z = wallZ, climbable from the -z side.
   * Rails and rungs collide up to `height`; the handrails above are decor.
   */
  ladder(x: number, y: number, wallZ: number, height: number, width = 0.7) {
    // Stand off 0.18 m so overhangs and copings above don't catch the climber's head.
    const z0 = wallZ - 0.18;
    const z1 = wallZ - 0.12;
    for (const s of [-1, 1]) {
      const rx = x + (s * width) / 2;
      this.detail([rx - 0.03, y, z0], [rx + 0.03, y + height, z1], M.steel);
      this.detail([rx - 0.03, y + height, z0], [rx + 0.03, y + height + 0.9, z1], M.steel, false);
      for (const by of [0.4, height - 0.3]) this.detail([rx - 0.02, y + by, z1], [rx + 0.02, y + by + 0.05, wallZ], M.steel, false);
    }
    for (let ry = 0.3; ry < height - 0.1; ry += 0.3) {
      this.detail([x - width / 2, y + ry - 0.02, z0 + 0.01], [x + width / 2, y + ry + 0.02, z1 - 0.01], M.steel);
    }
    this.list.push({ k: 'climb', min: [x - width / 2, y, z0 - 0.45], max: [x + width / 2, y + height + 0.3, z0], normal: [0, 0, -1] });
  }
}
