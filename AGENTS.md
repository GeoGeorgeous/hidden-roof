# AGENTS.md

Hidden roof: a three.js graffiti game. The world is ink on paper and the only color is player paint. A small, fast codebase matters more than more features.

## Performance first

- Paint is baked into textures, as in Bombing!!: each surface's atlas on the CPU, a block of a shared page on the GPU (`src/paint-gpu.ts`).
- Never add meshes, decals or other objects per stroke or per particle. Spray particles are visual only.
- Painting the whole level must cost the same per frame as painting nothing. No per-paint draw calls, no growing scene graph.
- Create paint lazily, on a surface's first hit (a page on the first hit on any of its surfaces).
- Paintable surfaces are drawn merged per tile with their pages (`src/level/batches.ts`): never give a surface or a prop a draw call of its own.
- Upload only textures that changed this frame, and only their dirty rect (`PaintGpu.flush`, `src/paint-gpu.ts`).
- Every paintable surface uses the same texel density (`PAINT.texelsPerMeter`). It's a player setting (PAINT DETAIL), so give paint sizes in meters, never in texels.
- Lamp light is baked too (`src/render/bake`). Only moving lights (CCTV) use the small real-light pool.
- Most of the screen is city, so per-pixel cost is what counts. Keep the surface shader lean, and keep the city on its own material (`src/city/material.ts`).
- Dense detail fades with distance, never into a black mass: thin steel and wires are pen lines (`src/city/lines.ts`) with a range and a feature size; shader patterns are filtered by their screen footprint.

## Codebase

- Tunable numbers go in `src/config.ts`, not inline.
- Removing code beats adding it. A cleanup keeps behavior identical: `npm run check` passes before and after.
- Before writing new logic, look for an existing helper and reuse or extend it.
- Keep source files under ~400 lines (`config.ts` and CSS excepted). Split by responsibility before a file gets there, not after.
- Branch names are `type/short-kebab-name`, with type one of `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test` (e.g. `feat/roller-tool`, `perf/dirty-rect-upload`).

## Releases

- Branch flow: topic branches → `dev` → `next` (tested) → `main` (deployed). Only a release moves `main`.
- New work (features, fixes, docs) goes on a topic branch from `dev`. Merge it into `dev` only when I say so ("works, merge it"), never on your own. `next` and `main` move only by promotion.
- Push merges into `dev` and `next` right away. Topic branches stay local unless I ask.
- When asked to merge or promote `next` into `main`, first ask me: patch, minor, major, or no release (and say what's new since the last tag, `git log --oneline $(git describe --tags --abbrev=0)..next`). Never pick the bump yourself.
- Release, on a clean `next` with `npm run check` passing: `npm version <bump>` (bumps, commits, tags `vX.Y.Z`), `git push origin next:main --follow-tags` (fast-forward, never a PR or merge commit), then merge `next` back into `dev` and push.
- The game shows its build's `git describe` (`src/version.ts`), so `dev` and `next` need no bumps.

## Long runs

When a step doesn't need my input, keep going. Stop and ask only when you can't continue without me, or before deleting data, force-pushing, or changing anything outside this repository.
End every run with: Blocked on me, Changed, Found.

## Before working in these areas, read

- Props, colliders, grid, paintable faces: `src/kit/AGENTS.md`
- Ink style, materials, color, signs: `src/render/ink/AGENTS.md`
- Debug panel (F3): tabs, naming, tooltips, values: `src/debug/AGENTS.md`
- Deploy, the VPS, the multiplayer server's hosting: `docs/deploy.md`
