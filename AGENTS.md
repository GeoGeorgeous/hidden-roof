# AGENTS.md

Guidance for anyone (human or agent) changing this codebase.

## Performance first

- Paint is baked into per-surface textures, as in Bombing!!.
- Never add meshes, decals or other objects per stroke or per particle. Spray particles are visual only.
- Painting the whole level must cost the same per frame as painting nothing. No per-paint draw calls, no growing scene graph.
- Create paint textures lazily, on a surface's first hit.
- Upload only textures that changed this frame, and only their dirty rect (`PaintSystem.flush`).
- Every paintable surface uses the same texel density (`PAINT.texelsPerMeter`). It's a player setting (PAINT DETAIL), so give paint sizes in meters, never in texels.
- Lamp light is baked too (`src/render/bake`). Never add real lights for lamps that don't move: only moving lights (CCTV) use the small real-light pool.
- Most of the screen is city, so per-pixel cost is what counts. Keep the surface shader lean, and keep the city on its own material (`src/city/material.ts`): it shades city pixels at a fraction of the cost.
- Dense detail fades with distance, never into a black mass: thin steel and wires are pen lines (`src/city/lines.ts`) with a range and a feature size; shader patterns (hatching, facade bands, seams) are filtered by their screen footprint.

## Small files

- Split code by responsibility into small, focused files that are easy to read and edit in isolation.
- If a file grows past roughly 300–500 lines, split it.
- Tunable numbers go in `src/config.ts`, not inline.

## Props (src/kit)

- **Colliders come from the visual data.** A prop is a list of pieces (box, cylinder, rod, cone, climb volume), and its meshes, colliders and ladder volumes are all generated from that list. Never add colliders or invisible walls by hand.
- **No single-sided geometry.** Use full boxes and capped cylinders, so everything is visible from all sides. Skip a face only if another piece of the same prop fully covers it.
- **Railings everywhere you can walk:** stairs, platforms, landings, catwalks and fire escapes.
- **Big flat faces are paintable, small details are decor.** Decor is batched in big tiles (`RENDER.batchTile`), so draw calls grow with the level's area, never with its number of props.
- **Fit the grid:** 2 m horizontal and 4 m vertical modules, with small props snapping to 0.5 m.
  - Edge pieces are 1.7 m long and centered on grid lines. The level generates joint posts where they meet, so never overlap coplanar faces.
- **Style:** ink on paper (`src/render/ink`). Materials are the four neutral grays in `kit/pieces.ts`; the ink turns them into paper, hatching or black. The only color in the world is player paint: never add colored materials, lights, glows or sprites (pickups of paint colors are the one exception, and lamp kinds with `LIGHTS[kind].tint` above 0, whose hue tints the light on walls; `INK.tint` scales or switches it all off). Signs get made-up lettering (`Mat.letters`), small signs real words (`render/ink/words.ts`), neon blades real text in the bundled Japanese font (`render/ink/neon-text.ts`), big walls facade bands (`Mat.facade`).
