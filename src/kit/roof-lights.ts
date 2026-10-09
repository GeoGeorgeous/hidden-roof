import { LIGHTS } from '../config';
import { withVariants, type PropDef } from './def';
import { floodTilt } from './lights';
import { lens, M, Parts, type V3 } from './pieces';

// Lights for roofs, on walls, parapets and vent units: a caged bulkhead lamp
// over a door, a floodlight on a bracket, a flat light panel; and the red
// aviation light on roof corners, pulsing slowly (FLICKER.pulse*).

/** Caged bulkhead lamp, centered on the aim point: a base on the wall, a glass lens, steel bars over it. Lights down and out. */
function bulkhead() {
  const p = new Parts();
  p.detail([-0.15, -0.11, -0.05], [0.15, 0.11, 0], M.metal);
  p.detail([-0.12, -0.08, -0.13], [0.12, 0.08, -0.05], lens(LIGHTS.bulkhead.color), false);
  // The cage: three bars over the top, front and bottom of the lens, and one across.
  for (const x of [-0.06, 0, 0.06]) {
    const pts: V3[] = [
      [x, 0.1, -0.05],
      [x, 0.1, -0.16],
      [x, -0.1, -0.16],
      [x, -0.1, -0.05],
    ];
    for (let i = 1; i < pts.length; i++) p.rod(pts[i - 1], pts[i], 0.007, M.steel);
  }
  p.rod([-0.1, 0, -0.16], [0.1, 0, -0.16], 0.008, M.steel);
  p.light({ kind: 'bulkhead', pos: [0, -0.04, -0.135] });
  return p.list;
}

/** Floodlight on an arm out of the wall (a parapet, a vent unit), its head aimed down and out at this instance's tilt ([ ]). */
function bracketFlood({ adjust: tilt }: { adjust: number }) {
  const p = new Parts();
  p.detail([-0.08, -0.12, -0.02], [0.08, 0.12, 0], M.steel);
  p.detail([-0.025, -0.025, -0.35], [0.025, 0.025, -0.02], M.steel, false);
  // Yoke and head, turned down by the tilt.
  p.detail([-0.2, -0.03, -0.38], [0.2, 0.03, -0.32], M.steel, false);
  const t = (tilt * Math.PI) / 180;
  const d: V3 = [0, -Math.sin(t), -Math.cos(t)];
  const c: V3 = [0, -0.08, -0.38];
  const along = (k: number): V3 => [c[0] + d[0] * k, c[1] + d[1] * k, c[2] + d[2] * k];
  p.rod(along(-0.1), along(0.08), 0.16, M.metal);
  p.rod(along(0.08), along(0.095), 0.14, lens(LIGHTS.floodlight.color));
  p.light({ kind: 'floodlight', pos: along(0.096), dir: d });
  return p.list;
}

/** Flat light panel on the wall, centered on the aim point: a thin housing and its glowing face. */
function lightPanel() {
  const p = new Parts();
  p.detail([-0.32, -0.16, -0.04], [0.32, 0.16, 0], M.metal);
  p.detail([-0.29, -0.13, -0.05], [0.29, 0.13, -0.04], lens(LIGHTS.lightPanel.color), false);
  p.light({ kind: 'lightPanel', pos: [0, 0, -0.051] });
  return p.list;
}

export const roofLight = withVariants({ type: 'roof_light', label: 'Roof light', category: 'lights', place: 'mount', snap: 0.5, hang: 0 }, [
  { id: 'bulkhead', label: 'caged lamp', build: bulkhead },
  { id: 'flood', label: 'floodlight', adjust: { label: 'TILT', min: -30, max: 85, step: 5, initial: floodTilt }, build: bracketFlood },
  { id: 'panel', label: 'panel', build: lightPanel },
]);

/** Aviation obstruction light for roof corners: a red dome on a short stem and a low base; dome and light pulse together. */
export const aviationLight: PropDef = {
  type: 'aviation_light',
  label: 'Aviation light',
  category: 'lights',
  place: 'floor',
  snap: 0.5,
  build() {
    const p = new Parts();
    // Every aviation light pulses on the same beat (flicker -1: a pulse with no phase offset).
    const dome = { ...lens(LIGHTS.aviation.color), flicker: -1 };
    p.detail([-0.16, 0, -0.16], [0.16, 0.1, 0.16], M.metal);
    p.cyl([0, 0.1, 0], 'y', 0.22, 0.035, M.steel, { paint: false, seg: 8 });
    p.cyl([0, 0.32, 0], 'y', 0.04, 0.1, M.steel, { paint: false, seg: 12 });
    p.cyl([0, 0.36, 0], 'y', 0.07, 0.09, dome, { r2: 0.07, paint: false, collide: false, seg: 12 });
    p.cone([0, 0.43, 0], 0.07, 0.06, dome);
    // Two cones, down (LIGHTS.aviation.dir) and up, light all around it, as the bare bulb does.
    p.light({ kind: 'aviation', pos: [0, 0.42, 0], flicker: -1 });
    p.light({ kind: 'aviation', pos: [0, 0.42, 0], dir: [0, 1, 0], flicker: -1 });
    return p.list;
  },
};
