import { LIGHTS } from '../config';
import type { PropDef } from './def';
import { M, Parts, type Mat, type V3 } from './pieces';

// Practical lights. Each carries a light piece at its default spot on the lens;
// color, aim, offset, strength, spread and range come from LIGHTS in config.ts
// (lens colors and floodlight heads are built from it too). The nearest few
// become real lights (budget); all of them show emissive parts + glow sprites
// + beams.

const lens = (tint: string): Mat => ({ tex: 'flat', tint, emissive: 1 });

/** Warm sodium wall lamp on a short bracket. */
export const wallLamp: PropDef = {
  type: 'wall_lamp',
  label: 'Wall lamp',
  category: 'lights',
  place: 'mount',
  snap: 0.5,
  hang: 0.2,
  build() {
    const p = new Parts();
    p.detail([-0.04, 0.15, -0.3], [0.04, 0.2, 0], M.steel, false);
    p.detail([-0.16, 0, -0.42], [0.16, 0.18, -0.18], M.steel, false);
    p.detail([-0.13, -0.03, -0.39], [0.13, 0, -0.21], lens(LIGHTS.wallLamp.color), false);
    // The lens faces down (LIGHTS.wallLamp.dir tilts it a little away from the wall).
    p.light({ kind: 'wallLamp', pos: [0, -0.035, -0.3] });
    return p.list;
  },
};

/** Downward tilt (degrees) of LIGHTS.floodlight.dir: the default for floodlights never tilted by hand. */
function floodTilt() {
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

/**
 * Street lamp on a pole: a curved arm reaching forward (-z) with a flat
 * luminaire head that lights straight down. Can cast shadows (nearest ones).
 */
export const lampPost: PropDef = {
  type: 'lamp_post',
  label: 'Lamp post',
  category: 'lights',
  place: 'floor',
  snap: 0.5,
  build() {
    const p = new Parts();
    const top = 4.6;
    p.detail([-0.18, 0, -0.18], [0.18, 0.1, 0.18], M.steel);
    p.cyl([0, 0, 0], 'y', top, 0.07, M.steel, { paint: false, seg: 8 });
    // Arm: up and over in three short rods, then the head.
    p.rod([0, top - 0.05, 0], [0, top + 0.2, -0.3], 0.045, M.steel);
    p.rod([0, top + 0.2, -0.3], [0, top + 0.25, -0.9], 0.04, M.steel);
    p.rod([0, top + 0.25, -0.9], [0, top + 0.18, -1.15], 0.04, M.steel);
    p.detail([-0.17, top + 0.06, -1.6], [0.17, top + 0.22, -1.05], M.metal, false);
    p.detail([-0.14, top + 0.04, -1.56], [0.14, top + 0.06, -1.09], lens(LIGHTS.lampPost.color), false);
    p.light({ kind: 'lampPost', pos: [0, top + 0.035, -1.325] });
    return p.list;
  },
};

/** Festoon lights: bare bulbs on a sagging cable from the wall you aim at, 6 m out. */
export const stringLights: PropDef = {
  type: 'string_lights',
  label: 'String lights',
  category: 'lights',
  place: 'mount',
  snap: 0.5,
  hang: 0,
  build() {
    const p = new Parts();
    const span = 6;
    const sag = 0.5;
    const n = 16;
    const at = (t: number): V3 => [0, -sag * 4 * t * (1 - t), -span * t];
    for (let i = 0; i < n; i++) p.rod(at(i / n), at((i + 1) / n), 0.012, M.cable);
    p.detail([-0.06, -0.06, -0.12], [0.06, 0.06, 0], M.steel, false);
    p.cyl([0, 0, -span], 'y', 0.6, 0.03, M.steel, { paint: false, collide: false, seg: 6 });
    // Bulbs hang just under the cable; every bulb glows, one real light in the middle.
    const bulb = lens(LIGHTS.stringLights.color);
    const bulbs: V3[] = [];
    for (let i = 1; i < 12; i++) {
      const [x, y, z] = at(i / 12);
      p.detail([x - 0.035, y - 0.11, z - 0.035], [x + 0.035, y - 0.04, z + 0.035], bulb, false);
      bulbs.push([x, y - 0.075, z]);
    }
    const [mx, my, mz] = at(0.5);
    p.light({ kind: 'stringLights', pos: [mx, my - 0.12, mz], glows: bulbs });
    return p.list;
  },
};

