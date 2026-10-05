import { Color } from 'three';
import { LIGHTS, NEON_LIGHT_ROWS, type LightKind } from '../config';
import { neonRect } from '../render/ink/neon-text';
import type { PropDef } from './def';
import { M, Parts, type Mat } from './pieces';

// Neon blade signs, like the vertical signs on Asian high streets: a tall,
// narrow lightbox standing out from the wall on two arms, readable from both
// sides. Each face has a neon tube outline around a column of real text in
// paper on ink (render/ink/neon-text.ts), one character under another; the
// text is the sign's own (PropDef.text: typed in build mode, saved in the
// level). Tubes, text and light flicker gently, in sync. The light is several
// lamps down each face (LIGHTS[kind], NEON_LIGHT_ROWS; aim and offset are
// mirrored for the second face), so it comes from the whole sign.

const H = 2.8; // height
const OUT = 0.2; // gap between wall and sign
const W = 0.8; // depth out from the wall
const T = 0.08; // half thickness
const ZC = -(OUT + W / 2); // sign center along z
/** Tube outline: distance from the sign's edge and thickness. */
const EDGE = 0.1;
const TUBE = 0.03;

/** The sign's light color as the walls get it: its brightness as a gray plus `tint` of its hue (see LIGHTS[kind].tint). */
function hue(kind: LightKind) {
  const c = new Color(LIGHTS[kind].color);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const t = LIGHTS[kind].tint;
  return `#${c.setRGB(lum + (c.r - lum) * t, lum + (c.g - lum) * t, lum + (c.b - lum) * t).getHexString()}`;
}

const lit = (tint: string, emissive = 1, flicker = 0): Mat => ({ tex: 'flat', tint, emissive, flicker });

function blade(name: string, kind: LightKind, text: string): PropDef {
  return {
    type: `neon_${name}`,
    label: `Neon sign (${name})`,
    category: 'lights',
    place: 'mount',
    snap: 0.5,
    hang: H / 2,
    text,
    build({ seed, text }) {
      const p = new Parts();
      // Tubes, text and the real lights all flicker together.
      const fl = 1 + (seed % 9973);
      const tube = lit(LIGHTS[kind].color, 1, fl);
      const letters: Mat = { tex: 'neon', tile: 1, tint: hue(kind), emissive: 1, flicker: fl, letters: neonRect(text) };
      const z0 = -(OUT + W);
      const z1 = -OUT;
      // Arms to the wall, the box itself.
      for (const y of [0.25, H - 0.31]) p.detail([-0.03, y, z1], [0.03, y + 0.06, 0], M.steel, false);
      p.detail([-T, 0, z0], [T, H, z1], M.dark);
      for (const s of [1, -1]) {
        const xa = s * T;
        const xb = s * (T + 0.012);
        const xc = s * (T + 0.03);
        const lo = Math.min(xa, xb);
        const hi = Math.max(xa, xb);
        const tlo = Math.min(xb, xc);
        const thi = Math.max(xb, xc);
        // The lettered face, inside the tube outline.
        const inner = EDGE + TUBE;
        p.detail([lo, inner, z0 + inner], [hi, H - inner, z1 - inner], letters, false);
        // Tube outline around it.
        p.detail([tlo, EDGE, z0 + EDGE], [thi, EDGE + TUBE, z1 - EDGE], tube, false);
        p.detail([tlo, H - EDGE - TUBE, z0 + EDGE], [thi, H - EDGE, z1 - EDGE], tube, false);
        p.detail([tlo, EDGE, z0 + EDGE], [thi, H - EDGE, z0 + EDGE + TUBE], tube, false);
        p.detail([tlo, EDGE, z1 - EDGE - TUBE], [thi, H - EDGE, z1 - EDGE], tube, false);
        // The tube is a tall source: several lamps down its height, one share of the intensity each.
        for (let i = 0; i < NEON_LIGHT_ROWS; i++) {
          const y = EDGE + ((H - 2 * EDGE) * (i + 0.5)) / NEON_LIGHT_ROWS;
          p.light({ kind, pos: [s * (T + 0.04), y, ZC], mirrorX: s < 0, flicker: fl, share: 1 / NEON_LIGHT_ROWS });
        }
      }
      return p.list;
    },
  };
}

export const neonPink = blade('pink', 'neonPink', '買え。考えるな。'); // Buy. Don't think.
export const neonCyan = blade('cyan', 'neonCyan', '汚れのない未来へ。'); // Toward a spotless future.
export const neonAmber = blade('amber', 'neonAmber', '監視は安心です。'); // Surveillance is reassuring.
