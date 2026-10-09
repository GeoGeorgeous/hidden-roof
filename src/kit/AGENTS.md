# Props (src/kit)

- **Colliders come from the visual data.** A prop is a list of pieces (box, cylinder, rod, cone, climb volume), and its meshes, colliders and ladder volumes are all generated from that list. Never add colliders or invisible walls by hand.
- **No single-sided geometry.** Use full boxes and capped cylinders, so everything is visible from all sides. Skip a face only if another piece of the same prop fully covers it. Faces pressed against another prop need nothing: the level makes them decor (`src/level/cover.ts`).
- **Railings everywhere you can walk:** stairs, platforms, landings, catwalks and fire escapes.
- **Rectangular faces are paintable unless tiny; glowing details are decor.** A box piece (`box` or `detail`) takes paint when one face is at least `PAINT.minFaceSide` wide and `PAINT.minFaceArea` big (frames, posts and plates do; bolts and lamp heads don't), never when it is emissive or chain-link. The rest is decor, batched in big tiles (`RENDER.batchTile`), so decor draw calls grow with the level's area, never with its number of props. Paintable pieces cost one mesh per prop and material: keep a prop's paintable pieces on few materials.
- **Fit the grid:** 2 m horizontal and 4 m vertical modules, with small props snapping to 0.5 m. Edge pieces are 1.7 m long and centered on grid lines. The level generates joint posts where they meet, so never overlap coplanar faces.
- Materials and color rules: `src/render/ink/AGENTS.md`.
