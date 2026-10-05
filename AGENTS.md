# AGENTS.md

Hidden roof: a three.js graffiti game. The world is ink on paper and the only color is player paint. A small, fast codebase matters more than more features.

## Performance first

- Paint is baked into per-surface textures, as in Bombing!!.
- Never add meshes, decals or other objects per stroke or per particle. Spray particles are visual only.
- Painting the whole level must cost the same per frame as painting nothing. No per-paint draw calls, no growing scene graph.
- Create paint textures lazily, on a surface's first hit.
- Upload only textures that changed this frame, and only their dirty rect (`PaintSystem.flush`).
- Every paintable surface uses the same texel density (`PAINT.texelsPerMeter`). It's a player setting (PAINT DETAIL), so give paint sizes in meters, never in texels.
- Lamp light is baked too (`src/render/bake`). Only moving lights (CCTV) use the small real-light pool.
- Most of the screen is city, so per-pixel cost is what counts. Keep the surface shader lean, and keep the city on its own material (`src/city/material.ts`).
- Dense detail fades with distance, never into a black mass: thin steel and wires are pen lines (`src/city/lines.ts`) with a range and a feature size; shader patterns are filtered by their screen footprint.

## Codebase

- Tunable numbers go in `src/config.ts`, not inline.
- Removing code beats adding it. A cleanup keeps behavior identical: `npm run check` and `npm test` pass before and after.
- Branch names are `type/short-kebab-name`, with type one of `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test` (e.g. `feat/roller-tool`, `perf/dirty-rect-upload`).

## Long runs

When a step doesn't need my input, keep going. Stop and ask only when you can't continue without me, or before deleting data, force-pushing, or changing anything outside this repository.
End every run with: Blocked on me, Changed, Found.

## Before working in these areas, read

- Props, colliders, grid, paintable faces: `src/kit/AGENTS.md`
- Ink style, materials, color, signs: `src/render/ink/AGENTS.md`
