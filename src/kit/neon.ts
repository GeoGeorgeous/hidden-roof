import { Color } from 'three';
import { LIGHTS, NEON_COLORS, type NeonColor } from '../config';
import { neonRect } from '../render/ink/neon-text';
import { tinted } from '../render/light-tint';
import { withVariants, type Variant } from './def';
import { M, Parts, type Mat } from './pieces';

// Neon blade signs, like the vertical signs on Asian high streets: a tall,
// narrow lightbox standing out from the wall on two arms, readable from both
// sides. Each face has a neon tube outline around a column of real text in
// paper on ink (render/ink/neon-text.ts), one character under another; the
// text is the sign's own (PropDef.text: typed in build mode, saved in the
// level). Tubes, text and light flicker gently, in sync. Each face lights as
// one line source along its height (LIGHTS.neon in its own color, NEON_COLORS;
// LightPiece.span; the aim is mirrored for the second face), so it comes from
// the whole sign.

const H = 2.8; // height
const OUT = 0.2; // gap between wall and sign
const W = 0.8; // depth out from the wall
const T = 0.08; // half thickness
const ZC = -(OUT + W / 2); // sign center along z
/** Tube outline: distance from the sign's edge and thickness. */
const EDGE = 0.1;
const TUBE = 0.03;
/** The lettered face inside the tube outline: its inset from the sign's edge and its aspect (width / height). */
const INNER = EDGE + TUBE;
const FACE_ASPECT = (W - 2 * INNER) / (H - 2 * INNER);

/** The sign's light color as the walls get it: its brightness as a gray plus `tint` of its hue (see LIGHTS.neon.tint). */
function hue(name: NeonColor) {
  return `#${tinted(new Color(NEON_COLORS[name]), LIGHTS.neon.tint).getHexString()}`;
}

const lit = (tint: string, emissive = 1, flicker = 0): Mat => ({ tex: 'flat', tint, emissive, flicker });

function blade(name: NeonColor, text: string): Variant {
  return {
    id: name,
    label: name,
    text,
    build({ seed, text }) {
      const p = new Parts();
      // Tubes, text and the real lights all flicker together.
      const fl = 1 + (seed % 9973);
      const tube = lit(NEON_COLORS[name], 1, fl);
      const letters: Mat = { tex: 'neonText', tile: 1, tint: hue(name), emissive: 1, flicker: fl, letters: neonRect(text, false, FACE_ASPECT) };
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
        // The lettered face, inside the tube outline: a big flat face, so it takes paint (the body covers its back).
        p.box([lo, INNER, z0 + INNER], [hi, H - INNER, z1 - INNER], letters, { paint: true, collide: false, skip: [s > 0 ? '-x' : '+x'] });
        // Tube outline around it.
        p.detail([tlo, EDGE, z0 + EDGE], [thi, EDGE + TUBE, z1 - EDGE], tube, false);
        p.detail([tlo, H - EDGE - TUBE, z0 + EDGE], [thi, H - EDGE, z1 - EDGE], tube, false);
        p.detail([tlo, EDGE, z0 + EDGE], [thi, H - EDGE, z0 + EDGE + TUBE], tube, false);
        p.detail([tlo, EDGE, z1 - EDGE - TUBE], [thi, H - EDGE, z1 - EDGE], tube, false);
        // The tube is a tall source: a line along its height.
        p.light({ kind: 'neon', neon: name, pos: [s * (T + 0.04), H / 2, ZC], mirrorX: s < 0, flicker: fl, span: H - 2 * EDGE });
      }
      return p.list;
    },
  };
}

export const neon = withVariants({ type: 'neon', label: 'Neon sign', category: 'neon', place: 'mount', snap: 0.5, hang: H / 2 }, [
  blade('pink', '買え。考えるな。'), // Buy. Don't think.
  blade('cyan', '汚れのない未来へ。'), // Toward a spotless future.
  blade('amber', '監視は安心です。'), // Surveillance is reassuring.
  blade('lime', '笑顔を忘れずに。'), // Don't forget to smile.
  blade('violet', 'あなたは幸せです。'), // You are happy.
  blade('red', '不満のない社会へ。'), // Toward a society without complaints.
]);
