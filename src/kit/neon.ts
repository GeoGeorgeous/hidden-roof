import { LIGHTS, type LightKind } from '../config';
import type { PropDef } from './def';
import { M, Parts, type Mat, type V3 } from './pieces';

// Neon blade signs, like the vertical signs on Asian high streets: a tall,
// narrow lightbox standing out from the wall on two arms, readable from both
// sides. Each face has a backlit panel, a neon tube outline and a column of
// glyph-like characters made of tube strokes (abstract, not real text),
// different for every placed sign. Tubes and light flicker gently, in sync. One real light per face (LIGHTS[kind];
// aim and offset are mirrored for the second face).

const H = 2.8; // height
const OUT = 0.2; // gap between wall and sign
const W = 0.8; // depth out from the wall
const T = 0.08; // half thickness
const ZC = -(OUT + W / 2); // sign center along z

const lit = (tint: string, emissive = 1, flicker = 0): Mat => ({ tex: 'flat', tint, emissive, flicker });

interface Palette {
  /** Backlit panel tint and glow. */
  panel: string;
  panelGlow: number;
  /** Glyph tube color ('sign' = the light color). */
  glyph: string | 'sign';
}

const PALETTES: Record<string, Palette> = {
  pink: { panel: '#4a0c2e', panelGlow: 0.35, glyph: '#fff0f6' },
  cyan: { panel: '#062630', panelGlow: 0.25, glyph: 'sign' },
};

/** Small deterministic RNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stroke in glyph cell space: u along the sign (z), v up; cell spans -0.22..0.22. */
type Stroke = [number, number, number, number];

/** 3-5 strokes in the spirit of a CJK character: bars, posts, a box, sweeps. */
function glyph(rand: () => number): Stroke[] {
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const out: Stroke[] = [];
  const hy = pick([-0.18, -0.06, 0.06, 0.18]);
  out.push([-0.2 + rand() * 0.08, hy, 0.12 + rand() * 0.08, hy]); // a long bar
  const vx = pick([-0.13, 0, 0.13]);
  out.push([vx, -0.21, vx, 0.12 + rand() * 0.09]); // a post
  const extra = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < extra; i++) {
    const kind = pick(['bar', 'box', 'sweep', 'dot']);
    if (kind === 'bar') {
      const y = pick([-0.18, -0.06, 0.06, 0.18]);
      out.push([-0.12, y, 0.12, y]);
    } else if (kind === 'box') {
      const [cx, cy] = [pick([-0.1, 0.1]), pick([-0.1, 0.1])];
      const s = 0.07;
      out.push([cx - s, cy - s, cx + s, cy - s], [cx - s, cy + s, cx + s, cy + s], [cx - s, cy - s, cx - s, cy + s], [cx + s, cy - s, cx + s, cy + s]);
    } else if (kind === 'sweep') {
      const d = pick([-1, 1]);
      out.push([0, 0.02, d * 0.2, -0.2]);
    } else {
      const x = pick([-0.15, 0.15]);
      out.push([x, 0.2, x + 0.05, 0.14]);
    }
  }
  return out;
}

function blade(name: string, kind: LightKind, palette: Palette): PropDef {
  return {
    type: `neon_${name}`,
    label: `Neon sign (${name})`,
    category: 'lights',
    place: 'mount',
    snap: 0.5,
    hang: H / 2,
    build({ seed }) {
      const p = new Parts();
      const color = LIGHTS[kind].color;
      // Tubes, glyphs, backlit panel and the real lights all flicker together.
      const fl = 1 + (seed % 9973);
      const tube = lit(color, 1, fl);
      const glyphMat = lit(palette.glyph === 'sign' ? color : palette.glyph, 1, fl);
      const panel = lit(palette.panel, palette.panelGlow, fl);
      const z0 = -(OUT + W);
      const z1 = -OUT;
      // Arms to the wall, the box itself.
      for (const y of [0.25, H - 0.31]) p.detail([-0.03, y, z1], [0.03, y + 0.06, 0], M.steel, false);
      p.detail([-T, 0, z0], [T, H, z1], M.dark);
      const rand = rng(seed * 7919 + name.length);
      const glyphs = Array.from({ length: Math.floor((H - 0.36) / 0.6) }, () => glyph(rand));
      for (const s of [1, -1]) {
        const xa = s * T;
        const xb = s * (T + 0.012);
        const xc = s * (T + 0.03);
        const lo = Math.min(xa, xb);
        const hi = Math.max(xa, xb);
        const tlo = Math.min(xb, xc);
        const thi = Math.max(xb, xc);
        // Backlit panel and the tube outline around it.
        p.detail([lo, 0.06, z0 + 0.06], [hi, H - 0.06, z1 - 0.06], panel, false);
        const t = 0.03;
        const e = 0.1;
        p.detail([tlo, e, z0 + e], [thi, e + t, z1 - e], tube, false);
        p.detail([tlo, H - e - t, z0 + e], [thi, H - e, z1 - e], tube, false);
        p.detail([tlo, e, z0 + e], [thi, H - e, z0 + e + t], tube, false);
        p.detail([tlo, e, z1 - e - t], [thi, H - e, z1 - e], tube, false);
        // Glyphs, top to bottom, mirrored so both faces read the same way.
        glyphs.forEach((g, i) => {
          const cy = H - 0.48 - i * 0.6;
          for (const [u0, v0, u1, v1] of g) {
            const a: V3 = [(tlo + thi) / 2, cy + v0, ZC - s * u0];
            const b: V3 = [(tlo + thi) / 2, cy + v1, ZC - s * u1];
            if (u0 === u1 || v0 === v1) {
              const r = 0.014;
              p.detail([tlo, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r], [thi, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r], glyphMat, false);
            } else {
              p.rod(a, b, 0.014, glyphMat);
            }
          }
        });
        p.light({ kind, pos: [s * (T + 0.04), H / 2, ZC], mirrorX: s < 0, flicker: fl });
      }
      return p.list;
    },
  };
}

export const neonPink = blade('pink', 'neonPink', PALETTES.pink);
export const neonCyan = blade('cyan', 'neonCyan', PALETTES.cyan);
