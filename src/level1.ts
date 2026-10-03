import * as THREE from 'three';
import type { World } from './world';

// Level 1: the rooftop of a tall building at sunset.
//
// Roof footprint x [-12, 12], z [-9, 9], roof surface at y = 0. North is -z.
//   NW  stairwell hut (brick) with a ladder to its roof
//   N   catwalk from the hut roof running along a big blank billboard
//   E   row of AC units feeding an overhead duct that crosses the roof
//   SE  wooden water tank on a steel stand, big condenser + crates to climb
//   S   pipe runs along the parapet, a riser and an overhead pipe
//   SW  brick chimney, skylights, mushroom vents
// Everything around it is non-paintable skyline.

type V3 = [number, number, number];

export function buildLevel1(w: World) {
  const metal = { tex: 'metal' as const, tint: '#a8b0b4' };
  const darkMetal = { tex: 'metal' as const, tint: '#6d767c' };

  // --- Roof slab, building body, parapets ----------------------------------
  w.box([-12, -0.4, -9], [12, 0, 9], { tex: 'roof', skip: ['-y', '+x', '-x', '+z', '-z'] });
  w.box([-12, -90, -9], [12, -0.4, 9], { tex: 'facadeA', tileMeters: 8, paintable: false, collide: false, solid: false, skip: ['+y', '-y'] });

  const pT = 0.3; // parapet thickness
  const pH = 1.1;
  const parapet = { tex: 'concrete' as const, tint: '#e6dccd' };
  w.box([-12, 0, -9], [12, pH, -9 + pT], { ...parapet, skip: ['-y'] });
  w.box([-12, 0, 9 - pT], [12, pH, 9], { ...parapet, skip: ['-y'] });
  w.box([-12, 0, -9 + pT], [-12 + pT, pH, 9 - pT], { ...parapet, skip: ['-y', '+z', '-z'] });
  w.box([12 - pT, 0, -9 + pT], [12, pH, 9 - pT], { ...parapet, skip: ['-y', '+z', '-z'] });
  // Coping on top of the parapets.
  const cope = { tex: 'concrete' as const, tint: '#b9b2a8' };
  w.box([-12.05, pH, -9.05], [12.05, pH + 0.08, -8.65], cope);
  w.box([-12.05, pH, 8.65], [12.05, pH + 0.08, 9.05], cope);
  w.box([-12.05, pH, -8.65], [-11.65, pH + 0.08, 8.65], { ...cope, skip: ['+z', '-z'] });
  w.box([11.65, pH, -8.65], [12.05, pH + 0.08, 8.65], { ...cope, skip: ['+z', '-z'] });
  // Invisible walls keep you on the roof.
  w.wall([-13, 0, -9.6], [13, 14, -9.05]);
  w.wall([-13, 0, 9.05], [13, 14, 9.6]);
  w.wall([-13, 0, -9.6], [-12.05, 14, 9.6]);
  w.wall([12.05, 0, -9.6], [13, 14, 9.6]);

  // --- Stairwell hut (NW) ---------------------------------------------------
  const hutTop = 3.4;
  w.box([-11.7, 0, -8.7], [-6, hutTop, -3.2], { tex: 'brick', skip: ['-y', '-x', '-z'] });
  w.box([-9.5, 0, -3.2], [-8.3, 2.1, -3.12], { tex: 'metal', tint: '#56707e', skip: ['-y', '-z'] }); // door
  w.box([-9.6, 2.1, -3.2], [-8.2, 2.18, -3.1], { ...darkMetal, collide: false }); // lintel
  w.box([-9.1, 2.35, -3.2], [-8.7, 2.48, -3.05], { tex: 'plain', tint: '#ffe0a0', emissive: 1, paintable: false, collide: false }); // lamp
  w.box([-11.2, 1.2, -3.2], [-10.1, 1.9, -3.14], { ...darkMetal, collide: false }); // utility box by the door
  // Hut roof lips, with gaps for the ladder (z -6.4..-5.6) and the catwalk (z -8.5..-7.2).
  const lip = { tex: 'concrete' as const, tint: '#d6cdbf' };
  const lH = hutTop + 0.5;
  w.box([-11.7, hutTop, -8.7], [-6, lH, -8.5], { ...lip, skip: ['-y'] });
  w.box([-11.7, hutTop, -8.5], [-11.5, lH, -3.2], { ...lip, skip: ['-y'] });
  w.box([-11.5, hutTop, -3.4], [-6, lH, -3.2], { ...lip, skip: ['-y'] });
  w.box([-6.2, hutTop, -7.2], [-6, lH, -6.4], { ...lip, skip: ['-y'] });
  w.box([-6.2, hutTop, -5.6], [-6, lH, -3.4], { ...lip, skip: ['-y'] });
  w.ladder([-6, 0, -6], [1, 0, 0], hutTop);
  // Things on the hut roof.
  w.box([-11.0, hutTop, -8.0], [-9.6, hutTop + 1.0, -6.8], { ...metal, tint: '#c5c9c0' }); // elevator machine box
  w.box([-8.6, hutTop, -5.0], [-7.6, hutTop + 0.45, -4.0], { tex: 'wood', tint: '#c8b090' }); // crate
  w.cylinder([-10.3, hutTop, -4.4], 'y', 3.2, 0.06, { ...darkMetal, segments: 6, collide: false }); // antenna mast
  dish(w, new THREE.Vector3(-8.0, hutTop, -7.6));
  // Vertical pipe down the hut's east wall.
  w.cylinder([-5.88, 0, -4.0], 'y', hutTop + 0.3, 0.09, { ...metal, tint: '#9fa6a0', segments: 10 });

  // --- Catwalk + billboard (N) ---------------------------------------------
  const deckY = hutTop;
  w.box([-6, deckY - 0.15, -8.7], [9, deckY, -7.2], { tex: 'metal', tint: '#7d858a' });
  for (const x of [-3.5, 1.5, 6.5]) w.box([x - 0.1, 0, -7.45], [x + 0.1, deckY - 0.15, -7.25], darkMetal);
  // Railing (visual) + one invisible wall.
  w.box([-6, deckY + 0.95, -7.26], [9, deckY + 1.02, -7.18], { ...metal, collide: false });
  w.box([-6, deckY + 0.5, -7.25], [9, deckY + 0.54, -7.19], { ...metal, collide: false });
  for (let x = -5.5; x <= 9; x += 2.5) w.box([x - 0.04, deckY, -7.26], [x + 0.04, deckY + 0.95, -7.18], { ...metal, collide: false });
  w.box([8.92, deckY, -8.7], [9, deckY + 1.02, -7.18], { ...metal, collide: false });
  w.wall([-6, deckY, -7.26], [9.1, deckY + 1.6, -7.18]);
  w.wall([8.92, deckY, -8.7], [9.1, deckY + 1.6, -7.18]);
  // The board: a 12.5 x 4 m blank canvas.
  w.box([-4.5, deckY + 0.5, -8.66], [8, deckY + 4.5, -8.52], { tex: 'paper', tint: '#f4efe6' });
  w.box([-4.6, deckY + 4.5, -8.68], [8.1, deckY + 4.62, -8.48], darkMetal); // top trim
  for (const x of [-3.5, 1.75, 7]) {
    w.box([x - 0.08, deckY, -8.7], [x + 0.08, deckY + 4.8, -8.66], { ...darkMetal, collide: false });
    // Lamps on arms above the board.
    w.box([x - 0.03, deckY + 4.85, -8.66], [x + 0.03, deckY + 4.9, -7.9], { ...darkMetal, paintable: false, collide: false });
    w.box([x - 0.18, deckY + 4.75, -8.0], [x + 0.18, deckY + 4.85, -7.75], { tex: 'plain', tint: '#fff2c8', emissive: 1, paintable: false, collide: false });
  }
  // Electrical cabinet under the catwalk.
  w.box([0, 0, -8.7], [1.3, 1.8, -8.2], { tex: 'metal', tint: '#8c9a7c', skip: ['-y', '-z'] });
  w.cylinder([0.3, 1.8, -8.45], 'y', 1.4, 0.05, { ...darkMetal, segments: 6, caps: [false, false], collide: false }); // conduit

  // --- AC units + overhead duct (E) ----------------------------------------
  w.box([9.2, 0, -6.4], [11.7, 0.15, 0], { tex: 'concrete', tint: '#cfc6b8', skip: ['-y'] }); // pad
  for (const z of [-6, -4, -2]) {
    w.box([9.6, 0.15, z], [11.4, 1.15, z + 1.4], { tex: 'metal', tint: '#d2d6cf', skip: ['-y'] });
    w.cylinder([10.5, 1.15, z + 0.7], 'y', 0.06, 0.48, { ...darkMetal, segments: 12, caps: [false, true], collide: false }); // fan
  }
  const duct = { tex: 'metal' as const, tint: '#bfc4c6' };
  w.box([9.6, 1.15, -1.5], [10.2, 2.8, -0.9], { ...duct, skip: ['-y'] }); // riser out of the last unit
  w.box([-2.0, 2.2, -1.5], [9.6, 2.8, -0.9], { ...duct, skip: ['+x', '-x'] }); // overhead run
  w.box([-2.0, 0.6, -1.5], [-1.4, 2.2, -0.9], { ...duct, skip: ['-y', '+y'] }); // drop
  w.box([-2.4, 0, -1.9], [-1.0, 0.6, -0.5], { tex: 'metal', tint: '#99a0a3', skip: ['-y'] }); // housing
  for (const x of [2, 6]) w.box([x - 0.05, 0, -1.25], [x + 0.05, 2.2, -1.15], darkMetal); // hangers
  // Big exhaust column by the ladder.
  w.box([-4.6, 0, -5.4], [-3.8, 4.6, -4.6], { ...duct, skip: ['-y'] });
  w.box([-4.8, 4.6, -5.6], [-3.6, 5.0, -4.4], darkMetal);

  // --- Water tank + condenser + crates (SE) --------------------------------
  const tc = new THREE.Vector3(8.6, 0, 5.4);
  const legH = 2.4;
  for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    w.box([tc.x + dx - 0.1, 0, tc.z + dz - 0.1], [tc.x + dx + 0.1, legH - 0.2, tc.z + dz + 0.1], darkMetal);
  }
  w.box([tc.x - 1.6, legH - 0.2, tc.z - 1.6], [tc.x + 1.6, legH, tc.z + 1.6], { tex: 'metal', tint: '#6f6a64' });
  w.cylinder([tc.x, legH, tc.z], 'y', 3.0, 1.45, { tex: 'wood', tint: '#d2b48c', segments: 20, caps: [false, false] });
  const roofCone = new THREE.ConeGeometry(1.6, 0.9, 20, 1, true);
  roofCone.translate(tc.x, legH + 3.0 + 0.45, tc.z);
  w.decor(roofCone, { tex: 'metal', tint: '#5c5a58' });
  w.wall([tc.x - 1.6, legH, tc.z - 1.6], [tc.x + 1.6, legH + 3.9, tc.z + 1.6]);
  w.cylinder([tc.x, 0, tc.z], 'y', legH - 0.2, 0.11, { ...metal, segments: 10, caps: [false, false] }); // outlet pipe

  w.box([3, 0, 6.6], [6.4, 1.6, 8.7], { tex: 'metal', tint: '#c4cbc4', skip: ['-y', '+z'] }); // condenser
  w.cylinder([3.9, 1.6, 7.6], 'y', 0.06, 0.55, { ...darkMetal, segments: 12, caps: [false, true], collide: false });
  w.cylinder([5.5, 1.6, 7.6], 'y', 0.06, 0.55, { ...darkMetal, segments: 12, caps: [false, true], collide: false });
  const crate = { tex: 'wood' as const, tint: '#c9a878' };
  w.box([1.8, 0, 7.4], [2.8, 0.8, 8.4], { ...crate, skip: ['-y'] });
  w.box([0.9, 0, 7.6], [1.7, 0.45, 8.4], { ...crate, skip: ['-y'] });

  // --- Pipes along the south parapet + riser + overhead pipe ---------------
  const pipe = { tex: 'metal' as const, tint: '#8f9b91', segments: 10 };
  w.cylinder([-11.6, 0.45, 8.4], 'x', 13.3, 0.12, { ...pipe, caps: [true, false] });
  w.cylinder([-11.6, 0.8, 8.45], 'x', 13.3, 0.07, { ...pipe, tint: '#b07a5a', caps: [true, false] });
  for (let x = -10.5; x < 1.5; x += 2.5) w.box([x - 0.06, 0, 8.25], [x + 0.06, 0.38, 8.6], { ...darkMetal, collide: false });
  w.cylinder([1.7, 0.33, 8.4], 'y', 2.8, 0.12, { ...pipe, caps: [false, true] }); // riser
  w.cylinder([1.7, 3.0, -0.9], 'z', 9.3, 0.12, { ...pipe, caps: [false, false] }); // overhead run to the duct
  w.box([1.65, 2.8, 3.5], [1.75, 2.88, 3.6], { ...darkMetal, collide: false });

  // --- Chimney, skylights, vents (SW / middle) -----------------------------
  w.cylinder([-10.4, 0, 7.4], 'y', 5.2, 0.5, { tex: 'brick', segments: 14, caps: [false, true] });
  w.cylinder([-10.4, 5.2, 7.4], 'y', 0.3, 0.6, { ...darkMetal, segments: 14 });
  for (const [x0, z0, x1, z1] of [[-7.5, 0.8, -3.5, 4.0], [-7.5, 4.8, -3.5, 8.0]]) {
    w.box([x0, 0, z0], [x1, 0.55, z1], { tex: 'concrete', tint: '#d9d0c2', skip: ['-y'] });
    w.box([x0 + 0.2, 0.55, z0 + 0.2], [x1 - 0.2, 0.72, z1 - 0.2], { tex: 'plain', tint: '#6f8fb0', skip: ['-y'] });
  }
  for (const [x, z, h] of [[-0.8, 3.2, 0.8], [0.4, 4.4, 0.6], [-1.6, 5.4, 1.0]]) {
    w.cylinder([x, 0, z], 'y', h, 0.22, { ...metal, segments: 12 });
    w.cylinder([x, h, z], 'y', 0.18, 0.36, { ...darkMetal, segments: 12 });
  }
  // Bench-like low box to sit... or to paint.
  w.box([-11.4, 0, 0], [-10.6, 0.45, 4], { tex: 'wood', tint: '#a88c6c', skip: ['-y'] });

  skyline(w);

  w.spawn.set(2.5, 0, 4.5);
  w.spawnYaw = 0.35;
}

function dish(w: World, base: THREE.Vector3) {
  const m = { tex: 'plain' as const, tint: '#d8d8d8' };
  w.box([base.x - 0.05, base.y, base.z - 0.05], [base.x + 0.05, base.y + 1.0, base.z + 0.05], { ...m, paintable: false, collide: false });
  const g = new THREE.CylinderGeometry(0.55, 0.15, 0.18, 14, 1, true);
  g.rotateX(-1.0);
  g.rotateY(0.6);
  g.translate(base.x, base.y + 1.15, base.z);
  w.decor(g, { ...m, tint: '#e8e8e8' });
}

function skyline(w: World) {
  // Deterministic random so the city is the same each run.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const groups: Record<'facadeA' | 'facadeB' | 'facadeC', [number, number, number, number, number, number][]> = {
    facadeA: [],
    facadeB: [],
    facadeC: [],
  };
  const tops: [number, number, number, number, number, number][] = [];
  const keys = Object.keys(groups) as (keyof typeof groups)[];
  const street = -90;
  for (let gx = -6; gx <= 6; gx++) {
    for (let gz = -6; gz <= 6; gz++) {
      if (Math.abs(gx) <= 0 && Math.abs(gz) <= 0) continue;
      const cx = gx * 34 + (rnd() - 0.5) * 8;
      const cz = gz * 34 + (rnd() - 0.5) * 8;
      const d = Math.hypot(cx, cz);
      if (d < 26) continue;
      const sx = 10 + rnd() * 14;
      const sz = 10 + rnd() * 14;
      // Closer buildings are mostly lower so you can see over them; a few towers poke up.
      const tall = rnd() < 0.18;
      const top = tall ? 10 + rnd() * 45 : -30 + rnd() * 34;
      const b: V3 = [cx - sx / 2, street, cz - sz / 2];
      groups[keys[Math.floor(rnd() * keys.length)]].push([b[0], b[1], b[2], cx + sx / 2, top, cz + sz / 2]);
      // Rooftop clutter.
      if (rnd() < 0.7) {
        const hx = 2 + rnd() * 4;
        const hz = 2 + rnd() * 4;
        const ox = (rnd() - 0.5) * (sx - hx);
        const oz = (rnd() - 0.5) * (sz - hz);
        tops.push([cx + ox - hx / 2, top, cz + oz - hz / 2, cx + ox + hx / 2, top + 1.5 + rnd() * 3, cz + oz + hz / 2]);
      }
    }
  }
  for (const k of keys) w.mergedBoxes(groups[k], { tex: k, tileMeters: 8, skip: ['-y', '+y'] });
  const roofs = keys.flatMap((k) => groups[k]);
  w.mergedBoxes(roofs, { tex: 'roof', tint: '#77747e', skip: ['-y', '+x', '-x', '+z', '-z'] });
  w.mergedBoxes(tops, { tex: 'concrete', tint: '#8a8794', skip: ['-y'] });
  // Street level far below.
  w.mergedBoxes([[-600, street - 1, -600, 600, street, 600]], { tex: 'roof', tint: '#3a3a44', tileMeters: 16, skip: ['-y'] });
}
