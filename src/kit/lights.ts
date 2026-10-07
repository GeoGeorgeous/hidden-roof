import { LIGHTS } from '../config';
import { withVariants, type PropDef, type Variant } from './def';
import { BROKEN } from '../render/flicker';
import { lens, M, Parts, type V3 } from './pieces';

// Practical lights. Each carries a light piece at its default spot on the lens;
// color, aim, offset, strength, spread and range come from LIGHTS in config.ts
// (lens colors and floodlight heads are built from it too). The nearest few
// become real lights (budget); all of them show emissive parts + glow sprites
// + beams.

/** Warm sodium wall lamp on a short bracket; a broken one flickers (FLICKER.broken*), each on its own beat. */
function wallLampOf(broken: boolean): Variant['build'] {
  return ({ seed }) => {
    const p = new Parts();
    const flicker = broken ? BROKEN + 1 + (seed % 9973) : 0;
    p.detail([-0.04, 0.15, -0.3], [0.04, 0.2, 0], M.steel, false);
    p.detail([-0.16, 0, -0.42], [0.16, 0.18, -0.18], M.steel, false);
    p.detail([-0.13, -0.03, -0.39], [0.13, 0, -0.21], { ...lens(LIGHTS.wallLamp.color), flicker }, false);
    // The lens faces down (LIGHTS.wallLamp.dir tilts it a little away from the wall).
    p.light({ kind: 'wallLamp', pos: [0, -0.035, -0.3], flicker });
    return p.list;
  };
}

export const wallLamp = withVariants({ type: 'wall_lamp', label: 'Wall lamp', category: 'lights', place: 'mount', snap: 0.5, hang: 0.2 }, [
  { id: 'steady', label: 'steady', build: wallLampOf(false) },
  { id: 'broken', label: 'flickering (broken)', build: wallLampOf(true) },
]);

/** Downward tilt (degrees) of LIGHTS.floodlight.dir: the default for floodlights never tilted by hand. */
export function floodTilt() {
  const [x, y, z] = LIGHTS.floodlight.dir;
  return (Math.atan2(-y, Math.hypot(x, z)) * 180) / Math.PI;
}

/**
 * Floodlight on a pole, aimed down and forward. Can cast shadows (nearest ones).
 * Each one's tilt can be changed in build mode ([ / ]); heads and beam follow.
 */
export const floodlight: PropDef = {
  type: 'floodlight',
  label: 'Floodlight',
  category: 'lights',
  place: 'floor',
  snap: 0.5,
  adjust: { label: 'TILT', min: -30, max: 85, step: 5, initial: floodTilt },
  build({ adjust: tilt }) {
    const p = new Parts();
    p.detail([-0.25, 0, -0.25], [0.25, 0.08, 0.25], M.steel);
    p.cyl([0, 0, 0], 'y', 3.2, 0.06, M.steel, { paint: false, seg: 8 });
    p.detail([-0.4, 3.2, -0.05], [0.4, 3.26, 0.05], M.steel, false);
    // Two round heads, each aimed along the beam: housing, then the lens at its front.
    // Heads keep the configured heading and take this instance's tilt.
    const [hx, , hz] = LIGHTS.floodlight.dir;
    const hl = Math.hypot(hx, hz) || 1;
    const t = (tilt * Math.PI) / 180;
    const d: V3 = [(hx / hl) * Math.cos(t), -Math.sin(t), (hz / hl) * Math.cos(t)];
    const along = (c: V3, t: number): V3 => [c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t];
    const fronts: V3[] = [];
    for (const x of [-0.28, 0.28]) {
      const c: V3 = [x, 3.1, -0.16];
      p.rod([x, 3.2, 0], c, 0.025, M.steel);
      p.rod(along(c, -0.12), along(c, 0.1), 0.13, M.metal);
      p.rod(along(c, 0.1), along(c, 0.115), 0.11, lens(LIGHTS.floodlight.color));
      fronts.push(along(c, 0.116));
    }
    const mid: V3 = [0, fronts[0][1], fronts[0][2]];
    p.light({ kind: 'floodlight', pos: mid, dir: d, glows: fronts });
    return p.list;
  },
};
