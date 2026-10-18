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
- Notes for later (bugs, things to check, performance, ideas) go in `docs/backlog.md`, the one list. Keep the item's fields (type, status, priority, size, area, release) as in the other items. Mark an item `Done` when it ships; the release commit deletes the `Done` items.
- Removing code beats adding it. A cleanup keeps behavior identical: `npm run check` passes before and after.
- Before writing new logic, look for an existing helper and reuse or extend it.
- Keep source files under ~400 lines (`config.ts` and CSS excepted). Split by responsibility before a file gets there, not after.
- Branch names are `type/short-kebab-name`, with type one of `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test` (e.g. `feat/roller-tool`, `perf/dirty-rect-upload`).

## Verify

- Use `npm run check:quick` for docs, backlog, UI, and changes that do not affect the core runtime paths.
- Use `npm run check` when changes affect paint, rendering, the level, props, input, movement, networking, the server, or build setup. When unsure, run the full check.
- Run the appropriate check before reporting a task as done or asking me to merge. Commit only after it passes; chain the commands with `&&`, never `;`.
- Add a regression test for each bug fix. Verify that it fails without the fix and passes with it.
- Browser test suites (`npm run check`, `test:game`, `test:mp`, and `golden`) run one at a time on this machine. Concurrent runs can starve each other's frames and freeze WSL. Investigate failures rather than rerunning blindly to get a green result. If a failure appears pre-existing, verify it on a clean `dev` worktree and report the evidence and output.
- For visual changes (appearance, lighting, UI, props, avatar), run `npm run shots`, inspect the PNGs, and share them with me. These screenshots use the real game and GPU; headless tests use SwiftShader and may not represent the player's experience.
- The full check takes several minutes and may exceed the shell's default timeout. Give it a 10-minute timeout or run it in the background in a worktree of the tested commit, with `node_modules` linked. Continue only with work that cannot affect the running check.
- See `docs/testing.md` for test coverage and reliability details.

## Releases

- Branch flow: topic branches → `dev` → `next` → `main`. `next` is the tested branch; only a release moves `main`.
- Start new work (features, fixes, docs) on a topic branch from `dev`. Merge it into `dev` only when I explicitly approve ("works, merge it"). Never move `next` or `main` except through promotion.
- Before promoting `dev` to `next`, run the full `npm run check` on `dev` and confirm it passes.
- After merging a topic branch into `dev`, delete it with `git branch -d`, unless I ask to keep it. Push merges into `dev` and `next` immediately; keep topic branches local unless I ask otherwise.
- Before a release, ask me to choose patch, minor, major, or no release. Show what changed since the last tag using `git log --oneline $(git describe --tags --abbrev=0)..next`. Never choose the version bump yourself.
- Release only from a clean `next` with the full `npm run check` passing. Run `npm version <bump>`, push with `git push origin next:main --follow-tags` (fast-forward only, never a PR or merge commit), then merge `next` back into `dev` and push.
- For release notes and their publication, read `docs/releases/AGENTS.md`. Write release notes in the repository before `npm version`, never manually on GitHub.
- The game displays its build's `git describe` (`src/version.ts`), so `dev` and `next` do not need version bumps.

## Long runs

- When a step does not need my input, keep going. Stop and ask only when you cannot proceed without me, or before destructive actions, force-pushing, or changing anything outside this repository.
- End every run with: `Blocked on me`, `Changed`, `Found`.

## Before working in these areas, read

- Props, colliders, grid, and paintable faces: `src/kit/AGENTS.md`
- Ink style, materials, color, and signs: `src/render/ink/AGENTS.md`
- Debug panel (F3): tabs, naming, tooltips, and values: `src/debug/AGENTS.md`
- Deployment, VPS, and multiplayer hosting: `docs/deploy.md`
- Release notes and publication: `docs/releases/AGENTS.md`
