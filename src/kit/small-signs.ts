import { withVariants, type Variant } from './def';
import { M, Parts, type Mat, type V3 } from './pieces';
import { word } from './lettering';

// Small wall signs: exit, high voltage, no entry, a name plate. Their text is
// their own (PropDef.text: typed in build mode, saved in the level), drawn in
// real type (render/ink/words.ts); pictograms are ink rods on plates. Plates
// and lettered faces are paintable, like the big signs.

/** Pen stroke on a sign face at depth z. */
function stroke(p: Parts, z: number, pts: [number, number][], r: number, mat: Mat) {
  for (let i = 1; i < pts.length; i++) p.rod([pts[i - 1][0], pts[i - 1][1], z] as V3, [pts[i][0], pts[i][1], z] as V3, r, mat);
}

/** Exit sign: its text (EXIT) in paper on ink. */
const signExit: Variant = {
  id: 'exit',
  label: 'exit',
  hang: 0.11,
  text: 'EXIT',
  build({ text }) {
    const h = 0.22;
    const t = word(text, true, h);
    const p = new Parts();
    p.box([-t.width / 2, 0, -0.1], [t.width / 2, h, 0], t.mat, { paint: true, letterFace: '-z' });
    return p.list;
  },
};

/** High voltage: a bolt in a warning triangle over HIGH VOLTAGE. */
const signVoltage: Variant = {
  id: 'voltage',
  label: 'high voltage',
  hang: 0.2,
  text: 'HIGH VOLTAGE',
  build({ text }) {
    const w = 0.32;
    const h = 0.4;
    const p = new Parts();
    p.box([-w / 2, 0, -0.025], [w / 2, h, 0], M.paper, { paint: true });
    stroke(p, -0.032, [[-0.13, 0.14], [0, 0.37], [0.13, 0.14], [-0.13, 0.14]], 0.008, M.dark);
    stroke(p, -0.032, [[0.035, 0.32], [-0.03, 0.24], [0.03, 0.24], [-0.025, 0.165]], 0.011, M.dark);
    // The word as wide as the plate allows, as high as that leaves it.
    const inner = w - 0.04;
    const th = Math.min(0.08, inner / word(text, false, 1).width);
    p.box([-inner / 2, 0.04, -0.032], [inner / 2, 0.04 + th, -0.025], word(text, false, th, inner).mat, { paint: true, letterFace: '-z' });
    return p.list;
  },
};

/** No entry: a round sign, a person's silhouette crossed out. */
const signNoEntry: Variant = {
  id: 'no_entry',
  label: 'no entry',
  hang: 0.2,
  build() {
    const c = 0.2; // center height
    const p = new Parts();
    p.cyl([0, c, -0.025], 'z', 0.025, 0.2, M.dark, { paint: true, seg: 24 });
    p.cyl([0, c, -0.03], 'z', 0.005, 0.165, M.paper, { paint: true, collide: false, seg: 24 });
    // The person: head, body, arms, legs.
    const z = -0.034;
    p.cyl([0, c + 0.085, z - 0.004], 'z', 0.004, 0.026, M.dark, { paint: false, collide: false, seg: 12 });
    p.detail([-0.028, c - 0.03, z - 0.004], [0.028, c + 0.055, z], M.dark, false);
    for (const s of [-1, 1]) {
      stroke(p, z - 0.002, [[s * 0.026, c + 0.045], [s * 0.07, c - 0.015]], 0.01, M.dark);
      stroke(p, z - 0.002, [[s * 0.014, c - 0.03], [s * 0.035, c - 0.115]], 0.012, M.dark);
    }
    // Crossed out.
    stroke(p, -0.05, [[-0.12, c + 0.12], [0.12, c - 0.12]], 0.014, M.dark);
    return p.list;
  },
};

/** Small name plate in a steel frame, as wide as its text. */
const signPlate: Variant = {
  id: 'plate',
  label: 'name plate',
  hang: 0.07,
  text: 'STAFF ONLY',
  build({ text }) {
    const h = 0.14;
    const t = word(text, false, h, 0.3);
    const x = t.width / 2;
    const p = new Parts();
    p.box([-x, 0, -0.025], [x, h, 0], t.mat, { paint: true, letterFace: '-z' });
    p.detail([-x - 0.015, -0.015, -0.03], [x + 0.015, 0, 0], M.steel, false);
    p.detail([-x - 0.015, h, -0.03], [x + 0.015, h + 0.015, 0], M.steel, false);
    return p.list;
  },
};

/** Small wall signs, each with its own text or pictogram. */
export const smallSign = withVariants({ type: 'small_sign', label: 'Small sign', category: 'signs', place: 'mount', snap: 0.5 }, [signExit, signVoltage, signNoEntry, signPlate]);
