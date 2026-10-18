# An Environment module (BL-131)

Decided 2026-10-18 (architecture run on the composition root). For 1.4.0. No behavior change.

## Problem

`src/main.ts` is at its cap (397 lines, 59 imports). It builds the sky, fog, atmosphere, lighting, rain, smoke and view lights, rebuilds them on `level.onChange`, and copies fog, sky flash and view-light values from config every frame. `window.game` hands out lighting, lightFx, lightning, smoke and atmosphere one by one.

## Design

`src/render/environment.ts` owns the sky, fog, atmosphere, lighting, lightning, light FX, rain, heightmap, smoke, the player light and the view scene's two lights. Interface:

- `rebuild(level)`: the five environment lines of `level.onChange` (`baker.sync` stays in main).
- `setViewHeight(h)`.
- `update(view)` with `{ time, dt, at, shown, eye, fov, frozen, building }`, returning nothing.
- `lightning.onThunder` set once.

The per-frame copies from config (fog, sky flash, view lights) stay per frame but inside it, so F3 still shows them live with no new hooks. The frame's phases stay a plain sequence in `step()` (limit → input and dev → player and camera → shown view → environment → play: tools, drips, pickups, net → HUD → level, bake, paint upload → draw → stats): a phase list would hide the order the frame depends on. `window.game` and DevContext get `environment` and read its parts through it.

## Done when

Golden identical, full check before and after; main.ts ~10 imports and ~45 lines less.
