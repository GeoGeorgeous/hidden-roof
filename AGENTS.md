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
- Don't put backlog ids in code comments.
- Removing code beats adding it. A cleanup keeps behavior identical: `npm run check` passes before and after.
- Keep source files under ~400 lines (`config.ts` and CSS excepted). Split by responsibility before a file gets there, not after.

## Backlog

All work is tracked in `docs/backlog.md`. Its rules are at the top of that file; read them before changing it.

Essentials:
- One line per item, under its domain. Ids come from one shared counter (`next:` in the header); a number is never reused.
- New items use `[TYPE-NNN]`. Never create `BL` ids, and never convert existing `BL` ids.
- Markers in the id brackets: `!` critical, `?` unconfirmed (verify first), `>` explain.
- `@X.Y.Z` at the end of a line plans it for a release; a release's items are the lines tagged with it.
- A line wrapped in `~~...~~` is deleted: don't work on it or remove it.

## Verify

- Use `npm run check:quick` for docs, backlog, UI, and changes that do not affect the core runtime paths. Use `npm run check` when changes affect paint, rendering, the level, props, input, movement, networking, the server, or build setup. When unsure, run the full check.
- Run the appropriate check before reporting a task as done or asking me to merge. Commit only after it passes; chain the commands with `&&`, never `;`.
- Browser test suites (`npm run check`, `test:game`, `test:mp`, and `golden`) run one at a time on this machine. Concurrent runs can starve each other's frames and freeze WSL.
- For visual changes (appearance, lighting, UI, props, avatar), run `npm run shots`, inspect the PNGs, and share them with me.
- Running the full check, reading a failure, and what each test covers: `docs/testing.md`.

## Git workflow

- Branch flow: topic branches → `dev` → `next` → `main`. `next` is the tested branch; only a release moves `main` (`docs/releases/AGENTS.md`).
- Start new work (features, fixes, docs) on a topic branch from `dev`. Merge it into `dev` only when I explicitly approve ("works, merge it"). Never move `next` or `main` except through promotion.
- Before promoting `dev` to `next`, run the full `npm run check` on `dev` and confirm it passes.
- On a topic branch, commit each change once its check passes, without asking.
- After merging a topic branch into `dev`, delete it with `git branch -d`, unless I ask to keep it. Push merges into `dev` and `next` immediately; keep topic branches local unless I ask otherwise.

## Long runs

- When a step does not need my input, keep going. Put status notes in the same message as your next action. Stop and ask only when you cannot proceed without me, or before destructive actions, force-pushing, or changing anything outside this repository.
- End every run with: `Blocked on me`, `Changed`, `Found`.

## Before working in these areas, read

- Props, colliders, grid, and paintable faces: `src/kit/AGENTS.md`
- Ink style, materials, color, and signs: `src/render/ink/AGENTS.md`
- Debug panel (F3): tabs, naming, tooltips, and values: `src/debug/AGENTS.md`
- Deployment, VPS, and multiplayer hosting: `docs/deploy.md`; host changes waiting for devops: `docs/ideas/vps.md`
- Domain terms: `CONTEXT.md`
- Releases: `docs/releases/AGENTS.md`
